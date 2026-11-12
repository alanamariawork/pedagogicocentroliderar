import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, type Ambiente, type Cliente } from './apoio/ambiente'
import { hojeSP, somarDias, somarMeses } from '../shared/datas'

/*
 * Biblioteca ↔ Editora Prosperar: o backoffice (Loja online) publica, na visão loja_vitrine_material
 * do mesmo D1, os produtos ligados a cada material. O portal mostra "COMPRAR NA EDITORA PROSPERAR"
 * com a disponibilidade e o link com origem=biblioteca&material_id. Aqui a visão é simulada com o
 * mesmo formato da migração 0018 do backoffice. Dados fictícios.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
let suporte: Cliente
let aluna: Cliente
const h = hojeSP()

beforeAll(async () => {
  amb = await abrirAmbiente()
  const coord = await amb.entrar(await amb.criarEquipe('coord.editora@ficticio.local', 'Coord Fictícia', { perfil: 'coordenacao' }))
  suporte = await amb.entrar(await amb.criarEquipe('suporte.editora@ficticio.local', 'Suporte Fictício', { perfil: 'suporte' }))
  const r = await coord.post('/pessoas', { nome: 'Aluna Editora Fictícia', email: 'aluna.editora@ficticio.local', telefone: '(11) 95555-0001', matricula: { data_inicio: somarMeses(h, -1), data_fim: somarDias(somarMeses(h, 3), -1), itens_extras: [] } })
  aluna = await amb.entrar(await amb.criarAcessoPortal('aluna.editora@ficticio.local', r.id), 'portal')
}, 240_000)

afterAll(async () => {
  await amb?.db.run('DROP VIEW IF EXISTS loja_vitrine_material').catch(() => undefined)
  await amb?.fechar()
})

describe('Biblioteca: comprar na Editora Prosperar', () => {
  let material = ''
  let outro = ''

  it('sem a visão da loja (backoffice sem a migração 0018), a Biblioteca segue igual, sem botão', async () => {
    material = (await suporte.post('/conteudos', { secao: 'biblioteca', titulo: 'Capítulo 1 fictício', link: 'https://exemplo.com/cap1' })).id
    outro = (await suporte.post('/conteudos', { secao: 'biblioteca', titulo: 'Outro material fictício', link: 'https://exemplo.com/outro' })).id
    await suporte.post(`/conteudos/${material}/publicar`, { publicado: true })
    await suporte.post(`/conteudos/${outro}/publicar`, { publicado: true })
    const d = await aluna.get('/portal/conteudos/biblioteca')
    expect(d.itens.find((x: J) => x.id === material).editora).toBeUndefined()
  })

  it('com produto ligado, o material traz o botão, a disponibilidade e o link com a origem', async () => {
    await amb.db.run(`CREATE VIEW loja_vitrine_material AS
      SELECT '${material}' AS conteudo_id, 0 AS ordem, NULL AS rotulo, 'produto' AS tipo, 'Livro Fictício' AS titulo,
             'https://loja.exemplo.com.br/p/0b9c' AS url_base, 5990 AS preco_a_partir_centavos, 3 AS disponivel, 0 AS pre_venda
      UNION ALL
      SELECT '${material}', 1, 'Kit do aluno', 'colecao', 'Kit', 'https://loja.exemplo.com.br/colecoes/kit', NULL, NULL, NULL
      UNION ALL
      SELECT '${outro}', 0, NULL, 'produto', 'Livro esgotado', 'https://loja.exemplo.com.br/p/9999', 3500, 0, 0
      UNION ALL
      SELECT '${outro}', 1, NULL, 'produto', 'Sem domínio', '/p/1234', 3500, 5, 0`)
    const d = await aluna.get('/portal/conteudos/biblioteca')
    const m = d.itens.find((x: J) => x.id === material)
    expect(m.editora).toEqual([
      { rotulo: 'COMPRAR NA EDITORA PROSPERAR', titulo: 'Livro Fictício', tipo: 'produto', preco_a_partir_centavos: 5990, situacao: 'disponivel',
        url: `https://loja.exemplo.com.br/p/0b9c?origem=biblioteca&material_id=${material}` },
      { rotulo: 'Kit do aluno', titulo: 'Kit', tipo: 'colecao', preco_a_partir_centavos: null, situacao: 'disponivel',
        url: `https://loja.exemplo.com.br/colecoes/kit?origem=biblioteca&material_id=${material}` },
    ])
    // Esgotado aparece como tal; endereço sem domínio (loja sem endereço público) não vira botão.
    expect(d.itens.find((x: J) => x.id === outro).editora).toEqual([expect.objectContaining({ titulo: 'Livro esgotado', situacao: 'esgotado' })])
  })
})
