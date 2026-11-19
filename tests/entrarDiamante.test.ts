import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, Cliente, ORIGEM, type Ambiente } from './apoio/ambiente'
import { hojeSP, somarDias } from '../shared/datas'

/*
 * Login da página Diamante Business (/diamante/entrar): alunas e mentoras entram por ela; Administração,
 * Coordenação e Suporte, pelo backoffice. A senha é conferida pelo backoffice (aqui, a imitação local).
 * Dados fictícios.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
let coord: Cliente
const h = hojeSP()

/** Faz o login como o navegador faria e devolve o resultado e um cliente com o cookie recebido. */
async function entrar(email: string, senha: string) {
  const r = await amb.semLogin().req('POST', '/entrar', { email, senha })
  const cookie = (r.headers.get('Set-Cookie') ?? '').split(';')[0]
  return { ...r, sessao: cookie ? new Cliente(amb, cookie) : null }
}

beforeAll(async () => {
  amb = await abrirAmbiente()
  coord = await amb.entrar(await amb.criarEquipe('coord.ent@ficticio.local', 'Coordenação Fictícia', { perfil: 'coordenacao' }))
  await amb.criarEquipe('mentora.ent@ficticio.local', 'Mentora Fictícia', { perfil: 'mentora' })
  await amb.criarEquipe('suporte.ent@ficticio.local', 'Suporte Fictício', { perfil: 'suporte' })
  const r = await coord.post('/pessoas', { nome: 'Aluna Login Fictícia', email: 'aluna.ent@ficticio.local', telefone: '(11) 94444-0000', matricula: { data_inicio: somarDias(h, -10), data_fim: somarDias(h, 100), itens_extras: [] } })
  await amb.criarAcessoPortal('aluna.ent@ficticio.local', r.id)
  for (const e of ['coord.ent', 'mentora.ent', 'suporte.ent', 'aluna.ent']) amb.definirSenha(`${e}@ficticio.local`, 'senha-ficticia-123')
}, 240_000)

afterAll(async () => {
  await amb?.fechar()
})

describe('Login do Diamante Business', () => {
  it('a página de login abre sem sessão; portal e área da mentora sem sessão levam para ela', async () => {
    const anon = amb.semLogin()
    const p = await anon.pagina('/diamante/entrar')
    expect(p.status).toBe(200)
    expect(p.texto).toContain('Área das alunas e das mentoras')
    expect(p.texto).toContain('entrar pelo backoffice')
    expect(await anon.pagina('/diamante')).toMatchObject({ status: 302, destino: `${ORIGEM}/diamante/entrar` })
    expect(await anon.pagina('/diamante/mentora/')).toMatchObject({ status: 302, destino: `${ORIGEM}/diamante/entrar` })
    expect(await anon.pagina('/portal/diamante-business/')).toMatchObject({ status: 302, destino: `${ORIGEM}/diamante/entrar` })
    expect(await anon.pagina('/produtos/')).toMatchObject({ status: 302, destino: `${ORIGEM}/entrar?de=%2Fprodutos%2F` }) // equipe: backoffice
  })

  it('a aluna entra e vai para o portal; o cookie é o mesmo da sessão do backoffice', async () => {
    const r = await entrar('Aluna.Ent@ficticio.local', 'senha-ficticia-123')
    expect(r.status).toBe(200)
    expect(r.corpo.destino).toBe('/portal/diamante-business/')
    expect(r.headers.get('Set-Cookie')).toMatch(/^__Host-cl_sessao=.+; Path=\/; HttpOnly; Secure; SameSite=Strict/)
    expect((await r.sessao!.get('/auth/eu')).perfil).toBe('aluna')
    expect((await r.sessao!.pagina('/portal/diamante-business/')).status).toBe(200)
    expect(await r.sessao!.pagina('/diamante/entrar')).toMatchObject({ status: 302, destino: `${ORIGEM}/portal/diamante-business/` })
    expect(await r.sessao!.pagina('/diamante/mentora/')).toMatchObject({ status: 302, destino: `${ORIGEM}/portal/diamante-business/` })
  })

  it('a mentora entra e vai para a área própria; a área da equipe a leva de volta para lá', async () => {
    const r = await entrar('mentora.ent@ficticio.local', 'senha-ficticia-123')
    expect(r.corpo.destino).toBe('/diamante/mentora/')
    expect((await r.sessao!.get('/auth/eu')).perfil).toBe('mentora')
    expect((await r.sessao!.pagina('/diamante/mentora/')).status).toBe(200)
    expect(await r.sessao!.pagina('/produtos/')).toMatchObject({ status: 302, destino: `${ORIGEM}/diamante/mentora/` })
    expect(await r.sessao!.pagina('/portal/diamante-business/')).toMatchObject({ status: 302, destino: `${ORIGEM}/diamante/mentora/` })
  })

  it('Coordenação e Suporte são mandadas para o backoffice, sem sessão aberta', async () => {
    const antes = await amb.db.get<J>('SELECT COUNT(*) AS n FROM sessao')
    for (const email of ['coord.ent@ficticio.local', 'suporte.ent@ficticio.local']) {
      const r = await entrar(email, 'senha-ficticia-123')
      expect(r.status).toBe(403)
      expect(r.corpo.erro).toContain('backoffice')
      expect(r.headers.get('Set-Cookie')).toBeNull()
    }
    expect((await amb.db.get<J>('SELECT COUNT(*) AS n FROM sessao'))!.n).toBe(antes!.n)
    // Pelo backoffice, a coordenação segue na área da equipe; a área da mentora a leva para lá.
    expect(await coord.pagina('/diamante/mentora/')).toMatchObject({ status: 302, destino: `${ORIGEM}/produtos/` })
    expect((await coord.pagina('/produtos/')).status).toBe(200)
  })

  it('senha errada e e-mail inexistente recebem a mesma mensagem; campos vazios são recusados', async () => {
    const errada = await entrar('aluna.ent@ficticio.local', 'outra')
    const inexistente = await entrar('ninguem@ficticio.local', 'senha-ficticia-123')
    expect(errada).toMatchObject({ status: 401, corpo: { erro: 'E-mail ou senha incorretos.' } })
    expect(inexistente).toMatchObject({ status: 401, corpo: { erro: 'E-mail ou senha incorretos.' } })
    expect((await amb.semLogin().req('POST', '/entrar', { email: '', senha: '' })).status).toBe(400)
    // Sem o cabeçalho do app (formulário de outro site), nada acontece.
    expect((await amb.semLogin().req('POST', '/entrar', { email: 'aluna.ent@ficticio.local', senha: 'senha-ficticia-123' }, { semCabecalho: true })).status).toBe(403)
  })
})
