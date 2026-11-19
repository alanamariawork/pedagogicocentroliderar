import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, type Ambiente, type Cliente } from './apoio/ambiente'
import { hojeSP, somarDias } from '../shared/datas'
import { notificarAluna } from '../server/servicos'
import type { ConfigIntegracoes } from '../server/confirmacoes'

/*
 * Avisos às alunas também por e-mail e WhatsApp: fila por canal, sem duplicar, nova tentativa,
 * canal desligado ou sem cadastro, e o link de envio manual. Nada sai daqui: o WhatsApp é falso
 * e o e-mail fica registrado no imitador local do backoffice.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const chamadas: { url: string; corpo: J }[] = []
let falhar = 0
const config: ConfigIntegracoes = { whatsappToken: 'token-ficticio', whatsappNumeroId: '000000', whatsappModeloAviso: 'aviso_ficticio', whatsappIdioma: 'pt_BR' }
const fetchFalso: typeof fetch = async (entrada, init) => {
  chamadas.push({ url: String(entrada), corpo: JSON.parse(String(init?.body ?? '{}')) })
  if (falhar > 0) {
    falhar--
    return new Response(JSON.stringify({ error: { message: 'erro temporário (teste)' } }), { status: 500 })
  }
  return new Response(JSON.stringify({ messages: [{ id: `wamid.${chamadas.length}` }] }), { status: 200 })
}

let amb: Ambiente
let coord: Cliente
const h = hojeSP()
const alunas: Record<string, { pessoa: string; matricula: string; cliente: Cliente }> = {}
const envios = (pessoa: string) => amb.db.all<J>('SELECT * FROM ped_envios_aviso WHERE pessoa_id = ? ORDER BY criado_em, canal', pessoa)

beforeAll(async () => {
  amb = await abrirAmbiente({ confirmacoes: { config, fetch: fetchFalso } })
  coord = await amb.entrar(await amb.criarEquipe('coord.av@ficticio.local', 'Coordenação Fictícia', { perfil: 'coordenacao' }))
  for (const [k, nome, email, tel] of [
    ['ana', 'Ana Aviso Fictícia', 'ana.aviso@ficticio.local', '(11) 98888-1111'],
    ['sem', 'Bea Sem Contato Fictícia', null, null],
  ] as const) {
    const r = await coord.post('/pessoas', { nome, email, telefone: tel, matricula: { data_inicio: somarDias(h, -10), data_fim: somarDias(h, 100), itens_extras: [] } })
    const ficha = await coord.get(`/pessoas/${r.id}`)
    // Sem e-mail em Clientes ainda dá para ter acesso ao portal (conta criada à parte nos testes).
    const usuario = await amb.criarAcessoPortal(email ?? `sem.${r.id.slice(0, 6)}@ficticio.local`, r.id)
    alunas[k] = { pessoa: r.id, matricula: ficha.matriculas[0].id, cliente: await amb.entrar(usuario, 'portal') }
  }
}, 240_000)

afterAll(async () => {
  await amb?.fechar()
})

describe('Avisos por e-mail e WhatsApp', () => {
  it('um aviso da equipe entra no sino e na fila dos dois canais; o envio sai uma vez só', async () => {
    await coord.post('/avisos', { titulo: 'Encontro ao vivo amanhã', detalhe: 'Às 19h, no link de sempre.', link: '#/agenda', publico: 'aluna', pessoa_id: alunas.ana.pessoa })
    expect((await envios(alunas.ana.pessoa)).map((e) => [e.canal, e.situacao])).toEqual([['email', 'pendente'], ['whatsapp', 'pendente']])

    expect(await coord.post('/avisos/envios/tentar', {})).toMatchObject({ enviados: 2 })
    expect((await envios(alunas.ana.pessoa)).map((e) => e.situacao)).toEqual(['enviado', 'enviado'])
    expect(amb.clientes.emailsAviso).toHaveLength(1)
    expect(amb.clientes.emailsAviso[0]).toMatchObject({ email: 'ana.aviso@ficticio.local', aviso: { titulo: 'Encontro ao vivo amanhã', caminho: '#/agenda' } })
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].corpo).toMatchObject({ to: '5511988881111', template: { name: 'aviso_ficticio' } })
    expect(chamadas[0].corpo.template.components[0].parameters.map((p: J) => p.text)).toEqual(['Ana', 'Encontro ao vivo amanhã', 'Às 19h, no link de sempre.'])

    // Repetir não reenvia o que já foi.
    await coord.post('/avisos/envios/tentar', {})
    await coord.post('/avisos/envios/tentar', { ids: (await envios(alunas.ana.pessoa)).map((e) => e.id) })
    expect(amb.clientes.emailsAviso).toHaveLength(1)
    expect(chamadas).toHaveLength(1)
  })

  it('aviso automático (notificarAluna) também vai para a fila', async () => {
    await notificarAluna(amb.db, alunas.ana.matricula, { titulo: 'Sua atividade foi validada', link: '#/jornada' })
    const fila = (await envios(alunas.ana.pessoa)).filter((e) => e.situacao === 'pendente')
    expect(fila.map((e) => e.canal)).toEqual(['email', 'whatsapp'])
    // Encontros: o WhatsApp já sai pela confirmação do agendamento, então o aviso vai só por e-mail.
    await notificarAluna(amb.db, alunas.ana.matricula, { titulo: 'Encontro agendado', link: '#/mentorias' }, ['email'])
    const n = await amb.db.get<J>("SELECT id FROM ped_notificacoes WHERE titulo = 'Encontro agendado' ORDER BY criado_em DESC LIMIT 1")
    expect((await amb.db.all<J>('SELECT canal FROM ped_envios_aviso WHERE notificacao_id = ?', n!.id)).map((e) => e.canal)).toEqual(['email'])
  })

  it('falha no WhatsApp volta para a fila com nova tentativa; "Tentar novamente" usa a mesma linha', async () => {
    falhar = 1
    chamadas.length = 0
    await coord.post('/avisos/envios/tentar', {})
    const w = (await envios(alunas.ana.pessoa)).filter((e) => e.canal === 'whatsapp').at(-1)!
    expect(w).toMatchObject({ situacao: 'pendente', tentativas: 1 })
    expect(w.proxima_tentativa > new Date().toISOString()).toBe(true)
    expect(w.detalhe).toContain('Nova tentativa automática em 5 min')
    // A fila automática respeita a espera; a equipe pode antecipar.
    await coord.post('/avisos/envios/tentar', {})
    expect(chamadas).toHaveLength(1)
    await coord.post('/avisos/envios/tentar', { ids: [w.id] })
    expect(chamadas).toHaveLength(2)
    expect((await amb.db.get<J>('SELECT situacao, tentativas FROM ped_envios_aviso WHERE id = ?', w.id))).toMatchObject({ situacao: 'enviado', tentativas: 2 })
    expect(await amb.db.get<J>('SELECT COUNT(*) AS n FROM ped_envios_aviso WHERE notificacao_id = ?', w.notificacao_id)).toMatchObject({ n: 2 })
  })

  it('sem e-mail ou telefone em Clientes: "não configurado" com o motivo, sem enviar', async () => {
    chamadas.length = 0
    await coord.post('/avisos', { titulo: 'Aviso para quem não tem contato', publico: 'aluna', pessoa_id: alunas.sem.pessoa })
    await coord.post('/avisos/envios/tentar', {})
    const [email, whatsapp] = await envios(alunas.sem.pessoa)
    expect(email).toMatchObject({ situacao: 'nao_configurado' })
    expect(email.detalhe).toContain('não tem e-mail cadastrado')
    expect(whatsapp).toMatchObject({ situacao: 'nao_configurado', detalhe: 'A aluna não tem telefone válido em Clientes.' })
    expect(chamadas).toHaveLength(0)
  })

  it('canal desligado em Parâmetros não envia; o e-mail desativado no backoffice aparece como não configurado', async () => {
    await coord.put('/configuracoes', { avisos_whatsapp: '0' })
    amb.clientes.emailDesativado = true
    chamadas.length = 0
    await coord.post('/avisos', { titulo: 'Com WhatsApp desligado', publico: 'aluna', pessoa_id: alunas.ana.pessoa })
    await coord.post('/avisos/envios/tentar', {})
    const ultimos = (await envios(alunas.ana.pessoa)).slice(-2)
    expect(ultimos.map((e) => e.situacao)).toEqual(['nao_configurado', 'desligado'])
    expect(chamadas).toHaveLength(0)
    await coord.put('/configuracoes', { avisos_whatsapp: '1' })
    amb.clientes.emailDesativado = false
  })

  it('a equipe vê a situação de cada canal e o botão de WhatsApp manual; a aluna não acessa', async () => {
    const r = await coord.get(`/avisos/envios?pessoa_id=${alunas.ana.pessoa}`)
    const e = r.envios.find((x: J) => x.titulo === 'Encontro ao vivo amanhã')
    expect(e.canais.email.situacao).toBe('enviado')
    expect(e.whatsapp_manual).toMatch(/^https:\/\/wa\.me\/5511988881111\?text=/)
    expect(decodeURIComponent(e.whatsapp_manual.split('text=')[1])).toContain('Às 19h, no link de sempre.')
    expect((await coord.get(`/avisos/envios?pessoa_id=${alunas.sem.pessoa}`)).envios[0].whatsapp_manual).toBeNull()
    expect((await coord.get('/avisos/canais')).whatsapp).toMatchObject({ ligado: true, falta: [] })
    expect((await alunas.ana.cliente.req('GET', '/avisos/envios')).status).toBe(403)
    expect((await alunas.ana.cliente.req('POST', '/avisos/envios/tentar', {})).status).toBe(403)
  })
})
