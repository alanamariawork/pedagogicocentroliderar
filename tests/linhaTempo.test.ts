import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, type Ambiente, type Cliente } from './apoio/ambiente'
import { hojeSP, somarDias, somarMeses } from '../shared/datas'
import { mesesDoPlano, progressoDoMes } from '../shared/linhaTempo'

/*
 * Planos oficiais do Diamante Business (4, 6 e 12 meses, migration 0003) e linha do tempo do Início:
 * meses do plano com início e encerramento e barra de progresso pelas aulas assistidas. Dados fictícios.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
const c: Record<string, Cliente> = {}
const h = hojeSP()

beforeAll(async () => {
  amb = await abrirAmbiente()
  const coord = await amb.criarEquipe('coord.lt@ficticio.local', 'Coordenação Fictícia', { perfil: 'coordenacao' })
  c.coord = await amb.entrar(coord)
}, 240_000)

afterAll(async () => {
  await amb?.fechar()
})

describe('Meses do plano', () => {
  it('4 meses de 15/10/2026 a 14/02/2027, cada mês até a véspera do mesmo dia', () => {
    const m = mesesDoPlano('2026-10-15', '2027-02-14', '2026-11-12')
    expect(m.map((x) => [x.numero, x.inicio, x.fim, x.situacao])).toEqual([
      [1, '2026-10-15', '2026-11-14', 'atual'],
      [2, '2026-11-15', '2026-12-14', 'futuro'],
      [3, '2026-12-15', '2027-01-14', 'futuro'],
      [4, '2027-01-15', '2027-02-14', 'futuro'],
    ])
  })
  it('o último mês termina no encerramento do contrato, mesmo que seja antes; mês passado fica concluído', () => {
    const m = mesesDoPlano('2026-10-15', '2027-01-03', '2026-12-01')
    expect(m.at(-1)).toMatchObject({ numero: 3, inicio: '2026-12-15', fim: '2027-01-03' })
    expect(m[0].situacao).toBe('concluido')
    expect(m[1].situacao).toBe('atual')
  })
  it('sobra de poucos dias no fim entra no último mês (não vira um mês de 1 dia)', () => {
    const m = mesesDoPlano('2026-09-23', '2027-01-23', '2026-11-12')
    expect(m).toHaveLength(4)
    expect(m.at(-1)).toMatchObject({ inicio: '2026-12-23', fim: '2027-01-23' })
  })
  it('início no dia 31 não pula meses; sem datas não há linha do tempo', () => {
    expect(mesesDoPlano('2027-01-31', '2027-04-29', '2027-01-31').map((x) => x.inicio)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
    expect(mesesDoPlano(null, '2027-01-01', h)).toEqual([])
    expect(mesesDoPlano('2026-01-01', null, h)).toEqual([])
  })
  it('progresso: aula a partir de 90% conta inteira; mês sem aula não contabiliza', () => {
    expect(progressoDoMes([100, 0, 0, 0])).toBe(25)
    expect(progressoDoMes([92, 50])).toBe(75)
    expect(progressoDoMes([])).toBeNull()
  })
})

describe('Planos oficiais do Diamante Business', () => {
  const total = (itens: J[], origem = 'pacote') => itens.filter((i) => i.origem === origem).reduce((s, i) => s + i.quantidade, 0)
  it('4, 6 e 12 meses com 25, 35 e 67 encontros, mais os 4 bônus', async () => {
    const pacotes = (await c.coord.get('/pacotes')) as J[]
    for (const [meses, encontros, jaciara] of [[4, 25, 2], [6, 35, 3], [12, 67, 5]]) {
      const p = pacotes.find((x) => x.nome === `Diamante Business — ${meses} meses de acompanhamento`)
      expect(p, `plano de ${meses} meses`).toBeTruthy()
      expect(p!.duracao_meses).toBe(meses)
      expect(total(p!.itens)).toBe(encontros)
      expect(total(p!.itens, 'bonus')).toBe(4)
      const ind = p!.itens.find((i: J) => i.descricao === 'Mentorias individuais com Jaciara Mendes')
      expect(ind).toMatchObject({ quantidade: jaciara, profissional_nome: 'Jaciara Mendes' })
      expect(p!.itens.find((i: J) => i.descricao.startsWith('Análise individual do Modelo de Negócio'))).toMatchObject({ quantidade: 1, profissional_nome: 'Thallyta Medeiros' })
      expect(p!.itens.every((i: J) => i.tipo_id)).toBe(true)
    }
    const quatro = pacotes.find((x) => x.duracao_meses === 4 && x.nome.startsWith('Diamante Business'))!
    expect(quatro.itens.find((i: J) => i.descricao === 'Encontros de Vendas e Instagram').observacoes).toBe('Dois temas no mesmo encontro.')
    expect(quatro.itens.find((i: J) => i.origem === 'bonus' && i.descricao.includes('Leonardo Mendes')).profissional_nome).toBe('Leonardo Mendes')
  })
  it('a migration não duplica programa, profissionais nem tipos', async () => {
    const n = async (sql: string) => (await amb.db.get<{ n: number }>(sql))!.n
    expect(await n("SELECT COUNT(*) AS n FROM ped_programas WHERE nome = 'Diamante Business'")).toBe(1)
    expect(await n("SELECT COUNT(*) AS n FROM ped_profissionais WHERE nome = 'Jaciara Mendes'")).toBe(1)
    expect(await n("SELECT COUNT(*) AS n FROM ped_tipos_entregavel WHERE nome = 'Aprende & Age'")).toBe(1)
  })
})

describe('Linha do tempo no Início e progresso das aulas', () => {
  let aluna: Cliente
  let outra: Cliente
  let aulas: string[] = []
  let programa = ''
  beforeAll(async () => {
    const pacote = ((await c.coord.get('/pacotes')) as J[]).find((x) => x.nome === 'Diamante Business — 4 meses de acompanhamento')!
    programa = pacote.programa_id
    const inicio = somarMeses(h, -1)
    const nova = async (nome: string, email: string, prog: string | null) => {
      const r = await c.coord.post('/pessoas', { nome, email, telefone: '(11) 96666-0000', matricula: { programa_id: prog, pacote_id: prog ? pacote.id : undefined, data_inicio: inicio, data_fim: somarDias(somarMeses(inicio, 4), -1), itens_extras: [] } })
      return amb.entrar(await amb.criarAcessoPortal(email, r.id), 'portal')
    }
    aluna = await nova('Aluna Linha Fictícia', 'linha@ficticio.local', programa)
    const outroProg = (await c.coord.post('/catalogos/programas', { nome: 'Outro Programa Fictício' })).id
    outra = await nova('Outra Aluna Fictícia', 'outra.linha@ficticio.local', null)
    for (const [mes, titulo, prog] of [[1, 'Aula A', programa], [1, 'Aula B', programa], [2, 'Aula C', null], [2, 'Aula de outro programa', outroProg]] as const) {
      const id = (await c.coord.post('/aulas', { programa_id: prog, mes, titulo, video_url: 'https://vimeo.com/111111111' })).id
      await c.coord.post(`/aulas/${id}/publicar`, { publicado: true })
      aulas.push(id)
    }
    aulas.push((await c.coord.post('/aulas', { programa_id: programa, mes: 3, titulo: 'Rascunho', video_url: 'https://vimeo.com/222222222' })).id)
  })

  it('o Início mostra os 4 meses do plano com início, encerramento e "não contabiliza" sem aulas', async () => {
    const d = await aluna.get('/portal/inicio')
    const meses = d.linha_tempo.meses as J[]
    expect(meses).toHaveLength(4)
    expect(meses[0]).toMatchObject({ numero: 1, situacao: 'concluido', aulas: 2, progresso: 0 })
    expect(meses[1]).toMatchObject({ numero: 2, situacao: 'atual', aulas: 1 }) // aula de outro programa não entra
    expect(meses[2]).toMatchObject({ aulas: 0, progresso: null }) // rascunho não aparece
    expect(meses[3].fim).toBe(d.matricula.data_fim)
    expect(d.linha_tempo.programa).toBe('Diamante Business')
  })

  it('assistir avança a barra; o maior ponto alcançado vale (voltar o vídeo não tira progresso)', async () => {
    expect(await aluna.post(`/portal/aulas/${aulas[0]}/progresso`, { percentual: 95 })).toMatchObject({ assistida: true })
    expect(await aluna.post(`/portal/aulas/${aulas[0]}/progresso`, { percentual: 10 })).toMatchObject({ percentual: 95 })
    await aluna.post(`/portal/aulas/${aulas[1]}/progresso`, { percentual: 40 })
    const meses = (await aluna.get('/portal/inicio')).linha_tempo.meses as J[]
    expect(meses[0]).toMatchObject({ progresso: 70, assistidas: 1 })
    const mes1 = await aluna.get('/portal/linha-do-tempo/1')
    expect(mes1.aulas.map((a: J) => a.percentual)).toEqual([95, 40])
  })

  it('aula de outro programa, rascunho ou mês fora do plano são recusados; a aluna não acessa a gestão', async () => {
    expect((await aluna.req('POST', `/portal/aulas/${aulas[3]}/progresso`, { percentual: 100 })).status).toBe(404)
    expect((await aluna.req('POST', `/portal/aulas/${aulas[4]}/progresso`, { percentual: 100 })).status).toBe(404)
    expect((await aluna.req('GET', '/portal/linha-do-tempo/5')).status).toBe(404)
    expect((await aluna.req('GET', '/aulas')).status).toBe(403)
    expect((await c.coord.req('POST', '/aulas', { mes: 1, titulo: 'X', video_url: 'https://youtube.com/watch?v=1' })).status).toBe(400)
  })

  it('o progresso é de cada aluna: a outra aluna não vê o que esta assistiu', async () => {
    const meses = (await outra.get('/portal/inicio')).linha_tempo.meses as J[]
    expect(meses[0].aulas).toBe(0) // sem programa, só vê aulas gerais (mês 2)
    expect(meses[1]).toMatchObject({ aulas: 1, progresso: 0 })
  })
})
