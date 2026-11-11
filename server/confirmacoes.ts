/**
 * Confirmação por WhatsApp e evento no Google Agenda de cada encontro agendado.
 *
 * Como funciona:
 *   1. Agendar, reagendar e desmarcar gravam, na MESMA transação da reserva, uma linha por canal em
 *      `ped_integracoes` (chave única: ocorrência + canal + ação + versão da reserva). Assim o
 *      agendamento nunca depende do envio, e repetir a tentativa nunca cria outra reserva.
 *   2. Depois da gravação, `processarIntegracoes` tenta enviar. O resultado de cada canal fica na
 *      linha: enviado, falhou (com o motivo), nao_configurado (dizendo exatamente o que falta) ou
 *      descartado (uma versão mais nova do agendamento tornou a linha sem efeito).
 *   3. A equipe vê "Agendado — confirmação pendente" e pode tentar de novo pela mesma linha.
 *
 * Mensagem e evento só saem com credenciais configuradas no Worker (segredos da Cloudflare); sem
 * elas nada é enviado nem simulado. O Google Agenda é sincronizado com o estado atual do encontro,
 * com um id de evento fixo por encontro: reagendar atualiza o mesmo evento, desmarcar o remove.
 */
import { agoraIso, novoId, type BD, type TX } from './db'
import { FUSO, formatarData } from '../shared/datas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export type Canal = 'whatsapp' | 'google_agenda'
export type AcaoIntegracao = 'confirmar' | 'atualizar' | 'cancelar'
export const CANAIS: Canal[] = ['whatsapp', 'google_agenda']

/** Configuração lida dos segredos do Worker. Nenhum valor fica no código. */
export interface ConfigIntegracoes {
  whatsappToken?: string
  whatsappNumeroId?: string
  /** Nomes dos modelos de mensagem aprovados na Meta, um por ação. */
  whatsappModelos?: Partial<Record<AcaoIntegracao, string>>
  whatsappIdioma?: string
  googleEmailConta?: string
  googleChavePrivada?: string
  /** '1': a conta de serviço age em nome da mentora (delegação do Google Workspace). */
  googleAgirComoMentora?: boolean
}

export interface Integracoes {
  config: ConfigIntegracoes
  fetch: typeof fetch
}

export function configDoAmbiente(env: Record<string, unknown>): ConfigIntegracoes {
  const s = (k: string) => (typeof env[k] === 'string' && (env[k] as string).trim() ? (env[k] as string).trim() : undefined)
  return {
    whatsappToken: s('WHATSAPP_TOKEN'),
    whatsappNumeroId: s('WHATSAPP_PHONE_NUMBER_ID'),
    whatsappModelos: { confirmar: s('WHATSAPP_MODELO_CONFIRMAR'), atualizar: s('WHATSAPP_MODELO_ATUALIZAR'), cancelar: s('WHATSAPP_MODELO_CANCELAR') },
    whatsappIdioma: s('WHATSAPP_IDIOMA') ?? 'pt_BR',
    googleEmailConta: s('GOOGLE_CLIENT_EMAIL'),
    googleChavePrivada: s('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
    googleAgirComoMentora: s('GOOGLE_AGIR_COMO_MENTORA') === '1',
  }
}

/* ---------------- Fila (dentro da transação do agendamento) ---------------- */

/** Registra o que precisa ser enviado. `referencia` é a reserva (versão do agendamento). */
export function enfileirar(tx: TX, ocorrenciaId: string, acao: AcaoIntegracao, referencia: string) {
  const agora = agoraIso()
  for (const canal of CANAIS) {
    tx.run('INSERT OR IGNORE INTO ped_integracoes (id, ocorrencia_id, canal, acao, referencia, situacao, tentativas, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,0,?,?)', novoId(), ocorrenciaId, canal, acao, referencia, 'pendente', agora, agora)
  }
}

/* ---------------- Envio ---------------- */

type Resultado = { situacao: 'enviado' | 'falhou' | 'nao_configurado' | 'descartado'; detalhe: string; id_externo?: string | null }

async function dadosDoEncontro(db: BD, ocorrenciaId: string) {
  return (await db.get(
    `SELECT o.id, o.situacao, o.data_agendada, o.duracao_min, o.matricula_id,
            (SELECT r.id FROM ped_reservas r WHERE r.ocorrencia_id = o.id AND r.ativa = 1) AS reserva_ativa,
            (SELECT r.fim FROM ped_reservas r WHERE r.ocorrencia_id = o.id AND r.ativa = 1) AS fim,
            COALESCE(t.nome, i.descricao) AS encontro, pe.nome AS aluna_nome, pe.telefone AS aluna_telefone,
            pr.nome AS profissional_nome, COALESCE(NULLIF(TRIM(pr.email), ''), u.email) AS profissional_email
       FROM ped_ocorrencias o JOIN ped_itens_contratados i ON i.id = o.item_id LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id
       JOIN ped_matriculas m ON m.id = o.matricula_id JOIN ped_pessoas pe ON pe.id = m.pessoa_id
       LEFT JOIN ped_profissionais pr ON pr.id = COALESCE(o.profissional_id, i.profissional_id)
       LEFT JOIN ped_usuarios u ON u.id = pr.usuario_id
      WHERE o.id = ?`,
    ocorrenciaId,
  )) as Linha | undefined
}

/** Telefone no formato internacional, só dígitos (Brasil por padrão). */
export function telefoneWhatsapp(t: string | null | undefined): string | null {
  const d = (t ?? '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return `55${d}`
  if (d.length >= 12 && d.length <= 15) return d
  return null
}

async function enviarWhatsapp(int: Integracoes, linha: Linha, e: Linha): Promise<Resultado> {
  const c = int.config
  const acao = linha.acao as AcaoIntegracao
  const faltando: string[] = []
  if (!c.whatsappToken) faltando.push('WHATSAPP_TOKEN')
  if (!c.whatsappNumeroId) faltando.push('WHATSAPP_PHONE_NUMBER_ID')
  const modelo = c.whatsappModelos?.[acao]
  if (!modelo) faltando.push(`WHATSAPP_MODELO_${acao.toUpperCase()}`)
  if (faltando.length) return { situacao: 'nao_configurado', detalhe: `WhatsApp não configurado: falta ${faltando.join(', ')} nos segredos do Worker.` }
  const para = telefoneWhatsapp(e.aluna_telefone)
  if (!para) return { situacao: 'nao_configurado', detalhe: 'A aluna não tem telefone válido em Clientes para receber a confirmação.' }

  const quando = e.data_agendada ? `${formatarData(String(e.data_agendada).slice(0, 10))} às ${String(e.data_agendada).slice(11, 16)}` : ''
  const parametros = acao === 'cancelar' ? [e.aluna_nome, e.encontro] : [e.aluna_nome, e.encontro, quando, e.profissional_nome ?? 'a equipe']
  const r = await int.fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(c.whatsappNumeroId!)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.whatsappToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'template',
      template: { name: modelo, language: { code: c.whatsappIdioma ?? 'pt_BR' }, components: [{ type: 'body', parameters: parametros.map((p) => ({ type: 'text', text: String(p ?? '') })) }] },
    }),
  })
  const corpo = (await r.json().catch(() => ({}))) as Linha
  if (!r.ok) return { situacao: 'falhou', detalhe: `WhatsApp recusou o envio (${r.status}): ${corpo?.error?.message ?? 'sem detalhe'}` }
  return { situacao: 'enviado', detalhe: 'Confirmação enviada por WhatsApp.', id_externo: corpo?.messages?.[0]?.id ?? null }
}

/* Google: token da conta de serviço (JWT RS256 assinado no Worker). */

const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const x of bytes) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function tokenGoogle(int: Integracoes, agirComo: string | null): Promise<string> {
  const c = int.config
  const pem = c.googleChavePrivada!.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (ch) => ch.charCodeAt(0))
  const chave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const carga = b64url(JSON.stringify({ iss: c.googleEmailConta, scope: 'https://www.googleapis.com/auth/calendar.events', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600, ...(agirComo ? { sub: agirComo } : {}) }))
  const assinatura = b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${cabecalho}.${carga}`)))
  const r = await int.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecalho}.${carga}.${assinatura}` }).toString(),
  })
  const corpo = (await r.json().catch(() => ({}))) as Linha
  if (!r.ok || !corpo.access_token) throw new Error(`O Google recusou a autorização (${r.status}): ${corpo.error_description ?? corpo.error ?? 'sem detalhe'}`)
  return corpo.access_token as string
}

/** Id fixo do evento de um encontro (o Google aceita letras a–v e dígitos). */
export const idEventoGoogle = (ocorrenciaId: string) => `cl${ocorrenciaId.replace(/-/g, '').toLowerCase()}`

async function sincronizarGoogle(int: Integracoes, e: Linha): Promise<Resultado> {
  const c = int.config
  const faltando: string[] = []
  if (!c.googleEmailConta) faltando.push('GOOGLE_CLIENT_EMAIL')
  if (!c.googleChavePrivada) faltando.push('GOOGLE_PRIVATE_KEY')
  if (faltando.length) return { situacao: 'nao_configurado', detalhe: `Google Agenda não configurado: falta ${faltando.join(', ')} nos segredos do Worker.` }
  const email = e.profissional_email as string | null
  if (!email) return { situacao: 'nao_configurado', detalhe: 'A mentora não tem e-mail profissional cadastrado (Configurações › Profissionais) nem conta da equipe vinculada.' }

  try {
    const token = await tokenGoogle(int, c.googleAgirComoMentora ? email : null)
    const agenda = c.googleAgirComoMentora ? 'primary' : email
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(agenda)}/events`
    const idEvento = idEventoGoogle(e.id)
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    if (e.situacao !== 'agendada' || !e.data_agendada) {
      const r = await int.fetch(`${base}/${idEvento}?sendUpdates=none`, { method: 'DELETE', headers: auth })
      if (r.ok || r.status === 404 || r.status === 410) return { situacao: 'enviado', detalhe: 'Evento removido do Google Agenda da mentora.', id_externo: idEvento }
      return { situacao: 'falhou', detalhe: `O Google Agenda recusou a remoção (${r.status}).` }
    }
    // Só o essencial: o evento fica na agenda da mentora, sem dados pessoais além do nome da aluna.
    const evento = {
      id: idEvento,
      status: 'confirmed',
      summary: `${e.encontro} · ${e.aluna_nome}`,
      description: 'Encontro agendado pelo sistema pedagógico Diamante Business.',
      start: { dateTime: `${e.data_agendada}:00`, timeZone: FUSO },
      end: { dateTime: `${e.fim ?? e.data_agendada}:00`, timeZone: FUSO },
    }
    let r = await int.fetch(`${base}?sendUpdates=none`, { method: 'POST', headers: auth, body: JSON.stringify(evento) })
    if (r.status === 409) r = await int.fetch(`${base}/${idEvento}?sendUpdates=none`, { method: 'PUT', headers: auth, body: JSON.stringify(evento) })
    if (!r.ok) {
      const corpo = (await r.json().catch(() => ({}))) as Linha
      return { situacao: 'falhou', detalhe: `O Google Agenda recusou o evento (${r.status}): ${corpo?.error?.message ?? 'sem detalhe'}` }
    }
    return { situacao: 'enviado', detalhe: 'Evento no Google Agenda da mentora atualizado.', id_externo: idEvento }
  } catch (err) {
    return { situacao: 'falhou', detalhe: (err as Error)?.message ?? 'Falha ao falar com o Google Agenda.' }
  }
}

/**
 * Tenta enviar o que está pendente de um encontro. Cada linha é "reservada" antes de enviar
 * (tentativas = tentativas + 1 só se ninguém mexeu nela), então dois cliques ao mesmo tempo não
 * mandam a mensagem duas vezes. Linhas já enviadas nunca são reenviadas.
 */
export async function processarIntegracoes(db: BD, int: Integracoes | undefined, ocorrenciaId: string) {
  const linhas = (await db.all("SELECT * FROM ped_integracoes WHERE ocorrencia_id = ? AND situacao IN ('pendente','falhou','nao_configurado') ORDER BY criado_em, acao", ocorrenciaId)) as Linha[]
  if (!linhas.length) return
  const e = await dadosDoEncontro(db, ocorrenciaId)
  if (!e) return
  const ultimaGoogle = (await db.get("SELECT id FROM ped_integracoes WHERE ocorrencia_id = ? AND canal = 'google_agenda' ORDER BY criado_em DESC, rowid DESC LIMIT 1", ocorrenciaId)) as Linha | undefined

  for (const l of linhas) {
    let res: Resultado
    // Uma versão mais nova do agendamento torna esta linha sem efeito (não manda confirmação antiga).
    const obsoleta =
      l.canal === 'google_agenda'
        ? l.id !== ultimaGoogle?.id
        : l.acao === 'cancelar'
          ? e.situacao === 'agendada'
          : l.referencia !== e.reserva_ativa
    if (obsoleta) {
      await db.run("UPDATE ped_integracoes SET situacao = 'descartado', detalhe = ?, atualizado_em = ? WHERE id = ? AND situacao <> 'enviado'", 'Substituída por uma alteração mais nova do agendamento.', agoraIso(), l.id)
      continue
    }
    const reservou = await db.run("UPDATE ped_integracoes SET tentativas = tentativas + 1, atualizado_em = ? WHERE id = ? AND tentativas = ? AND situacao <> 'enviado'", agoraIso(), l.id, l.tentativas)
    if (!reservou.changes) continue
    // Sem configuração nenhuma, cada canal informa exatamente quais segredos faltam (nada é chamado).
    const efetivo: Integracoes = int ?? { config: {}, fetch: () => Promise.reject(new Error('Integrações não configuradas.')) }
    try {
      res = l.canal === 'whatsapp' ? await enviarWhatsapp(efetivo, l, e) : await sincronizarGoogle(efetivo, e)
    } catch (err) {
      res = { situacao: 'falhou', detalhe: (err as Error)?.message ?? 'Falha inesperada no envio.' }
    }
    await db.run('UPDATE ped_integracoes SET situacao = ?, detalhe = ?, id_externo = COALESCE(?, id_externo), atualizado_em = ? WHERE id = ?', res.situacao, res.detalhe, res.id_externo ?? null, agoraIso(), l.id)
  }
}

/** Situação para a equipe: a última linha de cada canal. */
export async function situacaoIntegracoes(db: BD, ocorrenciaId: string) {
  const linhas = (await db.all('SELECT * FROM ped_integracoes WHERE ocorrencia_id = ? ORDER BY criado_em DESC, rowid DESC', ocorrenciaId)) as Linha[]
  const ultima = (canal: Canal) => linhas.find((l) => l.canal === canal && l.situacao !== 'descartado') ?? null
  const canais = { whatsapp: ultima('whatsapp'), google_agenda: ultima('google_agenda') }
  const pendente = Object.values(canais).some((l) => l && l.situacao !== 'enviado')
  return { pendente, canais, historico: linhas }
}
