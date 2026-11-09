import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, ORIGEM, type Ambiente, type Cliente } from './apoio/ambiente'

/* Login único com o backoffice, bloqueio da aluna e ligação com Clientes. */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
const u: Record<string, string> = {}
const c: Record<string, Cliente> = {}
const contar = async (sql: string, ...p: unknown[]) => (await amb.db.get<{ n: number }>(sql, ...p))!.n

beforeAll(async () => {
  amb = await abrirAmbiente()
  u.admin = await amb.criarEquipe('admin@teste.local', 'Admin do backoffice', { papeis: ['admin'] }) // sem perfil pedagógico: vira admin
  u.coord = await amb.criarEquipe('coord@teste.local', 'Coordenação', { perfil: 'coordenacao' })
  u.vendas = await amb.criarEquipe('vendas@teste.local', 'Só vendas', { papeis: ['vendas'] })
  for (const k of ['admin', 'coord', 'vendas']) c[k] = await amb.entrar(u[k])

  // Aluna: pessoa em Clientes + aluna no pedagógico + conta de Portal.
  const aluna = await c.coord.post('/pessoas', { nome: 'Aluna Teste', email: 'aluna@teste.local', telefone: '(11) 98888-7777' })
  u.alunaPessoa = aluna.id
  u.aluna = await amb.criarAcessoPortal('aluna@teste.local', aluna.id)
  c.aluna = await amb.entrar(u.aluna, 'portal')

  // Cliente do backoffice (ex.: participante do MQA 13) que não é aluna do pedagógico.
  const outra = await amb.clientes.criarPessoa({ usuarioId: u.admin, escopo: 'equipe' }, { nome: 'Participante MQA', email: 'mqa@teste.local' })
  u.mqaPessoa = outra.id
  u.mqa = await amb.criarAcessoPortal('mqa@teste.local', outra.id)
  c.mqa = await amb.entrar(u.mqa, 'portal')
}, 180_000)

afterAll(async () => {
  await amb?.fechar()
})

describe('Login único e páginas', () => {
  it('sem login: a equipe vai para /entrar e a aluna para /portal/entrar', async () => {
    const anon = amb.semLogin()
    expect(await anon.pagina('/produtos/')).toMatchObject({ status: 302, destino: `${ORIGEM}/entrar?de=%2Fprodutos%2F` })
    expect(await anon.pagina('/portal/diamante-business/')).toMatchObject({ status: 302, destino: `${ORIGEM}/portal/entrar` })
    expect((await anon.req('GET', '/auth/eu')).status).toBe(401)
  })

  it('administradora do backoffice sem perfil escolhido entra como Administração', async () => {
    expect((await c.admin.pagina('/produtos/')).status).toBe(200)
    expect((await c.admin.get('/auth/eu')).perfil).toBe('admin')
  })

  it('as páginas antigas da vitrine levam para o sistema pedagógico', async () => {
    for (const antiga of ['/produtos/diamante-business', '/produtos/mqa-master', '/produtos/empresaria-que-vende'])
      expect(await c.coord.pagina(antiga)).toMatchObject({ status: 302, destino: `${ORIGEM}/produtos/` })
  })

  it('equipe sem perfil pedagógico recebe "sem acesso" na tela e na API', async () => {
    const p = await c.vendas.pagina('/produtos/')
    expect(p.status).toBe(403)
    expect(p.texto).toContain('Voltar ao backoffice')
    expect((await c.vendas.req('GET', '/pessoas')).status).toBe(403)
  })

  it('a aluna fica presa ao portal: a área da equipe redireciona e a API da equipe recusa', async () => {
    expect(await c.aluna.pagina('/produtos/')).toMatchObject({ status: 302, destino: `${ORIGEM}/portal/diamante-business/` })
    expect((await c.aluna.pagina('/portal/diamante-business/')).status).toBe(200)
    expect((await c.aluna.get('/auth/eu')).perfil).toBe('aluna')
    for (const rota of ['/pessoas', `/pessoas/${u.alunaPessoa}`, '/painel/mes', '/usuarios', '/clientes/busca?termo=Aluna'])
      expect((await c.aluna.req('GET', rota)).status, rota).toBe(403)
    expect((await c.aluna.req('POST', '/pessoas', { nome: 'x' })).status).toBe(403)
    expect((await c.aluna.req('GET', '/portal')).status).toBe(200)
  })

  it('sessão de portal nunca vira equipe, mesmo que a conta também seja da equipe', async () => {
    const dupla = await amb.entrar(u.coord, 'portal')
    expect((await dupla.req('GET', '/pessoas')).status).toBe(403)
    expect((await dupla.pagina('/produtos/')).status).toBe(302)
  })

  it('a equipe não abre o portal da aluna nem as rotas do portal', async () => {
    expect(await c.coord.pagina('/portal/diamante-business/')).toMatchObject({ status: 302, destino: `${ORIGEM}/produtos/` })
    expect((await c.coord.req('GET', '/portal')).status).toBe(403)
  })

  it('cliente do backoffice que não é aluna volta para o Portal dele', async () => {
    expect(await c.mqa.pagina('/portal/diamante-business/')).toMatchObject({ status: 302, destino: `${ORIGEM}/portal` })
    expect((await c.mqa.req('GET', '/portal')).status).toBe(403)
  })

  it('senha provisória e sessão vencida não entram', async () => {
    const id = await amb.criarEquipe('nova@teste.local', 'Nova', { perfil: 'suporte' })
    await amb.db.run('UPDATE usuario SET senha_provisoria = 1 WHERE id = ?', id)
    const nova = await amb.entrar(id)
    expect((await nova.req('GET', '/auth/eu')).status).toBe(403)
    const vencida = await amb.entrar(u.coord)
    await amb.db.run("UPDATE sessao SET expira_em = '2000-01-01T00:00:00.000Z' WHERE usuario_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessao WHERE usuario_id = ? ORDER BY criada_em LIMIT 1)", u.coord, u.coord)
    expect((await vencida.req('GET', '/auth/eu')).status).toBe(401)
  })

  it('alteração vinda de outro site é recusada (cabeçalho do app e origem)', async () => {
    expect((await c.coord.req('POST', '/pessoas', { nome: 'x' }, { semCabecalho: true })).status).toBe(403)
    expect((await c.coord.req('POST', '/pessoas', { nome: 'x' }, { origem: 'https://outro.site' })).status).toBe(403)
  })
})

describe('Ligação com Clientes', () => {
  it('aluna nova é criada uma vez em Clientes e o pedagógico guarda só o que é dele', async () => {
    expect(await contar('SELECT COUNT(*) AS n FROM pessoa WHERE email = ?', 'aluna@teste.local')).toBe(1)
    const p = await amb.db.get<J>('SELECT nome, telefone FROM pessoa WHERE id = ?', u.alunaPessoa)
    expect(p).toMatchObject({ nome: 'Aluna Teste', telefone: '11988887777' })
    const colunas = (await amb.db.all<J>("SELECT name FROM pragma_table_info('ped_alunas')")).map((x) => x.name)
    expect(colunas).not.toContain('nome')
    expect(colunas).not.toContain('email')
  })

  it('e-mail que já existe em Clientes não gera cadastro duplicado', async () => {
    const antes = await contar('SELECT COUNT(*) AS n FROM pessoa')
    const r = await c.coord.req('POST', '/pessoas', { nome: 'Outro nome', email: 'mqa@teste.local' })
    expect(r.status).toBe(409)
    expect(await contar('SELECT COUNT(*) AS n FROM pessoa')).toBe(antes)
  })

  it('busca em Clientes e vincula o cadastro existente, sem criar outro', async () => {
    const achados = (await c.coord.get('/clientes/busca?termo=Participante')) as J[]
    expect(achados).toEqual([expect.objectContaining({ id: u.mqaPessoa, ja_aluna: false })])
    expect(achados[0].cpf).toBeUndefined()
    const antes = await contar('SELECT COUNT(*) AS n FROM pessoa')
    const r = await c.coord.post('/pessoas', { pessoa_id: u.mqaPessoa, nome: 'Participante MQA', empresa: 'Loja X' })
    expect(r.id).toBe(u.mqaPessoa)
    expect(await contar('SELECT COUNT(*) AS n FROM pessoa')).toBe(antes)
    expect((await c.coord.get('/clientes/busca?termo=Participante'))[0].ja_aluna).toBe(true)
    expect((await c.coord.req('POST', '/pessoas', { pessoa_id: u.mqaPessoa, nome: 'Participante MQA' })).status).toBe(409)
    // Agora ela é aluna e o mesmo login de Portal abre o portal do Diamante Business.
    expect((await c.mqa.pagina('/portal/diamante-business/')).status).toBe(200)
  })

  it('editar nome e telefone na ficha altera a pessoa em Clientes', async () => {
    const ficha = await c.coord.get(`/pessoas/${u.alunaPessoa}`)
    expect(ficha.pessoa.cpf).toBeUndefined()
    await c.coord.put(`/pessoas/${u.alunaPessoa}`, { ...ficha.pessoa, nome: 'Aluna Teste Silva', telefone: '11 97777-6666', cidade: 'Recife' })
    expect(await amb.db.get<J>('SELECT nome, telefone FROM pessoa WHERE id = ?', u.alunaPessoa)).toMatchObject({ nome: 'Aluna Teste Silva', telefone: '11977776666' })
    expect((await amb.db.get<J>('SELECT cidade FROM ped_alunas WHERE id = ?', u.alunaPessoa))!.cidade).toBe('Recife')
    expect((await c.coord.req('PUT', `/pessoas/${u.alunaPessoa}`, { ...ficha.pessoa, telefone: '123' })).status).toBe(400)
  })

  it('a aluna muda o próprio telefone pelo portal e ele vai para Clientes', async () => {
    await c.aluna.put('/portal/perfil', { telefone: '(21) 96666-5555' })
    expect((await amb.db.get<J>('SELECT telefone FROM pessoa WHERE id = ?', u.alunaPessoa))!.telefone).toBe('21966665555')
    // O backoffice recebe o escopo da sessão: pelo portal, a regra dele só aceita o próprio telefone.
    expect(amb.clientes.autores.at(-1)).toEqual({ usuarioId: u.aluna, escopo: 'portal' })
  })

  it('o acesso ao portal é um convite do backoffice, sem senha na tela', async () => {
    const r = await c.coord.req('POST', `/pessoas/${u.alunaPessoa}/convite-portal`, {})
    expect(r.status).toBe(403) // convite exige a permissão de Administração
    // A aluna já tem conta de Portal: nada é enviado.
    const ja = await c.admin.post(`/pessoas/${u.alunaPessoa}/convite-portal`, {})
    expect(ja.situacao).toBe('ja_tem_acesso')
    const nova = await c.coord.post('/pessoas', { nome: 'Sem Acesso Ainda', email: 'semacesso@teste.local' })
    expect((await c.admin.post(`/pessoas/${nova.id}/convite-portal`, {})).situacao).toBe('enviado')
    expect(amb.clientes.convites.map((x) => x.email)).toContain('semacesso@teste.local')
    const ficha = await c.admin.get(`/pessoas/${u.alunaPessoa}`)
    expect(ficha.acesso_portal).toMatchObject({ id: u.aluna, email: 'aluna@teste.local' })
  })
})
