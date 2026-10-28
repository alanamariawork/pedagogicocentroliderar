import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import { ErroHttp } from '../auth'
import { auditar, config, hoje, link, texto, validar } from '../servicos'
import { montarJornada } from './pedagogico'
import { ANEXOS_POR_ENVIO, corpoDoArquivo, entregarAnexo, guardarAnexo, vincularAnexos } from '../anexos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

/**
 * Espelho da Aluna (RF08). Todas as consultas usam SOMENTE a pessoa vinculada ao
 * usuário da sessão; nenhum identificador vindo da URL é usado para escolher dados de
 * outra pessoa (CA10). Notas internas e anotações nunca saem por aqui (CA14).
 */
export function rotasPortal(db: BD) {
  const r = Router()

  r.use('/portal', (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.')
    if (req.usuario.perfil !== 'aluna' || !req.usuario.pessoa_id) throw new ErroHttp(403, 'O portal é exclusivo para alunas.')
    next()
  })

  function matriculaAtual(pessoaId: string) {
    return db
      .prepare(
        `SELECT m.id, m.data_inicio, m.data_fim, m.situacao, pg.nome AS programa_nome, m.proximo_passo, pr.nome AS mentora_nome
         FROM matriculas m LEFT JOIN programas pg ON pg.id = m.programa_id LEFT JOIN profissionais pr ON pr.id = m.mentora_id
         WHERE m.pessoa_id = ? ORDER BY CASE m.situacao WHEN 'ativa' THEN 0 WHEN 'pausada' THEN 1 ELSE 2 END, m.data_inicio DESC LIMIT 1`,
      )
      .get(pessoaId) as Linha | undefined
  }

  r.get('/portal', (req, res) => {
    const pessoaId = req.usuario!.pessoa_id!
    const pessoa = db.prepare('SELECT nome FROM pessoas WHERE id = ?').get(pessoaId) as { nome: string }
    const m = matriculaAtual(pessoaId)
    const ajuda = config(db, 'texto_ajuda_aluna', 'Fale com o time de Sucesso do Cliente pelo seu grupo individual de acompanhamento.')
    if (!m) return res.json({ nome: pessoa.nome, matricula: null, ajuda })

    const jornada = montarJornada(db, m.id as string, { paraAluna: true })
    const encontros = (db
      .prepare(
        `SELECT o.id, o.numero, o.situacao, o.data_prevista, o.data_agendada, o.data_realizada, o.resumo_compartilhavel,
                i.descricao AS item_descricao, i.origem, t.nome AS tipo_nome, pr.nome AS profissional_nome
         FROM ocorrencias o JOIN itens_contratados i ON i.id = o.item_id LEFT JOIN tipos_entregavel t ON t.id = i.tipo_id
         LEFT JOIN profissionais pr ON pr.id = COALESCE(o.profissional_id, i.profissional_id)
         WHERE o.matricula_id = ? AND o.situacao <> 'cancelada' ORDER BY COALESCE(o.data_realizada, o.data_agendada, o.data_prevista, '9999'), o.numero`,
      )
      .all(m.id) as Linha[]).map((o): Linha => ({ ...o, resumo_compartilhavel: o.situacao === 'realizada' ? o.resumo_compartilhavel : null }))

    // RN08: tipos oferecidos que NÃO estão no contrato aparecem como "Não incluído no contrato" (diferente do cadeado pedagógico).
    const contratados = new Set((db.prepare('SELECT DISTINCT tipo_id FROM itens_contratados WHERE matricula_id = ? AND tipo_id IS NOT NULL').all(m.id) as { tipo_id: string }[]).map((x) => x.tipo_id))
    const naoIncluidos = (db.prepare('SELECT id, nome, descricao FROM tipos_entregavel WHERE ativo = 1 AND individual = 1 ORDER BY nome').all() as Linha[]).filter((t) => !contratados.has(t.id as string))

    const conquistas = db
      .prepare('SELECT id, titulo, situacao_anterior, acao_aplicada, resultado_percebido, data FROM conquistas WHERE matricula_id = ? AND validada = 1 AND visivel_aluna = 1 ORDER BY data DESC')
      .all(m.id)

    // Próximo passo: o que a aluna pode fazer agora, em ordem de prioridade.
    const h = hoje()
    let proximo: { tipo: string; titulo: string; detalhe: string } | null = null
    const etapasLiberadas: Linha[] = ((jornada?.etapas ?? []) as Linha[]).filter((e) => e.situacao === 'liberada')
    const ativs: Linha[] = etapasLiberadas.flatMap((e: Linha) => e.atividades.map((a: Linha) => ({ ...a, etapa: e.titulo })))
    const revisar = ativs.find((a) => a.situacao === 'em_revisao')
    const fazer = ativs.find((a) => a.situacao === 'em_execucao') ?? ativs.find((a) => a.situacao === 'pendente')
    const agendado = encontros.find((o) => o.situacao === 'agendada' && (o.data_agendada as string).slice(0, 10) >= h)
    if (revisar) proximo = { tipo: 'revisao', titulo: `Revisar: ${revisar.titulo}`, detalhe: 'A equipe pediu um ajuste nesta atividade. Veja o comentário e envie de novo.' }
    else if (fazer) proximo = { tipo: 'atividade', titulo: fazer.titulo as string, detalhe: `Etapa "${fazer.etapa}"` }
    else if (agendado) proximo = { tipo: 'encontro', titulo: `Encontro: ${agendado.item_descricao}`, detalhe: `Agendado para ${(agendado.data_agendada as string).replace('T', ' ')}` }
    else if (ativs.some((a) => a.situacao === 'enviada')) proximo = { tipo: 'aguardando', titulo: 'Aguardando validação da equipe', detalhe: 'Você enviou suas atividades. A equipe pedagógica vai analisar e liberar o próximo passo.' }
    else if (m.proximo_passo) proximo = { tipo: 'orientacao', titulo: m.proximo_passo as string, detalhe: 'Orientação registrada pela equipe' }

    res.json({
      nome: pessoa.nome,
      matricula: { ...m, proximo_passo: undefined },
      proximo_passo: proximo,
      jornada,
      encontros,
      nao_incluidos: naoIncluidos,
      conquistas,
      ajuda,
    })
  })

  function atividadeDaAluna(req: Request, atividadeId: string) {
    const a = db
      .prepare(
        `SELECT a.*, je.situacao AS etapa_situacao FROM atividades a JOIN jornada_etapas je ON je.id = a.jornada_etapa_id
         JOIN matriculas m ON m.id = a.matricula_id WHERE a.id = ? AND m.pessoa_id = ?`,
      )
      .get(atividadeId, req.usuario!.pessoa_id) as Linha | undefined
    // Mesmo status para "não existe" e "é de outra pessoa": não revela a existência do registro.
    if (!a) throw new ErroHttp(404, 'Atividade não encontrada.')
    if (a.etapa_situacao !== 'liberada') throw new ErroHttp(409, 'Esta etapa ainda não está liberada.')
    return a
  }

  r.post('/portal/atividades/:id/iniciar', (req, res) => {
    const a = atividadeDaAluna(req, req.params.id as string)
    if (a.situacao !== 'pendente') throw new ErroHttp(409, 'Esta atividade já foi iniciada.')
    db.prepare("UPDATE atividades SET situacao='em_execucao', atualizado_em=? WHERE id=?").run(agoraIso(), a.id)
    auditar(db, req, { entidade: 'atividade', entidade_id: a.id as string, acao: 'iniciada_pela_aluna', matricula_id: a.matricula_id as string })
    res.json({ ok: true })
  })

  r.post('/portal/atividades/:id/evidencias', (req, res) => {
    const a = atividadeDaAluna(req, req.params.id as string)
    if (a.situacao === 'validada') throw new ErroHttp(409, 'Esta atividade já foi validada.')
    const d = validar(z.object({ texto: texto(4000), link: link(), anexos: z.array(z.string().max(64)).max(ANEXOS_POR_ENVIO).optional() }), req.body)
    const anexos = d.anexos ?? []
    if (!d.texto && !d.link && !anexos.length) throw new ErroHttp(400, 'Escreva o que você fez, cole um link ou anexe um arquivo.')
    db.transaction(() => {
      const evId = novoId()
      db.prepare('INSERT INTO evidencias (id, atividade_id, texto, link, data_execucao, registrada_por_equipe, autor_id, criado_em) VALUES (?,?,?,?,?,0,?,?)').run(
        evId, a.id, d.texto ?? null, d.link ?? null, hoje(), req.usuario!.id, agoraIso())
      vincularAnexos(db, req, a.id as string, evId, anexos)
      db.prepare("UPDATE atividades SET situacao='enviada', atualizado_em=? WHERE id=?").run(agoraIso(), a.id)
      auditar(db, req, { entidade: 'atividade', entidade_id: a.id as string, acao: 'evidencia_enviada_pela_aluna', matricula_id: a.matricula_id as string })
    })()
    res.status(201).json({ ok: true })
  })

  /** Upload de um arquivo (corpo cru, nome no cabeçalho X-Nome-Arquivo). Vira parte do envio em /evidencias. */
  r.post('/portal/atividades/:id/anexos', corpoDoArquivo, (req, res) => {
    const a = atividadeDaAluna(req, req.params.id as string)
    if (a.situacao === 'validada' || a.situacao === 'enviada') throw new ErroHttp(409, 'Esta atividade não está aberta para envio.')
    res.status(201).json(guardarAnexo(db, req, a.id as string))
  })

  /** Download de um anexo que a própria aluna enviou. */
  r.get('/portal/anexos/:id', (req, res) => {
    const an = db
      .prepare(
        `SELECT an.* FROM anexos an JOIN atividades a ON a.id = an.atividade_id JOIN matriculas m ON m.id = a.matricula_id
         WHERE an.id = ? AND an.evidencia_id IS NOT NULL AND m.pessoa_id = ?`,
      )
      .get(req.params.id, req.usuario!.pessoa_id)
    if (!an) throw new ErroHttp(404, 'Arquivo não encontrado.')
    entregarAnexo(res, an as Record<string, unknown>)
  })

  return r
}
