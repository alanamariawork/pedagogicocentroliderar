import { Router, type Req as Request } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, transacao, type BD, type BDouTX, type TX } from '../db'
import { ErroHttp, exigir, exigirEquipe, tem } from '../auth'
import { auditar, booleano, data, dataObrig, escopoMatriculas, exigirAcessoMatricula, hoje, id, idObrig, link, notificarAluna, texto, textoObrig, validar } from '../servicos'
import { criaCiclo } from '../../shared/calculos'
import { anexosPorEvidencia, entregarAnexo } from '../anexos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

/** Monta a jornada de uma matrícula com etapas, cadeados explicados e atividades. Usada pela equipe e pelo portal. */
export async function montarJornada(db: BDouTX, matriculaId: string, opcoes: { paraAluna: boolean }) {
  const jornada = (await db.get('SELECT j.*, t.nome AS trilha_nome, pl.nome AS pilar_nome, pl.cor AS pilar_cor, pl.ordem AS pilar_ordem FROM ped_jornadas j LEFT JOIN ped_trilhas t ON t.id = j.trilha_id LEFT JOIN ped_pilares pl ON pl.id = j.pilar_id WHERE j.matricula_id = ?', matriculaId)) as Linha | undefined
  if (!jornada) return null
  const etapas = (await db.all(`SELECT je.*, COALESCE(je.titulo_personalizado, e.titulo) AS titulo, e.titulo AS titulo_modelo, COALESCE(je.objetivo_personalizado, e.objetivo) AS objetivo, e.objetivo AS objetivo_modelo,
              e.criterio_conclusao, e.links, e.ordem, e.trilha_id, e.pilar_id, t.nome AS trilha_nome, t.ordem AS trilha_ordem,
              pl.nome AS pilar_nome, pl.ordem AS pilar_ordem, pl.cor AS pilar_cor, uv.nome AS validador_nome, up.nome AS personalizada_por_nome
       FROM ped_jornada_etapas je JOIN ped_etapas e ON e.id = je.etapa_id LEFT JOIN ped_trilhas t ON t.id = e.trilha_id LEFT JOIN ped_pilares pl ON pl.id = e.pilar_id
       LEFT JOIN ped_usuarios uv ON uv.id = je.validador_id LEFT JOIN ped_usuarios up ON up.id = je.personalizada_por
       WHERE je.jornada_id = ? ORDER BY t.ordem, pl.ordem, e.ordem`, jornada.id)) as Linha[]
  const situacaoPorEtapa = new Map(etapas.map((e) => [e.etapa_id as string, e.situacao as string]))
  const nomes = new Map(((await db.all('SELECT id, titulo FROM ped_etapas')) as { id: string; titulo: string }[]).map((e) => [e.id, e.titulo]))
  const prereqs = (await db.all('SELECT * FROM ped_etapa_prerequisitos')) as { etapa_id: string; requer_etapa_id: string }[]
  // Atividade retirada desta matrícula some do portal; a equipe continua vendo (e as evidências ficam guardadas).
  const atividades = (await db.all(`SELECT * FROM ped_atividades WHERE matricula_id = ? ${opcoes.paraAluna ? 'AND arquivada = 0' : ''} ORDER BY criado_em`, matriculaId)) as Linha[]
  const evidencias = (await db.all('SELECT ev.*, u.nome AS autor_nome FROM ped_evidencias ev LEFT JOIN ped_usuarios u ON u.id = ev.autor_id WHERE ev.atividade_id IN (SELECT id FROM ped_atividades WHERE matricula_id = ?) ORDER BY ev.criado_em', matriculaId)) as Linha[]
  const anexos = await anexosPorEvidencia(db, evidencias.map((ev) => ev.id as string))
  for (const ev of evidencias) ev.anexos = anexos.get(ev.id) ?? []
  const validacoes = (await db.all(`SELECT v.*, u.nome AS autor_nome FROM ped_validacoes v LEFT JOIN ped_usuarios u ON u.id = v.autor_id WHERE v.matricula_id = ? ORDER BY v.criado_em`, matriculaId)) as Linha[]

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
    const vigentes = ativs.filter((a) => !a.arquivada)
    const validadas = vigentes.filter((a) => a.situacao === 'validada').length
    let falta: string[] = []
    if (e.situacao === 'bloqueada') {
      falta = requisitos.filter((r) => !r.concluida).map((r) => `Concluir a etapa "${r.titulo}"`)
      falta.push('Validação da equipe pedagógica para liberar esta etapa')
    } else if (e.situacao === 'liberada') {
      const pendentes = vigentes.filter((a) => a.situacao !== 'validada').length
      if (pendentes) falta.push(`${pendentes} atividade(s) ainda sem validação`)
      falta.push('Validação da equipe pedagógica para concluir a etapa')
    }
    const extra: Linha = opcoes.paraAluna ? { personalizada_por: undefined, personalizada_por_nome: undefined, titulo_modelo: undefined, objetivo_modelo: undefined } : {}
    return {
      ...e,
      ...extra,
      personalizada: !!(e.titulo_personalizado || e.objetivo_personalizado),
      links: e.links ? JSON.parse(e.links as string) : [],
      requisitos,
      atividades: ativs,
      progresso: { validadas, total: vigentes.length, texto: `${validadas} de ${vigentes.length} atividade(s) validada(s) nesta etapa` },
      falta,
      validacoes: opcoes.paraAluna ? [] : validacoes.filter((v) => (v.alvo_tipo === 'etapa_liberacao' || v.alvo_tipo === 'etapa_conclusao') && v.alvo_id === e.id),
    }
  })
  if (opcoes.paraAluna) delete jornada.diagnostico_operacional
  return { ...jornada, etapas: saidaEtapas }
}

export function rotasPedagogico(db: BD, ctx: ContextoApp) {
  const r = Router()
  r.use(exigirEquipe)

  /* ---------------- Modelo pedagógico configurável (RF07) ---------------- */

  r.get('/pedagogico/modelo', async (req, res) => {
    exigir(req, 'jornada:ver')
    res.json({
      trilhas: (await db.all('SELECT * FROM ped_trilhas ORDER BY ordem, nome')),
      pilares: (await db.all('SELECT * FROM ped_pilares ORDER BY ordem, nome')),
      etapas: ((await db.all('SELECT * FROM ped_etapas ORDER BY ordem')) as Linha[]).map((e) => ({ ...e, links: e.links ? JSON.parse(e.links as string) : [] })),
      prerequisitos: (await db.all('SELECT * FROM ped_etapa_prerequisitos')),
      atividades_modelo: (await db.all('SELECT * FROM ped_etapa_atividades_modelo ORDER BY ordem')),
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

  async function gravarEtapa(tx: TX, req: Request, etapaId: string, d: z.infer<typeof esquemaEtapa>, nova: boolean) {
    const grafo = new Map<string, string[]>()
    for (const p of (await tx.all('SELECT * FROM ped_etapa_prerequisitos')) as { etapa_id: string; requer_etapa_id: string }[])
      grafo.set(p.etapa_id, [...(grafo.get(p.etapa_id) ?? []), p.requer_etapa_id])
    if (d.prerequisitos.includes(etapaId)) throw new ErroHttp(400, 'Uma etapa não pode ser pré-requisito dela mesma.')
    if (criaCiclo(grafo, etapaId, d.prerequisitos)) throw new ErroHttp(400, 'Esses pré-requisitos criariam uma dependência circular entre etapas.')
    const agora = agoraIso()
    const links = JSON.stringify(d.links.filter((l) => l.url))
    if (nova)
      tx.run('INSERT INTO ped_etapas (id, trilha_id, pilar_id, titulo, objetivo, criterio_conclusao, links, ordem, ativo, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)', etapaId, d.trilha_id, d.pilar_id ?? null, d.titulo, d.objetivo ?? null, d.criterio_conclusao ?? null, links, d.ordem, agora, agora, req.usuario!.id)
    else {
      if (!(await tx.get('SELECT 1 FROM ped_etapas WHERE id = ?', etapaId))) throw new ErroHttp(404, 'Etapa não encontrada.')
      tx.run('UPDATE ped_etapas SET trilha_id=?, pilar_id=?, titulo=?, objetivo=?, criterio_conclusao=?, links=?, ordem=?, ativo=?, atualizado_em=?, autor_id=? WHERE id=?', d.trilha_id, d.pilar_id ?? null, d.titulo, d.objetivo ?? null, d.criterio_conclusao ?? null, links, d.ordem, d.ativo === false ? 0 : 1, agora, req.usuario!.id, etapaId)
    }
    tx.run('DELETE FROM ped_etapa_prerequisitos WHERE etapa_id = ?', etapaId)
    for (const p of d.prerequisitos) tx.run('INSERT INTO ped_etapa_prerequisitos (etapa_id, requer_etapa_id) VALUES (?,?)', etapaId, p)
    // Atividades-modelo: as já copiadas para jornadas individuais não mudam (progresso individual é separado do modelo).
    const manter = new Set(d.atividades_modelo.map((a) => a.id).filter(Boolean))
    tx.run(`UPDATE ped_etapa_atividades_modelo SET ativo = 0 WHERE etapa_id = ? AND id NOT IN (${[...manter].map(() => '?').join(',') || "''"})`, etapaId, ...manter)
    d.atividades_modelo.forEach((a, n) => {
      if (a.id) tx.run('UPDATE ped_etapa_atividades_modelo SET titulo=?, descricao=?, link=?, ordem=?, ativo=1 WHERE id=? AND etapa_id=?', a.titulo, a.descricao ?? null, a.link ?? null, n, a.id, etapaId)
      else tx.run('INSERT INTO ped_etapa_atividades_modelo (id, etapa_id, titulo, descricao, link, ordem) VALUES (?,?,?,?,?,?)', novoId(), etapaId, a.titulo, a.descricao ?? null, a.link ?? null, n)
    })
    await auditar(tx, req, { entidade: 'etapa', entidade_id: etapaId, acao: nova ? 'criada' : 'atualizada', dados: d })
  }

  r.post('/etapas', async (req, res) => {
    exigir(req, 'pedagogico:configurar')
    const d = validar(esquemaEtapa, req.body)
    const eid = novoId()
    await transacao(db, (tx) => gravarEtapa(tx, req, eid, d, true))
    res.status(201).json({ id: eid })
  })

  r.put('/etapas/:id', async (req, res) => {
    exigir(req, 'pedagogico:configurar')
    const d = validar(esquemaEtapa, req.body)
    await transacao(db, (tx) => gravarEtapa(tx, req, req.params.id as string, d, false))
    res.json({ ok: true })
  })

  /* ---------------- Jornada individual (ET04) ---------------- */

  r.get('/matriculas/:id/jornada', async (req, res) => {
    exigir(req, 'jornada:ver')
    await exigirAcessoMatricula(db, req, req.params.id as string)
    const j = await montarJornada(db, req.params.id as string, { paraAluna: false })
    if (j && !tem(req, 'notas:pedagogicas') && !tem(req, 'jornada:editar')) delete (j as Linha).diagnostico_operacional
    res.json(j)
  })

  async function copiarAtividadesModelo(tx: TX, req: Request, jornadaEtapaId: string, etapaId: string, matriculaId: string) {
    const modelos = (await tx.all('SELECT * FROM ped_etapa_atividades_modelo WHERE etapa_id = ? AND ativo = 1 ORDER BY ordem', etapaId)) as Linha[]
    const ja = new Set(((await tx.all('SELECT modelo_id FROM ped_atividades WHERE jornada_etapa_id = ?', jornadaEtapaId)) as { modelo_id: string }[]).map((x) => x.modelo_id))
    for (const m of modelos) {
      if (ja.has(m.id as string)) continue
      tx.run("INSERT INTO ped_atividades (id, jornada_etapa_id, matricula_id, modelo_id, titulo, descricao, link, situacao, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?, 'pendente', ?,?,?)", novoId(), jornadaEtapaId, matriculaId, m.id, m.titulo, m.descricao ?? null, m.link ?? null, agoraIso(), agoraIso(), req.usuario!.id)
    }
  }

  /**
   * Cria as etapas da trilha que a jornada ainda não tem. Devolve as etapas criadas agora
   * (etapa_id → linha), porque dentro da transação elas ainda não podem ser lidas do banco.
   */
  async function garantirEtapasDaTrilha(tx: TX, jornadaId: string, trilhaId: string) {
    const etapas = (await tx.all('SELECT id FROM ped_etapas WHERE trilha_id = ? AND ativo = 1', trilhaId)) as { id: string }[]
    const existentes = new Set(((await tx.all('SELECT etapa_id FROM ped_jornada_etapas WHERE jornada_id = ?', jornadaId)) as { etapa_id: string }[]).map((x) => x.etapa_id))
    const criadas = new Map<string, Linha>()
    for (const e of etapas) {
      if (existentes.has(e.id)) continue
      const je = { id: novoId(), jornada_id: jornadaId, etapa_id: e.id, situacao: 'bloqueada' }
      tx.run("INSERT OR IGNORE INTO ped_jornada_etapas (id, jornada_id, etapa_id, situacao) VALUES (?,?,?, 'bloqueada')", je.id, jornadaId, e.id)
      criadas.set(e.id, je)
    }
    return criadas
  }

  async function liberar(tx: TX, req: Request, je: Linha, matriculaId: string, justificativa: string | null) {
    const pendentes = (await tx.all(`SELECT e.titulo FROM ped_etapa_prerequisitos p JOIN ped_etapas e ON e.id = p.requer_etapa_id
         LEFT JOIN ped_jornada_etapas x ON x.etapa_id = p.requer_etapa_id AND x.jornada_id = ?
         WHERE p.etapa_id = ? AND COALESCE(x.situacao, 'bloqueada') <> 'concluida'`, je.jornada_id, je.etapa_id)) as { titulo: string }[]
    const excecao = pendentes.length > 0
    if (excecao && !justificativa)
      throw new ErroHttp(400, `Pré-requisitos não concluídos: ${pendentes.map((p) => p.titulo).join(', ')}. Para liberar como exceção, informe a justificativa.`)
    tx.run("UPDATE ped_jornada_etapas SET situacao='liberada', liberada_em=?, liberada_por=? WHERE id=?", agoraIso(), req.usuario!.id, je.id)
    await copiarAtividadesModelo(tx, req, je.id as string, je.etapa_id as string, matriculaId)
    tx.run("INSERT INTO ped_validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, excecao, justificativa, autor_id, criado_em) VALUES (?, 'etapa_liberacao', ?, ?, 'liberada', ?, ?, ?, ?)", novoId(), je.id, matriculaId, excecao ? 1 : 0, justificativa, req.usuario!.id, agoraIso())
    await auditar(tx, req, { entidade: 'jornada_etapa', entidade_id: je.id as string, acao: excecao ? 'etapa_liberada_excecao' : 'etapa_liberada', matricula_id: matriculaId, dados: { justificativa, pendentes } })
  }

  r.post('/matriculas/:id/jornada', async (req, res) => {
    exigir(req, 'jornada:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({ trilha_id: idObrig('a trilha'), pilar_id: id(), diagnostico_operacional: texto(2000), liberar_etapas: z.array(z.string().uuid()).max(100).default([]) }),
      req.body,
    )
    if (d.liberar_etapas.length) exigir(req, 'jornada:validar')
    if ((await db.get('SELECT 1 FROM ped_jornadas WHERE matricula_id = ?', m.id))) throw new ErroHttp(409, 'Esta matrícula já tem jornada definida.')
    const jid = novoId()
    await transacao(db, async (tx) => {
      tx.run('INSERT INTO ped_jornadas (id, matricula_id, trilha_id, pilar_id, diagnostico_operacional, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?)', jid, m.id, d.trilha_id, d.pilar_id ?? null, d.diagnostico_operacional ?? null, agoraIso(), agoraIso(), req.usuario!.id)
      const criadas = await garantirEtapasDaTrilha(tx, jid, d.trilha_id)
      for (const eid of d.liberar_etapas) {
        const je = criadas.get(eid)
        if (!je) throw new ErroHttp(400, 'Etapa escolhida não pertence à trilha.')
        await liberar(tx, req, je, m.id, null)
      }
      await auditar(tx, req, { entidade: 'jornada', entidade_id: jid, acao: 'definida', matricula_id: m.id, dados: { trilha_id: d.trilha_id, pilar_id: d.pilar_id } })
    })
    res.status(201).json({ id: jid })
  })

  r.put('/jornadas/:id', async (req, res) => {
    exigir(req, 'jornada:editar')
    const j = (await db.get('SELECT * FROM ped_jornadas WHERE id = ?', req.params.id)) as Linha | undefined
    if (!j) throw new ErroHttp(404, 'Jornada não encontrada.')
    await exigirAcessoMatricula(db, req, j.matricula_id as string)
    const d = validar(z.object({ trilha_id: idObrig('a trilha'), pilar_id: id(), diagnostico_operacional: texto(2000), motivo: texto(500) }), req.body)
    if ((d.trilha_id !== j.trilha_id || (d.pilar_id ?? null) !== j.pilar_id)) {
      exigir(req, 'jornada:validar') // mudança de trilha/pilar é avanço pedagógico: exige validação (RN09)
      if (!d.motivo) throw new ErroHttp(400, 'Informe o motivo da mudança de trilha ou pilar.')
    }
    await transacao(db, async (tx) => {
      tx.run('UPDATE ped_jornadas SET trilha_id=?, pilar_id=?, diagnostico_operacional=?, atualizado_em=?, autor_id=? WHERE id=?', d.trilha_id, d.pilar_id ?? null, d.diagnostico_operacional ?? null, agoraIso(), req.usuario!.id, j.id)
      await garantirEtapasDaTrilha(tx, j.id as string, d.trilha_id)
      await auditar(tx, req, { entidade: 'jornada', entidade_id: j.id as string, acao: 'atualizada', matricula_id: j.matricula_id as string, dados: { de: { trilha_id: j.trilha_id, pilar_id: j.pilar_id }, para: d } })
    })
    res.json({ ok: true })
  })

  async function carregarJE(req: Request, jeId: string) {
    const je = (await db.get('SELECT je.*, j.matricula_id FROM ped_jornada_etapas je JOIN ped_jornadas j ON j.id = je.jornada_id WHERE je.id = ?', jeId)) as Linha | undefined
    if (!je) throw new ErroHttp(404, 'Etapa da jornada não encontrada.')
    await exigirAcessoMatricula(db, req, je.matricula_id as string)
    return je
  }

  /**
   * Prazo, validador e adaptação da etapa para ESTA matrícula (título e objetivo). O modelo geral
   * (ped_etapas) e a jornada das outras alunas não mudam; quem alterou e quando fica registrado.
   */
  r.put('/jornada-etapas/:id', async (req, res) => {
    exigir(req, 'jornada:editar')
    const je = await carregarJE(req, req.params.id as string)
    const d = validar(
      z.object({
        prazo_individual: data('o prazo individual'),
        validador_id: id(),
        titulo_personalizado: texto(300).optional(),
        objetivo_personalizado: texto(2000).optional(),
      }),
      req.body,
    )
    const muda = (k: 'titulo_personalizado' | 'objetivo_personalizado') => d[k] !== undefined && (d[k] ?? null) !== (je[k] ?? null)
    const personaliza = muda('titulo_personalizado') || muda('objetivo_personalizado')
    const agora = agoraIso()
    await db.run(
      `UPDATE ped_jornada_etapas SET prazo_individual=?, validador_id=?,
         titulo_personalizado = CASE WHEN ? THEN ? ELSE titulo_personalizado END,
         objetivo_personalizado = CASE WHEN ? THEN ? ELSE objetivo_personalizado END,
         personalizada_por = CASE WHEN ? THEN ? ELSE personalizada_por END,
         personalizada_em = CASE WHEN ? THEN ? ELSE personalizada_em END
       WHERE id=?`,
      d.prazo_individual ?? null, d.validador_id ?? null,
      d.titulo_personalizado !== undefined ? 1 : 0, d.titulo_personalizado ?? null,
      d.objetivo_personalizado !== undefined ? 1 : 0, d.objetivo_personalizado ?? null,
      personaliza ? 1 : 0, req.usuario!.id, personaliza ? 1 : 0, agora,
      je.id,
    )
    await auditar(db, req, {
      entidade: 'jornada_etapa',
      entidade_id: je.id as string,
      acao: personaliza ? 'etapa_adaptada_para_matricula' : 'prazo_validador',
      matricula_id: je.matricula_id as string,
      dados: { antes: { prazo_individual: je.prazo_individual, titulo_personalizado: je.titulo_personalizado, objetivo_personalizado: je.objetivo_personalizado }, depois: d },
    })
    res.json({ ok: true })
  })

  // RN09: concluir tarefas não libera nada sozinho. Só perfil autorizado libera e conclui; exceções exigem justificativa.
  r.post('/jornada-etapas/:id/liberar', async (req, res) => {
    exigir(req, 'jornada:validar')
    const d = validar(z.object({ justificativa: texto(1000) }), req.body)
    await transacao(db, async (tx) => {
      const je = await carregarJE(req, req.params.id as string)
      if (je.situacao !== 'bloqueada') throw new ErroHttp(409, 'Esta etapa já foi liberada.')
      await liberar(tx, req, je, je.matricula_id as string, d.justificativa ?? null)
      await notificarAluna(tx, je.matricula_id as string, { titulo: 'Nova etapa liberada', detalhe: 'Veja as atividades na sua jornada.', link: `#/jornada/${je.id}` })
    })
    res.json({ ok: true })
  })

  r.post('/jornada-etapas/:id/concluir', async (req, res) => {
    exigir(req, 'jornada:validar')
    const d = validar(z.object({ justificativa: texto(1000) }), req.body)
    await transacao(db, async (tx) => {
      const je = await carregarJE(req, req.params.id as string)
      if (je.situacao !== 'liberada') throw new ErroHttp(409, 'Só é possível concluir uma etapa liberada.')
      const pendentes = ((await tx.get("SELECT COUNT(*) n FROM ped_atividades WHERE jornada_etapa_id = ? AND arquivada = 0 AND situacao <> 'validada'", je.id)) as { n: number }).n
      const excecao = pendentes > 0
      if (excecao && !d.justificativa) throw new ErroHttp(400, `${pendentes} atividade(s) ainda sem validação. Para concluir como exceção, informe a justificativa.`)
      tx.run("UPDATE ped_jornada_etapas SET situacao='concluida', concluida_em=?, concluida_por=? WHERE id=?", agoraIso(), req.usuario!.id, je.id)
      tx.run("INSERT INTO ped_validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, excecao, justificativa, autor_id, criado_em) VALUES (?, 'etapa_conclusao', ?, ?, 'concluida', ?, ?, ?, ?)", novoId(), je.id, je.matricula_id, excecao ? 1 : 0, d.justificativa ?? null, req.usuario!.id, agoraIso())
      await auditar(tx, req, { entidade: 'jornada_etapa', entidade_id: je.id as string, acao: excecao ? 'etapa_concluida_excecao' : 'etapa_concluida', matricula_id: je.matricula_id as string, dados: d })
      await notificarAluna(tx, je.matricula_id as string, { titulo: 'Etapa concluída', detalhe: 'Parabéns! A equipe concluiu uma etapa da sua jornada.', link: `#/jornada/${je.id}` })
    })
    res.json({ ok: true })
  })

  /* ---------------- Atividades e evidências (ET08, RN13) ---------------- */

  r.post('/jornada-etapas/:id/atividades', async (req, res) => {
    exigir(req, 'jornada:editar')
    const je = await carregarJE(req, req.params.id as string)
    const d = validar(z.object({ titulo: textoObrig('o título', 300), descricao: texto(2000), link: link(), prazo: data('o prazo') }), req.body)
    const aid = novoId()
    await db.run("INSERT INTO ped_atividades (id, jornada_etapa_id, matricula_id, titulo, descricao, link, prazo, situacao, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?, 'pendente', ?,?,?)", aid, je.id, je.matricula_id, d.titulo, d.descricao ?? null, d.link ?? null, d.prazo ?? null, agoraIso(), agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'atividade', entidade_id: aid, acao: 'criada', matricula_id: je.matricula_id as string, dados: d })
    res.status(201).json({ id: aid })
  })

  async function carregarAtividade(req: Request, aid: string) {
    const a = (await db.get('SELECT * FROM ped_atividades WHERE id = ?', aid)) as Linha | undefined
    if (!a) throw new ErroHttp(404, 'Atividade não encontrada.')
    await exigirAcessoMatricula(db, req, a.matricula_id as string)
    return a
  }

  // A atividade já é desta matrícula (cópia do modelo): adaptar aqui não muda o modelo nem as outras alunas.
  r.put('/atividades/:id', async (req, res) => {
    exigir(req, 'jornada:editar')
    const a = await carregarAtividade(req, req.params.id as string)
    const d = validar(z.object({ situacao: z.enum(['pendente', 'em_execucao']).optional(), prazo: data('o prazo'), titulo: textoObrig('o título', 300), descricao: texto(2000), link: link() }), req.body)
    if (a.situacao === 'validada' && d.situacao) throw new ErroHttp(409, 'Atividade já validada. Para reabrir, a equipe pedagógica deve marcar "Em revisão".')
    const adaptada = d.titulo !== a.titulo || (d.descricao ?? null) !== (a.descricao ?? null) || (d.link ?? null) !== (a.link ?? null) || (d.prazo ?? null) !== (a.prazo ?? null)
    await db.run(
      'UPDATE ped_atividades SET situacao=COALESCE(?, situacao), prazo=?, titulo=?, descricao=?, link=?, personalizada_por=CASE WHEN ? THEN ? ELSE personalizada_por END, personalizada_em=CASE WHEN ? THEN ? ELSE personalizada_em END, atualizado_em=? WHERE id=?',
      d.situacao ?? null, d.prazo ?? null, d.titulo, d.descricao ?? null, d.link ?? null, adaptada ? 1 : 0, req.usuario!.id, adaptada ? 1 : 0, agoraIso(), agoraIso(), a.id,
    )
    await auditar(db, req, { entidade: 'atividade', entidade_id: a.id as string, acao: adaptada ? 'atividade_adaptada_para_matricula' : 'atualizada', matricula_id: a.matricula_id as string, dados: { antes: { titulo: a.titulo, descricao: a.descricao, link: a.link, prazo: a.prazo }, depois: d } })
    res.json({ ok: true })
  })

  /** Retira (ou devolve) a atividade só desta matrícula. Nada é apagado: as evidências continuam guardadas. */
  r.post('/atividades/:id/arquivar', async (req, res) => {
    exigir(req, 'jornada:editar')
    const a = await carregarAtividade(req, req.params.id as string)
    const d = validar(z.object({ arquivada: z.boolean(), motivo: textoObrig('o motivo', 500) }), req.body)
    await db.run('UPDATE ped_atividades SET arquivada=?, personalizada_por=?, personalizada_em=?, atualizado_em=? WHERE id=?', d.arquivada ? 1 : 0, req.usuario!.id, agoraIso(), agoraIso(), a.id)
    await auditar(db, req, { entidade: 'atividade', entidade_id: a.id as string, acao: d.arquivada ? 'atividade_retirada_da_matricula' : 'atividade_devolvida_a_matricula', matricula_id: a.matricula_id as string, dados: d })
    res.json({ ok: true })
  })

  r.post('/atividades/:id/evidencias', async (req, res) => {
    exigir(req, 'jornada:editar')
    const a = await carregarAtividade(req, req.params.id as string)
    const d = validar(z.object({ texto: texto(4000), link: link(), data_execucao: dataObrig('a data em que a aluna realizou') }), req.body)
    if (!d.texto && !d.link) throw new ErroHttp(400, 'Descreva a evidência ou informe um link.')
    if (d.data_execucao > hoje()) throw new ErroHttp(400, 'A data de execução não pode estar no futuro.')
    if (a.situacao === 'validada') throw new ErroHttp(409, 'Esta atividade já foi validada.')
    await transacao(db, async (tx) => {
      tx.run('INSERT INTO ped_evidencias (id, atividade_id, texto, link, data_execucao, registrada_por_equipe, autor_id, criado_em) VALUES (?,?,?,?,?,1,?,?)', novoId(), a.id, d.texto ?? null, d.link ?? null, d.data_execucao, req.usuario!.id, agoraIso())
      tx.run("UPDATE ped_atividades SET situacao='enviada', atualizado_em=? WHERE id=?", agoraIso(), a.id)
      await auditar(tx, req, { entidade: 'atividade', entidade_id: a.id as string, acao: 'evidencia_registrada_pela_equipe', matricula_id: a.matricula_id as string, dados: d })
    })
    res.status(201).json({ ok: true })
  })

  /** Diagnóstico e metas que a aluna preencheu no portal (somente leitura para a equipe). */
  r.get('/matriculas/:id/diagnostico', async (req, res) => {
    exigir(req, 'jornada:ver')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const respostas = ((await db.all('SELECT versao, area, conteudo, atualizado_em FROM ped_diagnosticos WHERE matricula_id = ?', m.id)) as Linha[]).map((x) => ({
      ...x,
      conteudo: JSON.parse(x.conteudo as string),
    }))
    const metas = (await db.all('SELECT id, nome, unidade, valor_inicial, valor_alvo, valor_atual, atualizado_em FROM ped_metas WHERE matricula_id = ? AND ativo = 1 ORDER BY criado_em', m.id))
    res.json({ respostas, metas })
  })

  /** Download de um anexo enviado pela aluna, para quem pode ver a jornada dela. */
  r.get('/anexos/:id', async (req, res) => {
    exigir(req, 'jornada:ver')
    const an = (await db.get('SELECT * FROM ped_anexos WHERE id = ? AND evidencia_id IS NOT NULL', req.params.id)) as Linha | undefined
    if (!an) throw new ErroHttp(404, 'Arquivo não encontrado.')
    await carregarAtividade(req, an.atividade_id)
    await entregarAnexo(ctx.arquivos, res, an)
  })

  r.post('/atividades/:id/validar', async (req, res) => {
    exigir(req, 'jornada:validar')
    const a = await carregarAtividade(req, req.params.id as string)
    const d = validar(z.object({ decisao: z.enum(['validada', 'em_revisao']), comentario: texto(2000) }), req.body)
    if (d.decisao === 'em_revisao' && !d.comentario) throw new ErroHttp(400, 'Explique o que precisa ser revisado.')
    const temEvidencia = (await db.get('SELECT 1 FROM ped_evidencias WHERE atividade_id = ?', a.id))
    if (d.decisao === 'validada' && !temEvidencia && !d.comentario) throw new ErroHttp(400, 'Não há evidência registrada. Para validar mesmo assim, registre um comentário justificando.')
    await transacao(db, async (tx) => {
      tx.run('UPDATE ped_atividades SET situacao=?, atualizado_em=? WHERE id=?', d.decisao, agoraIso(), a.id)
      tx.run("INSERT INTO ped_validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, comentario, excecao, autor_id, criado_em) VALUES (?, 'atividade', ?, ?, ?, ?, ?, ?, ?)", novoId(), a.id, a.matricula_id, d.decisao, d.comentario ?? null, !temEvidencia && d.decisao === 'validada' ? 1 : 0, req.usuario!.id, agoraIso())
      await auditar(tx, req, { entidade: 'atividade', entidade_id: a.id as string, acao: d.decisao === 'validada' ? 'validada' : 'enviada_para_revisao', matricula_id: a.matricula_id as string, dados: d })
      await notificarAluna(tx, a.matricula_id as string, {
        titulo: d.decisao === 'validada' ? 'Atividade validada' : 'A equipe pediu um ajuste',
        detalhe: a.titulo as string,
        link: `#/jornada/${a.jornada_etapa_id}`,
      })
    })
    res.json({ ok: true })
  })

  /* ---------------- Fila de validação ---------------- */

  r.get('/validacoes/pendentes', async (req, res) => {
    exigir(req, 'jornada:ver')
    const esc = escopoMatriculas(req)
    const atividades = (await db.all(`SELECT a.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.id AS pessoa_id, e.titulo AS etapa_titulo, uv.nome AS validador_nome,
           (SELECT COUNT(*) FROM ped_evidencias ev WHERE ev.atividade_id = a.id) AS evidencias
         FROM ped_atividades a JOIN ped_jornada_etapas je ON je.id = a.jornada_etapa_id JOIN ped_etapas e ON e.id = je.etapa_id
         JOIN ped_matriculas m ON m.id = a.matricula_id JOIN ped_pessoas p ON p.id = m.pessoa_id LEFT JOIN ped_usuarios uv ON uv.id = je.validador_id
         WHERE ${esc.sql} AND a.situacao = 'enviada' ORDER BY a.atualizado_em`, esc.params)) as Linha[]
    const conquistas = (await db.all(`SELECT c.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.id AS pessoa_id FROM ped_conquistas c JOIN ped_matriculas m ON m.id = c.matricula_id JOIN ped_pessoas p ON p.id = m.pessoa_id WHERE ${esc.sql} AND c.validada = 0 AND c.validada_em IS NULL ORDER BY c.data`, esc.params))
    const saida = []
    for (const a of atividades) {
      const ev = await db.get<Linha>('SELECT id, texto, link, data_execucao, registrada_por_equipe FROM ped_evidencias WHERE atividade_id = ? ORDER BY criado_em DESC LIMIT 1', a.id)
      saida.push({ ...a, ultima_evidencia: ev ? { ...ev, anexos: (await anexosPorEvidencia(db, [ev.id])).get(ev.id) ?? [] } : null })
    }
    res.json({ atividades: saida, conquistas })
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

  r.post('/matriculas/:id/conquistas', async (req, res) => {
    exigir(req, 'conquistas:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(esquemaConquista, req.body)
    if (d.data > hoje()) throw new ErroHttp(400, 'A data da conquista não pode estar no futuro.')
    const cid = novoId()
    await db.run('INSERT INTO ped_conquistas (id, matricula_id, titulo, situacao_anterior, acao_aplicada, evidencia, resultado_percebido, data, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', cid, m.id, d.titulo, d.situacao_anterior ?? null, d.acao_aplicada ?? null, d.evidencia ?? null, d.resultado_percebido ?? null, d.data, agoraIso(), agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'conquista', entidade_id: cid, acao: 'registrada', matricula_id: m.id, dados: { titulo: d.titulo } })
    res.status(201).json({ id: cid })
  })

  r.post('/conquistas/:id/validar', async (req, res) => {
    exigir(req, 'conquistas:validar')
    const c = (await db.get('SELECT * FROM ped_conquistas WHERE id = ?', req.params.id)) as Linha | undefined
    if (!c) throw new ErroHttp(404, 'Conquista não encontrada.')
    await exigirAcessoMatricula(db, req, c.matricula_id as string)
    const d = validar(z.object({ validada: z.boolean(), visivel_aluna: z.boolean() }), req.body)
    if (d.visivel_aluna && !d.validada) throw new ErroHttp(400, 'Só conquistas validadas podem aparecer para a aluna.')
    await transacao(db, async (tx) => {
      // "Não validada" também registra quem decidiu e quando: sai da fila e a aluna vê a análise concluída.
      tx.run('UPDATE ped_conquistas SET validada=?, validada_por=?, validada_em=?, visivel_aluna=?, atualizado_em=? WHERE id=?', d.validada ? 1 : 0, req.usuario!.id, agoraIso(), d.visivel_aluna ? 1 : 0, agoraIso(), c.id)
      tx.run("INSERT INTO ped_validacoes (id, alvo_tipo, alvo_id, matricula_id, decisao, autor_id, criado_em) VALUES (?, 'conquista', ?, ?, ?, ?, ?)", novoId(), c.id, c.matricula_id, d.validada ? (d.visivel_aluna ? 'validada_visivel' : 'validada_interna') : 'nao_validada', req.usuario!.id, agoraIso())
      await auditar(tx, req, { entidade: 'conquista', entidade_id: c.id as string, acao: 'validacao', matricula_id: c.matricula_id as string, dados: d })
      if (d.visivel_aluna && !c.visivel_aluna) await notificarAluna(tx, c.matricula_id as string, { titulo: 'Nova vitória validada', detalhe: c.titulo as string, link: '#/vitorias' })
    })
    res.json({ ok: true })
  })

  return r
}
