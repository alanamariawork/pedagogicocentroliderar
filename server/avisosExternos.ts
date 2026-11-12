/**
 * Avisos às alunas também por e-mail e WhatsApp.
 *
 * Todo aviso que entra no sino de uma aluna (notificarAluna e avisos programados) grava, junto,
 * uma linha por canal em `ped_envios_aviso`. O envio acontece depois, fora da gravação:
 *   - pelo agendamento de cada minuto (server/worker.ts), com novas tentativas espaçadas;
 *   - pela equipe, em "Enviar agora" / "Tentar novamente" (mesma linha, nunca duplica).
 * E-mail: pelo backoffice (o mesmo serviço do convite do portal), sempre para o e-mail de Clientes.
 * WhatsApp: API oficial da Meta com um modelo de mensagem aprovado (WHATSAPP_MODELO_AVISO).
 * Sem configuração nada é enviado nem simulado: a linha diz exatamente o que falta.
 */
import { agoraIso, novoId, type BD, type BDouTX } from './db'
import type { Instrucao } from './bd'
import type { ContextoApp } from './contexto'
import { telefoneWhatsapp } from './confirmacoes'
import { config } from './servicos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export const CANAIS_AVISO = ['email', 'whatsapp'] as const
export type CanalAviso = (typeof CANAIS_AVISO)[number]

/** Avisos mais antigos que isso não são enviados automaticamente (evita mandar aviso velho). */
const VALIDADE_HORAS = 48
/** Espera antes de cada nova tentativa automática (minutos), depois de uma falha. */
const ESPERAS_MIN = [5, 15, 60, 240]
const MAX_TENTATIVAS = ESPERAS_MIN.length + 1

/** Instruções que põem os dois canais na fila para um aviso (mesma transação/lote do aviso). */
export function instrucoesEnvio(notificacaoId: string, usuarioId: string, canais: readonly CanalAviso[] = CANAIS_AVISO): Instrucao[] {
  const agora = agoraIso()
  return canais.map((canal) => ({
    sql: `INSERT OR IGNORE INTO ped_envios_aviso (id, notificacao_id, pessoa_id, canal, situacao, tentativas, criado_em, atualizado_em)
          SELECT ?, ?, a.pessoa_id, ?, 'pendente', 0, ?, ? FROM ped_acessos_aluna a WHERE a.usuario_id = ? LIMIT 1`,
    params: [novoId(), notificacaoId, canal, agora, agora, usuarioId],
  }))
}

export async function enfileirarEnvios(db: BDouTX, notificacaoId: string, usuarioId: string, canais?: readonly CanalAviso[]) {
  for (const i of instrucoesEnvio(notificacaoId, usuarioId, canais)) await db.run(i.sql, ...i.params)
}

type Resultado = { situacao: 'enviado' | 'falhou' | 'nao_configurado' | 'desligado'; detalhe: string; id_externo?: string | null }

/** Texto aceito como parâmetro de modelo do WhatsApp (sem quebra de linha nem tabulação). */
const paramWhatsapp = (s: string, max = 400) => s.replace(/[\n\r\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max) || '-'

async function enviarWhatsapp(ctx: ContextoApp, e: Linha): Promise<Resultado> {
  const int = ctx.confirmacoes
  const c = int?.config
  const faltando: string[] = []
  if (!c?.whatsappToken) faltando.push('WHATSAPP_TOKEN')
  if (!c?.whatsappNumeroId) faltando.push('WHATSAPP_PHONE_NUMBER_ID')
  if (!c?.whatsappModeloAviso) faltando.push('WHATSAPP_MODELO_AVISO')
  if (!int || faltando.length) return { situacao: 'nao_configurado', detalhe: `WhatsApp não configurado: falta ${faltando.join(', ')} nos segredos do Worker.` }
  const para = telefoneWhatsapp(e.telefone)
  if (!para) return { situacao: 'nao_configurado', detalhe: 'A aluna não tem telefone válido em Clientes.' }
  const primeiroNome = String(e.nome ?? '').trim().split(/\s+/)[0] ?? ''
  const parametros = [paramWhatsapp(primeiroNome, 60), paramWhatsapp(e.titulo, 150), paramWhatsapp(e.detalhe || 'Veja os detalhes no portal.')]
  try {
    const r = await int.fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(c!.whatsappNumeroId!)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c!.whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: para,
        type: 'template',
        template: { name: c!.whatsappModeloAviso, language: { code: c!.whatsappIdioma ?? 'pt_BR' }, components: [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }] },
      }),
    })
    const corpo = (await r.json().catch(() => ({}))) as Linha
    if (!r.ok) return { situacao: 'falhou', detalhe: `WhatsApp recusou o envio (${r.status}): ${corpo?.error?.message ?? 'sem detalhe'}` }
    return { situacao: 'enviado', detalhe: 'Enviado por WhatsApp.', id_externo: corpo?.messages?.[0]?.id ?? null }
  } catch {
    return { situacao: 'falhou', detalhe: 'Não foi possível falar com o WhatsApp agora.' }
  }
}

/** Motivos do backoffice que só mudam com configuração ou cadastro: não adianta tentar de novo sozinho. */
const MOTIVOS_DE_CONFIGURACAO = new Set(['envio_desativado', 'configuracao_ausente', 'configuracao_invalida', 'destinatario_invalido', 'sem_email'])

async function enviarEmail(ctx: ContextoApp, e: Linha): Promise<Resultado> {
  try {
    const r = await ctx.clientes.enviarAvisoAluna(e.pessoa_id, { titulo: e.titulo, detalhe: e.detalhe ?? null, caminho: e.link ?? null, chave: e.id })
    if (r.enviado) return { situacao: 'enviado', detalhe: 'Enviado por e-mail.', id_externo: r.provedor_id ?? null }
    const texto = `E-mail não enviado: ${r.explicacao ?? r.motivo ?? 'motivo não informado'}${r.config ? ` (${r.config})` : ''}.`
    return { situacao: MOTIVOS_DE_CONFIGURACAO.has(String(r.motivo)) ? 'nao_configurado' : 'falhou', detalhe: texto }
  } catch {
    return { situacao: 'falhou', detalhe: 'O serviço de e-mail do backoffice não respondeu.' }
  }
}

/**
 * Envia o que está na fila. Sem `ids`: as linhas pendentes vencidas e recentes (agendamento).
 * Com `ids`: as linhas pedidas pela equipe, em qualquer situação menos "enviado".
 * Cada linha é reservada antes do envio (tentativas = valor lido), então dois processamentos
 * simultâneos nunca enviam a mesma mensagem duas vezes.
 */
export async function processarEnviosAvisos(db: BD, ctx: ContextoApp, opcoes: { ids?: string[] } = {}) {
  const agora = agoraIso()
  const limite = new Date(Date.now() - VALIDADE_HORAS * 3600_000).toISOString()
  const linhas = (
    opcoes.ids
      ? opcoes.ids.length
        ? await db.all(`SELECT * FROM ped_envios_aviso WHERE situacao <> 'enviado' AND id IN (${opcoes.ids.map(() => '?').join(',')})`, ...opcoes.ids)
        : []
      : await db.all("SELECT * FROM ped_envios_aviso WHERE situacao = 'pendente' AND criado_em >= ? AND (proxima_tentativa IS NULL OR proxima_tentativa <= ?) ORDER BY criado_em LIMIT 50", limite, agora)
  ) as Linha[]
  if (!linhas.length) return 0
  const ligado = { email: (await config(db, 'avisos_email', '1')) === '1', whatsapp: (await config(db, 'avisos_whatsapp', '1')) === '1' }
  let enviados = 0
  for (const l of linhas) {
    const reservada = await db.run("UPDATE ped_envios_aviso SET tentativas = tentativas + 1, situacao = 'pendente', proxima_tentativa = NULL, atualizado_em = ? WHERE id = ? AND tentativas = ? AND situacao <> 'enviado'", agoraIso(), l.id, l.tentativas)
    if (reservada.changes !== 1) continue
    const e = (await db.get(
      `SELECT ev.id, ev.pessoa_id, n.titulo, n.detalhe, n.link, p.nome, p.telefone
         FROM ped_envios_aviso ev JOIN ped_notificacoes n ON n.id = ev.notificacao_id JOIN ped_pessoas p ON p.id = ev.pessoa_id WHERE ev.id = ?`,
      l.id,
    )) as Linha
    const canal = l.canal as CanalAviso
    const r: Resultado = !ligado[canal]
      ? { situacao: 'desligado', detalhe: `Envio por ${canal === 'email' ? 'e-mail' : 'WhatsApp'} desligado em Configurações › Parâmetros.` }
      : canal === 'email'
        ? await enviarEmail(ctx, e)
        : await enviarWhatsapp(ctx, e)
    const tentativas = l.tentativas + 1
    // Falha temporária: volta para a fila com espera crescente; depois do limite, fica como falhou.
    const espera = r.situacao === 'falhou' && tentativas < MAX_TENTATIVAS ? ESPERAS_MIN[tentativas - 1] : null
    const situacao = espera ? 'pendente' : r.situacao
    const proxima = espera ? new Date(Date.now() + espera * 60_000).toISOString() : null
    await db.run(
      'UPDATE ped_envios_aviso SET situacao = ?, detalhe = ?, id_externo = COALESCE(?, id_externo), proxima_tentativa = ?, enviado_em = ?, atualizado_em = ? WHERE id = ?',
      situacao,
      espera ? `${r.detalhe} Nova tentativa automática em ${espera} min.` : r.detalhe,
      r.id_externo ?? null,
      proxima,
      r.situacao === 'enviado' ? agoraIso() : null,
      agoraIso(),
      l.id,
    )
    if (r.situacao === 'enviado') enviados++
  }
  return enviados
}
