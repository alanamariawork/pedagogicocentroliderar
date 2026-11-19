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
import { PERCENTUAL_ASSISTIDA } from '../../shared/linhaTempo'
import { corpoDoArquivo, entregarAnexo } from '../anexos'
import { categorias, comentar, comentarios, contagens, criarPublicacao, editarPublicacao, entregarImagem, feed, guardarImagem, lerFiltros, publicacaoCompleta, publicacoesDa, schemaComentario, schemaPublicacao, type Dona } from '../mural'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>


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
    const encontros = (await db.all(`SELECT o.id, o.item_id, o.numero, o.situacao, o.data_agendada, o.data_realizada, CASE WHEN o.situacao = 'agendada' THEN o.link_reuniao END AS link_reuniao, pr.nome AS profissional_nome
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
    const encontros = ((await db.all(`SELECT o.id, o.item_id, o.situacao, o.data_agendada, o.data_realizada, CASE WHEN o.situacao = 'agendada' THEN o.link_reuniao END AS link_reuniao, r.inicio, r.fim, COALESCE(t.nome, i.descricao) AS tipo, pr.nome AS profissional_nome
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
    // Livro indicado: só aparece se o livro estiver publicado e visível na Biblioteca (senão o botão levaria a nada).
    const acoes = await db.all(`SELECT a.id, a.titulo, a.descricao, a.prazo, a.andamento, a.publicada_em, a.ocorrencia_id,
           lv.id AS livro_id, lv.titulo AS livro_titulo,
           COALESCE(t.nome, i.descricao) AS encontro_tipo, o.data_realizada AS encontro_data, o.numero AS encontro_numero
         FROM ped_acoes a
         LEFT JOIN ped_conteudos lv ON lv.id = a.conteudo_id AND lv.secao = 'livros' AND lv.publicado = 1
           AND (lv.estante_id IS NULL OR EXISTS (SELECT 1 FROM ped_estantes e WHERE e.id = lv.estante_id AND e.publicada = 1))
         LEFT JOIN ped_ocorrencias o ON o.id = a.ocorrencia_id LEFT JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id
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

  // Biblioteca: material fora de estante, ou dentro de estante publicada. Estante retirada esconde tudo o que tem nela.
  const VISIVEL = '(c.estante_id IS NULL OR EXISTS (SELECT 1 FROM ped_estantes e WHERE e.id = c.estante_id AND e.publicada = 1))'

  // Editora Prosperar (loja online do backoffice, mesmo banco D1): produtos ligados a cada material
  // na aba Loja online › Biblioteca. A visão loja_vitrine_material é o contrato entre os dois
  // sistemas: só produto publicado, com preço e disponibilidade calculados pelo estoque da Loja.
  // Se a visão não existir (backoffice sem a migração 0018), a Biblioteca segue igual, sem botão.
  async function comProdutosEditora(bd: BD, itens: Linha[]): Promise<Linha[]> {
    if (!itens.length) return itens
    let vinculos: Linha[] = []
    try {
      const ids = itens.map((c) => c.id)
      vinculos = (await bd.all(
        `SELECT conteudo_id, ordem, rotulo, tipo, titulo, url_base, preco_a_partir_centavos, disponivel, pre_venda
           FROM loja_vitrine_material WHERE conteudo_id IN (${ids.map(() => '?').join(',')}) ORDER BY conteudo_id, ordem`, ...ids)) as Linha[]
    } catch {
      return itens
    }
    return itens.map((c) => {
      const editora = vinculos
        .filter((v) => v.conteudo_id === c.id && typeof v.url_base === 'string' && /^https?:\/\//.test(v.url_base))
        .map((v) => {
          const url = new URL(v.url_base)
          url.searchParams.set('origem', 'biblioteca')
          url.searchParams.set('material_id', String(c.id))
          return {
            // O botão da Biblioteca sempre diz "Adquirir um livro" (texto pedido pela equipe).
            rotulo: 'Adquirir um livro',
            titulo: v.titulo,
            tipo: v.tipo,
            url: url.toString(),
            preco_a_partir_centavos: v.preco_a_partir_centavos ?? null,
            // Coleção não tem estoque próprio (null); produto: disponível = saldo - reservas.
            situacao: v.tipo === 'colecao' ? 'disponivel' : Number(v.disponivel) > 0 ? 'disponivel' : v.pre_venda ? 'pre_venda' : 'esgotado',
          }
        })
      return editora.length ? { ...c, editora } : c
    })
  }

  r.get('/portal/conteudos/:secao', async (req, res) => {
    const secao = req.params.secao
    if (!['rotina', 'biblioteca', 'livros'].includes(secao as string)) throw new ErroHttp(404, 'Seção não encontrada.')
    // Vídeos e arquivos são para alunas com matrícula; sem matrícula a lista vem vazia.
    const pessoaId = req.usuario!.pessoa_id!
    const m = await matriculaDaAluna(db, pessoaId)
    if (!m) return res.json({ itens: [], estantes: [] })
    const itens = await db.all(`SELECT c.id, c.secao, c.estante_id, c.categoria, c.titulo, c.descricao, c.link, c.video_url, c.compra_url, c.arquivo_nome, c.arquivo_tipo, c.arquivo_tamanho, c.ordem,
           COALESCE(p.percentual, 0) AS percentual
         FROM ped_conteudos c LEFT JOIN ped_conteudos_progresso p ON p.conteudo_id = c.id AND p.pessoa_id = ?
         WHERE c.secao = ? AND c.publicado = 1 AND ${VISIVEL} ORDER BY COALESCE(c.categoria, ''), c.ordem, c.titulo`, pessoaId, secao)
    const estantes = secao === 'biblioteca' ? await db.all('SELECT id, titulo, descricao, ordem FROM ped_estantes WHERE publicada = 1 ORDER BY ordem, titulo') : []
    res.json({ itens: await comProdutosEditora(db, itens as Linha[]), estantes, percentual_assistida: PERCENTUAL_ASSISTIDA })
  })

  // O player do Vimeo informa o ponto alcançado; o servidor guarda o maior valor (voltar o vídeo não tira progresso).
  r.post('/portal/conteudos/:id/progresso', async (req, res) => {
    const pessoaId = req.usuario!.pessoa_id!
    const d = validar(z.object({ percentual: z.coerce.number().min(0).max(100) }), req.body)
    const m = await matriculaDaAluna(db, pessoaId)
    if (!m) throw new ErroHttp(404, 'Você ainda não tem uma matrícula ativa.')
    const c = (await db.get(`SELECT c.id FROM ped_conteudos c WHERE c.id = ? AND c.publicado = 1 AND c.video_url IS NOT NULL AND ${VISIVEL}`, req.params.id)) as Linha | undefined
    if (!c) throw new ErroHttp(404, 'Vídeo não encontrado.')
    const pct = Math.floor(d.percentual)
    await db.run(
      `INSERT INTO ped_conteudos_progresso (conteudo_id, pessoa_id, percentual, concluida_em, atualizado_em) VALUES (?,?,?,?,?)
       ON CONFLICT(conteudo_id, pessoa_id) DO UPDATE SET
         percentual = MAX(percentual, excluded.percentual),
         concluida_em = COALESCE(concluida_em, excluded.concluida_em),
         atualizado_em = excluded.atualizado_em`,
      c.id, pessoaId, pct, pct >= PERCENTUAL_ASSISTIDA ? agoraIso() : null, agoraIso(),
    )
    const atual = (await db.get('SELECT percentual FROM ped_conteudos_progresso WHERE conteudo_id = ? AND pessoa_id = ?', c.id, pessoaId)) as Linha
    res.json({ percentual: atual.percentual, assistida: atual.percentual >= PERCENTUAL_ASSISTIDA })
  })

  r.get('/portal/conteudos/arquivo/:id', async (req, res) => {
    const m = await matriculaDaAluna(db, req.usuario!.pessoa_id!)
    const c = (await db.get(`SELECT arquivo_chave AS chave, arquivo_nome AS nome, arquivo_tipo AS tipo FROM ped_conteudos c WHERE c.id = ? AND c.publicado = 1 AND c.arquivo_chave IS NOT NULL AND ${VISIVEL}`, req.params.id)) as Linha | undefined
    if (!m || !c) throw new ErroHttp(404, 'Arquivo não encontrado.')
    await entregarAnexo(ctx.arquivos, res, c)
  })

  /* ---------------- Mural de oportunidades (feed) ---------------- */

  async function regrasMural() {
    return {
      publicacao: (await config(db, 'mural_publicacao', 'moderada')) as 'direta' | 'moderada' | 'somente_equipe',
      visibilidade: (await config(db, 'mural_visibilidade', 'ativas')) as 'ativas' | 'todas',
    }
  }

  /** Quem vê o feed segue a regra de Configurações; curtir, comentar e publicar exigem matrícula ativa. */
  async function acessoMural(req: Request) {
    const regras = await regrasMural()
    const m = await matriculaDaAluna(db, req.usuario!.pessoa_id!)
    const ativa = m?.situacao === 'ativa'
    return { regras, podeVer: regras.visibilidade === 'todas' || ativa, podeInteragir: ativa, podePublicar: ativa && regras.publicacao !== 'somente_equipe' }
  }

  const dona = (req: Request): Dona => ({ pessoa_id: req.usuario!.pessoa_id! })
  const nomeDaAluna = async (req: Request) => ((await db.get('SELECT nome FROM ped_pessoas WHERE id = ?', req.usuario!.pessoa_id)) as { nome: string }).nome

  /** Publicação que a aluna pode abrir: publicada (se ela vê o mural) ou dela, em qualquer situação. */
  async function publicacaoVisivel(req: Request, id: string) {
    const a = await acessoMural(req)
    const p = await publicacaoCompleta(db, id)
    const minha = !!p && p.autora_pessoa_id === req.usuario!.pessoa_id
    if (!p || !(minha || (p.situacao === 'publicada' && a.podeVer))) throw new ErroHttp(404, 'Publicação não encontrada.')
    return { p, a, minha }
  }

  /** Só publicações publicadas recebem curtidas e comentários, e só de quem vê o mural com matrícula ativa. */
  async function publicacaoParaInteragir(req: Request, id: string) {
    const a = await acessoMural(req)
    if (!a.podeVer) throw new ErroHttp(404, 'Publicação não encontrada.')
    if (!a.podeInteragir) throw new ErroHttp(403, 'Curtidas e comentários são para alunas com matrícula ativa.')
    const p = (await db.get("SELECT id FROM ped_mural WHERE id = ? AND situacao = 'publicada'", id)) as Linha | undefined
    if (!p) throw new ErroHttp(404, 'Publicação não encontrada.')
    return p
  }

  r.get('/portal/mural', async (req, res) => {
    const a = await acessoMural(req)
    const f = lerFiltros(req.query)
    const publicadas = a.podeVer ? await feed(db, f, req.usuario!.pessoa_id!) : { itens: [], tem_mais: false }
    res.json({
      pode_ver: a.podeVer,
      pode_publicar: a.podePublicar,
      pode_interagir: a.podeInteragir,
      moderada: a.regras.publicacao === 'moderada',
      categorias: await categorias(db, true),
      publicadas: publicadas.itens,
      tem_mais: publicadas.tem_mais,
      minhas: await publicacoesDa(db, dona(req)),
    })
  })

  // Imagens: enviar (fica solta até salvar a publicação) e exibir.
  r.post('/portal/mural/imagens', corpoDoArquivo, async (req, res) => {
    const a = await acessoMural(req)
    if (!a.podePublicar) throw new ErroHttp(403, a.regras.publicacao === 'somente_equipe' ? 'Por enquanto, só a equipe publica no mural.' : 'O mural é para alunas com matrícula ativa.')
    res.status(201).json(await guardarImagem(db, ctx.arquivos, req, dona(req)))
  })

  r.get('/portal/mural/imagens/:id', async (req, res) => {
    const a = await acessoMural(req)
    const img = (await db.get(
      `SELECT i.chave, i.tipo FROM ped_mural_imagens i LEFT JOIN ped_mural mu ON mu.id = i.mural_id
       WHERE i.id = ? AND (i.dona_pessoa_id = ? OR mu.autora_pessoa_id = ? OR (? AND mu.situacao = 'publicada' AND i.papel IN ('capa','galeria','logo')))`,
      req.params.id, req.usuario!.pessoa_id, req.usuario!.pessoa_id, a.podeVer ? 1 : 0,
    )) as Linha | undefined
    if (!img) throw new ErroHttp(404, 'Imagem não encontrada.')
    await entregarImagem(ctx.arquivos, res, img)
  })

  r.get('/portal/mural/:id', async (req, res) => {
    const { p, a, minha } = await publicacaoVisivel(req, req.params.id as string)
    const c = await contagens(db, p.id, req.usuario!.pessoa_id!)
    const { autora_pessoa_id: _a, autora_equipe_id: _e, ...publica } = p
    res.json({
      publicacao: { ...publica, ...c, motivo_moderacao: minha ? p.motivo_moderacao : undefined },
      minha,
      pode_interagir: a.podeInteragir && p.situacao === 'publicada',
      pode_editar: minha && a.podePublicar && p.situacao !== 'arquivada',
      moderada: a.regras.publicacao === 'moderada',
      comentarios: p.situacao === 'publicada' ? await comentarios(db, p.id, { pessoaId: req.usuario!.pessoa_id! }) : [],
    })
  })

  r.post('/portal/mural', async (req, res) => {
    const a = await acessoMural(req)
    if (a.regras.publicacao === 'somente_equipe') throw new ErroHttp(403, 'Por enquanto, só a equipe publica no mural.')
    if (!a.podePublicar) throw new ErroHttp(403, 'O mural é para alunas com matrícula ativa.')
    const d = validar(schemaPublicacao, req.body)
    const pendentes = ((await db.get("SELECT COUNT(*) AS n FROM ped_mural WHERE autora_pessoa_id = ? AND situacao = 'pendente'", req.usuario!.pessoa_id)) as { n: number }).n
    if (pendentes >= 5) throw new ErroHttp(429, 'Você já tem 5 publicações aguardando aprovação.')
    const situacao = a.regras.publicacao === 'direta' ? 'publicada' : 'pendente'
    const id = await criarPublicacao(db, dona(req), await nomeDaAluna(req), d, situacao)
    await auditar(db, req, { entidade: 'mural', entidade_id: id, acao: 'enviada_pela_aluna', pessoa_id: req.usuario!.pessoa_id, dados: { titulo: d.titulo, situacao } })
    res.status(201).json({ id, situacao })
  })

  // Editar: só a autora (conferido aqui pela sessão). Com moderação, a edição volta para aprovação.
  r.put('/portal/mural/:id', async (req, res) => {
    const a = await acessoMural(req)
    const atual = (await db.get('SELECT * FROM ped_mural WHERE id = ?', req.params.id)) as Linha | undefined
    if (!atual || atual.autora_pessoa_id !== req.usuario!.pessoa_id) throw new ErroHttp(404, 'Publicação não encontrada.')
    if (atual.situacao === 'arquivada') throw new ErroHttp(409, 'Publicação arquivada não pode ser editada.')
    if (a.regras.publicacao === 'somente_equipe') throw new ErroHttp(403, 'Por enquanto, só a equipe publica no mural.')
    if (!a.podePublicar) throw new ErroHttp(403, 'O mural é para alunas com matrícula ativa.')
    const d = validar(schemaPublicacao, req.body)
    const situacao = atual.situacao === 'recusada' || (a.regras.publicacao === 'moderada' && atual.situacao === 'publicada') ? 'pendente' : atual.situacao
    await editarPublicacao(db, atual, dona(req), d, situacao)
    await auditar(db, req, { entidade: 'mural', entidade_id: atual.id, acao: 'editada_pela_aluna', pessoa_id: req.usuario!.pessoa_id, dados: { titulo: d.titulo, de: atual.situacao, para: situacao } })
    res.json({ id: atual.id, situacao })
  })

  r.post('/portal/mural/:id/arquivar', async (req, res) => {
    const p = await db.run("UPDATE ped_mural SET situacao = 'arquivada', atualizado_em = ? WHERE id = ? AND autora_pessoa_id = ? AND situacao IN ('pendente','publicada','recusada')", agoraIso(), req.params.id, req.usuario!.pessoa_id)
    if (!p.changes) throw new ErroHttp(404, 'Publicação não encontrada.')
    await auditar(db, req, { entidade: 'mural', entidade_id: req.params.id as string, acao: 'arquivada_pela_aluna', pessoa_id: req.usuario!.pessoa_id })
    res.json({ ok: true })
  })

  // Curtir ou desfazer: uma curtida por pessoa (chave primária); repetir não duplica.
  r.post('/portal/mural/:id/curtir', async (req, res) => {
    const p = await publicacaoParaInteragir(req, req.params.id as string)
    const d = validar(z.object({ curtir: z.boolean() }), req.body)
    if (d.curtir) await db.run('INSERT OR IGNORE INTO ped_mural_curtidas (mural_id, pessoa_id, criado_em) VALUES (?,?,?)', p.id, req.usuario!.pessoa_id, agoraIso())
    else await db.run('DELETE FROM ped_mural_curtidas WHERE mural_id = ? AND pessoa_id = ?', p.id, req.usuario!.pessoa_id)
    res.json(await contagens(db, p.id, req.usuario!.pessoa_id!))
  })

  r.post('/portal/mural/:id/comentarios', async (req, res) => {
    const p = await publicacaoParaInteragir(req, req.params.id as string)
    const d = validar(schemaComentario, req.body)
    const id = await comentar(db, p.id, req.usuario!.pessoa_id!, await nomeDaAluna(req), d)
    res.status(201).json({ id, ...(await contagens(db, p.id, req.usuario!.pessoa_id!)) })
  })

  /** Comentário da própria aluna, ainda ativo, numa publicação que ela ainda pode ver. */
  async function meuComentario(req: Request) {
    const c = (await db.get("SELECT co.id, co.mural_id, co.autora_pessoa_id FROM ped_mural_comentarios co JOIN ped_mural mu ON mu.id = co.mural_id WHERE co.id = ? AND co.situacao = 'ativo' AND mu.situacao = 'publicada'", req.params.id)) as Linha | undefined
    if (!c) throw new ErroHttp(404, 'Comentário não encontrado.')
    if (c.autora_pessoa_id !== req.usuario!.pessoa_id) throw new ErroHttp(403, 'Você só pode alterar os seus comentários.')
    await publicacaoParaInteragir(req, c.mural_id)
    return c
  }

  r.put('/portal/mural/comentarios/:id', async (req, res) => {
    const c = await meuComentario(req)
    const d = validar(z.object({ texto: textoObrig('o comentário', 1000) }), req.body)
    await db.run("UPDATE ped_mural_comentarios SET texto = ?, editado_em = ?, atualizado_em = ? WHERE id = ? AND autora_pessoa_id = ? AND situacao = 'ativo'", d.texto, agoraIso(), agoraIso(), c.id, req.usuario!.pessoa_id)
    res.json({ ok: true })
  })

  // Excluir o próprio comentário: some da conversa (o registro fica guardado, sem aparecer).
  r.delete('/portal/mural/comentarios/:id', async (req, res) => {
    const c = await meuComentario(req)
    await db.run("UPDATE ped_mural_comentarios SET situacao = 'excluido', atualizado_em = ? WHERE id = ? AND autora_pessoa_id = ? AND situacao = 'ativo'", agoraIso(), c.id, req.usuario!.pessoa_id)
    res.json(await contagens(db, c.mural_id, req.usuario!.pessoa_id!))
  })

  return r
}
