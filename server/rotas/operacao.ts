import { Router, type Req as Request } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, transacao, type BD, type TX } from '../db'
import { ErroHttp, exigir, exigirEquipe, tem } from '../auth'
import {
  SQL_OCORRENCIAS,
  auditar,
  data,
  dataObrig,
  escopoMatriculas,
  exigirAcessoMatricula,
  filtrarNotas,
  hoje,
  historico,
  horarioObrig,
  id,
  idObrig,
  link,
  minutos,
  resumoItem,
  sincronizarOcorrencias,
  texto,
  textoObrig,
  validar,
  notificarAluna,
} from '../servicos'
import { RE_MES, formatarData, limitesDoMes, mesDe, somarDias, somarMinutos } from '../../shared/datas'
import {
  contido,
  emAberto,
  grupoDoMes,
  indicadorAtraso,
  mesclarIntervalos,
  minutosEmComum,
  recortar,
  somaMinutos,
  type Intervalo,
} from '../../shared/calculos'

type Linha = Record<string, unknown>

export function rotasOperacao(db: BD, ctx: ContextoApp) {
  const r = Router()
  r.use(exigirEquipe)

  async function carregarOcorrencia(req: Request, ocorrenciaId: string) {
    const o = (await db.get(`${SQL_OCORRENCIAS} WHERE o.id = ?`, ocorrenciaId)) as Linha | undefined
    if (!o) throw new ErroHttp(404, 'Entrega não encontrada.')
    await exigirAcessoMatricula(db, req, o.matricula_id as string)
    if (req.usuario!.perfil === 'mentora' && o.profissional_efetivo_id && o.profissional_efetivo_id !== req.usuario!.profissional_id) {
      // A mentora vê a matrícula inteira, mas só altera entregas atribuídas a ela.
      if (req.method !== 'GET') throw new ErroHttp(403, 'Esta entrega está atribuída a outra profissional.')
    }
    return o
  }

  async function exigirAberta(o: Linha) {
    if (o.situacao === 'realizada') throw new ErroHttp(409, 'Esta entrega já foi realizada.')
    if (o.situacao === 'cancelada') throw new ErroHttp(409, 'Esta entrega foi cancelada.')
  }

  async function liberarReserva(tx: TX, req: Request, o: Linha, motivo: string) {
    if (!o.reserva_id) return
    tx.run('UPDATE ped_reservas SET ativa = 0, liberada_em = ?, liberada_motivo = ? WHERE id = ?', agoraIso(), motivo, o.reserva_id)
    await auditar(tx, req, { entidade: 'reserva', entidade_id: o.reserva_id as string, acao: 'horario_liberado', matricula_id: o.matricula_id as string, dados: { motivo } })
  }

  /* ---------------- Planejamento de previsões (ET05, RN10) ---------------- */

  // Recebe as datas já revisadas na tela. A sugestão automática é feita no navegador e nunca é salva sem revisão.
  r.put('/itens/:id/previsoes', async (req, res) => {
    exigir(req, 'entregas:editar')
    const item = (await db.get('SELECT * FROM ped_itens_contratados WHERE id = ?', req.params.id)) as Linha | undefined
    if (!item) throw new ErroHttp(404, 'Item não encontrado.')
    await exigirAcessoMatricula(db, req, item.matricula_id as string)
    const d = validar(
      z.object({
        previsoes: z.array(z.object({ ocorrencia_id: idObrig('a ocorrência'), data_prevista: data('a previsão') })).min(1).max(500),
        motivo: texto(500),
      }),
      req.body,
    )
    await transacao(db, async (tx) => {
      for (const p of d.previsoes) {
        const o = (await db.get('SELECT * FROM ped_ocorrencias WHERE id = ? AND item_id = ?', p.ocorrencia_id, item.id)) as Linha | undefined
        if (!o) throw new ErroHttp(400, 'Ocorrência não pertence a este item.')
        const nova = p.data_prevista ?? null
        if ((o.data_prevista ?? null) === nova) continue
        if (o.situacao === 'realizada' || o.situacao === 'cancelada') continue
        if (o.data_prevista && !d.motivo) throw new ErroHttp(400, 'Informe o motivo da alteração das previsões já definidas.')
        tx.run('UPDATE ped_ocorrencias SET data_prevista = ?, data_prevista_original = COALESCE(data_prevista_original, ?), atualizado_em = ? WHERE id = ?', nova, nova, agoraIso(), o.id)
        await historico(tx, req, o.id as string, o.data_prevista ? 'previsao_alterada' : 'previsao_definida', (o.data_prevista as string) ?? null, nova, d.motivo ?? null)
      }
      await auditar(tx, req, { entidade: 'item', entidade_id: item.id as string, acao: 'previsoes_planejadas', matricula_id: item.matricula_id as string, dados: d })
    })
    res.json({ ok: true })
  })

  /* ---------------- Situação operacional ---------------- */

  r.put('/ocorrencias/:id/situacao', async (req, res) => {
    exigir(req, 'entregas:editar')
    const o = await carregarOcorrencia(req, req.params.id as string)
    await exigirAberta(o)
    const d = validar(
      z.object({
        situacao: z.enum(['prevista', 'aguardando_agenda', 'disponivel_agendar']),
        responsavel_resolucao_id: id(),
        duracao_min: minutos().optional(),
        profissional_id: id(),
      }),
      req.body,
    )
    if (o.situacao === 'agendada') throw new ErroHttp(409, 'Para mudar a situação de um encontro agendado, desmarque ou reagende.')
    await db.run('UPDATE ped_ocorrencias SET situacao=?, responsavel_resolucao_id=?, duracao_min=COALESCE(?, duracao_min), profissional_id=COALESCE(?, profissional_id), atualizado_em=? WHERE id=?', d.situacao, d.responsavel_resolucao_id ?? null, d.duracao_min ?? null, d.profissional_id ?? null, agoraIso(), o.id)
    await historico(db, req, o.id as string, 'situacao', o.situacao as string, d.situacao, null)
    await auditar(db, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'situacao_alterada', matricula_id: o.matricula_id as string, dados: d })
    res.json({ ok: true })
  })

  /* ---------------- Agendar, reagendar, desmarcar (RF05, RN11, CA06, CA07) ---------------- */

  const esquemaAgenda = z.object({
    inicio: horarioObrig('o horário'),
    duracao_min: minutos().optional(),
    profissional_id: id(),
    fora_disponibilidade: z.boolean().default(false),
    motivo: texto(500),
  })

  async function reservar(tx: TX, req: Request, o: Linha, d: z.infer<typeof esquemaAgenda>) {
    const profissional = (d.profissional_id ?? o.profissional_efetivo_id) as string | null
    if (!profissional) throw new ErroHttp(400, 'Defina a profissional responsável antes de agendar.')
    const duracao = (d.duracao_min ?? o.duracao_efetiva) as number | null
    if (!duracao) throw new ErroHttp(400, 'Esta entrega não tem duração definida. Informe a duração para reservar o horário.')
    const intervalo: Intervalo = { inicio: d.inicio, fim: somarMinutos(d.inicio, duracao) }
    if (!d.fora_disponibilidade) {
      const disp = (await db.all('SELECT inicio, fim FROM ped_disponibilidades WHERE profissional_id = ? AND inicio < ? AND fim > ?', profissional, intervalo.fim, intervalo.inicio)) as Intervalo[]
      if (!contido(intervalo, disp))
        throw new ErroHttp(409, 'O horário escolhido está fora da disponibilidade cadastrada da profissional. Cadastre a disponibilidade ou marque "fora da disponibilidade" com motivo.')
    } else if (!d.motivo) {
      throw new ErroHttp(400, 'Informe o motivo para agendar fora da disponibilidade cadastrada.')
    }
    // Conflitos de horário são barrados pelos gatilhos do banco no momento da gravação (ver comConflitoDeHorario).
    tx.run('INSERT INTO ped_reservas (id, profissional_id, ocorrencia_id, inicio, fim, ativa, fora_disponibilidade, criado_em, autor_id) VALUES (?,?,?,?,?,1,?,?,?)', novoId(), profissional, o.id, intervalo.inicio, intervalo.fim, d.fora_disponibilidade ? 1 : 0, agoraIso(), req.usuario!.id)
    tx.run("UPDATE ped_ocorrencias SET situacao='agendada', data_agendada=?, profissional_id=?, duracao_min=?, atualizado_em=? WHERE id=?", intervalo.inicio, profissional, duracao, agoraIso(), o.id)
    // Contatos e impedimentos ativos deixam de bloquear quando o encontro é agendado.
    tx.run('UPDATE ped_impedimentos SET ativo = 0, resolvido_em = ?, resolucao = ? WHERE ocorrencia_id = ? AND ativo = 1', agoraIso(), 'Encontro agendado', o.id)
  }

  /** Traduz os erros dos gatilhos de reserva (que só aparecem quando o lote é gravado). */
  async function comConflitoDeHorario<T>(p: Promise<T>): Promise<T> {
    try {
      return await p
    } catch (e) {
      const msg = (e as Error)?.message ?? ''
      if (msg.includes('conflito_horario')) throw new ErroHttp(409, 'Este horário já está reservado para outro encontro desta profissional. Escolha outro horário.')
      if (msg.includes('ocorrencia_ja_reservada')) throw new ErroHttp(409, 'Esta entrega já tem um horário reservado. Use "Reagendar".')
      throw e
    }
  }

  // RN07/CA05: atividades pedagógicas pendentes NÃO bloqueiam o agendamento.
  r.post('/ocorrencias/:id/agendar', async (req, res) => {
    exigir(req, 'entregas:editar')
    const d = validar(esquemaAgenda, req.body)
    await comConflitoDeHorario(transacao(db, async (tx) => {
      const o = await carregarOcorrencia(req, req.params.id as string)
      await exigirAberta(o)
      if (o.situacao === 'agendada') throw new ErroHttp(409, 'Esta entrega já está agendada. Use "Reagendar".')
      await reservar(tx, req, o, d)
      await historico(tx, req, o.id as string, 'agendada', null, d.inicio, d.motivo ?? null)
      await notificarAluna(tx, o.matricula_id as string, { titulo: 'Encontro agendado', detalhe: `${formatarData(d.inicio.slice(0, 10))} às ${d.inicio.slice(11, 16)}`, link: '#/mentorias' })
      await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'agendada', matricula_id: o.matricula_id as string, dados: d })
    }))
    res.json({ ok: true })
  })

  r.post('/ocorrencias/:id/reagendar', async (req, res) => {
    exigir(req, 'entregas:editar')
    const d = validar(esquemaAgenda.extend({ motivo: textoObrig('o motivo do reagendamento', 500) }), req.body)
    await comConflitoDeHorario(transacao(db, async (tx) => {
      const o = await carregarOcorrencia(req, req.params.id as string)
      await exigirAberta(o)
      if (o.situacao !== 'agendada') throw new ErroHttp(409, 'Só é possível reagendar um encontro agendado.')
      const anterior = o.data_agendada as string
      await liberarReserva(tx, req, o, `Reagendamento: ${d.motivo}`)
      await reservar(tx, req, { ...o, reserva_id: null }, d)
      // Histórico preserva previsão original, data anterior, nova data, motivo, autor e momento (RN11).
      await historico(tx, req, o.id as string, 'reagendada', anterior, d.inicio, d.motivo)
      await notificarAluna(tx, o.matricula_id as string, { titulo: 'Encontro remarcado', detalhe: `Nova data: ${formatarData(d.inicio.slice(0, 10))} às ${d.inicio.slice(11, 16)}`, link: '#/mentorias' })
      await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'reagendada', matricula_id: o.matricula_id as string, dados: { de: anterior, para: d.inicio, motivo: d.motivo } })
    }))
    res.json({ ok: true })
  })

  r.post('/ocorrencias/:id/desmarcar', async (req, res) => {
    exigir(req, 'entregas:editar')
    const d = validar(z.object({ motivo: textoObrig('o motivo', 500) }), req.body)
    await transacao(db, async (tx) => {
      const o = await carregarOcorrencia(req, req.params.id as string)
      if (o.situacao !== 'agendada') throw new ErroHttp(409, 'Esta entrega não está agendada.')
      await liberarReserva(tx, req, o, d.motivo)
      // Desmarcar libera o horário mas NÃO reduz a obrigação: a entrega volta a aguardar agenda.
      tx.run("UPDATE ped_ocorrencias SET situacao='aguardando_agenda', data_agendada=NULL, atualizado_em=? WHERE id=?", agoraIso(), o.id)
      await historico(tx, req, o.id as string, 'desmarcada', o.data_agendada as string, null, d.motivo)
      await notificarAluna(tx, o.matricula_id as string, { titulo: 'Encontro desmarcado', detalhe: 'A equipe vai combinar uma nova data com você.', link: '#/mentorias' })
      await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'desmarcada', matricula_id: o.matricula_id as string, dados: d })
    })
    res.json({ ok: true })
  })

  /* ---------------- Realizar (ET07, CA13) ---------------- */

  r.post('/ocorrencias/:id/realizar', async (req, res) => {
    exigir(req, 'entregas:realizar')
    const d = validar(
      z.object({
        data_realizada: dataObrig('a data real do encontro'),
        resumo_compartilhavel: texto(4000),
        notas_internas: texto(4000),
        acoes: z.array(z.object({ titulo: z.string().trim().min(1).max(300), jornada_etapa_id: id() })).max(20).default([]),
      }),
      req.body,
    )
    if (d.data_realizada > hoje()) throw new ErroHttp(400, 'A data de realização não pode estar no futuro.')
    if (d.notas_internas && !tem(req, 'notas:internas')) throw new ErroHttp(403, 'Você não tem permissão para registrar notas internas.')
    await transacao(db, async (tx) => {
      const o = await carregarOcorrencia(req, req.params.id as string)
      await exigirAberta(o)
      const r0 = await resumoItem(tx, o.item_id as string)
      if (r0.realizadas + 1 > r0.contratada) throw new ErroHttp(409, 'A quantidade contratada já foi totalmente realizada. Registre um ajuste ou exceção autorizada antes.')
      // Se havia reserva, ela continua registrada como o horário efetivamente usado.
      tx.run("UPDATE ped_ocorrencias SET situacao='realizada', data_realizada=?, resumo_compartilhavel=?, notas_internas=COALESCE(?, notas_internas), atualizado_em=? WHERE id=?", d.data_realizada, d.resumo_compartilhavel ?? null, d.notas_internas ?? null, agoraIso(), o.id)
      tx.run('UPDATE ped_impedimentos SET ativo = 0, resolvido_em = ?, resolucao = ? WHERE ocorrencia_id = ? AND ativo = 1', agoraIso(), 'Encontro realizado', o.id)
      await historico(tx, req, o.id as string, 'realizada', null, d.data_realizada, null)
      // Ações combinadas no encontro entram no plano de ação da etapa indicada.
      for (const a of d.acoes) {
        if (!a.jornada_etapa_id) continue
        const je = (await db.get('SELECT je.id FROM ped_jornada_etapas je JOIN ped_jornadas j ON j.id = je.jornada_id WHERE je.id = ? AND j.matricula_id = ?', a.jornada_etapa_id, o.matricula_id))
        if (!je) throw new ErroHttp(400, 'A etapa escolhida para a ação não pertence a esta matrícula.')
        tx.run("INSERT INTO ped_atividades (id, jornada_etapa_id, matricula_id, titulo, descricao, situacao, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?, 'pendente', ?,?,?)", novoId(), a.jornada_etapa_id, o.matricula_id, a.titulo, `Combinada no encontro de ${d.data_realizada}`, agoraIso(), agoraIso(), req.usuario!.id)
      }
      await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'realizada', matricula_id: o.matricula_id as string, dados: { data_realizada: d.data_realizada, acoes: d.acoes.length } })
    })
    res.json({ ok: true })
  })

  /* ---------------- Conferir registro legado (importação) ---------------- */

  r.post('/ocorrencias/:id/conferir', async (req, res) => {
    exigir(req, 'obrigacoes:ajustar')
    const d = validar(z.object({ resultado: z.enum(['realizada', 'pendente']), data_realizada: data('a data real'), motivo: textoObrig('a observação da conferência', 500) }), req.body)
    await transacao(db, async (tx) => {
      const o = await carregarOcorrencia(req, req.params.id as string)
      if (o.situacao !== 'conferencia') throw new ErroHttp(409, 'Esta entrega não está aguardando conferência.')
      if (d.resultado === 'realizada') {
        if (!d.data_realizada || d.data_realizada > hoje()) throw new ErroHttp(400, 'Informe uma data real válida, que não esteja no futuro.')
        tx.run("UPDATE ped_ocorrencias SET situacao='realizada', data_realizada=?, atualizado_em=? WHERE id=?", d.data_realizada, agoraIso(), o.id)
      } else {
        tx.run("UPDATE ped_ocorrencias SET situacao='prevista', atualizado_em=? WHERE id=?", agoraIso(), o.id)
      }
      await historico(tx, req, o.id as string, 'conferida', o.valor_original as string, d.resultado, d.motivo)
      await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'conferida', matricula_id: o.matricula_id as string, dados: d })
    })
    res.json({ ok: true })
  })

  /* ---------------- Cancelar ocorrência mediante decisão (IN08) ---------------- */

  r.post('/ocorrencias/:id/cancelar', async (req, res) => {
    exigir(req, 'obrigacoes:ajustar')
    const d = validar(z.object({ manter_obrigacao: z.boolean(), motivo: textoObrig('o motivo da decisão', 1000) }), req.body)
    await transacao(db, async (tx) => {
      const o = await carregarOcorrencia(req, req.params.id as string)
      await exigirAberta(o)
      await liberarReserva(tx, req, o, `Cancelamento: ${d.motivo}`)
      tx.run("UPDATE ped_ocorrencias SET situacao='cancelada', cancelamento_motivo=?, data_agendada=NULL, atualizado_em=? WHERE id=?", d.motivo, agoraIso(), o.id)
      await historico(tx, req, o.id as string, 'cancelada', null, null, d.motivo)
      if (!d.manter_obrigacao) {
        tx.run("INSERT INTO ped_ajustes_obrigacao (id, item_id, delta, tipo, motivo, autor_id, criado_em) VALUES (?,?,-1,'cancelamento',?,?,?)", novoId(), o.item_id, d.motivo, req.usuario!.id, agoraIso())
      }
      // Mantendo a obrigação, uma nova ocorrência sem previsão é criada para substituí-la.
      // (As leituras ainda contam esta ocorrência como ativa: o +1 compensa o cancelamento pendente.)
      if (d.manter_obrigacao) await sincronizarOcorrencias(tx, req, o.item_id as string, d.motivo, { delta: 1 })
      await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: d.manter_obrigacao ? 'cancelada_obrigacao_mantida' : 'cancelada_obrigacao_reduzida', matricula_id: o.matricula_id as string, dados: d })
    })
    res.json({ ok: true })
  })

  /* ---------------- Contatos e impedimentos (RF06) ---------------- */

  r.post('/contatos', async (req, res) => {
    exigir(req, 'entregas:editar')
    const d = validar(
      z.object({
        matricula_id: idObrig('a matrícula'),
        ocorrencia_id: id(),
        data: dataObrig('a data do contato'),
        canal: z.enum(['whatsapp', 'telefone', 'email', 'presencial', 'videochamada', 'outro'], { error: 'Selecione o canal.' }),
        responsavel_id: id(),
        resumo: texto(1000),
        resultado: z.enum(['sem_resposta', 'respondeu', 'agendou', 'pediu_reagendamento', 'recusou', 'outro']).nullable().optional(),
        proxima_acao: texto(500),
        proxima_tentativa: data('a próxima tentativa'),
        link_externo: link(),
      }),
      req.body,
    )
    if (d.data > hoje()) throw new ErroHttp(400, 'A data do contato não pode estar no futuro.')
    await exigirAcessoMatricula(db, req, d.matricula_id)
    if (d.ocorrencia_id) {
      const o = (await db.get('SELECT matricula_id FROM ped_ocorrencias WHERE id = ?', d.ocorrencia_id)) as { matricula_id: string } | undefined
      if (!o || o.matricula_id !== d.matricula_id) throw new ErroHttp(400, 'A entrega não pertence a esta matrícula.')
    }
    const cid = novoId()
    await db.run('INSERT INTO ped_contatos (id, matricula_id, ocorrencia_id, data, canal, responsavel_id, resumo, resultado, proxima_acao, proxima_tentativa, link_externo, criado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', cid, d.matricula_id, d.ocorrencia_id ?? null, d.data, d.canal, d.responsavel_id ?? req.usuario!.id, d.resumo ?? null, d.resultado ?? null, d.proxima_acao ?? null, d.proxima_tentativa ?? null, d.link_externo ?? null, agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'contato', entidade_id: cid, acao: 'registrado', matricula_id: d.matricula_id, dados: { canal: d.canal, resultado: d.resultado } })
    res.status(201).json({ id: cid })
  })

  r.post('/ocorrencias/:id/impedimentos', async (req, res) => {
    exigir(req, 'entregas:editar')
    const d = validar(z.object({ motivo_id: idObrig('o motivo'), descricao: texto(1000), responsavel_id: idObrig('quem deve agir') }), req.body)
    const motivo = (await db.get('SELECT * FROM ped_motivos_impedimento WHERE id = ?', d.motivo_id)) as Linha | undefined
    if (!motivo) throw new ErroHttp(400, 'Motivo não encontrado.')
    if (motivo.exige_descricao && !d.descricao) throw new ErroHttp(400, 'Este motivo exige uma descrição.')
    let iid = ''
    await transacao(db, async (tx) => {
      const o = await carregarOcorrencia(req, req.params.id as string)
      await exigirAberta(o)
      tx.run('UPDATE ped_impedimentos SET ativo = 0, resolvido_em = ?, resolucao = ? WHERE ocorrencia_id = ? AND ativo = 1', agoraIso(), 'Substituído por novo impedimento', o.id)
      iid = novoId()
      tx.run('INSERT INTO ped_impedimentos (id, ocorrencia_id, motivo_id, descricao, responsavel_id, ativo, criado_em, autor_id) VALUES (?,?,?,?,?,1,?,?)', iid, o.id, d.motivo_id, d.descricao ?? null, d.responsavel_id, agoraIso(), req.usuario!.id)
      tx.run('UPDATE ped_ocorrencias SET responsavel_resolucao_id = ?, atualizado_em = ? WHERE id = ?', d.responsavel_id, agoraIso(), o.id)
      await auditar(tx, req, { entidade: 'impedimento', entidade_id: iid, acao: 'registrado', matricula_id: o.matricula_id as string, dados: { ...d, motivo: motivo.nome } })
    })
    res.status(201).json({ id: iid })
  })

  r.post('/impedimentos/:id/resolver', async (req, res) => {
    exigir(req, 'entregas:editar')
    const imp = (await db.get('SELECT * FROM ped_impedimentos WHERE id = ?', req.params.id)) as Linha | undefined
    if (!imp) throw new ErroHttp(404, 'Impedimento não encontrado.')
    const o = await carregarOcorrencia(req, imp.ocorrencia_id as string)
    const d = validar(z.object({ resolucao: textoObrig('como foi resolvido', 500) }), req.body)
    await db.run('UPDATE ped_impedimentos SET ativo = 0, resolvido_em = ?, resolucao = ? WHERE id = ?', agoraIso(), d.resolucao, imp.id)
    await auditar(db, req, { entidade: 'impedimento', entidade_id: imp.id as string, acao: 'resolvido', matricula_id: o.matricula_id as string, dados: d })
    res.json({ ok: true })
  })

  /* ---------------- Painel "Entregas do mês" (RF04, IN03, IN04) ---------------- */

  const esquemaFiltros = z.object({
    mes: z.string().regex(RE_MES, 'Mês inválido.').optional(),
    programa_id: z.string().uuid().optional(),
    profissional_id: z.string().optional(), // uuid ou 'sem'
    responsavel_id: z.string().uuid().optional(),
    trilha_id: z.string().uuid().optional(),
    pilar_id: z.string().uuid().optional(),
    situacao: z.enum(['ativa', 'pausada', 'encerrada', 'cancelada']).optional(),
  })

  async function ocorrenciasFiltradas(req: Request, f: z.infer<typeof esquemaFiltros>) {
    const esc = escopoMatriculas(req)
    const linhas = (await db.all(`${SQL_OCORRENCIAS}
         LEFT JOIN ped_jornadas jj ON jj.matricula_id = m.id
         WHERE ${esc.sql}
           AND (@programa_id IS NULL OR m.programa_id = @programa_id)
           AND (@responsavel_id IS NULL OR m.responsavel_id = @responsavel_id)
           AND (@trilha_id IS NULL OR jj.trilha_id = @trilha_id)
           AND (@pilar_id IS NULL OR jj.pilar_id = @pilar_id)
           AND (@situacao IS NULL OR m.situacao = @situacao)
           AND (@situacao IS NOT NULL OR m.situacao IN ('ativa','pausada'))
         ORDER BY p.codigo IS NULL, p.codigo, p.nome COLLATE NOCASE, i.criado_em, o.numero`, {
        programa_id: f.programa_id ?? null,
        responsavel_id: f.responsavel_id ?? null,
        trilha_id: f.trilha_id ?? null,
        pilar_id: f.pilar_id ?? null,
        situacao: f.situacao ?? null,
        ...esc.params,
      })) as Linha[]
    return linhas.filter((o) => {
      if (!f.profissional_id) return true
      if (f.profissional_id === 'sem') return !o.profissional_efetivo_id
      return o.profissional_efetivo_id === f.profissional_id
    })
  }

  r.get('/painel/mes', async (req, res) => {
    exigir(req, 'entregas:ver')
    const f = validar(esquemaFiltros, req.query)
    const mes = f.mes ?? mesDe(hoje())
    const h = hoje()
    const grupos: Record<string, Linha[]> = { previstos: [], anteriores: [], sem_previsao: [], agendados: [], realizados: [] }
    for (const o of await ocorrenciasFiltradas(req, f)) {
      const g = grupoDoMes(o as never, mes)
      if (g === 'fora') continue
      const contratada = o.item_contratada as number
      grupos[g].push({
        ...filtrarNotas(req, o),
        atraso: indicadorAtraso(o as never, h),
        entregas_restantes: Math.max(contratada - (o.item_realizadas as number), 0),
        incompleto: [!o.duracao_efetiva && 'sem duração', !o.profissional_efetivo_id && 'sem profissional', !o.data_prevista && 'sem previsão'].filter(Boolean),
      })
    }
    // Cada ocorrência entra em um único grupo: contatos e reagendamentos não multiplicam horas (CA12).
    const soma = (lista: Linha[]) => ({
      quantidade: lista.length,
      minutos: lista.reduce((t, o) => t + ((o.duracao_efetiva as number) ?? 0), 0),
      sem_duracao: lista.filter((o) => !o.duracao_efetiva).length,
    })
    res.json({
      mes,
      hoje: h,
      grupos,
      totais: {
        demanda_mes: soma([...grupos.previstos, ...grupos.agendados]), // IN03
        pendencia_anterior: soma(grupos.anteriores), // IN04
        sem_previsao: soma(grupos.sem_previsao),
        realizados: soma(grupos.realizados),
      },
      capacidade: await capacidade(req, mes, f),
    })
  })

  /* ---------------- Capacidade por profissional (IN05–IN07) ---------------- */

  async function capacidade(req: Request, mes: string, f: z.infer<typeof esquemaFiltros>) {
    const { inicio, fim } = limitesDoMes(mes)
    const ini = `${inicio}T00:00`
    const fimDt = `${somarDias(fim, 1)}T00:00`
    const ocorrencias = await ocorrenciasFiltradas(req, { ...f, profissional_id: undefined })
    let profissionais = (await db.all('SELECT id, nome, especialidade FROM ped_profissionais WHERE ativo = 1 ORDER BY nome')) as Linha[]
    if (req.usuario!.perfil === 'mentora') profissionais = profissionais.filter((p) => p.id === req.usuario!.profissional_id)
    if (f.profissional_id && f.profissional_id !== 'sem') profissionais = profissionais.filter((p) => p.id === f.profissional_id)
    const linhas: Linha[] = []
    for (const p of profissionais) {
      const disp = recortar((await db.all('SELECT inicio, fim FROM ped_disponibilidades WHERE profissional_id = ? AND inicio < ? AND fim > ?', p.id, fimDt, ini)) as Intervalo[], ini, fimDt)
      const reservas = recortar((await db.all('SELECT inicio, fim FROM ped_reservas WHERE profissional_id = ? AND ativa = 1 AND inicio < ? AND fim > ?', p.id, fimDt, ini)) as Intervalo[], ini, fimDt)
      const disponivel = somaMinutos(disp) // IN05: sem contar sobreposições duas vezes
      const reservado = minutosEmComum(disp, reservas)
      const livre = disponivel - reservado
      const devidas = ocorrencias.filter((o) => {
        if (o.profissional_efetivo_id !== p.id || !emAberto(o as never) || o.reserva_id) return false
        const g = grupoDoMes(o as never, mes)
        return g === 'previstos' || g === 'anteriores'
      })
      const semReserva = devidas.reduce((t, o) => t + ((o.duracao_efetiva as number) ?? 0), 0) // IN06
      linhas.push({
        profissional_id: p.id,
        profissional_nome: p.nome,
        especialidade: p.especialidade,
        disponivel_min: disponivel,
        reservado_min: reservado,
        reservado_fora_disponibilidade_min: somaMinutos(reservas) - reservado,
        livre_min: livre,
        demanda_sem_agendamento_min: semReserva,
        demanda_sem_agendamento_qtd: devidas.length,
        sem_duracao_qtd: devidas.filter((o) => !o.duracao_efetiva).length,
        saldo_min: livre - semReserva, // IN07
      })
    }
    const semProfissional = ocorrencias.filter((o) => !o.profissional_efetivo_id && emAberto(o as never) && ['previstos', 'anteriores'].includes(grupoDoMes(o as never, mes)))
    return {
      profissionais: linhas,
      sem_profissional: { quantidade: semProfissional.length, minutos: semProfissional.reduce((t, o) => t + ((o.duracao_efetiva as number) ?? 0), 0) },
      aviso: 'Saldo positivo não garante que os horários livres sejam compatíveis com os das alunas.',
    }
  }

  r.get('/capacidade', async (req, res) => {
    exigir(req, 'entregas:ver')
    const f = validar(esquemaFiltros, req.query)
    res.json({ mes: f.mes ?? mesDe(hoje()), ...(await capacidade(req, f.mes ?? mesDe(hoje()), f)) })
  })

  /* ---------------- Agenda e disponibilidade (RF05) ---------------- */

  r.get('/agenda', async (req, res) => {
    exigir(req, 'entregas:ver')
    const q = validar(z.object({ de: dataObrig('a data inicial'), ate: dataObrig('a data final'), profissional_id: z.string().uuid().optional() }), req.query)
    let prof = q.profissional_id ?? null
    if (req.usuario!.perfil === 'mentora') prof = req.usuario!.profissional_id ?? '__nenhum__'
    const ini = `${q.de}T00:00`
    const fim = `${somarDias(q.ate, 1)}T00:00`
    const disponibilidades = (await db.all('SELECT d.*, p.nome AS profissional_nome FROM ped_disponibilidades d JOIN ped_profissionais p ON p.id = d.profissional_id WHERE (@prof IS NULL OR d.profissional_id = @prof) AND d.inicio < @fim AND d.fim > @ini ORDER BY d.inicio', { prof, ini, fim }))
    const esc = escopoMatriculas(req)
    const reservas = (await db.all(`SELECT r.*, pr.nome AS profissional_nome, o.situacao AS ocorrencia_situacao, o.matricula_id, i.descricao AS item_descricao, pe.nome AS pessoa_nome, pe.codigo AS pessoa_codigo, pe.id AS pessoa_id,
           CASE WHEN ${esc.sql} THEN 1 ELSE 0 END AS visivel
         FROM ped_reservas r JOIN ped_profissionais pr ON pr.id = r.profissional_id JOIN ped_ocorrencias o ON o.id = r.ocorrencia_id
         JOIN ped_itens_contratados i ON i.id = o.item_id JOIN ped_matriculas m ON m.id = o.matricula_id JOIN ped_pessoas pe ON pe.id = m.pessoa_id
         WHERE r.ativa = 1 AND (@prof IS NULL OR r.profissional_id = @prof) AND r.inicio < @fim AND r.fim > @ini ORDER BY r.inicio`, { prof, ini, fim, ...esc.params })) as Linha[]
    res.json({
      disponibilidades,
      // Horários de outras alunas aparecem só como "Reservado", sem nome, para quem não tem acesso à matrícula.
      reservas: reservas.map((r) => (r.visivel ? r : { ...r, pessoa_nome: 'Reservado', pessoa_codigo: null, pessoa_id: null, item_descricao: null, matricula_id: null })),
    })
  })

  r.post('/disponibilidades', async (req, res) => {
    exigir(req, 'agenda:editar')
    const d = validar(
      z.object({
        profissional_id: idObrig('a profissional'),
        intervalos: z.array(z.object({ inicio: horarioObrig('o início'), fim: horarioObrig('o fim') })).min(1).max(100),
        observacao: texto(300),
      }),
      req.body,
    )
    if (req.usuario!.perfil === 'mentora' && d.profissional_id !== req.usuario!.profissional_id) throw new ErroHttp(403, 'Você só pode cadastrar a sua própria disponibilidade.')
    for (const i of d.intervalos) if (i.fim <= i.inicio) throw new ErroHttp(400, 'O fim de cada horário precisa ser depois do início.')
    const existentes = (await db.all('SELECT inicio, fim FROM ped_disponibilidades WHERE profissional_id = ?', d.profissional_id)) as Intervalo[]
    const novos = mesclarIntervalos(d.intervalos)
    await transacao(db, async (tx) => {
      for (const i of novos) {
        if (existentes.some((e) => e.inicio < i.fim && e.fim > i.inicio)) throw new ErroHttp(409, `Já existe disponibilidade cadastrada que se sobrepõe a ${i.inicio.replace('T', ' ')}.`)
        tx.run('INSERT INTO ped_disponibilidades (id, profissional_id, inicio, fim, observacao, criado_em, autor_id) VALUES (?,?,?,?,?,?,?)', novoId(), d.profissional_id, i.inicio, i.fim, d.observacao ?? null, agoraIso(), req.usuario!.id)
      }
      await auditar(tx, req, { entidade: 'disponibilidade', entidade_id: d.profissional_id, acao: 'cadastrada', dados: d })
    })
    res.status(201).json({ ok: true, criados: novos.length })
  })

  r.delete('/disponibilidades/:id', async (req, res) => {
    exigir(req, 'agenda:editar')
    const disp = (await db.get('SELECT * FROM ped_disponibilidades WHERE id = ?', req.params.id)) as Linha | undefined
    if (!disp) throw new ErroHttp(404, 'Disponibilidade não encontrada.')
    if (req.usuario!.perfil === 'mentora' && disp.profissional_id !== req.usuario!.profissional_id) throw new ErroHttp(403, 'Você só pode alterar a sua própria disponibilidade.')
    const reservado = (await db.get('SELECT 1 FROM ped_reservas WHERE profissional_id = ? AND ativa = 1 AND inicio < ? AND fim > ? AND ocorrencia_id IN (SELECT id FROM ped_ocorrencias WHERE situacao = \'agendada\')', disp.profissional_id, disp.fim, disp.inicio))
    if (reservado) throw new ErroHttp(409, 'Há encontros agendados neste horário. Reagende ou desmarque antes de remover a disponibilidade.')
    await db.run('DELETE FROM ped_disponibilidades WHERE id = ?', disp.id)
    await auditar(db, req, { entidade: 'disponibilidade', entidade_id: disp.id as string, acao: 'removida', dados: disp })
    res.json({ ok: true })
  })

  /* ---------------- Alunas da agenda de uma profissional (perfil Mentora) ---------------- */

  r.get('/mentora/alunas', async (req, res) => {
    exigir(req, 'entregas:ver')
    const q = validar(z.object({ profissional_id: z.string().uuid().optional() }), req.query)
    const prof = req.usuario!.perfil === 'mentora' ? req.usuario!.profissional_id : (q.profissional_id ?? null)
    if (!prof) return res.json({ profissional: null, alunas: [] })
    const profissional = (await db.get('SELECT id, nome, especialidade FROM ped_profissionais WHERE id = ?', prof)) ?? null
    const h = hoje()
    const esc = escopoMatriculas(req)
    const ocorrencias = ((await db.all(`${SQL_OCORRENCIAS} WHERE ${esc.sql} AND COALESCE(o.profissional_id, i.profissional_id) = @prof AND m.situacao IN ('ativa','pausada') AND o.situacao <> 'cancelada'
         ORDER BY p.codigo IS NULL, p.codigo, COALESCE(o.data_realizada, substr(o.data_agendada,1,10), o.data_prevista, '9999'), o.numero`, { prof, ...esc.params })) as Linha[]).map((o): Linha => ({ ...filtrarNotas(req, o), atraso: indicadorAtraso(o as never, h), entregas_restantes: Math.max((o.item_contratada as number) - (o.item_realizadas as number), 0) }))
    const SQL_JORNADA = `SELECT t.nome AS trilha_nome, pl.nome AS pilar_nome,
         (SELECT COUNT(*) FROM ped_atividades a WHERE a.matricula_id = j.matricula_id) AS total,
         (SELECT COUNT(*) FROM ped_atividades a WHERE a.matricula_id = j.matricula_id AND a.situacao = 'validada') AS validadas,
         (SELECT COUNT(*) FROM ped_atividades a WHERE a.matricula_id = j.matricula_id AND a.situacao = 'enviada') AS aguardando
       FROM ped_jornadas j LEFT JOIN ped_trilhas t ON t.id = j.trilha_id LEFT JOIN ped_pilares pl ON pl.id = j.pilar_id WHERE j.matricula_id = ?`
    const SQL_ULTIMA_NOTA = ("SELECT texto, criado_em FROM ped_anotacoes WHERE matricula_id = ? AND tipo IN (" + [tem(req, 'notas:internas') && "'operacional'", tem(req, 'notas:pedagogicas') && "'pedagogica'"].filter(Boolean).concat("''").join(',') + ") ORDER BY criado_em DESC LIMIT 1")
    const porMatricula = new Map<string, Linha[]>()
    for (const o of ocorrencias) porMatricula.set(o.matricula_id as string, [...(porMatricula.get(o.matricula_id as string) ?? []), o])
    const alunas: Linha[] = []
    for (const [mid, ocs] of porMatricula.entries()) {
      const o0 = ocs[0]
      const abertas = ocs.filter((o) => o.situacao !== 'realizada')
      const realizadas = ocs.filter((o) => o.situacao === 'realizada').sort((a, b) => String(b.data_realizada).localeCompare(String(a.data_realizada)))
      const proximo = abertas.filter((o) => o.situacao === 'agendada').sort((a, b) => String(a.data_agendada).localeCompare(String(b.data_agendada)))[0] ?? null
      alunas.push({
        pessoa_id: o0.pessoa_id,
        pessoa_codigo: o0.pessoa_codigo,
        pessoa_nome: o0.pessoa_nome,
        matricula: { id: mid, situacao: o0.matricula_situacao, data_inicio: o0.data_inicio, data_fim: o0.data_fim },
        jornada: (await db.get(SQL_JORNADA, mid)) ?? null,
        proximo,
        ultimo_realizado: realizadas[0] ?? null,
        abertas,
        realizadas_qtd: realizadas.length,
        vencidas: abertas.filter((o) => (o.atraso as { tipo: string }).tipo === 'vencida').length,
        sem_registro: abertas.filter((o) => o.situacao === 'agendada' && String(o.data_agendada).slice(0, 10) < h).length,
        ultima_anotacao: (await db.get(SQL_ULTIMA_NOTA, mid)) ?? null,
      })
    }
    res.json({ profissional, alunas })
  })

  /* ---------------- Visão geral (RF01) ---------------- */

  r.get('/visao-geral', async (req, res) => {
    exigir(req, 'indicadores:ver')
    const f = validar(esquemaFiltros, req.query)
    const mes = f.mes ?? mesDe(hoje())
    const h = hoje()
    const janela = Number(((await db.get("SELECT valor FROM ped_configuracoes WHERE chave = 'janela_termino_dias'")) as { valor: string } | undefined)?.valor ?? 45)
    const esc = escopoMatriculas(req)
    const matriculas = (await db.all(`SELECT m.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, pg.nome AS programa_nome, j.trilha_id, j.pilar_id, t.nome AS trilha_nome, pl.nome AS pilar_nome,
           (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.matricula_id = m.id AND o.situacao NOT IN ('realizada','cancelada')) AS restantes
         FROM ped_matriculas m JOIN ped_pessoas p ON p.id = m.pessoa_id LEFT JOIN ped_programas pg ON pg.id = m.programa_id
         LEFT JOIN ped_jornadas j ON j.matricula_id = m.id LEFT JOIN ped_trilhas t ON t.id = j.trilha_id LEFT JOIN ped_pilares pl ON pl.id = j.pilar_id
         WHERE ${esc.sql}
           AND (@programa_id IS NULL OR m.programa_id = @programa_id) AND (@responsavel_id IS NULL OR m.responsavel_id = @responsavel_id)
           AND (@trilha_id IS NULL OR j.trilha_id = @trilha_id) AND (@pilar_id IS NULL OR j.pilar_id = @pilar_id)
           AND (@situacao IS NULL OR m.situacao = @situacao)`, { programa_id: f.programa_id ?? null, responsavel_id: f.responsavel_id ?? null, trilha_id: f.trilha_id ?? null, pilar_id: f.pilar_id ?? null, situacao: f.situacao ?? null, ...esc.params })) as Linha[]
    const ativas = matriculas.filter((m) => m.situacao === 'ativa')
    const limite = somarDias(h, janela)
    const proximas = ativas.filter((m) => m.data_fim && (m.data_fim as string) >= h && (m.data_fim as string) <= limite).sort((a, b) => String(a.data_fim).localeCompare(String(b.data_fim)))
    const ocorrencias = await ocorrenciasFiltradas(req, f)
    const vencidas = ocorrencias.filter((o) => indicadorAtraso(o as never, h).tipo === 'vencida')
    const previstasMes = ocorrencias.filter((o) => ['previstos', 'agendados'].includes(grupoDoMes(o as never, mes)))

    const contatosPend = (await db.all(`SELECT c.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.id AS pessoa_id, u.nome AS responsavel_nome FROM ped_contatos c
         JOIN ped_matriculas m ON m.id = c.matricula_id JOIN ped_pessoas p ON p.id = m.pessoa_id LEFT JOIN ped_usuarios u ON u.id = c.responsavel_id
         WHERE ${esc.sql} AND m.situacao IN ('ativa','pausada') AND c.proxima_tentativa IS NOT NULL AND c.proxima_tentativa <= @hoje
           AND NOT EXISTS (SELECT 1 FROM ped_contatos c2 WHERE c2.matricula_id = c.matricula_id AND COALESCE(c2.ocorrencia_id,'') = COALESCE(c.ocorrencia_id,'')
                           AND (c2.data > c.data OR (c2.data = c.data AND c2.criado_em > c.criado_em)))
         ORDER BY c.proxima_tentativa`, { hoje: h, ...esc.params }))

    const dist: Record<string, { trilha: string; pilar: string; quantidade: number }> = {}
    for (const m of ativas) {
      const chave = `${m.trilha_id ?? '-'}|${m.pilar_id ?? '-'}`
      dist[chave] ??= { trilha: (m.trilha_nome as string) ?? 'Jornada não definida', pilar: (m.pilar_nome as string) ?? '—', quantidade: 0 }
      dist[chave].quantidade++
    }

    const pendCadastro: { tipo: string; descricao: string; pessoa_id: string; pessoa_nome: string; pessoa_codigo: number | null }[] = []
    for (const m of matriculas.filter((x) => x.situacao === 'ativa' || x.situacao === 'pausada')) {
      const base = { pessoa_id: m.pessoa_id as string, pessoa_nome: m.pessoa_nome as string, pessoa_codigo: m.pessoa_codigo as number | null }
      if (!m.data_fim) pendCadastro.push({ ...base, tipo: 'vigencia', descricao: 'Matrícula sem data de término da vigência' })
      if (m.contrato_situacao !== 'assinado') pendCadastro.push({ ...base, tipo: 'contrato', descricao: `Contrato ${m.contrato_situacao === 'enviado' ? 'enviado, aguardando assinatura' : 'pendente'}` })
      if (m.conferencia_comercial !== 'conferida') pendCadastro.push({ ...base, tipo: 'conferencia', descricao: 'Pacote e bônus ainda não conferidos com a fonte comercial' })
    }
    const porItem = new Map<string, Linha[]>()
    for (const o of ocorrencias) if (emAberto(o as never)) porItem.set(o.item_id as string, [...(porItem.get(o.item_id as string) ?? []), o])
    for (const lista of porItem.values()) {
      const o = lista[0]
      const base = { pessoa_id: o.pessoa_id as string, pessoa_nome: o.pessoa_nome as string, pessoa_codigo: o.pessoa_codigo as number | null }
      if (!o.duracao_efetiva) pendCadastro.push({ ...base, tipo: 'duracao', descricao: `"${o.item_descricao}" sem duração definida (horas não entram no cálculo)` })
      if (!o.profissional_efetivo_id) pendCadastro.push({ ...base, tipo: 'profissional', descricao: `"${o.item_descricao}" sem profissional definida` })
      const semPrev = lista.filter((x) => !x.data_prevista).length
      if (semPrev) pendCadastro.push({ ...base, tipo: 'previsao', descricao: `"${o.item_descricao}": ${semPrev} ocorrência(s) sem previsão` })
    }

    const pessoasAtivas = new Set(ativas.map((m) => m.pessoa_id)).size
    res.json({
      mes,
      hoje: h,
      janela_termino_dias: janela,
      indicadores: {
        pessoas_ativas: pessoasAtivas, // IN01
        matriculas_ativas: ativas.length, // IN02
        matriculas_pausadas: matriculas.filter((m) => m.situacao === 'pausada').length,
        proximas_termino: proximas.length,
        entregas_vencidas: vencidas.length,
        entregas_previstas_mes: previstasMes.length,
        contatos_pendentes: contatosPend.length,
        pendencias_cadastro: pendCadastro.length,
      },
      proximas_termino: proximas.map((m) => ({ id: m.id, pessoa_id: m.pessoa_id, pessoa_nome: m.pessoa_nome, pessoa_codigo: m.pessoa_codigo, data_fim: m.data_fim, restantes: m.restantes, programa_nome: m.programa_nome })),
      vencidas: vencidas.slice(0, 50).map((o) => ({ id: o.id, pessoa_id: o.pessoa_id, pessoa_nome: o.pessoa_nome, pessoa_codigo: o.pessoa_codigo, item_descricao: o.item_descricao, numero: o.numero, data_prevista: o.data_prevista, profissional_nome: o.profissional_nome, impedimento_motivo: o.impedimento_motivo, atraso: indicadorAtraso(o as never, h) })),
      contatos_pendentes: contatosPend,
      distribuicao: Object.values(dist).sort((a, b) => b.quantidade - a.quantidade),
      pendencias_cadastro: pendCadastro,
    })
  })

  /* ---------------- Alertas internos (calculados na consulta) ---------------- */

  r.get('/alertas', async (req, res) => {
    const h = hoje()
    const esc = escopoMatriculas(req)
    const alertas: { chave: string; tipo: string; titulo: string; detalhe: string; responsavel: string; pessoa_id?: string; data?: string | null }[] = []
    if (tem(req, 'entregas:ver')) {
      const abertas = (await db.all(`${SQL_OCORRENCIAS} WHERE ${esc.sql} AND m.situacao IN ('ativa','pausada') AND o.situacao NOT IN ('realizada','cancelada')`, esc.params)) as Linha[]
      for (const o of abertas) {
        const a = indicadorAtraso(o as never, h)
        if (a.tipo === 'vencida')
          alertas.push({
            chave: `vencida:${o.id}`,
            tipo: 'entrega_vencida',
            titulo: `${o.pessoa_nome}: ${o.item_descricao} nº ${o.numero} vencida há ${a.dias} dia(s)`,
            detalhe: o.impedimento_motivo ? `Impedimento: ${o.impedimento_motivo}` : 'Sem impedimento registrado',
            responsavel: (o.impedimento_responsavel_nome as string) ?? (o.responsavel_resolucao_nome as string) ?? 'Suporte/CS',
            pessoa_id: o.pessoa_id as string,
            data: o.data_prevista as string,
          })
        if (o.situacao === 'agendada' && o.data_agendada && (o.data_agendada as string).slice(0, 10) < h)
          alertas.push({
            chave: `sem_registro:${o.id}`,
            tipo: 'encontro_sem_registro',
            titulo: `${o.pessoa_nome}: encontro de ${(o.data_agendada as string).slice(0, 10).split('-').reverse().join('/')} sem registro de realização`,
            detalhe: `${o.item_descricao} com ${o.profissional_nome ?? 'profissional não definida'}`,
            responsavel: (o.profissional_nome as string) ?? 'Suporte/CS',
            pessoa_id: o.pessoa_id as string,
            data: o.data_agendada as string,
          })
      }
      const tentativas = (await db.all(`SELECT c.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.id AS pessoa_id, u.nome AS responsavel_nome FROM ped_contatos c JOIN ped_matriculas m ON m.id = c.matricula_id JOIN ped_pessoas p ON p.id = m.pessoa_id LEFT JOIN ped_usuarios u ON u.id = c.responsavel_id
           WHERE ${esc.sql} AND m.situacao IN ('ativa','pausada') AND c.proxima_tentativa IS NOT NULL AND c.proxima_tentativa <= @hoje
             AND NOT EXISTS (SELECT 1 FROM ped_contatos c2 WHERE c2.matricula_id = c.matricula_id AND COALESCE(c2.ocorrencia_id,'') = COALESCE(c.ocorrencia_id,'') AND (c2.data > c.data OR (c2.data = c.data AND c2.criado_em > c.criado_em)))`, { hoje: h, ...esc.params })) as Linha[]
      for (const c of tentativas)
        alertas.push({ chave: `tentativa:${c.id}`, tipo: 'proxima_tentativa', titulo: `${c.pessoa_nome}: tentar contato novamente`, detalhe: (c.proxima_acao as string) ?? 'Próxima tentativa de contato', responsavel: (c.responsavel_nome as string) ?? 'Suporte/CS', pessoa_id: c.pessoa_id as string, data: c.proxima_tentativa as string })
    }
    if (tem(req, 'alunas:ver')) {
      const janela = Number(((await db.get("SELECT valor FROM ped_configuracoes WHERE chave = 'janela_termino_dias'")) as { valor: string } | undefined)?.valor ?? 45)
      const ms = (await db.all(`SELECT m.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, u.nome AS responsavel_nome, (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.matricula_id = m.id AND o.situacao NOT IN ('realizada','cancelada')) AS restantes
           FROM ped_matriculas m JOIN ped_pessoas p ON p.id = m.pessoa_id LEFT JOIN ped_usuarios u ON u.id = m.responsavel_id WHERE ${esc.sql}`, esc.params)) as Linha[]
      for (const m of ms) {
        const resp = (m.responsavel_nome as string) ?? 'Coordenação'
        if (m.situacao === 'ativa' && m.data_fim && (m.data_fim as string) >= h && (m.data_fim as string) <= somarDias(h, janela))
          alertas.push({ chave: `termino:${m.id}`, tipo: 'proxima_termino', titulo: `${m.pessoa_nome}: matrícula termina em ${(m.data_fim as string).split('-').reverse().join('/')}`, detalhe: `${m.restantes} entrega(s) restante(s)`, responsavel: resp, pessoa_id: m.pessoa_id as string, data: m.data_fim as string })
        if ((m.situacao === 'ativa' || m.situacao === 'pausada') && (!m.data_fim || !m.programa_id || m.contrato_situacao !== 'assinado'))
          alertas.push({
            chave: `cadastro:${m.id}`,
            tipo: 'cadastro_incompleto',
            titulo: `${m.pessoa_nome}: cadastro incompleto`,
            detalhe: [!m.data_fim && 'sem término da vigência', !m.programa_id && 'sem programa', m.contrato_situacao !== 'assinado' && `contrato ${m.contrato_situacao}`].filter(Boolean).join(', '),
            responsavel: resp,
            pessoa_id: m.pessoa_id as string,
          })
        if (m.situacao === 'cancelada' && (m.restantes as number) > 0)
          alertas.push({ chave: `cancelada_obrigacoes:${m.id}`, tipo: 'decisao_obrigacoes', titulo: `${m.pessoa_nome}: matrícula cancelada com ${m.restantes} obrigação(ões) em aberto`, detalhe: 'Decida explicitamente o destino de cada obrigação remanescente', responsavel: 'Coordenação' , pessoa_id: m.pessoa_id as string })
      }
      const pausas = (await db.all(`SELECT pa.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.id AS pessoa_id FROM ped_pausas pa JOIN ped_matriculas m ON m.id = pa.matricula_id JOIN ped_pessoas p ON p.id = m.pessoa_id WHERE ${esc.sql} AND pa.decisao_prazos = 'pendente'`, esc.params)) as Linha[]
      for (const p of pausas) alertas.push({ chave: `pausa:${p.id}`, tipo: 'pausa_decisao', titulo: `${p.pessoa_nome}: decisão de prazos da pausa pendente`, detalhe: `Pausa desde ${(p.inicio as string).split('-').reverse().join('/')}: ${p.motivo}`, responsavel: 'Coordenação pedagógica', pessoa_id: p.pessoa_id as string, data: p.inicio as string })
    }
    if (tem(req, 'jornada:validar')) {
      const enviadas = (await db.all(`SELECT a.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.id AS pessoa_id, uv.nome AS validador_nome FROM ped_atividades a JOIN ped_jornada_etapas je ON je.id = a.jornada_etapa_id JOIN ped_matriculas m ON m.id = a.matricula_id JOIN ped_pessoas p ON p.id = m.pessoa_id LEFT JOIN ped_usuarios uv ON uv.id = je.validador_id WHERE ${esc.sql} AND a.situacao = 'enviada'`, esc.params)) as Linha[]
      for (const a of enviadas) alertas.push({ chave: `validacao:${a.id}`, tipo: 'aguardando_validacao', titulo: `${a.pessoa_nome}: "${a.titulo}" aguardando validação`, detalhe: 'Atividade enviada', responsavel: (a.validador_nome as string) ?? 'Coordenação pedagógica', pessoa_id: a.pessoa_id as string, data: (a.atualizado_em as string)?.slice(0, 10) })
    }
    // Chave de deduplicação: cada condição gera no máximo um alerta.
    const unicos = [...new Map(alertas.map((a) => [a.chave, a])).values()]
    res.json({ calculado_em: agoraIso(), observacao: 'Alertas calculados no momento da consulta. Não há envio automático de mensagens nesta versão.', alertas: unicos })
  })

  return r
}
