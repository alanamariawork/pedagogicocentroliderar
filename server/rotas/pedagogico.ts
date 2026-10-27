import { Router, type Request } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import { ErroHttp, exigir, exigirEquipe, tem } from '../auth'
import { auditar, booleano, data, dataObrig, escopoMatriculas, exigirAcessoMatricula, hoje, id, idObrig, link, texto, textoObrig, validar } from '../servicos'
import { criaCiclo } from '../../shared/calculos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

/** Monta a jornada de uma matrícula com etapas, cadeados explicados e atividades. Usada pela equipe e pelo portal. */
export function montarJornada(db: BD, matriculaId: string, opcoes: { paraAluna: boolean }) {
  const jornada = db
    .prepare('SELECT j.*, t.nome AS trilha_nome, pl.nome AS pilar_nome FROM jornadas j LEFT JOIN trilhas t ON t.id = j.trilha_id LEFT JOIN pilares pl ON pl.id = j.pilar_id WHERE j.matricula_id = ?')
    .get(matriculaId) as Linha | undefined
  if (!jornada) return null
  const etapas = db
    .prepare(
      `SELECT je.*, e.titulo, e.objetivo, e.criterio_conclusao, e.links, e.ordem, e.trilha_id, e.pilar_id, t.nome AS trilha_nome, t.ordem AS trilha_ordem,
              pl.nome AS pilar_nome, pl.ordem AS pilar_ordem, uv.nome AS validador_nome
       FROM jornada_etapas je JOIN etapas e ON e.id = je.etapa_id LEFT JOIN trilhas t ON t.id = e.trilha_id LEFT JOIN pilares pl ON pl.id = e.pilar_id
       LEFT JOIN usuarios uv ON uv.id = je.validador_id
       WHERE je.jornada_id = ? ORDER BY t.ordem, pl.ordem, e.ordem`,
    )
    .all(jornada.id) as Linha[]
  const situacaoPorEtapa = new Map(etapas.map((e) => [e.etapa_id as string, e.situacao as string]))
  const nomes = new Map((db.prepare('SELECT id, titulo FROM etapas').all() as { id: string; titulo: string }[]).map((e) => [e.id, e.titulo]))
  const prereqs = db.prepare('SELECT * FROM etapa_prerequisitos').all() as { etapa_id: string; requer_etapa_id: string }[]
  const atividades = db.prepare('SELECT * FROM atividades WHERE matricula_id = ? ORDER BY criado_em').all(matriculaId) as Linha[]
  const evidencias = db
    .prepare('SELECT ev.*, u.nome AS autor_nome FROM evidencias ev LEFT JOIN usuarios u ON u.id = ev.autor_id WHERE ev.atividade_id IN (SELECT id FROM atividades WHERE matricula_id = ?) ORDER BY ev.criado_em')
    .all(matriculaId) as Linha[]
  const validacoes = db
    .prepare(`SELECT v.*, u.nome AS autor_nome FROM validacoes v LEFT JOIN usuarios u ON u.id = v.autor_id WHERE v.matricula_id = ? ORDER BY v.criado_em`)
    .all(matriculaId) as Linha[]

  const saidaEtapas = etapas.map((e): Linha => {
    const requisitos = prereqs.filter((p) => p.etapa_id === e.etapa_id).map((p) => ({
      etapa_id: p.requer_etapa_id,
      titulo: nomes.get(p.requer_etapa_id) ?? 'Etapa',
      concluida: situacaoPorEtapa.get(p.requer_etapa_id) === 'concluida',
    }))
    const ativs = atividades
      .filter((a) => a.jornada_etapa_id === e.id)
      .map((a): Linha => ({
        ...a,
        evidencias: evidencias.filter((ev) => ev.atividade_id === a.id),
        validacoes: validacoes.filter((v) => v.alvo_tipo === 'atividade' && v.alvo_id === a.id).map((v) => (opcoes.paraAluna ? { decisao: v.decisao, comentario: v.comentario, criado_em: v.criado_em } : v)),
      }))
    const validadas = ativs.filter((a) => a.situacao === 'validada').length
    let falta: string[] = []
    if (e.situacao === 'bloqueada') {
      falta = requisitos.filter((r) => !r.concluida).map((r) => `Concluir a etapa "${r.titulo}"`)
      falta.push('Validação da equipe pedagógica para liberar esta etapa')
    } else if (e.situacao === 'liberada') {
      const pendentes = ativs.filter((a) => a.situacao !== 'validada').length
      if (pendentes) falta.push(`${pendentes} atividade(s) ainda sem validação`)
      falta.push('Validação da equipe pedagógica para concluir a etapa')
    }
    return {
      ...e,
      links: e.links ? JSON.parse(e.links as string) : [],
      requisitos,
      atividades: ativs,
      progresso: { validadas, total: ativs.length, texto: `${validadas} de ${ativs.length} atividade(s) validada(s) nesta etapa` },
      falta,
      validacoes: opcoes.paraAluna ? [] : validacoes.filter((v) => (v.alvo_tipo === 'etapa_liberacao' || v.alvo_tipo === 'etapa_conclusao') && v.alvo_id === e.id),
    }
  })
  if (opcoes.paraAluna) delete jornada.diagnostico_operacional
  return { ...jornada, etapas: saidaEtapas }
}

export function rotasPedagogico(db: BD) {
  const r = Router()
  r.use(exigirEquipe)

  /* ---------------- Modelo pedagógico configurável (RF07) ---------------- */

  r.get('/pedagogico/modelo', (req, res) => {
    exigir(req, 'jornada:ver')
    res.json({
      trilhas: db.prepare('SELECT * FROM trilhas ORDER BY ordem, nome').all(),
      pilares: db.prepare('SELECT * FROM pilares ORDER BY ordem, nome').all(),
      etapas: (db.prepare('SELECT * FROM etapas ORDER BY ordem').all() as Linha[]).map((e) => ({ ...e, links: e.links ? JSON.parse(e.links as string) : [] })),
      prerequisitos: db.prepare('SELECT * FROM etapa_prerequisitos').all(),
      atividades_modelo: db.prepare('SELECT * FROM etapa_atividades_modelo ORDER BY ordem').all(),
    })
  })

  const esquemaEtapa = z.object({
    trilha_id: idObrig('a trilha'),
    pilar_id: id(),
    titulo: textoObrig('o título da etapa', 300),
    objetivo: texto(2000),
    criterio_conclusao: texto(2000),
    ordem: z.coerce.number().int().min(0).max(9999).default(0),
    ativo: booleano().optional(),
    links: z.array(z.object({ titulo: z.string().trim().min(1, 'Informe o título do link.').max(200), url: link() })).max(20).default([]),
    prerequisitos: z.array(z.string().uuid()).max(50).default([]),
    atividades_modelo: z.array(z.object({ id: id(), titulo: z.string().trim().min(1, 'Informe o título da atividade.').max(300), descricao: texto(2000), link: link() })).max(50).default([]),
  })

  function gravarEtapa(req: Request, etapaId: string, d: z.infer<typeof esquemaEtapa>, nova: boolean) {
    const grafo = new Map<string, string[]>()
    for (const p of db.prepare('SELECT * FROM etapa_prerequisitos').all() as { etapa_id: string; requer_etapa_id: string }[])
      grafo.set(p.etapa_id, [...(grafo.get(p.etapa_id) ?? []), p.requer_etapa_id])
    if (d.prerequisitos.includes(etapaId)) throw new ErroHttp(400, 'Uma etapa não pode ser pré-requisito dela mesma.')
    if (criaCiclo(grafo, etapaId, d.prerequisitos)) throw new ErroHttp(400, 'Esses pré-requisitos criariam uma dependência circular entre etapas.')
    const agora = agoraIso()
    const links = JSON.stringify(d.links.filter((l) => l.url))
    if (nova)
      db.prepare('INSERT INTO etapas (id, trilha_id, pilar_id, titulo, objetivo, criterio_conclusao, links, ordem, ativo, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)').run(
        etapaId, d.trilha_id, d.pilar_id ?? null, d.titulo, d.objetivo ?? null, d.criterio_conclusao ?? null, links, d.ordem, agora, agora, req.usuario!.id)
    else {
      const info = db
        .prepare('UPDATE etapas SET trilha_id=?, pilar_id=?, titulo=?, objetivo=?, criterio_conclusao=?, links=?, ordem=?, ativo=?, atualizado_em=?, autor_id=? WHERE id=?')
        .run(d.trilha_id, d.pilar_id ?? null, d.titulo, d.objetivo ?? null, d.criterio_conclusao ?? null, links, d.ordem, d.ativo === false ? 0 : 1, agora, req.usuario!.id, etapaId)
      if (info.changes === 0) throw new ErroHttp(404, 'Etapa não encontrada.')
    }
    db.prepare('DELETE FROM etapa_prerequisitos WHERE etapa_id = ?').run(etapaId)
    for (const p of d.prerequisitos) db.prepare('INSERT INTO etapa_prerequisitos (etapa_id, requer_etapa_id) VALUES (?,?)').run(etapaId, p)
    // Atividades-modelo: as já copiadas para jornadas individuais não mudam (progresso individual é separado do modelo).
    const manter = new Set(d.atividades_modelo.map((a) => a.id).filter(Boolean))
    db.prepare(`UPDATE etapa_atividades_modelo SET ativo = 0 WHERE etapa_id = ? AND id NOT IN (${[...manter].map(() => '?').join(',') || "''"})`).run(etapaId, ...manter)
    d.atividades_modelo.forEach((a, n) => {
      if (a.id) db.prepare('UPDATE etapa_atividades_modelo SET titulo=?, descricao=?, link=?, ordem=?, ativo=1 WHERE id=? AND etapa_id=?').run(a.titulo, a.descricao ?? null, a.link ?? null, n, a.id, etapaId)
      else db.prepare('INSERT INTO etapa_atividades_modelo (id, etapa_id, titulo, descricao, link, ordem) VALUES (?,?,?,?,?,?)').run(novoId(), etapaId, a.titulo, a.descricao ?? null, a.link ?? null, n)
    })
    auditar(db, req, { entidade: 'etapa', entidade_id: etapaId, acao: nova ? 'criada' : 'atualizada', dados: d })
  }

  r.post('/etapas', (req, res) => {
    exigir(req, 'pedagogico:configurar')
    const d = validar(esquemaEtapa, req.body)
    const eid = novoId()
    db.transaction(() => gravarEtapa(req, eid, d, true))()
    res.status(201).json({ id: eid })
  })

  r.put('/etapas/:id', (req, res) => {
    exigir(req, 'pedagogico:configurar')
    const d = validar(esquemaEtapa, req.body)
    db.transaction(() => gravarEtapa(req, req.params.id as string, d, false))()
    res.json({ ok: true })
  })

  /* ---------------- Jornada individual (ET04) ---------------- */

  r.get('/matriculas/:id/jornada', (req, res) => {
    exigir(req, 'jornada:ver')
    exigirAcessoMatricula(db, req, req.params.id as string)
    const j = montarJornada(db, req.params.id as string, { paraAluna: false })
    if (j && !tem(req, 'notas:pedagogicas') && !tem(req, 'jornada:editar')) delete (j as Linha).diagnostico_operacional
    res.json(j)
  })

  function copiarAtividadesModelo(req: Request, jornadaEtapaId: string, etapaId: string, matriculaId: string) {
    const modelos = db.prepare('SELECT * FROM etapa_atividades_modelo WHERE etapa_id = ? AND ativo = 1 ORDER BY ordem').all(etapaId) as Linha[]
    const ja = new Set((db.prepare('SELECT modelo_id FROM atividades WHERE jornada_etapa_id = ?').all(jornadaEtapaId) as { modelo_id: string }[]).map((x) => x.modelo_id))
    for (const m of modelos) {
      if (ja.has(m.id as string)) continue
      db.prepare("INSERT INTO atividades (id, jornada_etapa_id, matricula_id, modelo_id, titulo, descricao, link, situacao, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?, 'pendente', ?,?,?)").run(
        novoId(), jornadaEtapaId, matriculaId, m.id, m.titulo, m.descricao ?? null, m.link ?? null, agoraIso(), agoraIso(), req.usuario!.id)
    }
  }

  function garantirEtapasDaTrilha(req: Request, jornadaId: string, trilhaId: string) {
    const etapas = db.prepare('SELECT id FROM etapas WHERE trilha_id = ? AND ativo = 1').all(trilhaId) as { id: string }[]
    for (const e of etapas) db.prepare("INSERT OR IGNORE INTO jornada_etapas (id, jornada_id, etapa_id, situacao) VALUES (?,?,?, 'bloqueada')").run(novoId(), jornadaId, e.id)
    void req
  }

  function liberar(req: Request, je: Linha, matriculaId: string, justificativa: string | null) {
    const pendentes = db
      .prepare(
        `SELECT e.titulo FROM etapa_prerequisitos p JOIN etapas e ON e.id = p.requer_etapa_id
         LEFT JOIN jornada_etapas x ON x.etapa_id = p.requer_etapa_id AND x.jornada_id = ?
         WHERE p.etapa_id = ? AND COALESCE(x.situacao, 'bloqueada') <> 'concluida'`,
      )
      .all(je.jornada_id, je.etapa_id) as { titulo: string }[]
    const excecao = pendentes.length > 0
    if (excecao && !justificativa)
      throw new ErroHttp(400, `Pré-requisitos não concluídos: ${pendentes.map((p) => p.titulo).join(', ')}. Para liberar como exceção, informe a justificativa.`)
    db.prepare("UPDATE jornada_etapas SET situacao='liberada', liberada_em=?, liberada_por=? WHERE id=?").run(agoraIso(), req.usuario!.id, je.id)
    copiarAtividadesModelo(req, je.id as string, je.etapa_id as string, matriculaId)
    db.prepare("INSERT INTO validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, excecao, justificativa, autor_id, criado_em) VALUES (?, 'etapa_liberacao', ?, ?, 'liberada', ?, ?, ?, ?)").run(
      novoId(), je.id, matriculaId, excecao ? 1 : 0, justificativa, req.usuario!.id, agoraIso())
    auditar(db, req, { entidade: 'jornada_etapa', entidade_id: je.id as string, acao: excecao ? 'etapa_liberada_excecao' : 'etapa_liberada', matricula_id: matriculaId, dados: { justificativa, pendentes } })
  }

  r.post('/matriculas/:id/jornada', (req, res) => {
    exigir(req, 'jornada:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({ trilha_id: idObrig('a trilha'), pilar_id: id(), diagnostico_operacional: texto(2000), liberar_etapas: z.array(z.string().uuid()).max(100).default([]) }),
      req.body,
    )
    if (d.liberar_etapas.length) exigir(req, 'jornada:validar')
    if (db.prepare('SELECT 1 FROM jornadas WHERE matricula_id = ?').get(m.id)) throw new ErroHttp(409, 'Esta matrícula já tem jornada definida.')
    const jid = novoId()
    db.transaction(() => {
      db.prepare('INSERT INTO jornadas (id, matricula_id, trilha_id, pilar_id, diagnostico_operacional, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?)').run(
        jid, m.id, d.trilha_id, d.pilar_id ?? null, d.diagnostico_operacional ?? null, agoraIso(), agoraIso(), req.usuario!.id)
      garantirEtapasDaTrilha(req, jid, d.trilha_id)
      for (const eid of d.liberar_etapas) {
        const je = db.prepare('SELECT * FROM jornada_etapas WHERE jornada_id = ? AND etapa_id = ?').get(jid, eid) as Linha | undefined
        if (!je) throw new ErroHttp(400, 'Etapa escolhida não pertence à trilha.')
        liberar(req, je, m.id, null)
      }
      auditar(db, req, { entidade: 'jornada', entidade_id: jid, acao: 'definida', matricula_id: m.id, dados: { trilha_id: d.trilha_id, pilar_id: d.pilar_id } })
    })()
    res.status(201).json({ id: jid })
  })

  r.put('/jornadas/:id', (req, res) => {
    exigir(req, 'jornada:editar')
    const j = db.prepare('SELECT * FROM jornadas WHERE id = ?').get(req.params.id) as Linha | undefined
    if (!j) throw new ErroHttp(404, 'Jornada não encontrada.')
    exigirAcessoMatricula(db, req, j.matricula_id as string)
    const d = validar(z.object({ trilha_id: idObrig('a trilha'), pilar_id: id(), diagnostico_operacional: texto(2000), motivo: texto(500) }), req.body)
    if ((d.trilha_id !== j.trilha_id || (d.pilar_id ?? null) !== j.pilar_id)) {
      exigir(req, 'jornada:validar') // mudança de trilha/pilar é avanço pedagógico: exige validação (RN09)
      if (!d.motivo) throw new ErroHttp(400, 'Informe o motivo da mudança de trilha ou pilar.')
    }
    db.transaction(() => {
      db.prepare('UPDATE jornadas SET trilha_id=?, pilar_id=?, diagnostico_operacional=?, atualizado_em=?, autor_id=? WHERE id=?').run(d.trilha_id, d.pilar_id ?? null, d.diagnostico_operacional ?? null, agoraIso(), req.usuario!.id, j.id)
      garantirEtapasDaTrilha(req, j.id as string, d.trilha_id)
      auditar(db, req, { entidade: 'jornada', entidade_id: j.id as string, acao: 'atualizada', matricula_id: j.matricula_id as string, dados: { de: { trilha_id: j.trilha_id, pilar_id: j.pilar_id }, para: d } })
    })()
    res.json({ ok: true })
  })

  function carregarJE(req: Request, jeId: string) {
    const je = db.prepare('SELECT je.*, j.matricula_id FROM jornada_etapas je JOIN jornadas j ON j.id = je.jornada_id WHERE je.id = ?').get(jeId) as Linha | undefined
    if (!je) throw new ErroHttp(404, 'Etapa da jornada não encontrada.')
    exigirAcessoMatricula(db, req, je.matricula_id as string)
    return je
  }

  r.put('/jornada-etapas/:id', (req, res) => {
    exigir(req, 'jornada:editar')
    const je = carregarJE(req, req.params.id as string)
    const d = validar(z.object({ prazo_individual: data('o prazo individual'), validador_id: id() }), req.body)
    db.prepare('UPDATE jornada_etapas SET prazo_individual=?, validador_id=? WHERE id=?').run(d.prazo_individual ?? null, d.validador_id ?? null, je.id)
    auditar(db, req, { entidade: 'jornada_etapa', entidade_id: je.id as string, acao: 'prazo_validador', matricula_id: je.matricula_id as string, dados: d })
    res.json({ ok: true })
  })

  // RN09: concluir tarefas não libera nada sozinho. Só perfil autorizado libera e conclui; exceções exigem justificativa.
  r.post('/jornada-etapas/:id/liberar', (req, res) => {
    exigir(req, 'jornada:validar')
    const d = validar(z.object({ justificativa: texto(1000) }), req.body)
    db.transaction(() => {
      const je = carregarJE(req, req.params.id as string)
      if (je.situacao !== 'bloqueada') throw new ErroHttp(409, 'Esta etapa já foi liberada.')
      liberar(req, je, je.matricula_id as string, d.justificativa ?? null)
    })()
    res.json({ ok: true })
  })

  r.post('/jornada-etapas/:id/concluir', (req, res) => {
    exigir(req, 'jornada:validar')
    const d = validar(z.object({ justificativa: texto(1000) }), req.body)
    db.transaction(() => {
      const je = carregarJE(req, req.params.id as string)
      if (je.situacao !== 'liberada') throw new ErroHttp(409, 'Só é possível concluir uma etapa liberada.')
      const pendentes = (db.prepare("SELECT COUNT(*) n FROM atividades WHERE jornada_etapa_id = ? AND situacao <> 'validada'").get(je.id) as { n: number }).n
      const excecao = pendentes > 0
      if (excecao && !d.justificativa) throw new ErroHttp(400, `${pendentes} atividade(s) ainda sem validação. Para concluir como exceção, informe a justificativa.`)
      db.prepare("UPDATE jornada_etapas SET situacao='concluida', concluida_em=?, concluida_por=? WHERE id=?").run(agoraIso(), req.usuario!.id, je.id)
      db.prepare("INSERT INTO validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, excecao, justificativa, autor_id, criado_em) VALUES (?, 'etapa_conclusao', ?, ?, 'concluida', ?, ?, ?, ?)").run(
        novoId(), je.id, je.matricula_id, excecao ? 1 : 0, d.justificativa ?? null, req.usuario!.id, agoraIso())
      auditar(db, req, { entidade: 'jornada_etapa', entidade_id: je.id as string, acao: excecao ? 'etapa_concluida_excecao' : 'etapa_concluida', matricula_id: je.matricula_id as string, dados: d })
    })()
    res.json({ ok: true })
  })

  /* ---------------- Atividades e evidências (ET08, RN13) ---------------- */

  r.post('/jornada-etapas/:id/atividades', (req, res) => {
    exigir(req, 'jornada:editar')
    const je = carregarJE(req, req.params.id as string)
    const d = validar(z.object({ titulo: textoObrig('o título', 300), descricao: texto(2000), link: link(), prazo: data('o prazo') }), req.body)
    const aid = novoId()
    db.prepare("INSERT INTO atividades (id, jornada_etapa_id, matricula_id, titulo, descricao, link, prazo, situacao, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?, 'pendente', ?,?,?)").run(
      aid, je.id, je.matricula_id, d.titulo, d.descricao ?? null, d.link ?? null, d.prazo ?? null, agoraIso(), agoraIso(), req.usuario!.id)
    auditar(db, req, { entidade: 'atividade', entidade_id: aid, acao: 'criada', matricula_id: je.matricula_id as string, dados: d })
    res.status(201).json({ id: aid })
  })

  function carregarAtividade(req: Request, aid: string) {
    const a = db.prepare('SELECT * FROM atividades WHERE id = ?').get(aid) as Linha | undefined
    if (!a) throw new ErroHttp(404, 'Atividade não encontrada.')
    exigirAcessoMatricula(db, req, a.matricula_id as string)
    return a
  }

  r.put('/atividades/:id', (req, res) => {
    exigir(req, 'jornada:editar')
    const a = carregarAtividade(req, req.params.id as string)
    const d = validar(z.object({ situacao: z.enum(['pendente', 'em_execucao']).optional(), prazo: data('o prazo'), titulo: textoObrig('o título', 300), descricao: texto(2000), link: link() }), req.body)
    if (a.situacao === 'validada' && d.situacao) throw new ErroHttp(409, 'Atividade já validada. Para reabrir, a equipe pedagógica deve marcar "Em revisão".')
    db.prepare('UPDATE atividades SET situacao=COALESCE(?, situacao), prazo=?, titulo=?, descricao=?, link=?, atualizado_em=? WHERE id=?').run(
      d.situacao ?? null, d.prazo ?? null, d.titulo, d.descricao ?? null, d.link ?? null, agoraIso(), a.id)
    auditar(db, req, { entidade: 'atividade', entidade_id: a.id as string, acao: 'atualizada', matricula_id: a.matricula_id as string, dados: d })
    res.json({ ok: true })
  })

  r.post('/atividades/:id/evidencias', (req, res) => {
    exigir(req, 'jornada:editar')
    const a = carregarAtividade(req, req.params.id as string)
    const d = validar(z.object({ texto: texto(4000), link: link(), data_execucao: dataObrig('a data em que a aluna realizou') }), req.body)
    if (!d.texto && !d.link) throw new ErroHttp(400, 'Descreva a evidência ou informe um link.')
    if (d.data_execucao > hoje()) throw new ErroHttp(400, 'A data de execução não pode estar no futuro.')
    if (a.situacao === 'validada') throw new ErroHttp(409, 'Esta atividade já foi validada.')
    db.transaction(() => {
      db.prepare('INSERT INTO evidencias (id, atividade_id, texto, link, data_execucao, registrada_por_equipe, autor_id, criado_em) VALUES (?,?,?,?,?,1,?,?)').run(
        novoId(), a.id, d.texto ?? null, d.link ?? null, d.data_execucao, req.usuario!.id, agoraIso())
      db.prepare("UPDATE atividades SET situacao='enviada', atualizado_em=? WHERE id=?").run(agoraIso(), a.id)
      auditar(db, req, { entidade: 'atividade', entidade_id: a.id as string, acao: 'evidencia_registrada_pela_equipe', matricula_id: a.matricula_id as string, dados: d })
    })()
    res.status(201).json({ ok: true })
  })

  r.post('/atividades/:id/validar', (req, res) => {
    exigir(req, 'jornada:validar')
    const a = carregarAtividade(req, req.params.id as string)
    const d = validar(z.object({ decisao: z.enum(['validada', 'em_revisao']), comentario: texto(2000) }), req.body)
    if (d.decisao === 'em_revisao' && !d.comentario) throw new ErroHttp(400, 'Explique o que precisa ser revisado.')
    const temEvidencia = db.prepare('SELECT 1 FROM evidencias WHERE atividade_id = ?').get(a.id)
    if (d.decisao === 'validada' && !temEvidencia && !d.comentario) throw new ErroHttp(400, 'Não há evidência registrada. Para validar mesmo assim, registre um comentário justificando.')
    db.transaction(() => {
      db.prepare('UPDATE atividades SET situacao=?, atualizado_em=? WHERE id=?').run(d.decisao, agoraIso(), a.id)
      db.prepare("INSERT INTO validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, comentario, excecao, autor_id, criado_em) VALUES (?, 'atividade', ?, ?, ?, ?, ?, ?, ?)").run(
        novoId(), a.id, a.matricula_id, d.decisao, d.comentario ?? null, !temEvidencia && d.decisao === 'validada' ? 1 : 0, req.usuario!.id, agoraIso())
      auditar(db, req, { entidade: 'atividade', entidade_id: a.id as string, acao: d.decisao === 'validada' ? 'validada' : 'enviada_para_revisao', matricula_id: a.matricula_id as string, dados: d })
    })()
    res.json({ ok: true })
  })

  /* ---------------- Fila de validação ---------------- */

  r.get('/validacoes/pendentes', (req, res) => {
    exigir(req, 'jornada:ver')
    const esc = escopoMatriculas(req)
    const atividades = db
      .prepare(
        `SELECT a.*, p.nome AS pessoa_nome, p.id AS pessoa_id, e.titulo AS etapa_titulo, uv.nome AS validador_nome,
           (SELECT COUNT(*) FROM evidencias ev WHERE ev.atividade_id = a.id) AS evidencias
         FROM atividades a JOIN jornada_etapas je ON je.id = a.jornada_etapa_id JOIN etapas e ON e.id = je.etapa_id
         JOIN matriculas m ON m.id = a.matricula_id JOIN pessoas p ON p.id = m.pessoa_id LEFT JOIN usuarios uv ON uv.id = je.validador_id
         WHERE ${esc.sql} AND a.situacao = 'enviada' ORDER BY a.atualizado_em`,
      )
      .all(esc.params) as Linha[]
    const ultimaEvidencia = db.prepare('SELECT texto, link, data_execucao, registrada_por_equipe FROM evidencias WHERE atividade_id = ? ORDER BY criado_em DESC LIMIT 1')
    const conquistas = db
      .prepare(`SELECT c.*, p.nome AS pessoa_nome, p.id AS pessoa_id FROM conquistas c JOIN matriculas m ON m.id = c.matricula_id JOIN pessoas p ON p.id = m.pessoa_id WHERE ${esc.sql} AND c.validada = 0 ORDER BY c.data`)
      .all(esc.params)
    res.json({ atividades: atividades.map((a) => ({ ...a, ultima_evidencia: ultimaEvidencia.get(a.id) ?? null })), conquistas })
  })

  /* ---------------- Conquistas (RF09) ---------------- */

  const esquemaConquista = z.object({
    titulo: textoObrig('o título da conquista', 200),
    situacao_anterior: texto(1000),
    acao_aplicada: texto(1000),
    evidencia: texto(1000),
    resultado_percebido: texto(1000),
    data: dataObrig('a data'),
  })

  r.post('/matriculas/:id/conquistas', (req, res) => {
    exigir(req, 'conquistas:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(esquemaConquista, req.body)
    if (d.data > hoje()) throw new ErroHttp(400, 'A data da conquista não pode estar no futuro.')
    const cid = novoId()
    db.prepare(
      'INSERT INTO conquistas (id, matricula_id, titulo, situacao_anterior, acao_aplicada, evidencia, resultado_percebido, data, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ).run(cid, m.id, d.titulo, d.situacao_anterior ?? null, d.acao_aplicada ?? null, d.evidencia ?? null, d.resultado_percebido ?? null, d.data, agoraIso(), agoraIso(), req.usuario!.id)
    auditar(db, req, { entidade: 'conquista', entidade_id: cid, acao: 'registrada', matricula_id: m.id, dados: { titulo: d.titulo } })
    res.status(201).json({ id: cid })
  })

  r.post('/conquistas/:id/validar', (req, res) => {
    exigir(req, 'conquistas:validar')
    const c = db.prepare('SELECT * FROM conquistas WHERE id = ?').get(req.params.id) as Linha | undefined
    if (!c) throw new ErroHttp(404, 'Conquista não encontrada.')
    exigirAcessoMatricula(db, req, c.matricula_id as string)
    const d = validar(z.object({ validada: z.boolean(), visivel_aluna: z.boolean() }), req.body)
    if (d.visivel_aluna && !d.validada) throw new ErroHttp(400, 'Só conquistas validadas podem aparecer para a aluna.')
    db.transaction(() => {
      db.prepare('UPDATE conquistas SET validada=?, validada_por=?, validada_em=?, visivel_aluna=?, atualizado_em=? WHERE id=?').run(
        d.validada ? 1 : 0, d.validada ? req.usuario!.id : null, d.validada ? agoraIso() : null, d.visivel_aluna ? 1 : 0, agoraIso(), c.id)
      db.prepare("INSERT INTO validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, autor_id, criado_em) VALUES (?, 'conquista', ?, ?, ?, ?, ?)").run(
        novoId(), c.id, c.matricula_id, d.validada ? (d.visivel_aluna ? 'validada_visivel' : 'validada_interna') : 'nao_validada', req.usuario!.id, agoraIso())
      auditar(db, req, { entidade: 'conquista', entidade_id: c.id as string, acao: 'validacao', matricula_id: c.matricula_id as string, dados: d })
    })()
    res.json({ ok: true })
  })

  return r
}
