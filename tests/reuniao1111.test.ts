import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, type Ambiente, type Cliente } from './apoio/ambiente'
import { agoraSP, hojeSP, somarDias } from '../shared/datas'
import { situacaoVigencia } from '../shared/vigencia'
import { corDoPilar } from '../shared/pilares'
import { extrairContrato } from '../shared/contrato'
import { embedVimeo, sugerirAcoes } from '../server/rotas/acompanhamento'
import { processarIntegracoes, type ConfigIntegracoes } from '../server/confirmacoes'

/*
 * Ajustes da reunião de 11/11/2026: Início do portal (resumo, avisos, 45 dias), saldo e reserva de
 * mentorias pelo portal, concorrência, confirmação WhatsApp/Google Agenda (com envio falso, nada sai
 * daqui), etapa individual por matrícula, Plano de Ação e transcrição, contrato, vitórias, mural.
 * Todos os dados são fictícios.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
const c: Record<string, Cliente> = {}
const u: Record<string, string> = {}
const h = hojeSP()
const contar = async (sql: string, ...p: unknown[]) => (await amb.db.get<{ n: number }>(sql, ...p))!.n

/* Envio falso: registra as chamadas e responde como os provedores. Nenhuma mensagem real é enviada. */
const chamadas: { url: string; metodo: string; corpo: string }[] = []
let falharWhatsapp = 0
const eventosGoogle: Record<string, J> = {}
let googleSemMeet = false
const config: ConfigIntegracoes = { whatsappToken: 'token-ficticio', whatsappNumeroId: '000000', whatsappModelos: { confirmar: 'confirmacao_ficticia', atualizar: 'remarcacao_ficticia', cancelar: 'cancelamento_ficticio' }, whatsappIdioma: 'pt_BR', googleEmailConta: 'conta@ficticia.iam.gserviceaccount.com' }
const fetchFalso: typeof fetch = async (entrada, init) => {
  const url = String(entrada)
  chamadas.push({ url, metodo: init?.method ?? 'GET', corpo: String(init?.body ?? '') })
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })
  if (url.startsWith('https://graph.facebook.com/')) {
    if (falharWhatsapp > 0) {
      falharWhatsapp--
      return json({ error: { message: 'erro temporário (teste)' } }, 500)
    }
    return json({ messages: [{ id: `wamid.${chamadas.length}` }] })
  }
  if (url === 'https://oauth2.googleapis.com/token') return json({ access_token: 'token-google-ficticio' })
  if (url.startsWith('https://www.googleapis.com/calendar/')) {
    // Agenda falsa: guarda os eventos por id e cria um Meet quando pedido (ou recusa, como uma agenda sem Meet).
    const id = new URL(url).pathname.split('/events/')[1]
    const corpo = init?.body ? JSON.parse(String(init.body)) : {}
    const comMeet = (ev: J) => {
      if (!corpo.conferenceData?.createRequest || ev.hangoutLink) return ev
      return { ...ev, hangoutLink: `https://meet.google.com/fic-${Object.keys(eventosGoogle).length}-xyz`, conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'x' }] } }
    }
    if (corpo.conferenceData && googleSemMeet) return json({ error: { message: 'Invalid conference type value.' } }, 400)
    const metodo = init?.method ?? 'GET'
    if (metodo === 'DELETE') {
      delete eventosGoogle[id!]
      return new Response(null, { status: 204 })
    }
    if (metodo === 'POST') {
      if (eventosGoogle[corpo.id]) return json({ error: { message: 'duplicate' } }, 409)
      eventosGoogle[corpo.id] = comMeet({ ...corpo, conferenceData: undefined })
      return json(eventosGoogle[corpo.id])
    }
    if (!eventosGoogle[id!]) return json({}, 404)
    if (metodo === 'PATCH') eventosGoogle[id!] = comMeet({ ...eventosGoogle[id!], ...corpo, conferenceData: eventosGoogle[id!].conferenceData })
    return json(eventosGoogle[id!])
  }
  return json({}, 404)
}

async function chavePrivadaFicticia() {
  const par = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', par.privateKey)) as ArrayBuffer)
  let s = ''
  for (const b of der) s += String.fromCharCode(b)
  return `-----BEGIN PRIVATE KEY-----\n${btoa(s)}\n-----END PRIVATE KEY-----\n`
}

/** Próximo dia útil a partir de `n` dias à frente. */
function diaAFrente(n: number, de = h) {
  let d = somarDias(de, n)
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = somarDias(d, 1)
  return d
}
const D1 = diaAFrente(3)
const D2 = diaAFrente(1, D1)

async function novaAluna(nome: string, email: string, itens: J[], extra: J = {}) {
  const r = await c.coord.post('/pessoas', { nome, email, telefone: '(11) 97777-0000', matricula: { data_inicio: somarDias(h, -30), data_fim: somarDias(h, 120), itens_extras: itens, ...extra } })
  const ficha = await c.coord.get(`/pessoas/${r.id}`)
  const usuario = await amb.criarAcessoPortal(email, r.id)
  return { pessoa: r.id as string, matricula: ficha.matriculas[0].id as string, cliente: await amb.entrar(usuario, 'portal'), ficha }
}

let jaciara: Awaited<ReturnType<typeof novaAluna>>
let bia: Awaited<ReturnType<typeof novaAluna>>
let tipoId = ''
let profId = ''

beforeAll(async () => {
  config.googleChavePrivada = await chavePrivadaFicticia()
  amb = await abrirAmbiente({ confirmacoes: { config, fetch: fetchFalso } })
  u.admin = await amb.criarEquipe('admin@ficticio.local', 'Admin Fictícia', { perfil: 'admin' })
  c.admin = await amb.entrar(u.admin)
  u.coord = await amb.criarEquipe('coord@ficticio.local', 'Coordenação Fictícia', { perfil: 'coordenacao' })
  u.suporte = await amb.criarEquipe('suporte@ficticio.local', 'Suporte Fictício', { perfil: 'suporte' })
  u.mentora = await amb.criarEquipe('mentora@ficticio.local', 'Mentora Fictícia', { perfil: 'mentora' })
  for (const k of ['coord', 'suporte', 'mentora']) c[k] = await amb.entrar(u[k])

  tipoId = (await c.coord.post('/catalogos/tipos-entregavel', { nome: 'Mentoria Individual', duracao_padrao_min: 60, individual: true })).id
  // E-mail profissional em branco: a agenda usa o e-mail da conta da equipe vinculada.
  profId = (await c.coord.post('/catalogos/profissionais', { nome: 'Mentora Fictícia', especialidade: 'Vendas', email: '' })).id
  await c.admin.put(`/usuarios/${u.mentora}`, { perfil: 'mentora', profissional_id: profId })
  c.mentora = await amb.entrar(u.mentora)

  // Disponibilidade: 09:00–12:00 em dois dias (3 horários de 60 min por dia).
  await c.coord.post('/disponibilidades', { profissional_id: profId, intervalos: [{ inicio: `${D1}T09:00`, fim: `${D1}T12:00` }, { inicio: `${D2}T09:00`, fim: `${D2}T12:00` }] })

  // Jaciara: 2 do pacote + 1 bônus do mesmo tipo = 3 contratadas.
  jaciara = await novaAluna('Jaciara Fictícia', 'jaciara@ficticio.local', [
    { tipo_id: tipoId, descricao: 'Mentoria Individual', quantidade: 2, profissional_id: profId, origem: 'pacote' },
    { tipo_id: tipoId, descricao: 'Mentoria Individual (bônus)', quantidade: 1, profissional_id: profId, origem: 'bonus' },
  ])
  bia = await novaAluna('Bia Fictícia', 'bia@ficticio.local', [{ tipo_id: tipoId, descricao: 'Mentoria Individual', quantidade: 1, profissional_id: profId, origem: 'pacote' }])
}, 240_000)

afterAll(async () => {
  await amb?.fechar()
})

const tipoDe = (m: J) => m.tipos.find((t: J) => t.tipo_id === tipoId)

describe('Vigência: 45 dias (portal e equipe)', () => {
  it('46 dias não destaca, 45 destaca (inclusive), sem data mostra "Sem prazo definido"', () => {
    expect(situacaoVigencia(somarDias(h, 46), h).destacar).toBe(false)
    expect(situacaoVigencia(somarDias(h, 45), h)).toMatchObject({ destacar: true, dias_restantes: 45, texto: 'Faltam 45 dias' })
    expect(situacaoVigencia(h, h)).toMatchObject({ destacar: true, texto: 'Termina hoje' })
    expect(situacaoVigencia(somarDias(h, -1), h).destacar).toBe(false)
    expect(situacaoVigencia(null, h)).toMatchObject({ destacar: false, texto: 'Sem prazo definido' })
  })

  it('o Início do portal e a Visão geral da equipe usam a mesma janela de 45 dias', async () => {
    const m = jaciara.matricula
    const dados = (await c.coord.get(`/pessoas/${jaciara.pessoa}`)).matriculas[0]
    const mudar = (fim: string | null) => c.coord.put(`/matriculas/${m}/dados`, { data_inicio: dados.data_inicio, data_fim: fim, motivo_alteracao_vigencia: 'teste da janela' })
    await mudar(somarDias(h, 46))
    expect((await jaciara.cliente.get('/portal/inicio')).resumo.vigencia).toMatchObject({ destacar: false, dias_restantes: 46, janela_dias: 45 })
    expect((await c.coord.get('/visao-geral')).proximas_termino.some((x: J) => x.id === m)).toBe(false)
    await mudar(somarDias(h, 45))
    expect((await jaciara.cliente.get('/portal/inicio')).resumo.vigencia).toMatchObject({ destacar: true, dias_restantes: 45 })
    expect((await c.coord.get('/visao-geral')).proximas_termino.some((x: J) => x.id === m)).toBe(true)
    await mudar(null)
    expect((await jaciara.cliente.get('/portal/inicio')).resumo.vigencia).toMatchObject({ data_fim: null, texto: 'Sem prazo definido' })
    await mudar(somarDias(h, 120))
  })

  it('renovação futura não toma o lugar do ciclo vigente; quando começa, o portal passa a usar o novo ciclo', async () => {
    const r = await novaAluna('Renata Fictícia', 'renata@ficticio.local', [])
    const futura = await c.coord.post('/matriculas', { pessoa_id: r.pessoa, matricula_anterior_id: r.matricula, data_inicio: somarDias(h, 10), data_fim: somarDias(h, 400), itens_extras: [] })
    let ini = await r.cliente.get('/portal/inicio')
    expect(ini.matricula.id).toBe(r.matricula)
    expect(ini.resumo.vigencia.data_fim).toBe(somarDias(h, 120))
    // O novo ciclo começou (a vigência da renovação é a que vale).
    await amb.db.run('UPDATE ped_matriculas SET data_inicio = ? WHERE id = ?', somarDias(h, -1), futura.id)
    ini = await r.cliente.get('/portal/inicio')
    expect(ini.matricula.id).toBe(futura.id)
    expect(ini.resumo.vigencia.data_fim).toBe(somarDias(h, 400))
  })
})

describe('Início do portal: resumo e avisos', () => {
  it('o resumo traz só os campos da aluna, sem notas internas nem dados de outra aluna', async () => {
    await amb.db.run("UPDATE ped_alunas SET observacoes_internas = 'NOTA INTERNA SECRETA' WHERE id = ?", jaciara.pessoa).catch(() => undefined)
    await c.coord.post(`/matriculas/${jaciara.matricula}/anotacoes`, { texto: 'ANOTACAO PEDAGOGICA PRIVADA' }).catch(() => undefined)
    const ini = await jaciara.cliente.get('/portal/inicio')
    expect(Object.keys(ini.resumo).sort()).toEqual(['etapa_atual', 'mentorias', 'programa', 'proximo_encontro', 'proximo_passo', 'vigencia'])
    const texto = JSON.stringify(ini)
    expect(texto).not.toContain('SECRETA')
    expect(texto).not.toContain('PRIVADA')
    expect(texto).not.toContain('Bia Fictícia')
    expect(ini.resumo.mentorias).toEqual({ realizadas: 0, contratadas: 3 })
  })

  it('aviso programado só aparece no Início quando chega a data; o publicado aparece', async () => {
    await c.coord.post('/avisos', { titulo: 'Aviso futuro fictício', publico: 'aluna', pessoa_id: jaciara.pessoa, inicio: `${somarDias(h, 5)}T08:00` })
    await c.coord.post('/avisos', { titulo: 'Aviso de hoje fictício', publico: 'aluna', pessoa_id: jaciara.pessoa })
    const titulos = (await jaciara.cliente.get('/portal/inicio')).avisos.map((a: J) => a.titulo)
    expect(titulos).toContain('Aviso de hoje fictício')
    expect(titulos).not.toContain('Aviso futuro fictício')
    expect((await bia.cliente.get('/portal/inicio')).avisos.map((a: J) => a.titulo)).not.toContain('Aviso de hoje fictício')
  })
})

describe('Mentorias: saldo e reserva pelo portal', () => {
  it('Jaciara: 3 contratadas, 1 realizada e 1 agendada → 1 disponível; depois de reservar, 0', async () => {
    const ocs = (await c.coord.get(`/pessoas/${jaciara.pessoa}`)).matriculas[0].ocorrencias as J[]
    expect(ocs).toHaveLength(3)
    // 1 realizada (agendada fora da disponibilidade no passado próximo) e 1 agendada pela equipe.
    await c.coord.post(`/ocorrencias/${ocs[0].id}/agendar`, { inicio: `${somarDias(h, -2)}T15:00`, fora_disponibilidade: true, motivo: 'encontro já feito (teste)' })
    await c.coord.post(`/ocorrencias/${ocs[0].id}/realizar`, { data_realizada: somarDias(h, -2) })
    await c.coord.post(`/ocorrencias/${ocs[1].id}/agendar`, { inicio: `${D1}T09:00` })

    let m = tipoDe(await jaciara.cliente.get('/portal/mentorias'))
    expect(m).toMatchObject({ contratada: 3, realizadas: 1, agendadas: 1, disponiveis: 1 })

    const item = m.itens.find((i: J) => i.disponiveis > 0)
    const horarios = (await jaciara.cliente.get(`/portal/mentorias/itens/${item.id}/horarios`)).horarios as J[]
    expect(horarios.map((x) => x.inicio)).not.toContain(`${D1}T09:00`) // já reservado
    expect(horarios.map((x) => x.inicio)).toContain(`${D1}T10:00`)
    await jaciara.cliente.post(`/portal/mentorias/itens/${item.id}/reservar`, { inicio: `${D1}T10:00` })

    m = tipoDe(await jaciara.cliente.get('/portal/mentorias'))
    expect(m).toMatchObject({ contratada: 3, realizadas: 1, agendadas: 2, disponiveis: 0 })
    const outra = await jaciara.cliente.req('POST', `/portal/mentorias/itens/${m.itens[0].id}/reservar`, { inicio: `${D2}T09:00` })
    expect(outra.status).toBe(409)
    expect(outra.corpo.erro).toContain('não tem mais encontros disponíveis')
  })

  it('a agenda da aluna mostra os mesmos encontros que a equipe vê', async () => {
    const minha = (await jaciara.cliente.get('/portal/agenda')).encontros.filter((e: J) => e.situacao === 'agendada').map((e: J) => e.inicio).sort()
    const equipe = (await c.coord.get(`/agenda?de=${D1}&ate=${D1}`)).reservas.filter((r: J) => r.pessoa_id === jaciara.pessoa).map((r: J) => r.inicio).sort()
    expect(minha).toEqual([`${D1}T09:00`, `${D1}T10:00`])
    expect(equipe).toEqual(minha)
  })

  it('a aluna não marca horário fora da disponibilidade nem num item de outra aluna', async () => {
    const item = tipoDe(await bia.cliente.get('/portal/mentorias')).itens[0]
    expect((await bia.cliente.req('POST', `/portal/mentorias/itens/${item.id}/reservar`, { inicio: `${D1}T14:00` })).status).toBe(409)
    const itemJaciara = tipoDe(await jaciara.cliente.get('/portal/mentorias')).itens[0]
    expect((await bia.cliente.req('POST', `/portal/mentorias/itens/${itemJaciara.id}/reservar`, { inicio: `${D2}T11:00` })).status).toBe(404)
    expect((await bia.cliente.req('GET', `/portal/mentorias/itens/${itemJaciara.id}/horarios`)).status).toBe(404)
  })

  it('duas alunas no mesmo horário ao mesmo tempo: só uma consegue', async () => {
    const carol = await novaAluna('Carol Fictícia', 'carol@ficticio.local', [{ tipo_id: tipoId, descricao: 'Mentoria Individual', quantidade: 2, profissional_id: profId, origem: 'pacote' }])
    const iBia = tipoDe(await bia.cliente.get('/portal/mentorias')).itens[0]
    const iCarol = tipoDe(await carol.cliente.get('/portal/mentorias')).itens[0]
    const [a, b] = await Promise.all([
      bia.cliente.req('POST', `/portal/mentorias/itens/${iBia.id}/reservar`, { inicio: `${D2}T09:00` }),
      carol.cliente.req('POST', `/portal/mentorias/itens/${iCarol.id}/reservar`, { inicio: `${D2}T09:00` }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await contar(`SELECT COUNT(*) AS n FROM ped_reservas WHERE ativa = 1 AND inicio = ?`, `${D2}T09:00`)).toBe(1)
    // Quem perdeu continua com o saldo intacto.
    const perdeu = a.status === 409 ? bia : carol
    expect(tipoDe(await perdeu.cliente.get('/portal/mentorias')).disponiveis).toBeGreaterThan(0)
  })

  it('o último encontro não pode ser usado em dois horários ao mesmo tempo', async () => {
    const dani = await novaAluna('Dani Fictícia', 'dani@ficticio.local', [{ tipo_id: tipoId, descricao: 'Mentoria Individual', quantidade: 1, profissional_id: profId, origem: 'pacote' }])
    const item = tipoDe(await dani.cliente.get('/portal/mentorias')).itens[0]
    const livres = ((await dani.cliente.get(`/portal/mentorias/itens/${item.id}/horarios`)).horarios as J[]).map((x) => x.inicio)
    const [a, b] = await Promise.all([
      dani.cliente.req('POST', `/portal/mentorias/itens/${item.id}/reservar`, { inicio: livres[0] }),
      dani.cliente.req('POST', `/portal/mentorias/itens/${item.id}/reservar`, { inicio: livres[1] }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await contar('SELECT COUNT(*) AS n FROM ped_reservas r JOIN ped_ocorrencias o ON o.id = r.ocorrencia_id WHERE r.ativa = 1 AND o.matricula_id = ?', dani.matricula)).toBe(1)
    expect(tipoDe(await dani.cliente.get('/portal/mentorias')).disponiveis).toBe(0)
  })

  it('reagendar move o mesmo encontro (não consome outro) e guarda o histórico', async () => {
    const enc = (await jaciara.cliente.get('/portal/agenda')).encontros.find((e: J) => e.inicio === `${D1}T10:00`)
    const antes = tipoDe(await jaciara.cliente.get('/portal/mentorias'))
    await jaciara.cliente.post(`/portal/mentorias/encontros/${enc.id}/reagendar`, { inicio: `${D2}T10:00` })
    const depois = tipoDe(await jaciara.cliente.get('/portal/mentorias'))
    expect(depois).toMatchObject({ contratada: antes.contratada, agendadas: antes.agendadas, disponiveis: antes.disponiveis })
    const o = await amb.db.get<J>('SELECT situacao, data_agendada FROM ped_ocorrencias WHERE id = ?', enc.id)
    expect(o).toMatchObject({ situacao: 'agendada', data_agendada: `${D2}T10:00` })
    expect(await contar('SELECT COUNT(*) AS n FROM ped_reservas WHERE ocorrencia_id = ?', enc.id)).toBe(2) // a anterior fica no histórico, inativa
    expect(await contar('SELECT COUNT(*) AS n FROM ped_reservas WHERE ocorrencia_id = ? AND ativa = 1', enc.id)).toBe(1)
    const hist = await amb.db.get<J>("SELECT valor_anterior, valor_novo, autor_id FROM ped_ocorrencia_historico WHERE ocorrencia_id = ? AND tipo = 'reagendada'", enc.id)
    expect(hist).toMatchObject({ valor_anterior: `${D1}T10:00`, valor_novo: `${D2}T10:00` })
    // O horário antigo volta a ficar livre.
    expect(await contar('SELECT COUNT(*) AS n FROM ped_reservas WHERE ativa = 1 AND inicio = ?', `${D1}T10:00`)).toBe(0)
  })

  it('desmarcar libera o horário e devolve a possibilidade de agendar (a obrigação continua)', async () => {
    const enc = (await jaciara.cliente.get('/portal/agenda')).encontros.find((e: J) => e.inicio === `${D2}T10:00`)
    await jaciara.cliente.post(`/portal/mentorias/encontros/${enc.id}/desmarcar`, { motivo: 'imprevisto fictício' })
    const m = tipoDe(await jaciara.cliente.get('/portal/mentorias'))
    expect(m).toMatchObject({ contratada: 3, realizadas: 1, agendadas: 1, disponiveis: 1 })
    expect(await contar('SELECT COUNT(*) AS n FROM ped_reservas WHERE ativa = 1 AND inicio = ?', `${D2}T10:00`)).toBe(0)
  })

  it('encontro com menos antecedência que a mínima não é alterado pelo portal', async () => {
    await c.coord.put('/configuracoes', { agenda_antecedencia_horas: 24 * 30 })
    const enc = (await jaciara.cliente.get('/portal/agenda')).encontros.find((e: J) => e.situacao === 'agendada')
    const r = await jaciara.cliente.req('POST', `/portal/mentorias/encontros/${enc.id}/desmarcar`, {})
    expect(r.status).toBe(409)
    expect(r.corpo.erro).toContain('Fale com a equipe')
    await c.coord.put('/configuracoes', { agenda_antecedencia_horas: 24 })
  })
})

describe('Confirmação por WhatsApp e Google Agenda (envio falso)', () => {
  it('cada agendamento gera uma confirmação por canal; falha fica "pendente" e tentar de novo não duplica nada', async () => {
    const ocs = (await c.coord.get(`/pessoas/${bia.pessoa}`)).matriculas[0].ocorrencias as J[]
    const o = ocs.find((x) => x.situacao === 'agendada') ?? ocs[0]
    // Garante um agendamento novo, feito pela equipe, com o WhatsApp falhando uma vez.
    if (o.situacao === 'agendada') await c.coord.post(`/ocorrencias/${o.id}/desmarcar`, { motivo: 'preparar teste' })
    chamadas.length = 0
    falharWhatsapp = 1
    const r = await c.coord.post(`/ocorrencias/${o.id}/agendar`, { inicio: `${D2}T11:00` })
    expect(r.confirmacao.pendente).toBe(true)
    expect(r.confirmacao.canais.whatsapp.situacao).toBe('falhou')
    expect(r.confirmacao.canais.google_agenda.situacao).toBe('enviado')
    const evento = chamadas.find((x) => x.url.includes('/calendar/') && x.metodo === 'POST')!
    expect(decodeURIComponent(evento.url)).toContain('/calendars/mentora@ficticio.local/events') // e-mail da conta vinculada
    // A equipe vê "confirmação pendente" no painel.
    const linha = (await c.coord.get(`/pessoas/${bia.pessoa}`)).matriculas[0].ocorrencias.find((x: J) => x.id === o.id)
    expect(linha.confirmacoes_pendentes).toBeGreaterThan(0)

    const reservas = await contar('SELECT COUNT(*) AS n FROM ped_reservas WHERE ocorrencia_id = ?', o.id)
    const novo = await c.coord.post(`/ocorrencias/${o.id}/confirmacoes/tentar`, {})
    expect(novo.pendente).toBe(false)
    expect(chamadas.filter((x) => x.url.includes('graph.facebook.com'))).toHaveLength(2) // 1 falha + 1 envio
    expect(chamadas.filter((x) => x.url.includes('/calendar/'))).toHaveLength(1) // o evento não é recriado
    // Tentar de novo depois de enviado não manda nada.
    await c.coord.post(`/ocorrencias/${o.id}/confirmacoes/tentar`, {})
    expect(chamadas.filter((x) => x.url.includes('graph.facebook.com'))).toHaveLength(2)
    expect(await contar('SELECT COUNT(*) AS n FROM ped_reservas WHERE ocorrencia_id = ?', o.id)).toBe(reservas)
    const reserva = (await amb.db.get<J>('SELECT id FROM ped_reservas WHERE ocorrencia_id = ? AND ativa = 1', o.id))!.id
    expect(await contar('SELECT COUNT(*) AS n FROM ped_integracoes WHERE ocorrencia_id = ? AND referencia = ?', o.id, reserva)).toBe(2) // uma por canal
  })

  it('reagendar atualiza o mesmo evento e desmarcar remove; WhatsApp sai com o modelo de cada ação', async () => {
    const o = (await c.coord.get(`/pessoas/${bia.pessoa}`)).matriculas[0].ocorrencias.find((x: J) => x.situacao === 'agendada')
    chamadas.length = 0
    await c.coord.post(`/ocorrencias/${o.id}/reagendar`, { inicio: `${D2}T16:00`, fora_disponibilidade: true, motivo: 'teste' })
    await c.coord.post(`/ocorrencias/${o.id}/desmarcar`, { motivo: 'teste' })
    const idEvento = `cl${o.id.replace(/-/g, '')}`
    const google = chamadas.filter((x) => x.url.includes('/calendar/'))
    expect(google.map((x) => x.metodo)).toEqual(['POST', 'PATCH', 'DELETE']) // o evento já existia: PATCH mantém o mesmo Meet
    expect(JSON.parse(google[0].corpo).id).toBe(idEvento)
    expect(google[2].url).toContain(idEvento)
    const modelos = chamadas.filter((x) => x.url.includes('graph.facebook.com')).map((x) => JSON.parse(x.corpo).template.name)
    expect(modelos).toEqual(['remarcacao_ficticia', 'cancelamento_ficticio'])
  })

  it('o evento sai com link do Google Meet; reagendar mantém o link; desmarcar tira; aluna e equipe veem o link', async () => {
    const o = (await c.coord.get(`/pessoas/${bia.pessoa}`)).matriculas[0].ocorrencias.find((x: J) => !['realizada', 'cancelada', 'agendada'].includes(x.situacao))
    chamadas.length = 0
    const r = await c.coord.post(`/ocorrencias/${o.id}/agendar`, { inicio: `${D2}T17:00`, fora_disponibilidade: true, motivo: 'teste do Meet' })
    const post = chamadas.find((x) => x.url.includes('/calendar/') && x.metodo === 'POST')!
    expect(post.url).toContain('conferenceDataVersion=1')
    expect(JSON.parse(post.corpo).conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet')
    expect(JSON.parse(post.corpo).attendees).toEqual([]) // convite à aluna vem desligado
    const link = r.confirmacao.link_reuniao as string
    expect(link).toMatch(/^https:\/\/meet\.google\.com\//)
    expect(r.confirmacao.canais.google_agenda.detalhe).toContain('Google Meet')
    expect((await bia.cliente.get('/portal/agenda')).encontros.find((x: J) => x.id === o.id).link_reuniao).toBe(link)
    expect((await c.coord.get(`/ocorrencias/${o.id}/confirmacoes`)).link_reuniao).toBe(link)

    await c.coord.post(`/ocorrencias/${o.id}/reagendar`, { inicio: `${D2}T18:00`, fora_disponibilidade: true, motivo: 'teste' })
    expect((await c.coord.get(`/ocorrencias/${o.id}/confirmacoes`)).link_reuniao).toBe(link)
    await c.coord.post(`/ocorrencias/${o.id}/desmarcar`, { motivo: 'teste' })
    expect((await c.coord.get(`/ocorrencias/${o.id}/confirmacoes`)).link_reuniao).toBeNull()
  })

  it('agenda sem Meet: o evento sai sem link e o motivo fica dito; com convite ligado, a aluna é convidada pelo Google', async () => {
    const o = (await c.coord.get(`/pessoas/${bia.pessoa}`)).matriculas[0].ocorrencias.find((x: J) => !['realizada', 'cancelada', 'agendada'].includes(x.situacao))
    await c.coord.put('/configuracoes', { agenda_convidar_aluna: '1' })
    googleSemMeet = true
    chamadas.length = 0
    const r = await c.coord.post(`/ocorrencias/${o.id}/agendar`, { inicio: `${D2}T17:00`, fora_disponibilidade: true, motivo: 'teste sem Meet' })
    googleSemMeet = false
    await c.coord.put('/configuracoes', { agenda_convidar_aluna: '0' })
    expect(r.confirmacao.canais.google_agenda.situacao).toBe('enviado')
    expect(r.confirmacao.canais.google_agenda.detalhe).toContain('GOOGLE_AGIR_COMO_MENTORA')
    expect(r.confirmacao.link_reuniao).toBeNull()
    const ultimo = chamadas.filter((x) => x.url.includes('/calendar/') && x.metodo === 'POST').at(-1)!
    expect(ultimo.url).toContain('sendUpdates=all')
    expect(JSON.parse(ultimo.corpo).attendees).toEqual([{ email: 'bia@ficticio.local', displayName: 'Bia Fictícia' }])
    await c.coord.post(`/ocorrencias/${o.id}/desmarcar`, { motivo: 'teste' })
  })

  it('sem credenciais, o agendamento segue e fica dito exatamente o que falta', async () => {
    const o = (await c.coord.get(`/pessoas/${bia.pessoa}`)).matriculas[0].ocorrencias.find((x: J) => !['realizada', 'cancelada', 'agendada'].includes(x.situacao))
    await amb.db.run("INSERT INTO ped_integracoes (id, ocorrencia_id, canal, acao, referencia, situacao, tentativas, criado_em, atualizado_em) VALUES (?, ?, 'whatsapp', 'cancelar', 'ref-teste', 'pendente', 0, ?, ?)", crypto.randomUUID(), o.id, new Date().toISOString(), new Date().toISOString())
    const antes = chamadas.length
    await processarIntegracoes(amb.db, undefined, o.id)
    const linha = await amb.db.get<J>("SELECT situacao, detalhe FROM ped_integracoes WHERE referencia = 'ref-teste'")
    expect(linha).toMatchObject({ situacao: 'nao_configurado' })
    expect(linha?.detalhe).toContain('WHATSAPP_TOKEN')
    expect(chamadas.length).toBe(antes)
  })
})

describe('Jornada individual', () => {
  it('adaptar a etapa de uma matrícula não muda o modelo nem a outra aluna, e registra quem e quando', async () => {
    const trilha = (await c.coord.post('/catalogos/trilhas', { nome: 'Trilha Fictícia', ordem: 1 })).id
    const pilar = (await c.coord.post('/catalogos/pilares', { nome: 'Ação', ordem: 1 })).id
    const etapa = (await c.coord.post('/etapas', { trilha_id: trilha, pilar_id: pilar, titulo: 'Etapa modelo', objetivo: 'Objetivo modelo', atividades_modelo: [{ titulo: 'Atividade modelo' }] })).id
    for (const a of [jaciara, bia]) await c.coord.post(`/matriculas/${a.matricula}/jornada`, { trilha_id: trilha, pilar_id: pilar, liberar_etapas: [etapa] })
    const jJ = await c.coord.get(`/matriculas/${jaciara.matricula}/jornada`)
    const je = jJ.etapas.find((e: J) => e.etapa_id === etapa)
    await c.coord.put(`/jornada-etapas/${je.id}`, { prazo_individual: somarDias(h, 20), titulo_personalizado: 'Etapa adaptada para Jaciara' })
    const atv = je.atividades[0]
    await c.coord.put(`/atividades/${atv.id}`, { titulo: 'Atividade adaptada', descricao: null, link: null, prazo: somarDias(h, 15) })

    const depoisJ = (await c.coord.get(`/matriculas/${jaciara.matricula}/jornada`)).etapas.find((e: J) => e.etapa_id === etapa)
    expect(depoisJ).toMatchObject({ titulo: 'Etapa adaptada para Jaciara', titulo_modelo: 'Etapa modelo', personalizada: true, personalizada_por: u.coord, prazo_individual: somarDias(h, 20) })
    expect(depoisJ.personalizada_em).toBeTruthy()
    const daBia = (await c.coord.get(`/matriculas/${bia.matricula}/jornada`)).etapas.find((e: J) => e.etapa_id === etapa)
    expect(daBia).toMatchObject({ titulo: 'Etapa modelo', personalizada: false, prazo_individual: null })
    expect(daBia.atividades[0].titulo).toBe('Atividade modelo')
    const modelo = (await c.coord.get('/pedagogico/modelo')).etapas.find((e: J) => e.id === etapa)
    expect(modelo.titulo).toBe('Etapa modelo')
    expect(await contar("SELECT COUNT(*) AS n FROM ped_auditoria WHERE acao = 'etapa_adaptada_para_matricula' AND entidade_id = ? AND autor_id = ?", je.id, u.coord)).toBe(1)

    // No portal a aluna vê a versão dela, sem quem alterou nem o texto do modelo.
    const portal = (await jaciara.cliente.get('/portal')).jornada.etapas.find((e: J) => e.etapa_id === etapa)
    expect(portal.titulo).toBe('Etapa adaptada para Jaciara')
    expect(portal.titulo_modelo).toBeUndefined()
    expect(portal.personalizada_por).toBeUndefined()
  })

  it('cores dos pilares: Ação, Gestão e Escala distintas', () => {
    const cores = ['Ação', 'Gestão', 'Escala'].map((nome, i) => corDoPilar({ nome, ordem: i }))
    expect(new Set(cores).size).toBe(3)
    expect(corDoPilar({ nome: 'Gestão', cor: 'azul' })).toBe('azul')
  })
})

describe('Plano de Ação e transcrição', () => {
  it('transcrição só para quem tem permissão; sugestões viram rascunho e só a ação publicada chega à aluna', async () => {
    const o = (await c.coord.get(`/pessoas/${jaciara.pessoa}`)).matriculas[0].ocorrencias.find((x: J) => x.situacao === 'realizada')
    const transcricao = 'Mentora: Ficou combinado que você vai revisar a tabela de preços até 20/12.\nAluna: Combinado, vou preparar a lista de clientes.\nMentora: Ótimo, falamos de outros assuntos também.'
    expect((await c.suporte.req('PUT', `/ocorrencias/${o.id}/transcricao`, { texto: transcricao })).status).toBe(403)
    await c.coord.put(`/ocorrencias/${o.id}/transcricao`, { texto: transcricao })
    expect((await c.suporte.req('GET', `/ocorrencias/${o.id}/transcricao`)).status).toBe(403)
    expect((await c.mentora.get(`/ocorrencias/${o.id}/transcricao`)).transcricao.texto).toContain('tabela de preços')

    const s = await c.coord.post(`/ocorrencias/${o.id}/transcricao/sugestoes`, {})
    expect(s.criadas).toBe(2)
    expect((await c.coord.post(`/ocorrencias/${o.id}/transcricao/sugestoes`, {})).criadas).toBe(0) // reprocessar não duplica
    const acoes = (await c.coord.get(`/matriculas/${jaciara.matricula}/acoes`)).acoes as J[]
    expect(acoes.every((a) => a.situacao === 'rascunho')).toBe(true)
    expect(acoes.find((a) => a.titulo.includes('tabela de preços'))?.prazo).toMatch(/-12-20$/)
    expect((await jaciara.cliente.get('/portal/plano-acao')).acoes).toHaveLength(0)

    const a = acoes[0]
    expect((await c.coord.req('POST', `/acoes/${a.id}/fluxo`, { passo: 'publicar' })).status).toBe(409) // precisa de revisão antes
    await c.mentora.post(`/acoes/${a.id}/fluxo`, { passo: 'enviar_revisao' })
    expect((await c.mentora.req('POST', `/acoes/${a.id}/fluxo`, { passo: 'publicar' })).status).toBe(403) // mentora não publica
    await c.coord.post(`/acoes/${a.id}/fluxo`, { passo: 'publicar' })

    const plano = (await jaciara.cliente.get('/portal/plano-acao')).acoes as J[]
    expect(plano).toHaveLength(1)
    expect(plano[0]).toMatchObject({ id: a.id, andamento: 'a_fazer', encontro_tipo: 'Mentoria Individual' })
    await jaciara.cliente.put(`/portal/plano-acao/${a.id}`, { andamento: 'em_andamento' })
    expect((await jaciara.cliente.get('/portal/plano-acao')).acoes[0].andamento).toBe('em_andamento')
    // A transcrição nunca sai pelo portal, nem para a própria aluna.
    // Nem o restante da transcrição nem a sugestão ainda em rascunho aparecem para a aluna.
    for (const rota of ['/portal', '/portal/inicio', '/portal/plano-acao', '/portal/agenda', '/portal/mentorias']) {
      const corpo = JSON.stringify(await jaciara.cliente.get(rota))
      expect(corpo).not.toContain('falamos de outros assuntos')
      expect(corpo).not.toContain('preparar a lista de clientes')
    }
    expect((await jaciara.cliente.req('GET', `/ocorrencias/${o.id}/transcricao`)).status).toBe(403)
    expect((await bia.cliente.get('/portal/plano-acao')).acoes).toHaveLength(0)
    expect((await bia.cliente.req('PUT', `/portal/plano-acao/${a.id}`, { andamento: 'concluida' })).status).toBe(404)
  })

  it('sugestões a partir de frases com compromisso', () => {
    expect(sugerirAcoes('Vou montar o funil de vendas até 10/01. O tempo hoje está bom.').map((s) => s.titulo)).toEqual(['Vou montar o funil de vendas até 10/01.'])
  })
})

describe('Contrato na matrícula', () => {
  const TEXTO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS — PROGRAMA DIAMANTE BUSINESS (dados fictícios)
Cláusula 2. O presente contrato terá vigência de 01/12/2026 a 30/11/2027, pelo prazo de 12 (doze) meses.
Cláusula 3. Estão incluídos 4 (quatro) encontros de Mentoria Individual com a mentora indicada.
Bônus: 1 (uma) Mentoria Individual extra.
Bônus: acesso à comunidade por 12 meses.`

  it('lê o texto, aponta divergências, aplica o que foi revisado e reprocessar não duplica', async () => {
    const prog = (await c.coord.post('/catalogos/programas', { nome: 'Diamante Business' })).id
    const dados = extrairContrato(TEXTO, { programas: [{ id: prog, nome: 'Diamante Business' }], tipos: [{ id: tipoId, nome: 'Mentoria Individual' }] })
    expect(dados).toMatchObject({ legivel: true, data_inicio: { valor: '2026-12-01' }, data_fim: { valor: '2027-11-30' }, duracao_meses: { valor: 12 }, programa: { valor: { id: prog } } })
    expect(dados.itens.map((i) => [i.origem, i.tipo_id, i.quantidade])).toEqual([
      ['pacote', tipoId, 4],
      ['bonus', tipoId, 1],
      ['bonus', null, null],
    ])
    expect(extrairContrato('', { programas: [], tipos: [] })).toMatchObject({ legivel: false, data_inicio: { situacao: 'pendente' } })

    const pdf = new TextEncoder().encode('%PDF-1.4 contrato fictício').buffer as ArrayBuffer
    const enviar = () =>
      amb.api(new Request('https://sistema.teste/api/ped/matriculas/' + jaciara.matricula + '/contratos', { method: 'POST', headers: { Cookie: c.coord.cookie, 'X-CL-App': '1', Origin: 'https://sistema.teste', 'X-Nome-Arquivo': 'contrato-ficticio.pdf', 'Content-Length': String(pdf.byteLength) }, body: pdf })).then((r) => r.json() as Promise<J>)
    const up = await enviar()
    expect(up.repetido).toBe(false)
    expect((await enviar()).repetido).toBe(true) // mesmo arquivo não vira outro documento
    expect((await c.suporte.req('GET', `/matriculas/${jaciara.matricula}/contratos`)).status).toBe(403) // acesso restrito
    expect((await jaciara.cliente.req('GET', `/contratos/${up.id}/arquivo`)).status).toBe(403)

    const leitura = await c.coord.post(`/contratos/${up.id}/leitura`, { texto: TEXTO })
    const pacote = leitura.comparacao.itens.find((i: J) => i.chave.startsWith('pacote:'))
    expect(pacote).toMatchObject({ contrato: 4, sistema: 2, diverge: true, ja_existe: true })

    const itensAntes = await contar('SELECT COUNT(*) AS n FROM ped_itens_contratados WHERE matricula_id = ?', jaciara.matricula)
    const corpo = { data_inicio: somarDias(h, -30), data_fim: somarDias(h, 120), programa_id: prog, motivo: 'conferido com o contrato', itens: [{ chave: 'bonus:livre:0', descricao: 'Acesso à comunidade', quantidade: 1, origem: 'bonus' }] }
    const ap = await c.coord.post(`/contratos/${up.id}/aplicar`, corpo)
    expect(ap.criados).toEqual(['Acesso à comunidade'])
    const de_novo = await c.coord.post(`/contratos/${up.id}/aplicar`, corpo)
    expect(de_novo).toMatchObject({ criados: [], ignorados: ['Acesso à comunidade'] })
    expect(await contar('SELECT COUNT(*) AS n FROM ped_itens_contratados WHERE matricula_id = ?', jaciara.matricula)).toBe(itensAntes + 1)
    const ct = (await c.coord.get(`/matriculas/${jaciara.matricula}/contratos`)).contratos[0]
    expect(ct.confirmado_por_nome).toBe('Coordenação Fictícia')
  })
})

describe('Vitórias, depoimentos, conteúdos e mural', () => {
  it('vitória enviada pela aluna entra na fila de validação e aparece como "aguardando análise"', async () => {
    const r = await jaciara.cliente.post('/portal/vitorias', { titulo: 'Fechei meu primeiro contrato (fictício)' })
    expect(r.situacao).toBe('aguardando_analise')
    expect((await c.coord.get('/validacoes/pendentes')).conquistas.some((x: J) => x.id === r.id)).toBe(true)
    await c.coord.post(`/conquistas/${r.id}/validar`, { validada: false, visivel_aluna: false })
    expect((await c.coord.get('/validacoes/pendentes')).conquistas.some((x: J) => x.id === r.id)).toBe(false)
    expect((await jaciara.cliente.get('/portal/vitorias')).enviadas.find((x: J) => x.id === r.id).situacao).toBe('nao_validada')
    expect((await bia.cliente.get('/portal/vitorias')).enviadas).toHaveLength(0)
  })

  it('um depoimento por encontro realizado; outro envio atualiza o mesmo espaço', async () => {
    const o = (await jaciara.cliente.get('/portal/agenda')).encontros.find((e: J) => e.situacao === 'realizada')
    await jaciara.cliente.put(`/portal/depoimentos/encontro/${o.id}`, { texto: 'Gostei muito (fictício).' })
    await jaciara.cliente.put(`/portal/depoimentos/encontro/${o.id}`, { texto: 'Gostei muito, revisado (fictício).' })
    expect(await contar("SELECT COUNT(*) AS n FROM ped_depoimentos WHERE alvo_id = ?", o.id)).toBe(1)
    expect((await bia.cliente.req('PUT', `/portal/depoimentos/encontro/${o.id}`, { texto: 'x' })).status).toBe(404)
    expect((await c.coord.get(`/matriculas/${jaciara.matricula}/depoimentos`)).depoimentos[0].texto).toContain('revisado')
  })

  it('conteúdos: só o publicado aparece; Vimeo vira player; livro nunca recebe PDF', async () => {
    const rotina = await c.coord.post('/conteudos', { secao: 'rotina', titulo: 'Dia Extraordinário (rascunho fictício)', video_url: 'https://vimeo.com/123456789' })
    expect((await jaciara.cliente.get('/portal/conteudos/rotina')).itens).toHaveLength(0) // estado vazio até publicar
    await c.coord.post(`/conteudos/${rotina.id}/publicar`, { publicado: true })
    expect((await jaciara.cliente.get('/portal/conteudos/rotina')).itens[0].video_url).toBe('https://player.vimeo.com/video/123456789')
    expect((await c.coord.req('POST', '/conteudos', { secao: 'biblioteca', titulo: 'x', video_url: 'https://youtube.com/watch?v=1' })).status).toBe(400)
    await c.coord.post('/conteudos', { secao: 'biblioteca', categoria: 'Ferramentas', titulo: 'Planilha de metas (fictícia)', link: 'https://exemplo.com/planilha' })
    const livro = await c.coord.post('/conteudos', { secao: 'livros', titulo: 'Livro fictício', compra_url: 'https://loja.exemplo.com/livro' })
    const pdf = new TextEncoder().encode('%PDF').buffer as ArrayBuffer
    const r = await amb.api(new Request(`https://sistema.teste/api/ped/conteudos/${livro.id}/arquivo`, { method: 'POST', headers: { Cookie: c.coord.cookie, 'X-CL-App': '1', Origin: 'https://sistema.teste', 'X-Nome-Arquivo': 'livro.pdf' }, body: pdf }))
    expect(r.status).toBe(400)
    expect((await c.suporte.req('POST', '/conteudos', { secao: 'rotina', titulo: 'x' })).status).toBe(403)
    expect(embedVimeo('https://vimeo.com/76979871/abc123')).toBe('https://player.vimeo.com/video/76979871?h=abc123')
  })

  it('mural: com moderação, a publicação da aluna só aparece depois de aprovada e mostra só o contato escolhido', async () => {
    const p = await jaciara.cliente.post('/portal/mural', { categoria: 'servico', titulo: 'Consultoria fictícia', descricao: 'Serviço de teste.', contato_canal: 'instagram', contato_valor: '@ficticia' })
    expect(p.situacao).toBe('pendente')
    expect((await bia.cliente.get('/portal/mural')).publicadas).toHaveLength(0)
    await c.suporte.post(`/mural/${p.id}/moderar`, { decisao: 'publicar' })
    const visto = (await bia.cliente.get('/portal/mural')).publicadas[0]
    expect(visto).toMatchObject({ titulo: 'Consultoria fictícia', contato_canal: 'instagram', contato_valor: '@ficticia', autora_nome: 'Jaciara Fictícia' })
    expect(JSON.stringify(visto)).not.toContain('jaciara@ficticio.local')
    expect(JSON.stringify(visto)).not.toContain('97777')
    expect((await c.mentora.req('POST', `/mural/${p.id}/moderar`, { decisao: 'arquivar' })).status).toBe(403)
  })
})

void agoraSP
