/**
 * Agenda dos encontros contratados: reservar, mover e liberar horários, saldo por item e horários
 * livres. A mesma regra serve à equipe (rotas de operação) e à aluna (portal).
 *
 * Concorrência: a reserva é gravada num lote e os gatilhos do banco barram, no momento da gravação,
 * (1) dois encontros no mesmo horário da mesma profissional e (2) duas reservas ativas para a mesma
 * ocorrência. Como cada ocorrência é um encontro contratado, a segunda trava também impede usar o
 * último encontro disponível em dois horários ao mesmo tempo.
 */
import { z } from 'zod'
import { agoraIso, novoId, type BD, type BDouTX, type TX } from './db'
import { ErroHttp } from './auth'
import type { Req } from './http'
import { id, horarioObrig, minutos, texto } from './servicos'
import { contido, horariosLivres, type Intervalo } from '../shared/calculos'
import { somarMinutos } from '../shared/datas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export const esquemaAgenda = z.object({
  inicio: horarioObrig('o horário'),
  duracao_min: minutos().optional(),
  profissional_id: id(),
  fora_disponibilidade: z.boolean().default(false),
  motivo: texto(500),
})
export type DadosAgenda = z.infer<typeof esquemaAgenda>

/** Situações em que o encontro contratado ainda pode ser agendado. */
export const SITUACOES_A_AGENDAR = ['prevista', 'aguardando_agenda', 'disponivel_agendar'] as const

/**
 * Reserva o horário e marca a ocorrência como agendada (dentro de uma transação). Devolve o id da
 * reserva, que identifica esta versão do agendamento (usada pelas integrações).
 */
export async function reservar(db: BD, tx: TX, req: Req, o: Linha, d: DadosAgenda): Promise<string> {
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
  const reservaId = novoId()
  // Conflitos de horário são barrados pelos gatilhos do banco no momento da gravação (ver comConflitoDeHorario).
  tx.run('INSERT INTO ped_reservas (id, profissional_id, ocorrencia_id, inicio, fim, ativa, fora_disponibilidade, criado_em, autor_id) VALUES (?,?,?,?,?,1,?,?,?)', reservaId, profissional, o.id, intervalo.inicio, intervalo.fim, d.fora_disponibilidade ? 1 : 0, agoraIso(), req.usuario!.id)
  tx.run("UPDATE ped_ocorrencias SET situacao='agendada', data_agendada=?, profissional_id=?, duracao_min=?, atualizado_em=? WHERE id=?", intervalo.inicio, profissional, duracao, agoraIso(), o.id)
  // Contatos e impedimentos ativos deixam de bloquear quando o encontro é agendado.
  tx.run('UPDATE ped_impedimentos SET ativo = 0, resolvido_em = ?, resolucao = ? WHERE ocorrencia_id = ? AND ativo = 1', agoraIso(), 'Encontro agendado', o.id)
  return reservaId
}

export function liberarReserva(tx: TX, o: Linha, motivo: string) {
  if (!o.reserva_id) return
  tx.run('UPDATE ped_reservas SET ativa = 0, liberada_em = ?, liberada_motivo = ? WHERE id = ?', agoraIso(), motivo, o.reserva_id)
}

/** Traduz os erros dos gatilhos de reserva (que só aparecem quando o lote é gravado). */
export async function comConflitoDeHorario<T>(p: Promise<T>, mensagens: { horario?: string; ocorrencia?: string } = {}): Promise<T> {
  try {
    return await p
  } catch (e) {
    const msg = (e as Error)?.message ?? ''
    if (msg.includes('conflito_horario')) throw new ErroHttp(409, mensagens.horario ?? 'Este horário já está reservado para outro encontro desta profissional. Escolha outro horário.')
    if (msg.includes('ocorrencia_ja_reservada')) throw new ErroHttp(409, mensagens.ocorrencia ?? 'Esta entrega já tem um horário reservado. Use "Reagendar".')
    throw e
  }
}

/**
 * Saldo de cada item contratado da matrícula: contratada (quantidade + ajustes, bônus e
 * personalizações são itens próprios), realizadas, agendadas e disponíveis para reservar.
 */
export async function saldoItens(db: BDouTX, matriculaId: string) {
  return (await db.all(`SELECT i.id, i.descricao, i.origem, i.tipo_id, t.nome AS tipo_nome, i.duracao_min, COALESCE(i.duracao_min, t.duracao_padrao_min) AS duracao_efetiva,
         i.profissional_id, pr.nome AS profissional_nome,
         i.quantidade + COALESCE((SELECT SUM(a.delta) FROM ped_ajustes_obrigacao a WHERE a.item_id = i.id), 0) AS contratada,
         (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.item_id = i.id AND o.situacao = 'realizada') AS realizadas,
         (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.item_id = i.id AND o.situacao = 'agendada') AS agendadas,
         (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.item_id = i.id AND o.situacao IN ('prevista','aguardando_agenda','disponivel_agendar')) AS disponiveis
       FROM ped_itens_contratados i LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id LEFT JOIN ped_profissionais pr ON pr.id = i.profissional_id
       WHERE i.matricula_id = ? ORDER BY COALESCE(t.nome, i.descricao), i.origem, i.criado_em`, matriculaId)) as Linha[]
}

/** Horários livres da profissional para um item, de `aPartirDe` até `ate` (AAAA-MM-DDTHH:MM). */
export async function horariosDoItem(db: BDouTX, item: Linha, aPartirDe: string, ate: string): Promise<Intervalo[]> {
  if (!item.profissional_id || !item.duracao_efetiva) return []
  const disp = (await db.all('SELECT inicio, fim FROM ped_disponibilidades WHERE profissional_id = ? AND fim > ? AND inicio < ? ORDER BY inicio', item.profissional_id, aPartirDe, ate)) as Intervalo[]
  const reservas = (await db.all('SELECT inicio, fim FROM ped_reservas WHERE profissional_id = ? AND ativa = 1 AND fim > ? AND inicio < ?', item.profissional_id, aPartirDe, ate)) as Intervalo[]
  return horariosLivres(disp, reservas, item.duracao_efetiva as number, aPartirDe, ate)
}
