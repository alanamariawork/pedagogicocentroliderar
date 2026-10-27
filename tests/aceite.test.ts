import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { abrirBanco, type BD } from '../server/db'
import { criarApp } from '../server/app'
import { popularDemonstracao, SENHA_DEMO } from '../server/demo'
import { hojeSP, mesDe, somarDias } from '../shared/datas'

/* Testes dos critérios de aceite (CA01–CA16) contra a API real, com o banco de demonstração. */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

class Cliente {
  cookie = ''
  constructor(private base: string) {}
  async req(metodo: string, caminho: string, corpo?: unknown, semCabecalho = false) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Cookie: this.cookie }
    if (!semCabecalho) headers['X-Requested-With'] = 'efeito-diamante'
    const r = await fetch(this.base + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
    const set = r.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0]
    return { status: r.status, corpo: (await r.json().catch(() => ({}))) as J, texto: '' }
  }
  async ok(metodo: string, caminho: string, corpo?: unknown) {
    const r = await this.req(metodo, caminho, corpo)
    if (r.status >= 400) throw new Error(`${metodo} ${caminho} → ${r.status} ${r.corpo.erro}`)
    return r.corpo
  }
  entrar(email: string) {
    return this.ok('POST', '/auth/login', { email, senha: SENHA_DEMO })
  }
}

let dir: string
let caminhoBanco: string
let db: BD
let servidor: Server
let base: string
const c: Record<string, Cliente> = {}
const hoje = hojeSP()
const mes = mesDe(hoje)

async function pessoaPorNome(nome: string) {
  const lista = (await c.admin.ok('GET', '/pessoas')) as unknown as J[]
  return lista.find((p) => p.nome.startsWith(nome))!
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ed-teste-'))
  caminhoBanco = join(dir, 'teste.db')
  db = abrirBanco(caminhoBanco)
  await popularDemonstracao(db)
  servidor = criarApp(db).listen(0, '127.0.0.1')
  await new Promise((ok) => servidor.once('listening', ok))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`
  for (const [k, email] of Object.entries({
    admin: 'admin@demo.local',
    coord: 'coordenacao@demo.local',
    suporte: 'suporte@demo.local',
    comercial: 'comercial@demo.local',
    mentora: 'mentora@demo.local',
    beatriz: 'beatriz@demo.local',
    carla: 'carla@demo.local',
  })) {
    c[k] = new Cliente(base)
    await c[k].entrar(email)
  }
}, 60_000)

afterAll(() => {
  servidor?.close()
  db?.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('Critérios de aceite', () => {
  it('CA01 — renovação preserva histórico e a pessoa é contada uma vez', async () => {
    const elisa = await pessoaPorNome('Elisa')
    const ficha = await c.admin.ok('GET', `/pessoas/${elisa.id}`)
    expect(ficha.matriculas).toHaveLength(2)
    const anterior = ficha.matriculas.find((m: J) => m.situacao === 'encerrada')
    const nova = ficha.matriculas.find((m: J) => m.matricula_anterior_id === anterior.id)
    expect(nova).toBeTruthy()
    expect(anterior.ocorrencias.filter((o: J) => o.situacao === 'realizada')).toHaveLength(8) // histórico intacto

    const antes = (await c.admin.ok('GET', '/visao-geral')).indicadores
    // Uma segunda matrícula ATIVA para a mesma pessoa: +1 matrícula, mesma quantidade de pessoas.
    const daniela = await pessoaPorNome('Daniela')
    await c.admin.ok('POST', '/matriculas', { pessoa_id: daniela.id, data_inicio: hoje, data_fim: somarDias(hoje, 120), itens_extras: [] })
    const depois = (await c.admin.ok('GET', '/visao-geral')).indicadores
    expect(depois.matriculas_ativas).toBe(antes.matriculas_ativas + 1)
    expect(depois.pessoas_ativas).toBe(antes.pessoas_ativas)
  })

  it('CA02 — duas matrículas com a mesma duração podem ter quantidades diferentes', async () => {
    const r = await c.admin.ok('POST', '/pessoas', {
      nome: 'Teste Mesma Duração',
      matricula: {
        data_inicio: hoje,
        data_fim: somarDias(hoje, 182),
        itens_extras: [{ descricao: 'Tutoria', quantidade: 2, duracao_min: 45, origem: 'pacote' }],
      },
    })
    const ficha = await c.admin.ok('GET', `/pessoas/${r.id}`)
    const carla = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Carla')).id}`)
    const tutCarla = carla.matriculas[0].itens.find((i: J) => i.descricao === 'Tutoria')
    expect(tutCarla.contratada).toBe(4)
    expect(ficha.matriculas[0].itens[0].contratada).toBe(2)
  })

  it('CA03 — editar o modelo de pacote não altera matrículas existentes', async () => {
    const pacotes = (await c.admin.ok('GET', '/pacotes')) as unknown as J[]
    const p4 = pacotes.find((p) => p.nome.includes('4 meses'))!
    const beatriz = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Beatriz')).id}`)
    const mat = beatriz.matriculas.find((m: J) => m.pacote_origem_id === p4.id)
    const antes = mat.itens.find((i: J) => i.descricao === 'Tutoria').contratada
    await c.admin.ok('PUT', `/pacotes/${p4.id}`, { ...p4, itens: p4.itens.map((i: J) => ({ ...i, quantidade: i.quantidade + 5 })) })
    const depois = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Beatriz')).id}`)
    expect(depois.matriculas.find((m: J) => m.id === mat.id).itens.find((i: J) => i.descricao === 'Tutoria').contratada).toBe(antes)
  })

  it('CA04 — painel mensal lista quem precisa de encontro e calcula a demanda por profissional', async () => {
    const painel = await c.admin.ok('GET', `/painel/mes?mes=${mes}`)
    const todos = [...painel.grupos.previstos, ...painel.grupos.agendados, ...painel.grupos.anteriores]
    expect(todos.some((o: J) => o.pessoa_nome.startsWith('Carla'))).toBe(true)
    // IN03: soma das durações de previstos + agendados não realizados
    const esperado = [...painel.grupos.previstos, ...painel.grupos.agendados].reduce((t: number, o: J) => t + (o.duracao_efetiva ?? 0), 0)
    expect(painel.totais.demanda_mes.minutos).toBe(esperado)
    // IN06 por profissional: devidas sem reserva
    const tut = painel.capacidade.profissionais.find((p: J) => p.profissional_nome.startsWith('Mentora de Tutoria'))
    const devidas = [...painel.grupos.previstos, ...painel.grupos.anteriores].filter((o: J) => o.profissional_efetivo_id === tut.profissional_id && !o.reserva_id)
    expect(tut.demanda_sem_agendamento_min).toBe(devidas.reduce((t: number, o: J) => t + (o.duracao_efetiva ?? 0), 0))
    expect(tut.saldo_min).toBe(tut.livre_min - tut.demanda_sem_agendamento_min)
    // Vencida mostra motivo e quem deve agir
    const vencida = [...painel.grupos.previstos, ...painel.grupos.anteriores].find((o: J) => o.pessoa_nome.startsWith('Carla') && o.atraso.tipo === 'vencida')
    expect(vencida.atraso.tipo).toBe('vencida')
    expect(vencida.impedimento_motivo).toBe('Aguardando resposta da aluna')
    expect(vencida.impedimento_responsavel_nome).toBe('Suporte CS (demo)')
  })

  it('CA05 — é possível agendar mesmo com atividades pedagógicas pendentes', async () => {
    const beatriz = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Beatriz')).id}`)
    const mat = beatriz.matriculas.find((m: J) => m.itens.length > 1)
    const jornada = await c.admin.ok('GET', `/matriculas/${mat.id}/jornada`)
    const pendentes = jornada.etapas.flatMap((e: J) => e.atividades).filter((a: J) => a.situacao === 'pendente')
    expect(pendentes.length).toBeGreaterThan(0)
    const tut = mat.ocorrencias.find((o: J) => o.item_descricao === 'Tutoria' && o.situacao === 'prevista')
    const agenda = await c.admin.ok('GET', `/agenda?de=${hoje}&ate=${somarDias(hoje, 60)}&profissional_id=${tut.profissional_efetivo_id}`)
    const ocupados = new Set(agenda.reservas.map((r: J) => r.inicio))
    const livre = agenda.disponibilidades.find((d: J) => !ocupados.has(d.inicio) && d.inicio.slice(0, 10) > hoje)
    const r = await c.suporte.req('POST', `/ocorrencias/${tut.id}/agendar`, { inicio: livre.inicio })
    expect(r.status).toBe(200)
  })

  it('CA06 — reagendar preserva data anterior, motivo e autor, sem duplicar a obrigação', async () => {
    const beatriz = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Beatriz')).id}`)
    const mat = beatriz.matriculas.find((m: J) => m.itens.length > 1)
    const plano = mat.ocorrencias.find((o: J) => o.item_descricao.startsWith('Plano') && o.situacao === 'agendada')
    const h = plano.historico.find((x: J) => x.tipo === 'reagendada')
    expect(h.valor_anterior).toBeTruthy()
    expect(h.valor_novo).toBe(plano.data_agendada)
    expect(h.motivo).toContain('Aluna pediu')
    expect(h.autor_nome).toBe('Admin (demo)')
    expect(h.previsao_original).toBeTruthy()
    const item = mat.itens.find((i: J) => i.id === plano.item_id)
    expect(mat.ocorrencias.filter((o: J) => o.item_id === item.id && o.situacao !== 'cancelada')).toHaveLength(item.contratada)
  })

  it('CA07 — duas tentativas simultâneas não reservam o mesmo horário', async () => {
    const r = await c.admin.ok('POST', '/pessoas', {
      nome: 'Teste Concorrência',
      matricula: { data_inicio: hoje, itens_extras: [{ descricao: 'Encontro teste', quantidade: 2, duracao_min: 60, origem: 'pacote', profissional_id: (await c.admin.ok('GET', '/catalogos')).profissionais[0].id }] },
    })
    const ficha = await c.admin.ok('GET', `/pessoas/${r.id}`)
    const [o1, o2] = ficha.matriculas[0].ocorrencias
    const inicio = `${somarDias(hoje, 3)}T07:00`
    const [a, b] = await Promise.all([
      c.admin.req('POST', `/ocorrencias/${o1.id}/agendar`, { inicio, fora_disponibilidade: true, motivo: 'teste' }),
      c.suporte.req('POST', `/ocorrencias/${o2.id}/agendar`, { inicio, fora_disponibilidade: true, motivo: 'teste' }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    // Sobreposição parcial também é recusada
    const c3 = await c.admin.req('POST', `/ocorrencias/${(a.status === 200 ? o2 : o1).id}/agendar`, { inicio: `${somarDias(hoje, 3)}T07:30`, fora_disponibilidade: true, motivo: 'teste' })
    expect(c3.status).toBe(409)
  })

  it('CA08 — pré-requisito pedagógico e item não contratado aparecem de forma distinta', async () => {
    const portal = await c.beatriz.ok('GET', '/portal')
    const bloqueada = portal.jornada.etapas.find((e: J) => e.situacao === 'bloqueada')
    expect(bloqueada.falta.length).toBeGreaterThan(0)
    expect(portal.nao_incluidos.map((t: J) => t.nome)).toContain('Análise de posicionamento')
    expect(portal.nao_incluidos.some((t: J) => 'falta' in t)).toBe(false)
  })

  it('CA09 — só perfil autorizado valida avanço e exceções ficam registradas', async () => {
    const carla = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Carla')).id}`)
    const mid = carla.matriculas[0].id
    const jornada = await c.admin.ok('GET', `/matriculas/${mid}/jornada`)
    const bloqueada = jornada.etapas.find((e: J) => e.situacao === 'bloqueada' && e.requisitos.length > 0)
    expect((await c.suporte.req('POST', `/jornada-etapas/${bloqueada.id}/liberar`, {})).status).toBe(403)
    expect((await c.mentora.req('POST', `/jornada-etapas/${bloqueada.id}/liberar`, { justificativa: 'x' })).status).toBe(403)
    const semJust = await c.coord.req('POST', `/jornada-etapas/${bloqueada.id}/liberar`, {})
    expect(semJust.status).toBe(400)
    await c.coord.ok('POST', `/jornada-etapas/${bloqueada.id}/liberar`, { justificativa: 'Aluna já domina o conteúdo anterior (teste).' })
    const depois = await c.admin.ok('GET', `/matriculas/${mid}/jornada`)
    const v = depois.etapas.find((e: J) => e.id === bloqueada.id).validacoes[0]
    expect(v.excecao).toBe(1)
    expect(v.justificativa).toContain('teste')
    // Concluir tarefas não libera a etapa seguinte sozinho
    const atividade = depois.etapas.find((e: J) => e.situacao === 'liberada').atividades[0]
    await c.carla.ok('POST', `/portal/atividades/${atividade.id}/evidencias`, { texto: 'feito' })
    const j3 = await c.admin.ok('GET', `/matriculas/${mid}/jornada`)
    expect(j3.etapas.filter((e: J) => e.situacao === 'liberada').length).toBe(depois.etapas.filter((e: J) => e.situacao === 'liberada').length)
  })

  it('CA10 — a aluna vê o próximo passo e não acessa dados de outra pessoa', async () => {
    const portal = await c.beatriz.ok('GET', '/portal')
    expect(portal.nome).toMatch(/^Beatriz/)
    expect(portal.proximo_passo).toBeTruthy()
    const carla = await pessoaPorNome('Carla')
    expect((await c.beatriz.req('GET', `/pessoas/${carla.id}`)).status).toBe(403)
    expect((await c.beatriz.req('GET', '/pessoas')).status).toBe(403)
    expect((await c.beatriz.req('GET', '/painel/mes')).status).toBe(403)
    const fichaCarla = await c.admin.ok('GET', `/pessoas/${carla.id}`)
    const jCarla = await c.admin.ok('GET', `/matriculas/${fichaCarla.matriculas[0].id}/jornada`)
    const atvCarla = jCarla.etapas.flatMap((e: J) => e.atividades)[0]
    expect((await c.beatriz.req('POST', `/portal/atividades/${atvCarla.id}/evidencias`, { texto: 'invasão' })).status).toBe(404)
    expect((await c.beatriz.req('GET', `/matriculas/${fichaCarla.matriculas[0].id}/jornada`)).status).toBe(403)
    // Sem sessão
    const anon = new Cliente(base)
    expect((await anon.req('GET', '/portal')).status).toBe(401)
  })

  it('CA11 — pausar não muda vigência nem previsões sem decisão explícita', async () => {
    const fernanda = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Fernanda')).id}`)
    const m = fernanda.matriculas[0]
    expect(m.situacao).toBe('pausada')
    expect(m.pausas[0].decisao_prazos).toBe('pendente')
    const auditoriaVigencia = fernanda.auditoria.filter((a: J) => a.acao === 'vigencia_alterada')
    expect(auditoriaVigencia).toHaveLength(0)
    expect(m.ocorrencias.every((o: J) => o.historico.every((h: J) => h.tipo !== 'previsao_alterada'))).toBe(true)
    // Decisão explícita de estender: registra autor e altera prazos de forma rastreável
    await c.coord.ok('POST', `/pausas/${m.pausas[0].id}/decisao`, { decisao: 'estender', dias_extensao: 20, mover_previsoes: true, justificativa: 'Teste de decisão' })
    const depois = (await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Fernanda')).id}`)).matriculas[0]
    expect(depois.data_fim).toBe(somarDias(m.data_fim, 20))
    expect(depois.pausas[0].decidido_por_nome).toBe('Coordenação (demo)')
  })

  it('CA12 — contatos e reagendamentos não multiplicam encontros nem horas', async () => {
    const antes = await c.admin.ok('GET', `/painel/mes?mes=${mes}`)
    const carla = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Carla')).id}`)
    const vencida = carla.matriculas[0].ocorrencias.find((o: J) => o.impedimento_motivo === 'Aguardando resposta da aluna')
    for (let i = 0; i < 3; i++)
      await c.suporte.ok('POST', '/contatos', { matricula_id: carla.matriculas[0].id, ocorrencia_id: vencida.id, data: hoje, canal: 'telefone', resultado: 'sem_resposta' })
    const depois = await c.admin.ok('GET', `/painel/mes?mes=${mes}`)
    expect(depois.totais).toEqual(antes.totais)
    expect(depois.capacidade.profissionais.map((p: J) => p.demanda_sem_agendamento_min)).toEqual(antes.capacidade.profissionais.map((p: J) => p.demanda_sem_agendamento_min))
  })

  it('CA13 — "Realizado" exige data real e rejeita data futura', async () => {
    const daniela = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Daniela')).id}`)
    const o = daniela.matriculas.flatMap((m: J) => m.ocorrencias).find((x: J) => x.situacao === 'prevista')
    expect((await c.coord.req('POST', `/ocorrencias/${o.id}/realizar`, { data_realizada: somarDias(hoje, 1) })).status).toBe(400)
    expect((await c.coord.req('POST', `/ocorrencias/${o.id}/realizar`, {})).status).toBe(400)
    expect((await c.coord.req('POST', `/ocorrencias/${o.id}/realizar`, { data_realizada: '2026-02-30' })).status).toBe(400)
  })

  it('CA14 — a aluna vê a conquista autorizada e não vê notas internas', async () => {
    const r = await c.beatriz.req('GET', '/portal')
    expect(r.corpo.conquistas.map((x: J) => x.titulo)).toContain('Conduzi minha primeira reunião de equipe')
    const texto = JSON.stringify(r.corpo)
    expect(texto).not.toContain('notas_internas')
    expect(texto).not.toContain('Nota interna de demonstração')
    expect(texto).not.toContain('diagnostico_operacional')
  })

  it('CA15 — dados salvos permanecem após reiniciar o servidor e iniciar nova sessão', async () => {
    const r = await c.admin.ok('POST', '/pessoas', { nome: 'Teste Persistência' })
    servidor.close()
    db.close()
    db = abrirBanco(caminhoBanco)
    servidor = criarApp(db).listen(0, '127.0.0.1')
    await new Promise((ok) => servidor.once('listening', ok))
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`
    const novo = new Cliente(base)
    await novo.entrar('admin@demo.local')
    const ficha = await novo.ok('GET', `/pessoas/${r.id}`)
    expect(ficha.pessoa.nome).toBe('Teste Persistência')
    for (const k of Object.keys(c)) {
      const cookie = c[k].cookie
      c[k] = new Cliente(base)
      c[k].cookie = cookie // sessão anterior continua válida após reiniciar
    }
    expect((await c.coord.req('GET', '/auth/eu')).status).toBe(200)
  })

  it('CA16 — registros sem duração ou previsão aparecem como incompletos', async () => {
    const painel = await c.admin.ok('GET', `/painel/mes?mes=${mes}`)
    const semDur = [...painel.grupos.previstos, ...painel.grupos.agendados].find((o: J) => o.item_descricao === 'Análise de posicionamento')
    expect(semDur.duracao_efetiva).toBeNull()
    expect(semDur.incompleto).toContain('sem duração')
    expect(painel.totais.demanda_mes.sem_duracao).toBeGreaterThanOrEqual(1)
    expect(painel.grupos.sem_previsao.some((o: J) => o.pessoa_nome.startsWith('Daniela'))).toBe(true)
    expect(painel.grupos.sem_previsao.every((o: J) => o.atraso.tipo === 'sem_previsao')).toBe(true)
  })
})

describe('Permissões e segurança', () => {
  it('recusa alterações sem o cabeçalho do app (CSRF)', async () => {
    const r = await c.admin.req('POST', '/pessoas', { nome: 'x' }, true)
    expect(r.status).toBe(403)
  })

  it('comercial não vê notas internas nem anotações pedagógicas', async () => {
    const carla = await pessoaPorNome('Carla')
    await c.coord.ok('POST', `/matriculas/${(await c.admin.ok('GET', `/pessoas/${carla.id}`)).matriculas[0].id}/anotacoes`, { tipo: 'pedagogica', texto: 'Anotação pedagógica privada (teste)' })
    const r = await c.comercial.req('GET', `/pessoas/${carla.id}`)
    const texto = JSON.stringify(r.corpo)
    expect(texto).not.toContain('Anotação pedagógica privada')
    expect(texto).not.toContain('Nota interna de demonstração')
    expect(texto).toContain('condicoes_comerciais')
  })

  it('mentora só vê matrículas em que atende', async () => {
    const r = await c.admin.ok('POST', '/pessoas', { nome: 'Teste Sem Mentora', matricula: { data_inicio: hoje, itens_extras: [{ descricao: 'Encontro de outra profissional', quantidade: 1, origem: 'pacote' }] } })
    const lista = (await c.mentora.ok('GET', '/pessoas')) as unknown as J[]
    expect(lista.some((p) => p.id === r.id)).toBe(false)
    expect(lista.some((p) => p.nome.startsWith('Carla'))).toBe(true)
    expect((await c.mentora.req('GET', `/pessoas/${r.id}`)).status).toBe(404)
    expect((await c.mentora.req('GET', `/matriculas/${r.matricula_id}/jornada`)).status).toBe(404)
  })

  it('impede dependência circular entre etapas', async () => {
    const modelo = await c.coord.ok('GET', '/pedagogico/modelo')
    const [a, b] = modelo.etapas.filter((e: J) => e.trilha_id === modelo.trilhas[0].id).sort((x: J, y: J) => x.ordem - y.ordem)
    const r = await c.coord.req('PUT', `/etapas/${a.id}`, { ...a, ativo: !!a.ativo, prerequisitos: [b.id], atividades_modelo: [] })
    expect(r.status).toBe(400)
    expect(r.corpo.erro).toContain('circular')
  })

  it('desmarcar libera o horário e não reduz a obrigação', async () => {
    const elisa = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Elisa')).id}`)
    const nova = elisa.matriculas.find((m: J) => m.matricula_anterior_id)
    const ag = nova.ocorrencias.find((o: J) => o.situacao === 'agendada')
    const item = nova.itens.find((i: J) => i.id === ag.item_id)
    await c.suporte.ok('POST', `/ocorrencias/${ag.id}/desmarcar`, { motivo: 'Teste' })
    const depois = (await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Elisa')).id}`)).matriculas.find((m: J) => m.id === nova.id)
    expect(depois.itens.find((i: J) => i.id === item.id).restantes).toBe(item.restantes)
    expect(depois.ocorrencias.find((o: J) => o.id === ag.id).situacao).toBe('aguardando_agenda')
    const agenda = await c.admin.ok('GET', `/agenda?de=${ag.data_agendada.slice(0, 10)}&ate=${ag.data_agendada.slice(0, 10)}`)
    expect(agenda.reservas.some((r: J) => r.ocorrencia_id === ag.id)).toBe(false)
  })

  it('transferência na renovação não duplica a obrigação', async () => {
    const elisa = await c.admin.ok('GET', `/pessoas/${(await pessoaPorNome('Elisa')).id}`)
    const anterior = elisa.matriculas.find((m: J) => m.situacao === 'encerrada')
    const plano = anterior.itens.find((i: J) => i.descricao.startsWith('Plano'))
    expect(plano.contratada).toBe(4) // 5 contratados − 1 transferido
    expect(plano.restantes).toBe(0)
    const nova = elisa.matriculas.find((m: J) => m.matricula_anterior_id)
    expect(nova.itens.find((i: J) => i.origem === 'ajuste').contratada).toBe(1)
  })
})
