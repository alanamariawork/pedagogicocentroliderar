import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, type Ambiente, type Cliente } from './apoio/ambiente'
import { hojeSP, somarDias, somarMeses } from '../shared/datas'

/*
 * Estantes da Biblioteca (migration 0005): Administração, Coordenação e Suporte criam estantes e colocam
 * nelas arquivos, links e vídeos. O vídeo toca no portal e o servidor grava quanto cada aluna assistiu.
 * Dados fictícios.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
const c: Record<string, Cliente> = {}
let aluna: Cliente
let outra: Cliente
const h = hojeSP()

beforeAll(async () => {
  amb = await abrirAmbiente()
  for (const [k, perfil] of [['coord', 'coordenacao'], ['suporte', 'suporte'], ['mentora', 'mentora']] as const) {
    c[k] = await amb.entrar(await amb.criarEquipe(`${k}.estante@ficticio.local`, `${k} Fictícia`, { perfil }))
  }
  const nova = async (nome: string, email: string) => {
    const r = await c.coord.post('/pessoas', { nome, email, telefone: '(11) 95555-0000', matricula: { data_inicio: somarMeses(h, -1), data_fim: somarDias(somarMeses(h, 3), -1), itens_extras: [] } })
    return amb.entrar(await amb.criarAcessoPortal(email, r.id), 'portal')
  }
  aluna = await nova('Aluna Estante Fictícia', 'aluna.estante@ficticio.local')
  outra = await nova('Outra Estante Fictícia', 'outra.estante@ficticio.local')
}, 240_000)

afterAll(async () => {
  await amb?.fechar()
})

describe('Estantes da Biblioteca', () => {
  let estante = ''
  let video = ''
  let arquivo = ''

  it('o Suporte cria a estante e coloca materiais nela; nada aparece até publicar estante e material', async () => {
    estante = (await c.suporte.post('/estantes', { titulo: 'Vendas (fictícia)', descricao: 'Materiais de vendas.' })).id
    video = (await c.suporte.post('/conteudos', { secao: 'biblioteca', estante_id: estante, titulo: 'Vídeo de vendas fictício', video_url: 'https://vimeo.com/76979871' })).id
    arquivo = (await c.suporte.post('/conteudos', { secao: 'biblioteca', estante_id: estante, titulo: 'Roteiro fictício', link: 'https://exemplo.com/roteiro' })).id
    await c.suporte.post(`/conteudos/${video}/publicar`, { publicado: true })
    await c.suporte.post(`/conteudos/${arquivo}/publicar`, { publicado: true })
    expect((await aluna.get('/portal/conteudos/biblioteca')).itens).toHaveLength(0) // estante ainda em rascunho
    await c.suporte.post(`/estantes/${estante}/publicar`, { publicada: true })
    const d = await aluna.get('/portal/conteudos/biblioteca')
    expect(d.estantes).toEqual([expect.objectContaining({ id: estante, titulo: 'Vendas (fictícia)' })])
    expect(d.itens.map((x: J) => [x.titulo, x.estante_id])).toEqual([
      ['Roteiro fictício', estante],
      ['Vídeo de vendas fictício', estante],
    ])
    expect(d.itens.find((x: J) => x.id === video).video_url).toBe('https://player.vimeo.com/video/76979871')
  })

  it('o progresso do vídeo é gravado por aluna e o maior ponto vale', async () => {
    expect(await aluna.post(`/portal/conteudos/${video}/progresso`, { percentual: 40 })).toMatchObject({ percentual: 40, assistida: false })
    expect(await aluna.post(`/portal/conteudos/${video}/progresso`, { percentual: 15 })).toMatchObject({ percentual: 40 })
    expect(await aluna.post(`/portal/conteudos/${video}/progresso`, { percentual: 93 })).toMatchObject({ assistida: true })
    expect((await aluna.get('/portal/conteudos/biblioteca')).itens.find((x: J) => x.id === video).percentual).toBe(93)
    expect((await outra.get('/portal/conteudos/biblioteca')).itens.find((x: J) => x.id === video).percentual).toBe(0)
    await outra.post(`/portal/conteudos/${video}/progresso`, { percentual: 20 })
    const equipe = ((await c.suporte.get('/conteudos')).conteudos as J[]).find((x) => x.id === video)!
    expect(equipe).toMatchObject({ alunas_iniciaram: 2, alunas_assistiram: 1 })
    // Material sem vídeo não recebe progresso.
    expect((await aluna.req('POST', `/portal/conteudos/${arquivo}/progresso`, { percentual: 100 })).status).toBe(404)
  })

  it('retirar a estante do portal esconde tudo o que está nela, sem apagar nada', async () => {
    await c.coord.post(`/estantes/${estante}/publicar`, { publicada: false })
    const d = await aluna.get('/portal/conteudos/biblioteca')
    expect(d.itens).toHaveLength(0)
    expect(d.estantes).toHaveLength(0)
    expect((await aluna.req('POST', `/portal/conteudos/${video}/progresso`, { percentual: 100 })).status).toBe(404)
    expect(((await c.coord.get('/conteudos')).conteudos as J[]).filter((x) => x.estante_id === estante)).toHaveLength(2)
    await c.coord.post(`/estantes/${estante}/publicar`, { publicada: true })
  })

  it('Suporte edita só a Biblioteca; mentora e aluna não gerenciam estantes; estante é só da Biblioteca', async () => {
    const vistos = await c.suporte.get('/conteudos')
    expect(vistos.secoes).toEqual(['biblioteca'])
    expect((await c.suporte.req('POST', '/conteudos', { secao: 'livros', titulo: 'x', compra_url: 'https://loja.exemplo.com' })).status).toBe(403)
    expect((await c.coord.req('POST', '/conteudos', { secao: 'rotina', estante_id: estante, titulo: 'x' })).status).toBe(400)
    expect((await c.coord.req('POST', '/conteudos', { secao: 'biblioteca', estante_id: 'nao-existe', titulo: 'x' })).status).toBe(400)
    expect((await c.mentora.req('POST', '/estantes', { titulo: 'x' })).status).toBe(403)
    expect((await c.mentora.req('GET', '/conteudos')).status).toBe(403)
    expect((await aluna.req('POST', '/estantes', { titulo: 'x' })).status).toBe(403)
    expect((await c.coord.get('/conteudos')).secoes).toEqual(['rotina', 'biblioteca', 'livros'])
  })
})
