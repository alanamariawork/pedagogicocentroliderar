/**
 * Área da equipe para os ajustes de 11/11: transcrição e Plano de Ação, contrato da matrícula,
 * conteúdos do portal (Rotina, Biblioteca, Livros), moderação do mural e depoimentos.
 *
 * A transcrição é dado interno: só sai por rotas da equipe com a permissão "transcricoes:ver" e
 * dentro do escopo de matrículas de quem pede (a mentora vê só as dela). O portal nunca a lê.
 */
import { Router, type Req as Request } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, transacao, type BD, type BDouTX } from '../db'
import { ErroHttp, exigir, exigirEquipe, tem } from '../auth'
import { auditar, data, escopoMatriculas, exigirAcessoMatricula, hoje, link, notificarAluna, sincronizarOcorrencias, texto, textoObrig, validar } from '../servicos'
import { arquivoEnviado, corpoDoArquivo, entregarAnexo, hashArquivo } from '../anexos'
import { extrairContrato, normalizar, type DadosContrato } from '../../shared/contrato'
import { CANAIS_CONTATO, CATEGORIAS_MURAL } from './portalServicos'
import { PERCENTUAL_ASSISTIDA } from '../../shared/linhaTempo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

/** Endereço de vídeo do Vimeo aceito: vimeo.com/123, vimeo.com/123/hash, player.vimeo.com/video/123?h=hash. */
export function embedVimeo(url: string | null | undefined): string | null {
  if (!url) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.replace(/^www\./, '')
  let id: string | undefined
  let hash: string | null = u.searchParams.get('h')
  if (host === 'player.vimeo.com') {
    const m = /^\/video\/(\d+)\/?$/.exec(u.pathname)
    id = m?.[1]
  } else if (host === 'vimeo.com') {
    const m = /^\/(?:.*\/)?(\d+)(?:\/([0-9a-f]+))?\/?$/.exec(u.pathname)
    id = m?.[1]
    hash = hash ?? m?.[2] ?? null
  }
  if (!id) return null
  return `https://player.vimeo.com/video/${id}${hash ? `?h=${encodeURIComponent(hash)}` : ''}`
}

/**
 * Sugestões de ação a partir da transcrição colada: frases com compromisso ("vou", "ficou combinado",
 * "próximo passo", "até sexta"...). É uma ajuda para a revisão, não um resumo automático: tudo nasce
 * como rascunho e só chega à aluna depois de revisado e publicado.
 */
export function sugerirAcoes(textoTranscricao: string): { titulo: string; prazo: string | null }[] {
  const frases = textoTranscricao
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.replace(/^\s*(?:\[[^\]]{0,20}\]|\d{1,2}:\d{2}(?::\d{2})?)\s*/, '').replace(/^[A-ZÀ-Ú][\wÀ-ú ]{0,30}:\s+/, '').trim())
    .filter((f) => f.length >= 15 && f.length <= 400)
  const marca = /\b(vou|vai|vamos|voce vai|ficou combinado|combinamos|combinado|proximo passo|proximos passos|tarefa|para a proxima|ate (?:o dia|dia|sexta|segunda|terca|quarta|quinta|sabado|domingo|a proxima|semana que vem)|preciso|precisa|definir|implementar|enviar|preparar|montar|revisar|criar|organizar)\b/
  const vistos = new Set<string>()
  const saida: { titulo: string; prazo: string | null }[] = []
  for (const f of frases) {
    const n = normalizar(f)
    if (!marca.test(n)) continue
    const chave = n.replace(/\W+/g, ' ').trim()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const d = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/.exec(f)
    let prazo: string | null = null
    if (d) {
      const ano = d[3] ? Number(d[3]) : Number(hoje().slice(0, 4))
      const mes = Number(d[2])
      const dia = Number(d[1])
      if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) prazo = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    }
    saida.push({ titulo: f.length > 200 ? `${f.slice(0, 197)}…` : f, prazo })
    if (saida.length >= 15) break
  }
  return saida
}

export function rotasAcompanhamento(db: BD, ctx: ContextoApp) {
  const r = Router()
  r.use(exigirEquipe)

  async function ocorrenciaComAcesso(req: Request, id: string) {
    const o = (await db.get('SELECT o.id, o.matricula_id, o.situacao, o.numero, o.data_realizada, o.data_agendada FROM ped_ocorrencias o WHERE o.id = ?', id)) as Linha | undefined
    if (!o) throw new ErroHttp(404, 'Encontro não encontrado.')
    await exigirAcessoMatricula(db, req, o.matricula_id)
    return o
  }

  /* ---------------- Transcrição (só equipe autorizada) ---------------- */

  r.get('/ocorrencias/:id/transcricao', async (req, res) => {
    exigir(req, 'transcricoes:ver')
    const o = await ocorrenciaComAcesso(req, req.params.id as string)
    const t = await db.get('SELECT t.id, t.texto, t.fonte, t.criado_em, t.atualizado_em, u.nome AS autor_nome FROM ped_transcricoes t LEFT JOIN ped_usuarios u ON u.id = t.autor_id WHERE t.ocorrencia_id = ?', o.id)
    res.json({ transcricao: t ?? null, automacao: 'A transcrição automática precisa de um serviço de gravação/transcrição conectado às reuniões (não configurado). Por enquanto, cole a transcrição pronta.' })
  })

  r.put('/ocorrencias/:id/transcricao', async (req, res) => {
    exigir(req, 'transcricoes:ver')
    const o = await ocorrenciaComAcesso(req, req.params.id as string)
    const d = validar(z.object({ texto: textoObrig('a transcrição', 200_000) }), req.body)
    const agora = agoraIso()
    await db.run(
      `INSERT INTO ped_transcricoes (id, ocorrencia_id, matricula_id, texto, fonte, autor_id, criado_em, atualizado_em) VALUES (?,?,?,?, 'manual', ?,?,?)
       ON CONFLICT (ocorrencia_id) DO UPDATE SET texto = excluded.texto, autor_id = excluded.autor_id, atualizado_em = excluded.atualizado_em`,
      novoId(), o.id, o.matricula_id, d.texto, req.usuario!.id, agora, agora,
    )
    // A auditoria registra que houve alteração, nunca o conteúdo da transcrição.
    await auditar(db, req, { entidade: 'transcricao', entidade_id: o.id, acao: 'transcricao_salva', matricula_id: o.matricula_id, dados: { caracteres: d.texto.length } })
    res.json({ ok: true })
  })

  r.post('/ocorrencias/:id/transcricao/sugestoes', async (req, res) => {
    exigir(req, 'transcricoes:ver', 'acoes:editar')
    const o = await ocorrenciaComAcesso(req, req.params.id as string)
    const t = (await db.get('SELECT texto FROM ped_transcricoes WHERE ocorrencia_id = ?', o.id)) as { texto: string } | undefined
    if (!t) throw new ErroHttp(409, 'Cole a transcrição do encontro antes de gerar sugestões.')
    const existentes = new Set(((await db.all("SELECT titulo FROM ped_acoes WHERE ocorrencia_id = ? AND origem = 'transcricao'", o.id)) as { titulo: string }[]).map((a) => normalizar(a.titulo)))
    const novas = sugerirAcoes(t.texto).filter((s) => !existentes.has(normalizar(s.titulo)))
    await transacao(db, async (tx) => {
      const agora = agoraIso()
      for (const s of novas)
        tx.run("INSERT INTO ped_acoes (id, matricula_id, ocorrencia_id, titulo, prazo, situacao, andamento, origem, autor_id, criado_em, atualizado_em) VALUES (?,?,?,?,?,'rascunho','a_fazer','transcricao',?,?,?)", novoId(), o.matricula_id, o.id, s.titulo, s.prazo, req.usuario!.id, agora, agora)
      await auditar(tx, req, { entidade: 'acao', entidade_id: o.id, acao: 'sugestoes_da_transcricao', matricula_id: o.matricula_id, dados: { criadas: novas.length } })
    })
    res.status(201).json({ criadas: novas.length })
  })

  /* ---------------- Plano de Ação: rascunho → revisão → publicação ---------------- */

  r.get('/matriculas/:id/acoes', async (req, res) => {
    exigir(req, 'jornada:ver')
    await exigirAcessoMatricula(db, req, req.params.id as string)
    const acoes = await db.all(`SELECT a.*, COALESCE(t.nome, i.descricao) AS encontro_tipo, o.numero AS encontro_numero, COALESCE(o.data_realizada, o.data_agendada) AS encontro_data,
           ua.nome AS autor_nome, ur.nome AS revisada_por_nome, up.nome AS publicada_por_nome
         FROM ped_acoes a LEFT JOIN ped_ocorrencias o ON o.id = a.ocorrencia_id LEFT JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id
         LEFT JOIN ped_usuarios ua ON ua.id = a.autor_id LEFT JOIN ped_usuarios ur ON ur.id = a.revisada_por LEFT JOIN ped_usuarios up ON up.id = a.publicada_por
         WHERE a.matricula_id = ? AND a.situacao <> 'arquivada' ORDER BY CASE a.situacao WHEN 'em_revisao' THEN 0 WHEN 'rascunho' THEN 1 ELSE 2 END, COALESCE(a.prazo, '9999'), a.criado_em`, req.params.id)
    const encontros = await db.all(`SELECT o.id, o.numero, o.situacao, COALESCE(o.data_realizada, o.data_agendada) AS data, COALESCE(t.nome, i.descricao) AS tipo,
           EXISTS (SELECT 1 FROM ped_transcricoes x WHERE x.ocorrencia_id = o.id) AS tem_transcricao
         FROM ped_ocorrencias o JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id
         WHERE o.matricula_id = ? AND o.situacao IN ('realizada','agendada') ORDER BY COALESCE(o.data_realizada, o.data_agendada) DESC`, req.params.id)
    res.json({ acoes, encontros: tem(req, 'transcricoes:ver') ? encontros : (encontros as Linha[]).map((e) => ({ ...e, tem_transcricao: undefined })) })
  })

  const esquemaAcao = z.object({ titulo: textoObrig('a ação', 300), descricao: texto(3000), prazo: data('o prazo'), ocorrencia_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()) })

  async function conferirEncontro(matriculaId: string, ocorrenciaId: string | null | undefined) {
    if (!ocorrenciaId) return
    const ok = await db.get('SELECT 1 FROM ped_ocorrencias WHERE id = ? AND matricula_id = ?', ocorrenciaId, matriculaId)
    if (!ok) throw new ErroHttp(400, 'O encontro escolhido não é desta matrícula.')
  }

  r.post('/matriculas/:id/acoes', async (req, res) => {
    exigir(req, 'acoes:editar')
    await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(esquemaAcao, req.body)
    await conferirEncontro(req.params.id as string, d.ocorrencia_id)
    const id = novoId()
    await db.run("INSERT INTO ped_acoes (id, matricula_id, ocorrencia_id, titulo, descricao, prazo, situacao, andamento, origem, autor_id, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,'rascunho','a_fazer','manual',?,?,?)", id, req.params.id, d.ocorrencia_id ?? null, d.titulo, d.descricao ?? null, d.prazo ?? null, req.usuario!.id, agoraIso(), agoraIso())
    await auditar(db, req, { entidade: 'acao', entidade_id: id, acao: 'criada', matricula_id: req.params.id as string, dados: { titulo: d.titulo } })
    res.status(201).json({ id })
  })

  async function acaoComAcesso(req: Request) {
    const a = (await db.get('SELECT * FROM ped_acoes WHERE id = ?', req.params.id)) as Linha | undefined
    if (!a) throw new ErroHttp(404, 'Ação não encontrada.')
    await exigirAcessoMatricula(db, req, a.matricula_id)
    return a
  }

  r.put('/acoes/:id', async (req, res) => {
    exigir(req, 'acoes:editar')
    const a = await acaoComAcesso(req)
    // Mudar o texto de uma ação já publicada é republicar: exige quem pode publicar.
    if (a.situacao === 'publicada') exigir(req, 'acoes:publicar')
    if (a.situacao === 'arquivada') throw new ErroHttp(409, 'Esta ação foi arquivada.')
    const d = validar(esquemaAcao, req.body)
    await conferirEncontro(a.matricula_id, d.ocorrencia_id)
    await db.run('UPDATE ped_acoes SET titulo=?, descricao=?, prazo=?, ocorrencia_id=?, atualizado_em=? WHERE id=?', d.titulo, d.descricao ?? null, d.prazo ?? null, d.ocorrencia_id ?? null, agoraIso(), a.id)
    await auditar(db, req, { entidade: 'acao', entidade_id: a.id, acao: 'editada', matricula_id: a.matricula_id, dados: { antes: { titulo: a.titulo, prazo: a.prazo }, depois: { titulo: d.titulo, prazo: d.prazo ?? null } } })
    res.json({ ok: true })
  })

  r.post('/acoes/:id/fluxo', async (req, res) => {
    const a = await acaoComAcesso(req)
    const d = validar(z.object({ passo: z.enum(['enviar_revisao', 'devolver', 'publicar', 'despublicar', 'arquivar']), motivo: texto(500) }), req.body)
    const agora = agoraIso()
    const u = req.usuario!.id
    const regras: Record<string, { de: string[]; para: string; permissao: 'acoes:editar' | 'acoes:publicar' }> = {
      enviar_revisao: { de: ['rascunho'], para: 'em_revisao', permissao: 'acoes:editar' },
      devolver: { de: ['em_revisao'], para: 'rascunho', permissao: 'acoes:editar' },
      publicar: { de: ['em_revisao'], para: 'publicada', permissao: 'acoes:publicar' },
      despublicar: { de: ['publicada'], para: 'em_revisao', permissao: 'acoes:publicar' },
      arquivar: { de: ['rascunho', 'em_revisao', 'publicada'], para: 'arquivada', permissao: 'acoes:editar' },
    }
    const regra = regras[d.passo]
    exigir(req, regra.permissao)
    if (a.situacao === 'publicada' && d.passo === 'arquivar') exigir(req, 'acoes:publicar')
    if (!regra.de.includes(a.situacao)) throw new ErroHttp(409, d.passo === 'publicar' ? 'Envie a ação para revisão antes de publicar.' : 'Esta ação não está na etapa certa para este passo.')
    await transacao(db, async (tx) => {
      if (d.passo === 'publicar') tx.run("UPDATE ped_acoes SET situacao='publicada', revisada_por=?, revisada_em=?, publicada_por=?, publicada_em=?, atualizado_em=? WHERE id=?", u, agora, u, agora, agora, a.id)
      else tx.run('UPDATE ped_acoes SET situacao=?, atualizado_em=? WHERE id=?', regra.para, agora, a.id)
      if (d.passo === 'publicar') await notificarAluna(tx, a.matricula_id, { titulo: 'Nova ação no seu Plano de Ação', detalhe: String(a.titulo).slice(0, 120), link: '#/acoes' })
      await auditar(tx, req, { entidade: 'acao', entidade_id: a.id, acao: `acao_${d.passo}`, matricula_id: a.matricula_id, dados: { de: a.situacao, para: regra.para, motivo: d.motivo ?? null } })
    })
    res.json({ ok: true })
  })

  /* ---------------- Contrato da matrícula ---------------- */

  const EXT_CONTRATO = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']

  async function matriculaContrato(req: Request, id: string) {
    exigir(req, 'contratos:ver')
    return (await exigirAcessoMatricula(db, req, id)) as Linha
  }

  async function itensComparaveis(dbx: BDouTX, matriculaId: string) {
    return (await dbx.all(`SELECT i.tipo_id, i.origem, COALESCE(t.nome, i.descricao) AS nome,
           SUM(i.quantidade + COALESCE((SELECT SUM(a.delta) FROM ped_ajustes_obrigacao a WHERE a.item_id = i.id), 0)) AS quantidade
         FROM ped_itens_contratados i LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id WHERE i.matricula_id = ? GROUP BY i.tipo_id, i.origem, COALESCE(t.nome, i.descricao)`, matriculaId)) as Linha[]
  }

  /** O que o contrato diz × o que está no sistema, campo a campo. */
  async function comparar(m: Linha, dados: DadosContrato | null) {
    if (!dados) return null
    const atual = (await db.get('SELECT m.data_inicio, m.data_fim, m.programa_id, p.nome AS programa_nome FROM ped_matriculas m LEFT JOIN ped_programas p ON p.id = m.programa_id WHERE m.id = ?', m.id)) as Linha
    const itens = await itensComparaveis(db, m.id)
    const campo = (contrato: unknown, sistema: unknown) => ({ contrato: contrato ?? null, sistema: sistema ?? null, diverge: contrato != null && sistema != null && contrato !== sistema })
    return {
      data_inicio: campo(dados.data_inicio.valor, atual.data_inicio),
      data_fim: campo(dados.data_fim.valor, atual.data_fim),
      programa: campo(dados.programa.valor?.nome, atual.programa_nome),
      itens: dados.itens.map((it) => {
        const noSistema = itens.filter((x) => (it.tipo_id ? x.tipo_id === it.tipo_id : normalizar(String(x.nome)) === normalizar(it.descricao)) && x.origem === it.origem)
        const qtd = noSistema.reduce((s, x) => s + Number(x.quantidade), 0)
        return { chave: it.chave, contrato: it.quantidade, sistema: noSistema.length ? qtd : null, diverge: noSistema.length > 0 && it.quantidade != null && it.quantidade !== qtd, ja_existe: noSistema.length > 0 }
      }),
    }
  }

  r.get('/matriculas/:id/contratos', async (req, res) => {
    const m = await matriculaContrato(req, req.params.id as string)
    const lista = (await db.all('SELECT c.id, c.nome, c.tipo, c.tamanho, c.hash, c.dados_extraidos, c.dados_aplicados, c.confirmado_em, c.criado_em, u.nome AS confirmado_por_nome, a.nome AS autor_nome FROM ped_contratos c LEFT JOIN ped_usuarios u ON u.id = c.confirmado_por LEFT JOIN ped_usuarios a ON a.id = c.autor_id WHERE c.matricula_id = ? ORDER BY c.criado_em DESC', m.id)) as Linha[]
    const saida = []
    for (const c of lista) {
      const dados = c.dados_extraidos ? (JSON.parse(c.dados_extraidos) as DadosContrato) : null
      saida.push({ ...c, hash: undefined, dados_extraidos: dados, dados_aplicados: c.dados_aplicados ? JSON.parse(c.dados_aplicados) : null, comparacao: await comparar(m, dados) })
    }
    res.json({ contratos: saida })
  })

  r.post('/matriculas/:id/contratos', corpoDoArquivo, async (req, res) => {
    const m = await matriculaContrato(req, req.params.id as string)
    exigir(req, 'comercial:editar')
    const f = arquivoEnviado(req, EXT_CONTRATO, 'Envie o contrato em PDF, Word (DOC, DOCX) ou imagem (JPG, PNG).')
    const hash = await hashArquivo(f.dados)
    const existente = (await db.get('SELECT id FROM ped_contratos WHERE matricula_id = ? AND hash = ?', m.id, hash)) as Linha | undefined
    if (existente) return res.json({ id: existente.id, repetido: true })
    const id = novoId()
    const chave = `contratos/${m.id}/${id}`
    await ctx.arquivos.guardar(chave, f.dados, f.tipo)
    await db.run('INSERT INTO ped_contratos (id, matricula_id, nome, tipo, tamanho, chave, hash, autor_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?)', id, m.id, f.nome, f.tipo, f.dados.byteLength, chave, hash, req.usuario!.id, agoraIso())
    await auditar(db, req, { entidade: 'contrato', entidade_id: id, acao: 'contrato_anexado', matricula_id: m.id, dados: { nome: f.nome, tamanho: f.dados.byteLength } })
    res.status(201).json({ id, repetido: false })
  })

  async function contratoComAcesso(req: Request) {
    exigir(req, 'contratos:ver')
    const c = (await db.get('SELECT * FROM ped_contratos WHERE id = ?', req.params.id)) as Linha | undefined
    if (!c) throw new ErroHttp(404, 'Contrato não encontrado.')
    const m = (await exigirAcessoMatricula(db, req, c.matricula_id)) as Linha
    return { c, m }
  }

  r.get('/contratos/:id/arquivo', async (req, res) => {
    const { c } = await contratoComAcesso(req)
    await auditar(db, req, { entidade: 'contrato', entidade_id: c.id, acao: 'contrato_baixado', matricula_id: c.matricula_id })
    await entregarAnexo(ctx.arquivos, res, c)
  })

  // O navegador lê o texto do PDF e manda para cá; a leitura dos campos é feita aqui (mesma regra sempre).
  r.post('/contratos/:id/leitura', async (req, res) => {
    const { c, m } = await contratoComAcesso(req)
    const d = validar(z.object({ texto: z.string().max(400_000).default('') }), req.body)
    const programas = (await db.all('SELECT id, nome FROM ped_programas WHERE ativo = 1')) as { id: string; nome: string }[]
    const tipos = (await db.all('SELECT id, nome FROM ped_tipos_entregavel WHERE ativo = 1')) as { id: string; nome: string }[]
    const dados = extrairContrato(d.texto, { programas, tipos })
    await db.run('UPDATE ped_contratos SET dados_extraidos = ? WHERE id = ?', JSON.stringify(dados), c.id)
    await auditar(db, req, { entidade: 'contrato', entidade_id: c.id, acao: 'contrato_lido', matricula_id: c.matricula_id, dados: { legivel: dados.legivel, itens: dados.itens.length } })
    res.json({ dados, comparacao: await comparar(m, dados) })
  })

  // Aplica o que a equipe revisou. Itens já aplicados deste arquivo (mesma origem) nunca são criados de novo.
  r.post('/contratos/:id/aplicar', async (req, res) => {
    const { c, m } = await contratoComAcesso(req)
    exigir(req, 'comercial:editar')
    const d = validar(
      z.object({
        data_inicio: data('o início da vigência'),
        data_fim: data('o término da vigência'),
        programa_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
        motivo: texto(500),
        itens: z
          .array(
            z.object({
              chave: z.string().trim().min(1).max(120),
              tipo_id: z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullable().optional()),
              descricao: textoObrig('a descrição do item', 200),
              quantidade: z.coerce.number({ error: 'Informe a quantidade.' }).int().min(1, 'A quantidade precisa ser pelo menos 1.').max(500),
              origem: z.enum(['pacote', 'bonus']),
            }),
          )
          .max(50)
          .default([]),
      }),
      req.body,
    )
    const inicio = d.data_inicio ?? m.data_inicio
    const fim = d.data_fim === undefined ? m.data_fim : d.data_fim
    if (fim && inicio && fim < inicio) throw new ErroHttp(400, 'O término da vigência não pode ser antes do início.')
    const mudaVigencia = (d.data_inicio && d.data_inicio !== m.data_inicio) || (d.data_fim && d.data_fim !== m.data_fim)
    if (mudaVigencia && m.data_fim && !d.motivo) throw new ErroHttp(400, 'Informe o motivo da alteração da vigência (ex.: conferido com o contrato assinado).')
    if (d.programa_id && !(await db.get('SELECT 1 FROM ped_programas WHERE id = ?', d.programa_id))) throw new ErroHttp(400, 'Programa não encontrado.')
    const prefixo = c.hash.slice(0, 16)
    const jaAplicados = new Set(((await db.all('SELECT contrato_origem FROM ped_itens_contratados WHERE matricula_id = ? AND contrato_origem LIKE ?', m.id, `${prefixo}:%`)) as Linha[]).map((x) => x.contrato_origem))
    const criados: string[] = []
    const ignorados: string[] = []
    await transacao(db, async (tx) => {
      if (d.data_inicio || d.data_fim !== undefined || d.programa_id) {
        tx.run('UPDATE ped_matriculas SET data_inicio = ?, data_fim = ?, programa_id = COALESCE(?, programa_id), atualizado_em = ?, autor_id = ? WHERE id = ?', inicio, fim ?? null, d.programa_id ?? null, agoraIso(), req.usuario!.id, m.id)
      }
      for (const it of d.itens) {
        const origem = `${prefixo}:${it.chave}`
        if (jaAplicados.has(origem)) {
          ignorados.push(it.descricao)
          continue
        }
        jaAplicados.add(origem)
        const iid = novoId()
        const agora = agoraIso()
        tx.run(`INSERT INTO ped_itens_contratados (id, matricula_id, tipo_id, descricao, quantidade, origem, referencia_comercial, contrato_origem, criado_em, atualizado_em, autor_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`, iid, m.id, it.tipo_id ?? null, it.descricao, it.quantidade, it.origem, `Contrato: ${c.nome}`, origem, agora, agora, req.usuario!.id)
        await sincronizarOcorrencias(tx, req, iid, 'Item do contrato', { novo: { matricula_id: m.id, quantidade: it.quantidade } })
        criados.push(it.descricao)
      }
      tx.run('UPDATE ped_contratos SET dados_aplicados = ?, confirmado_por = ?, confirmado_em = ? WHERE id = ?', JSON.stringify(d), req.usuario!.id, agoraIso(), c.id)
      await auditar(tx, req, { entidade: 'contrato', entidade_id: c.id, acao: 'contrato_conferido_aplicado', matricula_id: m.id, dados: { antes: { data_inicio: m.data_inicio, data_fim: m.data_fim, programa_id: m.programa_id }, depois: { data_inicio: inicio, data_fim: fim, programa_id: d.programa_id ?? m.programa_id }, criados, ignorados, motivo: d.motivo ?? null } })
    })
    res.json({ ok: true, criados, ignorados })
  })

  /* ---------------- Conteúdos do portal: Rotina, Biblioteca (com estantes) e Livros ---------------- */

  type SecaoConteudo = 'rotina' | 'biblioteca' | 'livros'
  // A Biblioteca também é editada por quem tem biblioteca:editar (Suporte, por padrão); Rotina e Livros, só conteudos:editar.
  const podeSecao = (req: Request, secao: SecaoConteudo) => tem(req, 'conteudos:editar') || (secao === 'biblioteca' && tem(req, 'biblioteca:editar'))
  const exigirSecao = (req: Request, secao: SecaoConteudo) => {
    if (!podeSecao(req, secao)) throw new ErroHttp(403, 'Você não tem permissão para esta operação.')
  }
  const exigirBiblioteca = (req: Request) => exigirSecao(req, 'biblioteca')

  const esquemaConteudo = z.object({
    secao: z.enum(['rotina', 'biblioteca', 'livros']),
    estante_id: z.string().trim().max(64).nullish().transform((v) => v || null),
    categoria: texto(80),
    titulo: textoObrig('o título', 200),
    descricao: texto(4000),
    link: link(),
    video_url: texto(500),
    compra_url: link(),
    ordem: z.coerce.number().int().min(0).max(999).default(0),
  })

  async function conferirConteudo(d: z.infer<typeof esquemaConteudo>) {
    if (d.video_url && !embedVimeo(d.video_url)) throw new ErroHttp(400, 'Use o endereço de um vídeo do Vimeo (https://vimeo.com/…).')
    if (d.secao === 'livros' && d.video_url) throw new ErroHttp(400, 'Livros não têm vídeo. Use o link de compra.')
    if (d.secao !== 'livros' && d.compra_url) throw new ErroHttp(400, 'O link de compra é só para livros.')
    if (d.estante_id) {
      if (d.secao !== 'biblioteca') throw new ErroHttp(400, 'Estantes são só da Biblioteca.')
      if (!(await db.get('SELECT id FROM ped_estantes WHERE id = ?', d.estante_id))) throw new ErroHttp(400, 'Estante não encontrada.')
    }
  }

  r.get('/conteudos', async (req, res) => {
    if (!tem(req, 'conteudos:editar')) exigirBiblioteca(req)
    const so = tem(req, 'conteudos:editar') ? '' : "WHERE c.secao = 'biblioteca'"
    // Quantas alunas começaram e quantas terminaram cada vídeo (sem expor quem, aqui).
    const lista = (await db.all(`SELECT c.*, u.nome AS autor_nome,
        (SELECT COUNT(*) FROM ped_conteudos_progresso p WHERE p.conteudo_id = c.id AND p.percentual > 0) AS alunas_iniciaram,
        (SELECT COUNT(*) FROM ped_conteudos_progresso p WHERE p.conteudo_id = c.id AND p.percentual >= ${PERCENTUAL_ASSISTIDA}) AS alunas_assistiram
      FROM ped_conteudos c LEFT JOIN ped_usuarios u ON u.id = c.autor_id ${so}
      ORDER BY c.secao, COALESCE(c.categoria, ''), c.ordem, c.titulo`)) as Linha[]
    res.json({
      conteudos: lista.map((c) => ({ ...c, arquivo_chave: undefined, tem_arquivo: !!c.arquivo_chave })),
      estantes: await db.all('SELECT * FROM ped_estantes ORDER BY ordem, titulo'),
      secoes: (['rotina', 'biblioteca', 'livros'] as const).filter((x) => podeSecao(req, x)),
    })
  })

  r.post('/conteudos', async (req, res) => {
    const d = validar(esquemaConteudo, req.body)
    exigirSecao(req, d.secao)
    await conferirConteudo(d)
    const id = novoId()
    await db.run('INSERT INTO ped_conteudos (id, secao, estante_id, categoria, titulo, descricao, link, video_url, compra_url, publicado, ordem, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?)', id, d.secao, d.estante_id, d.categoria ?? null, d.titulo, d.descricao ?? null, d.link ?? null, embedVimeo(d.video_url), d.compra_url ?? null, d.ordem, agoraIso(), agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'conteudo', entidade_id: id, acao: 'criado', dados: { secao: d.secao, titulo: d.titulo, estante_id: d.estante_id } })
    res.status(201).json({ id })
  })

  async function conteudo(id: string) {
    const c = (await db.get('SELECT * FROM ped_conteudos WHERE id = ?', id)) as Linha | undefined
    if (!c) throw new ErroHttp(404, 'Conteúdo não encontrado.')
    return c
  }

  r.put('/conteudos/:id', async (req, res) => {
    const c = await conteudo(req.params.id as string)
    exigirSecao(req, c.secao)
    const d = validar(esquemaConteudo, req.body)
    exigirSecao(req, d.secao)
    await conferirConteudo(d)
    if (d.secao === 'livros' && c.arquivo_chave) throw new ErroHttp(400, 'Livros não podem ter arquivo anexado. Remova o arquivo antes.')
    await db.run('UPDATE ped_conteudos SET secao=?, estante_id=?, categoria=?, titulo=?, descricao=?, link=?, video_url=?, compra_url=?, ordem=?, atualizado_em=?, autor_id=? WHERE id=?', d.secao, d.estante_id, d.categoria ?? null, d.titulo, d.descricao ?? null, d.link ?? null, embedVimeo(d.video_url), d.compra_url ?? null, d.ordem, agoraIso(), req.usuario!.id, c.id)
    await auditar(db, req, { entidade: 'conteudo', entidade_id: c.id, acao: 'atualizado', dados: { titulo: d.titulo, estante_id: d.estante_id } })
    res.json({ ok: true })
  })

  r.post('/conteudos/:id/publicar', async (req, res) => {
    const c = await conteudo(req.params.id as string)
    exigirSecao(req, c.secao)
    const d = validar(z.object({ publicado: z.boolean() }), req.body)
    await db.run('UPDATE ped_conteudos SET publicado = ?, atualizado_em = ? WHERE id = ?', d.publicado ? 1 : 0, agoraIso(), c.id)
    await auditar(db, req, { entidade: 'conteudo', entidade_id: c.id, acao: d.publicado ? 'publicado' : 'despublicado' })
    res.json({ ok: true })
  })

  // Arquivo de Rotina ou Biblioteca (ex.: ferramenta em planilha). Livro nunca recebe arquivo (sem PDF de livro).
  r.post('/conteudos/:id/arquivo', corpoDoArquivo, async (req, res) => {
    const c = await conteudo(req.params.id as string)
    exigirSecao(req, c.secao)
    if (c.secao === 'livros') throw new ErroHttp(400, 'Livros não recebem arquivo: use o link de compra.')
    const f = arquivoEnviado(req, ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp', 'txt', 'csv', 'mp3', 'm4a'], 'Tipo de arquivo não aceito. Envie PDF, Word, Excel, PowerPoint, imagem, texto ou áudio. Para vídeo, use o Vimeo.')
    const chave = `conteudos/${c.id}/${novoId()}`
    await ctx.arquivos.guardar(chave, f.dados, f.tipo)
    await db.run('UPDATE ped_conteudos SET arquivo_chave=?, arquivo_nome=?, arquivo_tipo=?, arquivo_tamanho=?, atualizado_em=? WHERE id=?', chave, f.nome, f.tipo, f.dados.byteLength, agoraIso(), c.id)
    if (c.arquivo_chave) await ctx.arquivos.apagar([c.arquivo_chave])
    await auditar(db, req, { entidade: 'conteudo', entidade_id: c.id, acao: 'arquivo_enviado', dados: { nome: f.nome } })
    res.status(201).json({ ok: true, nome: f.nome })
  })

  r.delete('/conteudos/:id/arquivo', async (req, res) => {
    const c = await conteudo(req.params.id as string)
    exigirSecao(req, c.secao)
    if (c.arquivo_chave) {
      await db.run('UPDATE ped_conteudos SET arquivo_chave=NULL, arquivo_nome=NULL, arquivo_tipo=NULL, arquivo_tamanho=NULL, atualizado_em=? WHERE id=?', agoraIso(), c.id)
      await ctx.arquivos.apagar([c.arquivo_chave])
      await auditar(db, req, { entidade: 'conteudo', entidade_id: c.id, acao: 'arquivo_removido' })
    }
    res.json({ ok: true })
  })

  /* ---------------- Estantes da Biblioteca ---------------- */

  const esquemaEstante = z.object({
    titulo: textoObrig('o nome da estante', 120),
    descricao: texto(1000),
    ordem: z.coerce.number().int().min(0).max(999).default(0),
  })

  async function estante(id: string) {
    const e = (await db.get('SELECT * FROM ped_estantes WHERE id = ?', id)) as Linha | undefined
    if (!e) throw new ErroHttp(404, 'Estante não encontrada.')
    return e
  }

  r.get('/estantes', async (req, res) => {
    exigirBiblioteca(req)
    res.json({ estantes: await db.all('SELECT * FROM ped_estantes ORDER BY ordem, titulo') })
  })

  r.post('/estantes', async (req, res) => {
    exigirBiblioteca(req)
    const d = validar(esquemaEstante, req.body)
    const id = novoId()
    await db.run('INSERT INTO ped_estantes (id, titulo, descricao, ordem, publicada, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,0,?,?,?)', id, d.titulo, d.descricao ?? null, d.ordem, agoraIso(), agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'estante', entidade_id: id, acao: 'criada', dados: { titulo: d.titulo } })
    res.status(201).json({ id })
  })

  r.put('/estantes/:id', async (req, res) => {
    exigirBiblioteca(req)
    const e = await estante(req.params.id as string)
    const d = validar(esquemaEstante, req.body)
    await db.run('UPDATE ped_estantes SET titulo=?, descricao=?, ordem=?, atualizado_em=?, autor_id=? WHERE id=?', d.titulo, d.descricao ?? null, d.ordem, agoraIso(), req.usuario!.id, e.id)
    await auditar(db, req, { entidade: 'estante', entidade_id: e.id, acao: 'atualizada', dados: { titulo: d.titulo } })
    res.json({ ok: true })
  })

  // Retirar do portal esconde a estante e tudo o que está nela; nada é apagado.
  r.post('/estantes/:id/publicar', async (req, res) => {
    exigirBiblioteca(req)
    const e = await estante(req.params.id as string)
    const d = validar(z.object({ publicada: z.boolean() }), req.body)
    await db.run('UPDATE ped_estantes SET publicada = ?, atualizado_em = ? WHERE id = ?', d.publicada ? 1 : 0, agoraIso(), e.id)
    await auditar(db, req, { entidade: 'estante', entidade_id: e.id, acao: d.publicada ? 'publicada' : 'despublicada' })
    res.json({ ok: true })
  })

  /* ---------------- Mural: moderação e publicação pela equipe ---------------- */

  r.get('/mural', async (req, res) => {
    exigir(req, 'mural:moderar')
    res.json({ publicacoes: await db.all("SELECT mu.*, u.nome AS moderada_por_nome FROM ped_mural mu LEFT JOIN ped_usuarios u ON u.id = mu.moderada_por ORDER BY CASE mu.situacao WHEN 'pendente' THEN 0 WHEN 'publicada' THEN 1 ELSE 2 END, mu.criado_em DESC LIMIT 300") })
  })

  r.post('/mural', async (req, res) => {
    exigir(req, 'mural:moderar')
    const d = validar(
      z.object({
        categoria: z.enum(CATEGORIAS_MURAL),
        titulo: textoObrig('o título', 120),
        descricao: textoObrig('a descrição', 2000),
        contato_canal: z.enum(CANAIS_CONTATO),
        contato_valor: textoObrig('o contato', 200),
        autora_nome: texto(120),
      }),
      req.body,
    )
    const id = novoId()
    await db.run("INSERT INTO ped_mural (id, autora_equipe_id, autora_nome, categoria, titulo, descricao, contato_canal, contato_valor, situacao, moderada_por, moderada_em, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,'publicada',?,?,?,?)", id, req.usuario!.id, d.autora_nome ?? 'Equipe Centro Liderar', d.categoria, d.titulo, d.descricao, d.contato_canal, d.contato_valor, req.usuario!.id, agoraIso(), agoraIso(), agoraIso())
    await auditar(db, req, { entidade: 'mural', entidade_id: id, acao: 'publicada_pela_equipe', dados: { titulo: d.titulo } })
    res.status(201).json({ id })
  })

  r.post('/mural/:id/moderar', async (req, res) => {
    exigir(req, 'mural:moderar')
    const d = validar(z.object({ decisao: z.enum(['publicar', 'recusar', 'arquivar']), motivo: texto(500) }), req.body)
    if (d.decisao === 'recusar' && !d.motivo) throw new ErroHttp(400, 'Informe o motivo da recusa (a aluna verá esse motivo).')
    const p = (await db.get('SELECT * FROM ped_mural WHERE id = ?', req.params.id)) as Linha | undefined
    if (!p) throw new ErroHttp(404, 'Publicação não encontrada.')
    const para = { publicar: 'publicada', recusar: 'recusada', arquivar: 'arquivada' }[d.decisao]
    await db.run('UPDATE ped_mural SET situacao=?, moderada_por=?, moderada_em=?, motivo_moderacao=?, atualizado_em=? WHERE id=?', para, req.usuario!.id, agoraIso(), d.motivo ?? null, agoraIso(), p.id)
    await auditar(db, req, { entidade: 'mural', entidade_id: p.id, acao: `mural_${d.decisao}`, pessoa_id: p.autora_pessoa_id ?? null, dados: { de: p.situacao, para, motivo: d.motivo ?? null } })
    res.json({ ok: true })
  })

  /* ---------------- Depoimentos (ficha da aluna) ---------------- */

  r.get('/matriculas/:id/depoimentos', async (req, res) => {
    exigir(req, 'jornada:ver')
    await exigirAcessoMatricula(db, req, req.params.id as string)
    res.json({
      depoimentos: await db.all(`SELECT d.id, d.alvo_tipo, d.alvo_id, d.texto, d.atualizado_em,
             CASE d.alvo_tipo WHEN 'encontro' THEN (SELECT COALESCE(t.nome, i.descricao) || ' nº ' || o.numero FROM ped_ocorrencias o JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id WHERE o.id = d.alvo_id)
               ELSE (SELECT a.titulo FROM ped_atividades a WHERE a.id = d.alvo_id) END AS alvo_nome
           FROM ped_depoimentos d WHERE d.matricula_id = ? ORDER BY d.atualizado_em DESC`, req.params.id),
    })
  })

  // Ações aguardando revisão, de todas as alunas que a pessoa pode ver.
  r.get('/acoes/pendentes-revisao', async (req, res) => {
    exigir(req, 'acoes:publicar')
    const esc = escopoMatriculas(req)
    res.json({ acoes: await db.all(`SELECT a.id, a.titulo, a.matricula_id, p.nome AS pessoa_nome, p.id AS pessoa_id FROM ped_acoes a JOIN ped_matriculas m ON m.id = a.matricula_id JOIN ped_pessoas p ON p.id = m.pessoa_id WHERE a.situacao = 'em_revisao' AND ${esc.sql} ORDER BY a.atualizado_em`, esc.params) })
  })

  return r
}
