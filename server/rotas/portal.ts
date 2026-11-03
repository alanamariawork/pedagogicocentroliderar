import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import { ErroHttp } from '../auth'
import { auditar, config, hoje, link, texto, textoObrig, validar } from '../servicos'
import { AREAS_DIAGNOSTICO, DIAS_DIAGNOSTICO_FIM } from '../../shared/diagnostico'
import { diferencaDias, somarDias } from '../../shared/datas'
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
        `SELECT m.id, m.data_inicio, m.data_fim, m.situacao, pg.nome AS programa_nome, m.proximo_passo, pr.nome AS mentora_nome,
                tu.nome AS turma_nome, m.data_boas_vindas, m.contrato_situacao, m.contrato_link
         FROM matriculas m LEFT JOIN programas pg ON pg.id = m.programa_id LEFT JOIN profissionais pr ON pr.id = m.mentora_id
         LEFT JOIN turmas tu ON tu.id = m.turma_id
         WHERE m.pessoa_id = ? ORDER BY CASE m.situacao WHEN 'ativa' THEN 0 WHEN 'pausada' THEN 1 ELSE 2 END, m.data_inicio DESC LIMIT 1`,
      )
      .get(pessoaId) as Linha | undefined
  }

  /** Tudo o que a aluna vê da própria matrícula: jornada, encontros, vitórias validadas e o próximo passo. */
  function dadosPortal(pessoaId: string): Linha {
    const pessoa = db.prepare('SELECT nome FROM pessoas WHERE id = ?').get(pessoaId) as { nome: string }
    const m = matriculaAtual(pessoaId)
    const ajuda = config(db, 'texto_ajuda_aluna', 'Fale com o time de Sucesso do Cliente pelo seu grupo individual de acompanhamento.')
    if (!m) return { nome: pessoa.nome, matricula: null, ajuda }

    const jornada = montarJornada(db, m.id as string, { paraAluna: true })
    const encontros = (db
      .prepare(
        `SELECT o.id, o.numero, o.situacao, o.data_prevista, o.data_agendada, o.data_realizada, o.resumo_compartilhavel,
                i.descricao AS item_descricao, i.origem, i.tipo_id, t.nome AS tipo_nome, pr.nome AS profissional_nome
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

    return {
      nome: pessoa.nome,
      matricula: { ...m, proximo_passo: undefined },
      proximo_passo: proximo,
      jornada,
      encontros,
      nao_incluidos: naoIncluidos,
      conquistas,
      ajuda,
    }
  }

  r.get('/portal', (req, res) => {
    res.json(dadosPortal(req.usuario!.pessoa_id!))
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

  /* ---------------- Portal novo: menu, início, perfil, diagnóstico, metas, links e avisos ---------------- */

  function exigirMatricula(pessoaId: string) {
    const m = matriculaAtual(pessoaId)
    if (!m) throw new ErroHttp(404, 'Você ainda não tem uma matrícula ativa. Fale com a equipe.')
    return m
  }

  function naoLidas(usuarioId: string) {
    return (db.prepare('SELECT COUNT(*) AS n FROM notificacoes WHERE usuario_id = ? AND lida_em IS NULL').get(usuarioId) as { n: number }).n
  }

  /** O que o menu lateral precisa: os tipos de encontro da aluna (submenu Mentorias) e avisos não lidos. */
  r.get('/portal/menu', (req, res) => {
    const m = matriculaAtual(req.usuario!.pessoa_id!)
    const tipos = m
      ? db
          .prepare(
            `SELECT DISTINCT t.id, t.nome FROM itens_contratados i JOIN tipos_entregavel t ON t.id = i.tipo_id
             WHERE i.matricula_id = ? AND t.individual = 1 ORDER BY t.nome`,
          )
          .all(m.id)
      : []
    res.json({ tipos_mentoria: tipos, nao_lidas: naoLidas(req.usuario!.id) })
  })

  r.get('/portal/inicio', (req, res) => {
    const pessoaId = req.usuario!.pessoa_id!
    const d = dadosPortal(pessoaId)
    const h = hoje()
    const links = db.prepare('SELECT id, titulo, url, categoria, descricao FROM links WHERE ativo = 1 AND destaque_inicio = 1 ORDER BY ordem, titulo').all()
    const frases = db.prepare('SELECT id, texto, autoria FROM frases WHERE ativo = 1 ORDER BY criado_em').all()
    if (!d.matricula) return res.json({ nome: d.nome, hoje: h, matricula: null, atalhos: links, frases })
    const m = d.matricula as Linha
    const diasDesdeInicio = diferencaDias(m.data_inicio as string, h)
    const etapas = ((d.jornada?.etapas ?? []) as Linha[])
    const iEtapa = etapas.findIndex((e) => e.situacao !== 'concluida')
    const encontros = d.encontros as Linha[]
    const realizados = encontros.filter((o) => o.situacao === 'realizada').sort((a, b) => String(b.data_realizada).localeCompare(String(a.data_realizada)))
    const porTipo = new Map<string, number>()
    for (const o of realizados) porTipo.set(o.tipo_nome ?? o.item_descricao, (porTipo.get(o.tipo_nome ?? o.item_descricao) ?? 0) + 1)
    const metas = db.prepare('SELECT id, nome, unidade, valor_inicial, valor_alvo, valor_atual FROM metas WHERE matricula_id = ? AND ativo = 1 ORDER BY criado_em').all(m.id)
    res.json({
      nome: d.nome,
      hoje: h,
      semana: diasDesdeInicio >= 0 ? Math.floor(diasDesdeInicio / 7) + 1 : null,
      matricula: m,
      proxima_etapa:
        iEtapa >= 0
          ? { id: etapas[iEtapa].id, titulo: etapas[iEtapa].titulo, situacao: etapas[iEtapa].situacao, numero: iEtapa + 1, total: etapas.length }
          : null,
      jornada_concluida: etapas.length > 0 && iEtapa < 0,
      sugestao: d.proximo_passo,
      proximos_encontros: encontros
        .filter((o) => o.situacao === 'agendada' && String(o.data_agendada).slice(0, 10) >= h)
        .slice(0, 4),
      mentorias: {
        total: realizados.length,
        por_tipo: [...porTipo].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total),
        ultimas: realizados.slice(0, 6).map((o) => ({ id: o.id, tipo: o.tipo_nome ?? o.item_descricao, profissional_nome: o.profissional_nome, data: o.data_realizada })),
      },
      atalhos: links,
      frases,
      metas,
    })
  })

  r.get('/portal/perfil', (req, res) => {
    const pessoaId = req.usuario!.pessoa_id!
    const pessoa = db.prepare('SELECT nome, email, telefone, cidade, instagram, linkedin, site, codigo FROM pessoas WHERE id = ?').get(pessoaId)
    res.json({ pessoa, matricula: matriculaAtual(pessoaId) ?? null })
  })

  // A aluna atualiza só contato e redes. Nome, e-mail de acesso, turma e datas ficam com a equipe.
  r.put('/portal/perfil', (req, res) => {
    const pessoaId = req.usuario!.pessoa_id!
    const d = validar(z.object({ telefone: texto(40), cidade: texto(120), instagram: texto(200), linkedin: texto(200), site: link() }), req.body)
    db.prepare('UPDATE pessoas SET telefone=?, cidade=?, instagram=?, linkedin=?, site=?, atualizado_em=? WHERE id=?').run(
      d.telefone ?? null, d.cidade ?? null, d.instagram ?? null, d.linkedin ?? null, d.site ?? null, agoraIso(), pessoaId)
    auditar(db, req, { entidade: 'pessoa', entidade_id: pessoaId, acao: 'dados_atualizados_pela_aluna', pessoa_id: pessoaId, dados: d })
    res.json({ ok: true })
  })

  function fimLiberado(m: Linha) {
    if (m.situacao === 'encerrada') return true
    return !!m.data_fim && hoje() >= somarDias(m.data_fim as string, -DIAS_DIAGNOSTICO_FIM)
  }

  r.get('/portal/diagnostico', (req, res) => {
    const m = matriculaAtual(req.usuario!.pessoa_id!)
    if (!m) return res.json({ matricula: null, respostas: [], metas: [], fim_liberado: false })
    const respostas = (db.prepare('SELECT versao, area, conteudo, atualizado_em FROM diagnosticos WHERE matricula_id = ?').all(m.id) as Linha[]).map((x) => ({
      ...x,
      conteudo: JSON.parse(x.conteudo as string),
    }))
    const metas = db.prepare('SELECT id, nome, unidade, valor_inicial, valor_alvo, valor_atual, atualizado_em FROM metas WHERE matricula_id = ? AND ativo = 1 ORDER BY criado_em').all(m.id)
    res.json({
      matricula: { id: m.id, data_inicio: m.data_inicio, data_fim: m.data_fim },
      respostas,
      metas,
      fim_liberado: fimLiberado(m),
      fim_a_partir_de: m.data_fim ? somarDias(m.data_fim as string, -DIAS_DIAGNOSTICO_FIM) : null,
    })
  })

  // Cada aba é salva separadamente (uma linha por área e versão).
  r.put('/portal/diagnostico/:versao/:area', (req, res) => {
    const m = exigirMatricula(req.usuario!.pessoa_id!)
    const versao = req.params.versao
    const area = AREAS_DIAGNOSTICO.find((a) => a.id === req.params.area)
    if ((versao !== 'inicio' && versao !== 'fim') || !area) throw new ErroHttp(404, 'Área do diagnóstico não encontrada.')
    if (versao === 'fim' && !fimLiberado(m)) throw new ErroHttp(409, 'O diagnóstico de fim de ciclo abre perto do fim da sua vigência.')
    const forma = Object.fromEntries(area.perguntas.map((p) => [p.id, texto(4000)]))
    const d = validar(z.object({ respostas: z.object(forma) }), req.body)
    const respostas = Object.fromEntries(Object.entries(d.respostas).filter(([, v]) => v))
    if (Object.keys(respostas).length === 0) throw new ErroHttp(400, 'Responda pelo menos uma pergunta antes de salvar.')
    const agora = agoraIso()
    db.prepare(
      `INSERT INTO diagnosticos (id, matricula_id, versao, area, conteudo, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (matricula_id, versao, area) DO UPDATE SET conteudo = excluded.conteudo, atualizado_em = excluded.atualizado_em, autor_id = excluded.autor_id`,
    ).run(novoId(), m.id, versao, area.id, JSON.stringify(respostas), agora, agora, req.usuario!.id)
    auditar(db, req, { entidade: 'diagnostico', entidade_id: `${m.id}:${versao}:${area.id}`, acao: 'salvo_pela_aluna', matricula_id: m.id as string })
    res.json({ ok: true })
  })

  const numero = (rotulo: string) => z.coerce.number({ error: `Informe ${rotulo}.` }).finite().min(-1e12).max(1e12)
  const esquemaMeta = z.object({
    nome: textoObrig('o nome da meta', 200),
    unidade: texto(40),
    valor_inicial: numero('o valor inicial'),
    valor_alvo: numero('o alvo'),
    valor_atual: z.preprocess((v) => (v === '' ? null : v), numero('o valor atual').nullable().optional()),
  })

  function metaDaAluna(req: Request) {
    const meta = db
      .prepare('SELECT mt.* FROM metas mt JOIN matriculas m ON m.id = mt.matricula_id WHERE mt.id = ? AND m.pessoa_id = ? AND mt.ativo = 1')
      .get(req.params.id, req.usuario!.pessoa_id) as Linha | undefined
    if (!meta) throw new ErroHttp(404, 'Meta não encontrada.')
    return meta
  }

  r.post('/portal/metas', (req, res) => {
    const m = exigirMatricula(req.usuario!.pessoa_id!)
    const d = validar(esquemaMeta, req.body)
    if (d.valor_alvo === d.valor_inicial) throw new ErroHttp(400, 'O alvo precisa ser diferente do valor inicial.')
    const n = (db.prepare('SELECT COUNT(*) AS n FROM metas WHERE matricula_id = ? AND ativo = 1').get(m.id) as { n: number }).n
    if (n >= 10) throw new ErroHttp(400, 'Você já tem 10 metas. Remova uma antes de criar outra.')
    const id = novoId()
    const agora = agoraIso()
    db.prepare('INSERT INTO metas (id, matricula_id, nome, unidade, valor_inicial, valor_alvo, valor_atual, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      id, m.id, d.nome, d.unidade ?? null, d.valor_inicial, d.valor_alvo, d.valor_atual ?? null, agora, agora, req.usuario!.id)
    res.status(201).json({ id })
  })

  r.put('/portal/metas/:id', (req, res) => {
    const meta = metaDaAluna(req)
    const d = validar(esquemaMeta, req.body)
    if (d.valor_alvo === d.valor_inicial) throw new ErroHttp(400, 'O alvo precisa ser diferente do valor inicial.')
    db.prepare('UPDATE metas SET nome=?, unidade=?, valor_inicial=?, valor_alvo=?, valor_atual=?, atualizado_em=?, autor_id=? WHERE id=?').run(
      d.nome, d.unidade ?? null, d.valor_inicial, d.valor_alvo, d.valor_atual ?? null, agoraIso(), req.usuario!.id, meta.id)
    res.json({ ok: true })
  })

  // Remover só desativa: o histórico da meta continua no banco.
  r.delete('/portal/metas/:id', (req, res) => {
    const meta = metaDaAluna(req)
    db.prepare('UPDATE metas SET ativo = 0, atualizado_em = ?, autor_id = ? WHERE id = ?').run(agoraIso(), req.usuario!.id, meta.id)
    res.json({ ok: true })
  })

  r.get('/portal/links', (_req, res) => {
    res.json({
      links: db.prepare("SELECT id, titulo, url, categoria, descricao FROM links WHERE ativo = 1 ORDER BY COALESCE(categoria, ''), ordem, titulo").all(),
      ajuda: config(db, 'texto_ajuda_aluna', 'Fale com o time de Sucesso do Cliente pelo seu grupo individual de acompanhamento.'),
    })
  })

  r.get('/portal/notificacoes', (req, res) => {
    const itens = db.prepare('SELECT id, titulo, detalhe, link, lida_em, criado_em FROM notificacoes WHERE usuario_id = ? ORDER BY criado_em DESC LIMIT 30').all(req.usuario!.id)
    res.json({ itens, nao_lidas: naoLidas(req.usuario!.id) })
  })

  r.post('/portal/notificacoes/lidas', (req, res) => {
    db.prepare('UPDATE notificacoes SET lida_em = ? WHERE usuario_id = ? AND lida_em IS NULL').run(agoraIso(), req.usuario!.id)
    res.json({ ok: true })
  })

  return r
}
