import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { processarAvisos } from '../server/servicos'
import { abrirAmbiente, ORIGEM, type Ambiente, type Cliente } from './apoio/ambiente'
import { CONTAS, popularDemonstracao } from './apoio/demo'
import { hojeSP, mesDe, somarDias } from '../shared/datas'

/* Testes dos critérios de aceite (CA01–CA16) contra a API real, num D1 local com o banco de demonstração. */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
const db = () => amb.db
const c: Record<string, Cliente> = {}
const hoje = hojeSP()
const mes = mesDe(hoje)

async function pessoaPorNome(nome: string) {
  const lista = (await c.admin.ok('GET', '/pessoas')) as unknown as J[]
  return lista.find((p) => p.nome.startsWith(nome))!
}

beforeAll(async () => {
  amb = await abrirAmbiente()
  await popularDemonstracao(amb)
  for (const [k, email] of Object.entries({
    admin: 'admin@demo.local',
    coord: 'coordenacao@demo.local',
    suporte: 'suporte@demo.local',
    mentora: 'mentora@demo.local',
  }))
    c[k] = await amb.entrar(CONTAS[email])
  c.beatriz = await amb.entrar(CONTAS['beatriz@demo.local'], 'portal')
  c.carla = await amb.entrar(CONTAS['carla@demo.local'], 'portal')
}, 180_000)

afterAll(async () => {
  await amb?.fechar()
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
    const p4 = pacotes.find((p) => p.nome === 'Modelo demonstrativo · 4 meses')!
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
      matricula: { data_inicio: hoje, responsavel_id: (await c.suporte.ok('GET', '/auth/eu')).id, itens_extras: [{ descricao: 'Encontro teste', quantidade: 2, duracao_min: 60, origem: 'pacote', profissional_id: (await c.admin.ok('GET', '/catalogos')).profissionais[0].id }] },
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
    const anon = amb.semLogin()
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
    await amb.reabrir()
    // Sessões do backoffice continuam valendo depois de reiniciar; uma nova também funciona.
    const novo = await amb.entrar(CONTAS['admin@demo.local'])
    const ficha = await novo.ok('GET', `/pessoas/${r.id}`)
    expect(ficha.pessoa.nome).toBe('Teste Persistência')
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
    const r = await c.admin.req('POST', '/pessoas', { nome: 'x' }, { semCabecalho: true })
    expect(r.status).toBe(403)
  })

  it('suporte não vê anotações pedagógicas privadas', async () => {
    const carla = await pessoaPorNome('Carla')
    await c.coord.ok('POST', `/matriculas/${(await c.admin.ok('GET', `/pessoas/${carla.id}`)).matriculas[0].id}/anotacoes`, { tipo: 'pedagogica', texto: 'Anotação pedagógica privada (teste)' })
    const r = await c.suporte.req('GET', `/pessoas/${carla.id}`)
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.corpo)).not.toContain('Anotação pedagógica privada')
  })

  it('o perfil Comercial não existe mais e não pode ser escolhido', async () => {
    const id = await amb.criarEquipe('comercial-novo@demo.local', 'Teste')
    const r = await c.admin.req('PUT', `/usuarios/${id}`, { perfil: 'comercial' })
    expect(r.status).toBe(400)
  })

  it('cada aluna recebe um ID sequencial na primeira matrícula e a lista segue o ID', async () => {
    const lista = (await c.admin.ok('GET', '/pessoas')) as unknown as J[]
    const codigos = lista.map((p) => p.codigo).filter((x) => x != null) as number[]
    expect(codigos).toEqual([...codigos].sort((a, b) => a - b))
    expect(new Set(codigos).size).toBe(codigos.length)
    const max = Math.max(...codigos)
    const nova = await c.admin.ok('POST', '/pessoas', { nome: 'Teste ID', matricula: { data_inicio: hoje, itens_extras: [] } })
    const ficha = await c.admin.ok('GET', `/pessoas/${nova.id}`)
    expect(ficha.pessoa.codigo).toBe(max + 1)
    // Renovação mantém o mesmo ID
    await c.admin.ok('POST', '/matriculas', { pessoa_id: nova.id, data_inicio: hoje, matricula_anterior_id: ficha.matriculas[0].id, itens_extras: [] })
    expect((await c.admin.ok('GET', `/pessoas/${nova.id}`)).pessoa.codigo).toBe(max + 1)
    const busca = (await c.admin.ok('GET', `/pessoas?busca=%23${String(max + 1).padStart(3, '0')}`)) as unknown as J[]
    expect(busca.map((p) => p.id)).toEqual([nova.id])
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

  it('a aluna anexa arquivos ao enviar uma atividade e só ela e a equipe conseguem baixá-los', async () => {
    const portal = await c.carla.ok('GET', '/portal')
    const atv = portal.jornada.etapas
      .filter((e: J) => e.situacao === 'liberada')
      .flatMap((e: J) => e.atividades)
      .find((a: J) => a.situacao === 'pendente' || a.situacao === 'em_execucao' || a.situacao === 'em_revisao')
    expect(atv).toBeTruthy()
    const subir = (cli: Cliente, nome: string, conteudo: string, semCabecalho = false) =>
      amb.api(
        new Request(`${ORIGEM}/api/ped/portal/atividades/${atv.id}/anexos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', Cookie: cli.cookie, Origin: ORIGEM, 'X-Nome-Arquivo': encodeURIComponent(nome), ...(semCabecalho ? {} : { 'X-CL-App': '1' }) },
          body: new TextEncoder().encode(conteudo),
        }),
      )
    expect((await subir(c.carla, 'virus.exe', 'MZ')).status).toBe(400)
    expect((await subir(c.carla, 'pagina.html', '<script>')).status).toBe(400)
    expect((await subir(c.carla, 'plano.pdf', '%PDF-1.4', true)).status).toBe(403) // CSRF
    expect((await subir(c.beatriz, 'plano.pdf', '%PDF-1.4')).status).toBe(404) // atividade de outra aluna
    const r = await subir(c.carla, 'Plano de ação ✓.pdf', '%PDF-1.4 teste')
    expect(r.status).toBe(201)
    const anexo = (await r.json()) as J
    // Ainda solto: ninguém baixa antes do envio ser concluído
    expect((await amb.api(new Request(`${ORIGEM}/api/ped/anexos/${anexo.id}`, { headers: { Cookie: c.admin.cookie } }))).status).toBe(404)
    await c.carla.ok('POST', `/portal/atividades/${atv.id}/evidencias`, { anexos: [anexo.id] })
    // Depois de enviada, a atividade não recebe arquivos novos
    const r2 = await subir(c.carla, 'outro.png', 'png')
    expect(r2.status).toBe(409)
    const baixar = (cli: Cliente, caminho: string) => amb.api(new Request(`${ORIGEM}/api/ped${caminho}/${anexo.id}`, { headers: { Cookie: cli.cookie } }))
    const propria = await baixar(c.carla, '/portal/anexos')
    expect(propria.status).toBe(200)
    expect(await propria.text()).toBe('%PDF-1.4 teste')
    expect(propria.headers.get('content-disposition')).toMatch(/^attachment;/)
    expect(propria.headers.get('content-type')).toBe('application/pdf')
    expect((await baixar(c.beatriz, '/portal/anexos')).status).toBe(404)
    expect((await baixar(c.beatriz, '/anexos')).status).toBe(403)
    expect((await baixar(c.coord, '/anexos')).status).toBe(200)
    // A equipe vê o anexo na fila de validações e na jornada
    const fila = await c.coord.ok('GET', '/validacoes/pendentes')
    const item = fila.atividades.find((a: J) => a.id === atv.id)
    expect(item.ultima_evidencia.anexos.map((x: J) => x.nome)).toEqual(['Plano de ação ✓.pdf'])
    expect(item.ultima_evidencia.anexos[0].conteudo).toBeUndefined()
  })

  describe('Portal da aluna, fase 1', () => {
    it('as migrations do pedagógico ficam registradas à parte e a turma vira cadastro', async () => {
      const versoes = (await db().all<J>('SELECT name FROM ped_migracoes ORDER BY id')).map((v) => v.name)
      expect(versoes).toEqual(['0001_ped_esquema.sql', '0002_ped_ajustes_reuniao_1111.sql', '0003_ped_planos_linha_do_tempo.sql', '0004_ped_avisos_email_whatsapp.sql'])
      // As matrículas da demonstração receberam uma das duas turmas cadastradas
      const turmas = (await db().get('SELECT COUNT(DISTINCT turma_id) AS n FROM ped_matriculas WHERE turma_id IS NOT NULL')) as J
      expect(turmas.n).toBe(2)
    })

    it('o Início mostra semana do programa, próximo passo, mentorias, atalhos, frases e metas', async () => {
      const ini = await c.beatriz.ok('GET', '/portal/inicio')
      expect(ini.semana).toBe(8) // matrícula começou há 50 dias
      expect(ini.proxima_etapa.numero).toBe(1)
      expect(ini.proxima_etapa.situacao).toBe('liberada')
      expect(ini.mentorias.total).toBeGreaterThan(0)
      expect(ini.mentorias.ultimas.length).toBeLessThanOrEqual(6)
      expect(ini.atalhos.length).toBe(3)
      expect(ini.frases.length).toBe(3)
      expect(ini.metas.map((m: J) => m.nome)).toContain('[Demo] Faturamento mensal')
      expect(ini.matricula.turma_nome).toMatch(/^Turma Demo/)
    })

    it('Meus Dados: a aluna muda contato e redes, mas não o nome nem o e-mail', async () => {
      await c.carla.ok('PUT', '/portal/perfil', { telefone: '(11) 90000-0000', instagram: '@carla.teste', nome: 'Outra', email: 'x@y.z' })
      const p = await c.carla.ok('GET', '/portal/perfil')
      expect(p.pessoa.instagram).toBe('@carla.teste')
      expect(p.pessoa.nome).toMatch(/^Carla/)
      expect(p.pessoa.email).toBe('carla@demo.local')
      expect((await c.carla.req('PUT', '/portal/perfil', { site: 'javascript:alert(1)' })).status).toBe(400)
    })

    it('Diagnóstico: cada aba é salva separadamente e o fim de ciclo só abre perto do fim', async () => {
      expect((await c.carla.req('PUT', '/portal/diagnostico/inicio/desafios', { respostas: { trava: '' } })).status).toBe(400)
      expect((await c.carla.req('PUT', '/portal/diagnostico/inicio/inventada', { respostas: {} })).status).toBe(404)
      await c.carla.ok('PUT', '/portal/diagnostico/inicio/desafios', { respostas: { trava: 'Falta de tempo (teste).', extra: 'ignorado' } })
      const d = await c.carla.ok('GET', '/portal/diagnostico')
      const desafios = d.respostas.find((r: J) => r.area === 'desafios' && r.versao === 'inicio')
      expect(desafios.conteudo).toEqual({ trava: 'Falta de tempo (teste).' })
      expect(d.fim_liberado).toBe(false)
      expect((await c.carla.req('PUT', '/portal/diagnostico/fim/desafios', { respostas: { trava: 'x' } })).status).toBe(409)
      // A equipe lê; a aluna não chega à rota da equipe
      const carla = await pessoaPorNome('Carla')
      const mid = (await c.admin.ok('GET', `/pessoas/${carla.id}`)).matriculas[0].id
      const visto = await c.coord.ok('GET', `/matriculas/${mid}/diagnostico`)
      expect(visto.respostas.some((r: J) => r.area === 'desafios')).toBe(true)
      expect((await c.carla.req('GET', `/matriculas/${mid}/diagnostico`)).status).toBe(403)
    })

    it('Metas: sempre com início e alvo, e uma aluna não mexe na meta de outra', async () => {
      expect((await c.carla.req('POST', '/portal/metas', { nome: 'Clientes', valor_inicial: 10, valor_alvo: 10 })).status).toBe(400)
      expect((await c.carla.req('POST', '/portal/metas', { nome: 'Clientes', valor_alvo: 20 })).status).toBe(400)
      const { id } = await c.carla.ok('POST', '/portal/metas', { nome: 'Clientes ativos', unidade: 'clientes', valor_inicial: 10, valor_alvo: 20, valor_atual: 12 })
      expect((await c.beatriz.req('PUT', `/portal/metas/${id}`, { nome: 'invasão', valor_inicial: 1, valor_alvo: 2 })).status).toBe(404)
      expect((await c.beatriz.req('DELETE', `/portal/metas/${id}`)).status).toBe(404)
      await c.carla.ok('DELETE', `/portal/metas/${id}`)
      const d = await c.carla.ok('GET', '/portal/diagnostico')
      expect(d.metas.some((m: J) => m.id === id)).toBe(false)
      expect(((await db().get('SELECT ativo FROM ped_metas WHERE id = ?', id)) as J).ativo).toBe(0) // só desativada
    })

    it('Avisos: ações da equipe geram aviso só para a aluna da matrícula', async () => {
      await c.beatriz.ok('POST', '/portal/notificacoes/lidas')
      await c.carla.ok('POST', '/portal/notificacoes/lidas')
      const beatriz = await pessoaPorNome('Beatriz')
      const mid = (await c.admin.ok('GET', `/pessoas/${beatriz.id}`)).matriculas[0].id
      const j = await c.admin.ok('GET', `/matriculas/${mid}/jornada`)
      const enviada = j.etapas.flatMap((e: J) => e.atividades).find((a: J) => a.situacao === 'enviada')
      await c.coord.ok('POST', `/atividades/${enviada.id}/validar`, { decisao: 'em_revisao', comentario: 'Detalhe um pouco mais (teste).' })
      const avisos = await c.beatriz.ok('GET', '/portal/notificacoes')
      expect(avisos.nao_lidas).toBe(1)
      expect(avisos.itens[0].titulo).toBe('A equipe pediu um ajuste')
      expect(avisos.itens[0].detalhe).not.toContain('Detalhe um pouco mais') // o comentário fica na jornada, não no aviso
      expect((await c.carla.ok('GET', '/portal/notificacoes')).nao_lidas).toBe(0)
      expect((await c.coord.req('GET', '/portal/notificacoes')).status).toBe(403)
    })

    it('Links do portal exigem endereço válido e aparecem para a aluna', async () => {
      expect((await c.admin.req('POST', '/catalogos/links', { titulo: 'Sem endereço' })).status).toBe(400)
      expect((await c.mentora.req('POST', '/catalogos/links', { titulo: 'x', url: 'https://example.com' })).status).toBe(403)
      const l = await c.beatriz.ok('GET', '/portal/links')
      expect(l.links.map((x: J) => x.titulo)).toContain('[Demo] Área de membros')
      expect(l.ajuda).toBeTruthy()
    })
  })

  describe('Administrativo, fase 1', () => {
    const opcao = async (lista: string, codigo: string) => ((await db().get('SELECT id FROM ped_opcoes_lista WHERE lista = ? AND codigo = ?', lista, codigo)) as J).id as string

    it('a migração 3 cria as listas e o estado inicial de cada aluna', async () => {
      const listas = ((await db().all('SELECT lista, COUNT(*) AS n FROM ped_opcoes_lista WHERE codigo IS NOT NULL GROUP BY lista')) as J[]).map((l) => `${l.lista}:${l.n}`)
      expect(listas).toEqual(expect.arrayContaining(['status_aluna:5', 'saude:3', 'engajamento:3']))
      const semEstado = (await db().get('SELECT COUNT(*) AS n FROM ped_pessoas p WHERE EXISTS (SELECT 1 FROM ped_matriculas m WHERE m.pessoa_id = p.id) AND (status_id IS NULL OR data_entrada IS NULL)')) as J
      expect(semEstado.n).toBe(0)
      const fernanda = (await db().get("SELECT status_id FROM ped_pessoas WHERE nome LIKE 'Fernanda%'")) as J
      expect(fernanda.status_id).toBe(await opcao('status_aluna', 'pausada')) // a matrícula está pausada
    })

    it('Suporte/CS vê todas as alunas; sem "ver todas", o perfil fica só com a carteira (regra na API)', async () => {
      const todas = (await c.admin.ok('GET', '/pessoas')) as unknown as J[]
      expect(((await c.suporte.ok('GET', '/pessoas')) as unknown as J[]).length).toBe(todas.length)
      // Se a Administração tirar "ver todas" do Suporte/CS, ele passa a ver só a carteira.
      await db().run("DELETE FROM ped_perfil_permissoes WHERE perfil = 'suporte' AND permissao = 'alunas:todas'")
      const carteira = (await c.suporte.ok('GET', '/pessoas')) as unknown as J[]
      const eu = await c.suporte.ok('GET', '/auth/eu')
      expect(carteira.length).toBeGreaterThan(0)
      expect(carteira.length).toBeLessThan(todas.length)
      expect(carteira.every((p) => p.responsavel_id === eu.id)).toBe(true)
      const fora = todas.find((p) => p.responsavel_id !== eu.id && p.matricula_atual)!
      expect((await c.suporte.req('GET', `/pessoas/${fora.id}`)).status).toBe(404)
      expect((await c.suporte.req('PUT', `/pessoas/${fora.id}/estado`, { em_risco: true })).status).toBe(404)
      const ficha = await c.admin.ok('GET', `/pessoas/${fora.id}`)
      expect((await c.suporte.req('GET', `/matriculas/${ficha.matriculas[0].id}/jornada`)).status).toBe(404)
      const painel = await c.suporte.ok('GET', '/painel/alunas')
      expect(painel.cards.total).toBe(carteira.filter((p) => p.matricula_atual).length)
      // Cadastrada pelo Suporte/CS, a aluna entra na carteira dele.
      const nova = await c.suporte.ok('POST', '/pessoas', { nome: 'Teste Carteira', empresa: 'Empresa Teste' })
      expect((await c.suporte.ok('GET', `/pessoas/${nova.id}`)).pessoa.responsavel_id).toBe(eu.id)
      await db().run("INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'alunas:todas')")
    })

    it('estado da aluna só aceita opções da lista certa e fica no histórico', async () => {
      const carla = await pessoaPorNome('Carla')
      expect((await c.admin.req('PUT', `/pessoas/${carla.id}/estado`, { saude_id: await opcao('engajamento', 'alto') })).status).toBe(400)
      expect((await c.mentora.req('PUT', `/pessoas/${carla.id}/estado`, { em_risco: true })).status).toBe(403)
      await c.admin.ok('PUT', `/pessoas/${carla.id}/estado`, {
        status_id: carla.status_id, saude_id: await opcao('saude', 'critico'), engajamento_id: await opcao('engajamento', 'baixo'), em_risco: true, responsavel_id: carla.responsavel_id, data_entrada: carla.data_entrada,
      })
      const f = await c.admin.ok('GET', `/pessoas/${carla.id}`)
      expect(f.pessoa.em_risco).toBe(1)
      expect(f.pessoa.saude_id).toBe(await opcao('saude', 'critico'))
      expect(f.auditoria.some((a: J) => a.acao === 'estado_atualizado')).toBe(true)
    })

    it('o status acompanha a matrícula: pausar e retomar', async () => {
      const beatriz = await pessoaPorNome('Beatriz')
      const mid = (await c.admin.ok('GET', `/pessoas/${beatriz.id}`)).matriculas[0].id
      const pausa = await c.admin.ok('POST', `/matriculas/${mid}/pausas`, { inicio: hoje, motivo: 'Teste de status' })
      expect((await pessoaPorNome('Beatriz')).status_id).toBe(await opcao('status_aluna', 'pausada'))
      await c.admin.ok('POST', `/pausas/${pausa.id}/encerrar`, { fim: hoje })
      expect((await pessoaPorNome('Beatriz')).status_id).toBe(await opcao('status_aluna', 'ativa'))
    })

    it('listas configuráveis: cada lista é separada e só quem configura edita', async () => {
      const novo = await c.admin.ok('POST', '/catalogos/segmentos', { nome: 'Segmento teste', cor: 'info' })
      const cat = await c.admin.ok('GET', '/catalogos')
      expect(cat.segmentos.some((o: J) => o.id === novo.id && o.lista === 'segmento')).toBe(true)
      expect(cat.saude.some((o: J) => o.id === novo.id)).toBe(false)
      expect((await c.admin.req('PUT', `/catalogos/saude/${novo.id}`, { nome: 'x' })).status).toBe(404) // id de outra lista
      expect((await c.admin.req('POST', '/catalogos/segmentos', { nome: 'x', cor: 'roxo' })).status).toBe(400)
      expect((await c.mentora.req('POST', '/catalogos/segmentos', { nome: 'x' })).status).toBe(403)
      expect((await c.admin.req('POST', '/pessoas', { nome: 'Segmento errado', segmento_id: await opcao('saude', 'critico') })).status).toBe(400)
    })

    it('painel da Visão Geral conta alunas e agrupa por estado, segmento, responsável, canal e turma', async () => {
      const p = await c.admin.ok('GET', '/painel/alunas')
      const comMatricula = ((await c.admin.ok('GET', '/pessoas')) as unknown as J[]).filter((x) => x.matricula_atual)
      expect(p.cards.total).toBe(comMatricula.length)
      for (const g of ['por_status', 'por_segmento', 'por_responsavel', 'por_canal', 'por_turma'])
        expect(p[g].reduce((t: number, x: J) => t + x.quantidade, 0)).toBe(p.cards.total)
      expect(p.por_responsavel.some((x: J) => x.nome === 'Sem responsável')).toBe(true)
    })

    it('campos visíveis: dados internos nunca podem ir para o portal', async () => {
      expect((await c.admin.req('PUT', '/campos-visibilidade', { saude: true })).status).toBe(400)
      expect((await c.admin.req('PUT', '/campos-visibilidade', { inventado: true })).status).toBe(400)
      await c.admin.ok('PUT', '/campos-visibilidade', { empresa: false })
      expect(((await db().get("SELECT visivel_aluna FROM ped_campos_visibilidade WHERE campo = 'empresa'")) as J).visivel_aluna).toBe(0)
      await c.admin.ok('PUT', '/campos-visibilidade', { empresa: true })
    })
  })

  describe('Avisos da equipe para as alunas', () => {
    it('aviso imediato chega só à aluna escolhida, e o link só pode ser do portal', async () => {
      await c.beatriz.ok('POST', '/portal/notificacoes/lidas')
      await c.carla.ok('POST', '/portal/notificacoes/lidas')
      const beatriz = await pessoaPorNome('Beatriz')
      expect((await c.mentora.req('POST', '/avisos', { publico: 'aluna', pessoa_id: beatriz.id, titulo: 'x' })).status).toBe(403)
      expect((await c.admin.req('POST', '/avisos', { publico: 'aluna', pessoa_id: beatriz.id, titulo: 'x', link: 'https://exemplo.com' })).status).toBe(400)
      expect((await c.admin.req('POST', '/avisos', { publico: 'turma', titulo: 'x' })).status).toBe(400)
      const r = await c.suporte.ok('POST', '/avisos', { publico: 'aluna', pessoa_id: beatriz.id, titulo: 'Lembrete da mentoria', detalhe: 'Traga suas dúvidas.', link: '#/mentorias' })
      expect(r.envios).toBe(1)
      const b = await c.beatriz.ok('GET', '/portal/notificacoes')
      expect(b.itens[0].titulo).toBe('Lembrete da mentoria')
      expect(b.itens[0].link).toBe('#/mentorias')
      expect((await c.carla.ok('GET', '/portal/notificacoes')).nao_lidas).toBe(0)
    })

    it('aviso recorrente: repete na data certa, não manda atrasados em lote, respeita o fim e pode ser pausado', async () => {
      const r = await c.admin.ok('POST', '/avisos', { publico: 'ativas', titulo: 'Preencha sua rotina', inicio: `${somarDias(hoje, 1)}T08:00`, recorrencia: 'semanal', fim: somarDias(hoje, 15) })
      expect(r.envios).toBe(0) // programado para amanhã
      const destinos = (await c.admin.ok('GET', '/avisos')).find((a: J) => a.id === r.id).destinatarias
      expect(destinos).toBeGreaterThan(1)
      const conta = async () => ((await db().get('SELECT COUNT(*) AS n FROM ped_notificacoes WHERE aviso_id = ?', r.id)) as J).n
      await processarAvisos(db(), `${somarDias(hoje, 1)}T08:00`)
      expect(await conta()).toBe(destinos)
      // Muito tempo depois: entrega uma vez só e marca o próximo depois de "agora"; passou do fim, encerra.
      await processarAvisos(db(), `${somarDias(hoje, 9)}T09:00`)
      expect(await conta()).toBe(destinos * 2)
      let a = (await db().get('SELECT * FROM ped_avisos_programados WHERE id = ?', r.id)) as J
      expect(a.proximo_envio).toBe(`${somarDias(hoje, 15)}T08:00`)
      await c.admin.ok('POST', `/avisos/${r.id}/ativo`, { ativo: false })
      await processarAvisos(db(), `${somarDias(hoje, 15)}T08:00`)
      expect(await conta()).toBe(destinos * 2) // pausado não envia
      await c.admin.ok('POST', `/avisos/${r.id}/ativo`, { ativo: true })
      await processarAvisos(db(), `${somarDias(hoje, 15)}T08:00`)
      expect(await conta()).toBe(destinos * 3)
      a = (await db().get('SELECT * FROM ped_avisos_programados WHERE id = ?', r.id)) as J
      expect(a.ativo).toBe(0) // o próximo passaria do fim
    })
  })
})
