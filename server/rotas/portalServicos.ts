/**
 * Portal da aluna: mentorias com saldo e reserva de horário, agenda, Plano de Ação, vitórias,
 * depoimentos, Rotina, Biblioteca, Livros e Mural.
 *
 * Como no restante do portal, tudo é escolhido pela pessoa da sessão (req.usuario.pessoa_id): um id
 * vindo da URL só é aceito se pertencer à matrícula atual da própria aluna. Saldo e horário são
 * conferidos aqui no servidor e, no momento da gravação, pelos gatilhos do banco.
 */
import { Router, type Req as Request, type Res as Response, type Next as NextFunction } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, transacao, type BD } from '../db'
import { ErroHttp } from '../auth'
import { SQL_OCORRENCIAS, auditar, config, data, hoje, historico, horarioObrig, texto, textoObrig, validar } from '../servicos'
import { SITUACOES_A_AGENDAR, comConflitoDeHorario, horariosDoItem, liberarReserva, reservar, saldoItens } from '../agenda'
import { enfileirar, processarIntegracoes } from '../confirmacoes'
import { matriculaDaAluna } from './portal'
import { agoraSP, somarDias, somarMinutos } from '../../shared/datas'
import { entregarAnexo } from '../anexos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export const CANAIS_CONTATO = ['whatsapp', 'email', 'instagram', 'site', 'outro'] as const
export const CATEGORIAS_MURAL = ['oportunidade', 'produto', 'servico'] as const

export function rotasPortalServicos(db: BD, ctx: ContextoApp) {
  const r = Router()

  r.use('/portal', async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.')
    if (req.usuario.perfil !== 'aluna' || !req.usuario.pessoa_id) throw new ErroHttp(403, 'O portal é exclusivo para alunas.')
    next()
  })

  async function matricula(req: Request) {
    const m = await matriculaDaAluna(db, req.usuario!.pessoa_id!)
    if (!m) throw new ErroHttp(404, 'Você ainda não tem uma matrícula ativa. Fale com a equipe.')
    return m
  }

  /** Regras de agenda do portal (Configurações): antecedência mínima e quantos dias à frente. */
  async function janelaAgenda() {
    const antecedencia = Number(await config(db, 'agenda_antecedencia_horas', '24'))
    const dias = Number(await config(db, 'agenda_dias_a_frente', '30'))
    const agora = agoraSP()
    return { antecedencia, dias, aPartirDe: somarMinutos(agora, Math.max(0, antecedencia) * 60), ate: `${somarDias(agora.slice(0, 10), Math.max(1, dias))}T23:59` }
  }

  /* ---------------- Mentorias: saldo por tipo de encontro ---------------- */

  r.get('/portal/mentorias', async (req, res) => {
    const m = await matricula(req)
    const itens = await saldoItens(db, m.id as string)
    const encontros = (await db.all(`SELECT o.id, o.item_id, o.numero, o.situacao, o.data_agendada, o.data_realizada, pr.nome AS profissional_nome
         FROM ped_ocorrencias o JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_profissionais pr ON pr.id = COALESCE(o.profissional_id, i.profissional_id)
         WHERE o.matricula_id = ? AND o.situacao IN ('agendada','realizada') ORDER BY COALESCE(o.data_agendada, o.data_realizada)`, m.id)) as Linha[]
    const ativa = m.situacao === 'ativa'
    // Pacote, bônus e personalizações do mesmo tipo de encontro somam no mesmo saldo.
    const porTipo = new Map<string, Linha>()
    for (const i of itens) {
      const chave = (i.tipo_id as string) ?? `item:${i.id}`
      const t = porTipo.get(chave) ?? { chave, tipo_id: i.tipo_id ?? null, nome: i.tipo_nome ?? i.descricao, contratada: 0, realizadas: 0, agendadas: 0, disponiveis: 0, itens: [] as Linha[] }
      t.contratada += i.contratada
      t.realizadas += i.realizadas
      t.agendadas += i.agendadas
      t.disponiveis += i.disponiveis
      const motivo = !ativa
        ? 'A matrícula não está ativa.'
        : !i.disponiveis
          ? null
          : !i.profissional_id
            ? 'A equipe ainda vai definir a profissional deste encontro.'
            : !i.duracao_efetiva
              ? 'A equipe ainda vai definir a duração deste encontro.'
              : null
      t.itens.push({
        id: i.id,
        descricao: i.descricao,
        origem: i.origem,
        profissional_nome: i.profissional_nome ?? null,
        duracao_min: i.duracao_efetiva ?? null,
        contratada: i.contratada,
        realizadas: i.realizadas,
        agendadas: i.agendadas,
        disponiveis: i.disponiveis,
        pode_agendar: ativa && i.disponiveis > 0 && !motivo,
        motivo_sem_agenda: motivo,
        encontros: encontros.filter((o) => o.item_id === i.id),
      })
      porTipo.set(chave, t)
    }
    const j = await janelaAgenda()
    res.json({ tipos: [...porTipo.values()], antecedencia_horas: j.antecedencia, dias_a_frente: j.dias })
  })

  async function itemDaAluna(req: Request, itemId: string) {
    const m = await matricula(req)
    const item = (await saldoItens(db, m.id as string)).find((i) => i.id === itemId)
    // Mesmo erro para "não existe" e "é de outra aluna".
    if (!item) throw new ErroHttp(404, 'Encontro não encontrado.')
    return { m, item }
  }

  r.get('/portal/mentorias/itens/:id/horarios', async (req, res) => {
    const { item } = await itemDaAluna(req, req.params.id as string)
    const j = await janelaAgenda()
    res.json({ horarios: item.disponiveis > 0 ? await horariosDoItem(db, item, j.aPartirDe, j.ate) : [], duracao_min: item.duracao_efetiva ?? null, profissional_nome: item.profissional_nome ?? null })
  })

  async function horarioLivre(item: Linha, inicio: string) {
    const j = await janelaAgenda()
    if (inicio < j.aPartirDe) throw new ErroHttp(409, `Escolha um horário com pelo menos ${j.antecedencia} h de antecedência.`)
    const livres = await horariosDoItem(db, item, j.aPartirDe, j.ate)
    if (!livres.some((h) => h.inicio === inicio)) throw new ErroHttp(409, 'Este horário não está mais disponível. Escolha outro.')
  }

  // Atividades pendentes não bloqueiam a marcação (RN07).
  r.post('/portal/mentorias/itens/:id/reservar', async (req, res) => {
    const d = validar(z.object({ inicio: horarioObrig('o horário') }), req.body)
    const { m, item } = await itemDaAluna(req, req.params.id as string)
    if (m.situacao !== 'ativa') throw new ErroHttp(409, 'A matrícula não está ativa. Fale com a equipe.')
    if (!item.profissional_id || !item.duracao_efetiva) throw new ErroHttp(409, 'Este encontro ainda não pode ser marcado pelo portal. Fale com a equipe.')
    if (item.disponiveis <= 0) throw new ErroHttp(409, 'Você não tem mais encontros disponíveis deste tipo para agendar.')
    await horarioLivre(item, d.inicio)
    // Tenta a próxima ocorrência livre; se outra marcação usou a mesma ao mesmo tempo, tenta a seguinte.
    const tentadas: string[] = []
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const o = (await db.get(
        `${SQL_OCORRENCIAS} WHERE o.item_id = ? AND o.situacao IN (${SITUACOES_A_AGENDAR.map(() => '?').join(',')})
           AND COALESCE(o.profissional_id, i.profissional_id) = ?
           AND NOT EXISTS (SELECT 1 FROM ped_reservas rr WHERE rr.ocorrencia_id = o.id AND rr.ativa = 1)
           ${tentadas.length ? `AND o.id NOT IN (${tentadas.map(() => '?').join(',')})` : ''}
         ORDER BY o.numero LIMIT 1`,
        item.id,
        ...SITUACOES_A_AGENDAR,
        item.profissional_id,
        ...tentadas,
      )) as Linha | undefined
      if (!o) throw new ErroHttp(409, 'Você não tem mais encontros disponíveis deste tipo para agendar.')
      try {
        await comConflitoDeHorario(
          transacao(db, async (tx) => {
            const reserva = await reservar(db, tx, req, o, { inicio: d.inicio, duracao_min: item.duracao_efetiva, profissional_id: item.profissional_id, fora_disponibilidade: false, motivo: null })
            enfileirar(tx, o.id as string, 'confirmar', reserva)
            await historico(tx, req, o.id as string, 'agendada', null, d.inicio, 'Marcado pela aluna no portal')
            await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'agendada_pela_aluna', matricula_id: m.id as string, dados: { inicio: d.inicio } })
          }),
          { horario: 'Este horário acabou de ser reservado. Escolha outro.', ocorrencia: '__repetir__' },
        )
        await processarIntegracoes(db, ctx.confirmacoes, o.id as string)
        return res.status(201).json({ ok: true, ocorrencia_id: o.id })
      } catch (e) {
        if (e instanceof ErroHttp && e.message === '__repetir__') {
          tentadas.push(o.id as string)
          continue
        }
        throw e
      }
    }
    throw new ErroHttp(409, 'Você não tem mais encontros disponíveis deste tipo para agendar.')
  })

  async function encontroDaAluna(req: Request, ocorrenciaId: string) {
    const m = await matricula(req)
    const o = (await db.get(`${SQL_OCORRENCIAS} WHERE o.id = ? AND o.matricula_id = ?`, ocorrenciaId, m.id)) as Linha | undefined
    if (!o) throw new ErroHttp(404, 'Encontro não encontrado.')
    if (o.situacao !== 'agendada') throw new ErroHttp(409, 'Este encontro não está agendado.')
    const j = await janelaAgenda()
    if ((o.data_agendada as string) < j.aPartirDe) throw new ErroHttp(409, `Faltam menos de ${j.antecedencia} h para o encontro. Fale com a equipe para remarcar ou desmarcar.`)
    return { m, o }
  }

  // Reagendar move o MESMO encontro contratado para outro horário: não consome outro do saldo.
  r.post('/portal/mentorias/encontros/:id/reagendar', async (req, res) => {
    const d = validar(z.object({ inicio: horarioObrig('o novo horário') }), req.body)
    const { m, o } = await encontroDaAluna(req, req.params.id as string)
    const item = (await saldoItens(db, m.id as string)).find((i) => i.id === o.item_id)!
    if ((o.profissional_efetivo_id ?? item.profissional_id) !== item.profissional_id) throw new ErroHttp(409, 'Este encontro foi combinado com outra profissional. Fale com a equipe para remarcar.')
    await horarioLivre(item, d.inicio)
    await comConflitoDeHorario(
      transacao(db, async (tx) => {
        liberarReserva(tx, o, 'Remarcado pela aluna no portal')
        const reserva = await reservar(db, tx, req, { ...o, reserva_id: null }, { inicio: d.inicio, duracao_min: item.duracao_efetiva, profissional_id: item.profissional_id, fora_disponibilidade: false, motivo: null })
        enfileirar(tx, o.id as string, 'atualizar', reserva)
        await historico(tx, req, o.id as string, 'reagendada', o.data_agendada as string, d.inicio, 'Remarcado pela aluna no portal')
        await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'reagendada_pela_aluna', matricula_id: m.id as string, dados: { de: o.data_agendada, para: d.inicio } })
      }),
      { horario: 'Este horário acabou de ser reservado. Escolha outro.' },
    )
    await processarIntegracoes(db, ctx.confirmacoes, o.id as string)
    res.json({ ok: true })
  })

  // Desmarcar libera o horário e devolve o encontro ao saldo. Cancelar a obrigação é só com a equipe.
  r.post('/portal/mentorias/encontros/:id/desmarcar', async (req, res) => {
    const d = validar(z.object({ motivo: texto(500) }), req.body ?? {})
    const { m, o } = await encontroDaAluna(req, req.params.id as string)
    await transacao(db, async (tx) => {
      liberarReserva(tx, o, d.motivo ? `Desmarcado pela aluna: ${d.motivo}` : 'Desmarcado pela aluna no portal')
      if (o.reserva_id) enfileirar(tx, o.id as string, 'cancelar', o.reserva_id as string)
      tx.run("UPDATE ped_ocorrencias SET situacao='disponivel_agendar', data_agendada=NULL, atualizado_em=? WHERE id=?", agoraIso(), o.id)
      await historico(tx, req, o.id as string, 'desmarcada', o.data_agendada as string, null, d.motivo ?? 'Desmarcado pela aluna no portal')
      await auditar(tx, req, { entidade: 'ocorrencia', entidade_id: o.id as string, acao: 'desmarcada_pela_aluna', matricula_id: m.id as string, dados: d })
    })
    await processarIntegracoes(db, ctx.confirmacoes, o.id as string)
    res.json({ ok: true })
  })

  /** Agenda da aluna: os mesmos encontros que a equipe vê na agenda (reservas ativas e realizados). */
  r.get('/portal/agenda', async (req, res) => {
    const m = await matricula(req)
    const j = await janelaAgenda()
    const encontros = ((await db.all(`SELECT o.id, o.item_id, o.situacao, o.data_agendada, o.data_realizada, r.inicio, r.fim, COALESCE(t.nome, i.descricao) AS tipo, pr.nome AS profissional_nome
         FROM ped_ocorrencias o JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id
         LEFT JOIN ped_reservas r ON r.ocorrencia_id = o.id AND r.ativa = 1
         LEFT JOIN ped_profissionais pr ON pr.id = COALESCE(r.profissional_id, o.profissional_id, i.profissional_id)
         WHERE o.matricula_id = ? AND o.situacao IN ('agendada','realizada') ORDER BY COALESCE(r.inicio, o.data_agendada, o.data_realizada) DESC`, m.id)) as Linha[]).map((o) => ({
      ...o,
      pode_alterar: o.situacao === 'agendada' && !!o.data_agendada && o.data_agendada >= j.aPartirDe,
    }))
    res.json({ encontros, antecedencia_horas: j.antecedencia })
  })

  /* ---------------- Plano de Ação (só ações publicadas pela equipe) ---------------- */

  r.get('/portal/plano-acao', async (req, res) => {
    const m = await matricula(req)
    const acoes = await db.all(`SELECT a.id, a.titulo, a.descricao, a.prazo, a.andamento, a.publicada_em, a.ocorrencia_id,
           COALESCE(t.nome, i.descricao) AS encontro_tipo, o.data_realizada AS encontro_data, o.numero AS encontro_numero
         FROM ped_acoes a LEFT JOIN ped_ocorrencias o ON o.id = a.ocorrencia_id LEFT JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id
         WHERE a.matricula_id = ? AND a.situacao = 'publicada' ORDER BY CASE a.andamento WHEN 'concluida' THEN 1 ELSE 0 END, COALESCE(a.prazo, '9999'), a.publicada_em`, m.id)
    res.json({ acoes })
  })

  r.put('/portal/plano-acao/:id', async (req, res) => {
    const m = await matricula(req)
    const d = validar(z.object({ andamento: z.enum(['a_fazer', 'em_andamento', 'concluida'], { error: 'Escolha o andamento.' }) }), req.body)
    const a = (await db.get("SELECT id FROM ped_acoes WHERE id = ? AND matricula_id = ? AND situacao = 'publicada'", req.params.id, m.id)) as Linha | undefined
    if (!a) throw new ErroHttp(404, 'Ação não encontrada.')
    await db.run('UPDATE ped_acoes SET andamento = ?, atualizado_em = ? WHERE id = ?', d.andamento, agoraIso(), a.id)
    await auditar(db, req, { entidade: 'acao', entidade_id: a.id as string, acao: 'andamento_pela_aluna', matricula_id: m.id as string, dados: d })
    res.json({ ok: true })
  })

  /* ---------------- Vitórias enviadas pela aluna (mesma fila de validação da equipe) ---------------- */

  r.get('/portal/vitorias', async (req, res) => {
    const m = await matricula(req)
    const validadas = await db.all('SELECT id, titulo, situacao_anterior, acao_aplicada, resultado_percebido, data FROM ped_conquistas WHERE matricula_id = ? AND validada = 1 AND visivel_aluna = 1 ORDER BY data DESC', m.id)
    const enviadas = ((await db.all('SELECT id, titulo, data, validada, validada_em, visivel_aluna, criado_em FROM ped_conquistas WHERE matricula_id = ? AND enviada_pela_aluna = 1 ORDER BY criado_em DESC', m.id)) as Linha[]).map((c) => ({
      id: c.id,
      titulo: c.titulo,
      data: c.data,
      situacao: !c.validada_em ? 'aguardando_analise' : c.validada ? (c.visivel_aluna ? 'validada' : 'validada_interna') : 'nao_validada',
    }))
    res.json({ validadas, enviadas })
  })

  r.post('/portal/vitorias', async (req, res) => {
    const m = await matricula(req)
    const d = validar(
      z.object({
        titulo: textoObrig('a sua vitória', 200),
        situacao_anterior: texto(2000),
        acao_aplicada: texto(2000),
        resultado_percebido: texto(2000),
        data: data('a data'),
      }),
      req.body,
    )
    const quando = d.data ?? hoje()
    if (quando > hoje()) throw new ErroHttp(400, 'A data da vitória não pode estar no futuro.')
    const pendentes = ((await db.get('SELECT COUNT(*) AS n FROM ped_conquistas WHERE matricula_id = ? AND enviada_pela_aluna = 1 AND validada_em IS NULL', m.id)) as { n: number }).n
    if (pendentes >= 20) throw new ErroHttp(429, 'Você já tem 20 vitórias aguardando análise. Aguarde a equipe analisar antes de enviar outras.')
    const id = novoId()
    await db.run('INSERT INTO ped_conquistas (id, matricula_id, titulo, situacao_anterior, acao_aplicada, resultado_percebido, data, validada, visivel_aluna, enviada_pela_aluna, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,0,0,1,?,?,?)', id, m.id, d.titulo, d.situacao_anterior ?? null, d.acao_aplicada ?? null, d.resultado_percebido ?? null, quando, agoraIso(), agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'conquista', entidade_id: id, acao: 'enviada_pela_aluna', matricula_id: m.id as string, dados: { titulo: d.titulo } })
    res.status(201).json({ id, situacao: 'aguardando_analise' })
  })

  /* ---------------- Depoimentos: um espaço por encontro realizado ou atividade validada ---------------- */

  async function alvoDoDepoimento(m: Linha, tipo: 'encontro' | 'atividade', alvoId: string) {
    const ok =
      tipo === 'encontro'
        ? await db.get("SELECT 1 FROM ped_ocorrencias WHERE id = ? AND matricula_id = ? AND situacao = 'realizada'", alvoId, m.id)
        : await db.get("SELECT 1 FROM ped_atividades WHERE id = ? AND matricula_id = ? AND situacao = 'validada' AND arquivada = 0", alvoId, m.id)
    if (!ok) throw new ErroHttp(404, tipo === 'encontro' ? 'O depoimento abre depois que o encontro é realizado.' : 'O depoimento abre depois que a atividade é validada.')
  }

  r.get('/portal/depoimentos', async (req, res) => {
    const m = await matricula(req)
    res.json({ depoimentos: await db.all('SELECT id, alvo_tipo, alvo_id, texto, atualizado_em FROM ped_depoimentos WHERE matricula_id = ? ORDER BY atualizado_em DESC', m.id) })
  })

  r.put('/portal/depoimentos/:tipo/:alvo', async (req, res) => {
    const m = await matricula(req)
    const tipo = req.params.tipo
    if (tipo !== 'encontro' && tipo !== 'atividade') throw new ErroHttp(404, 'Depoimento não encontrado.')
    const alvo = z.string().uuid().safeParse(req.params.alvo)
    if (!alvo.success) throw new ErroHttp(404, 'Depoimento não encontrado.')
    await alvoDoDepoimento(m, tipo, alvo.data)
    const d = validar(z.object({ texto: textoObrig('o seu depoimento', 3000) }), req.body)
    const agora = agoraIso()
    await db.run(
      `INSERT INTO ped_depoimentos (id, matricula_id, alvo_tipo, alvo_id, texto, autor_id, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (alvo_tipo, alvo_id) DO UPDATE SET texto = excluded.texto, atualizado_em = excluded.atualizado_em, autor_id = excluded.autor_id`,
      novoId(), m.id, tipo, alvo.data, d.texto, req.usuario!.id, agora, agora,
    )
    await auditar(db, req, { entidade: 'depoimento', entidade_id: `${tipo}:${alvo.data}`, acao: 'salvo_pela_aluna', matricula_id: m.id as string })
    res.json({ ok: true })
  })

  /* ---------------- Rotina, Biblioteca e Livros (só o que a equipe publicou) ---------------- */

  r.get('/portal/conteudos/:secao', async (req, res) => {
    const secao = req.params.secao
    if (!['rotina', 'biblioteca', 'livros'].includes(secao as string)) throw new ErroHttp(404, 'Seção não encontrada.')
    // Vídeos e arquivos são para alunas com matrícula; sem matrícula a lista vem vazia.
    const m = await matriculaDaAluna(db, req.usuario!.pessoa_id!)
    if (!m) return res.json({ itens: [] })
    const itens = await db.all(`SELECT id, secao, categoria, titulo, descricao, link, video_url, compra_url, arquivo_nome, arquivo_tipo, arquivo_tamanho, ordem
         FROM ped_conteudos WHERE secao = ? AND publicado = 1 ORDER BY COALESCE(categoria, ''), ordem, titulo`, secao)
    res.json({ itens })
  })

  r.get('/portal/conteudos/arquivo/:id', async (req, res) => {
    const m = await matriculaDaAluna(db, req.usuario!.pessoa_id!)
    const c = (await db.get('SELECT arquivo_chave AS chave, arquivo_nome AS nome, arquivo_tipo AS tipo FROM ped_conteudos WHERE id = ? AND publicado = 1 AND arquivo_chave IS NOT NULL', req.params.id)) as Linha | undefined
    if (!m || !c) throw new ErroHttp(404, 'Arquivo não encontrado.')
    await entregarAnexo(ctx.arquivos, res, c)
  })

  /* ---------------- Mural de oportunidades ---------------- */

  async function regrasMural() {
    return {
      publicacao: (await config(db, 'mural_publicacao', 'moderada')) as 'direta' | 'moderada' | 'somente_equipe',
      visibilidade: (await config(db, 'mural_visibilidade', 'ativas')) as 'ativas' | 'todas',
    }
  }

  r.get('/portal/mural', async (req, res) => {
    const regras = await regrasMural()
    const m = await matriculaDaAluna(db, req.usuario!.pessoa_id!)
    const podeVer = regras.visibilidade === 'todas' || m?.situacao === 'ativa'
    // Só o contato escolhido para a publicação é mostrado; nenhum outro dado da autora sai daqui.
    const publicadas = podeVer
      ? await db.all("SELECT id, autora_nome, categoria, titulo, descricao, contato_canal, contato_valor, criado_em FROM ped_mural WHERE situacao = 'publicada' ORDER BY criado_em DESC LIMIT 100")
      : []
    const minhas = await db.all('SELECT id, categoria, titulo, situacao, motivo_moderacao, criado_em FROM ped_mural WHERE autora_pessoa_id = ? ORDER BY criado_em DESC LIMIT 50', req.usuario!.pessoa_id)
    res.json({ pode_ver: podeVer, pode_publicar: regras.publicacao !== 'somente_equipe' && m?.situacao === 'ativa', moderada: regras.publicacao === 'moderada', publicadas, minhas })
  })

  r.post('/portal/mural', async (req, res) => {
    const regras = await regrasMural()
    const m = await matriculaDaAluna(db, req.usuario!.pessoa_id!)
    if (regras.publicacao === 'somente_equipe') throw new ErroHttp(403, 'Por enquanto, só a equipe publica no mural.')
    if (m?.situacao !== 'ativa') throw new ErroHttp(403, 'O mural é para alunas com matrícula ativa.')
    const d = validar(
      z.object({
        categoria: z.enum(CATEGORIAS_MURAL, { error: 'Escolha a categoria.' }),
        titulo: textoObrig('o título', 120),
        descricao: textoObrig('a descrição', 2000),
        contato_canal: z.enum(CANAIS_CONTATO, { error: 'Escolha como as pessoas falam com você.' }),
        contato_valor: textoObrig('o contato', 200),
      }),
      req.body,
    )
    const pendentes = ((await db.get("SELECT COUNT(*) AS n FROM ped_mural WHERE autora_pessoa_id = ? AND situacao = 'pendente'", req.usuario!.pessoa_id)) as { n: number }).n
    if (pendentes >= 5) throw new ErroHttp(429, 'Você já tem 5 publicações aguardando aprovação.')
    const pessoa = (await db.get('SELECT nome FROM ped_pessoas WHERE id = ?', req.usuario!.pessoa_id)) as { nome: string }
    const id = novoId()
    const situacao = regras.publicacao === 'direta' ? 'publicada' : 'pendente'
    await db.run('INSERT INTO ped_mural (id, autora_pessoa_id, autora_nome, categoria, titulo, descricao, contato_canal, contato_valor, situacao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)', id, req.usuario!.pessoa_id, pessoa.nome, d.categoria, d.titulo, d.descricao, d.contato_canal, d.contato_valor, situacao, agoraIso(), agoraIso())
    await auditar(db, req, { entidade: 'mural', entidade_id: id, acao: 'enviada_pela_aluna', pessoa_id: req.usuario!.pessoa_id, dados: { titulo: d.titulo, situacao } })
    res.status(201).json({ id, situacao })
  })

  r.post('/portal/mural/:id/arquivar', async (req, res) => {
    const p = await db.run("UPDATE ped_mural SET situacao = 'arquivada', atualizado_em = ? WHERE id = ? AND autora_pessoa_id = ? AND situacao IN ('pendente','publicada')", agoraIso(), req.params.id, req.usuario!.pessoa_id)
    if (!p.changes) throw new ErroHttp(404, 'Publicação não encontrada.')
    await auditar(db, req, { entidade: 'mural', entidade_id: req.params.id as string, acao: 'arquivada_pela_aluna', pessoa_id: req.usuario!.pessoa_id })
    res.json({ ok: true })
  })

  return r
}
