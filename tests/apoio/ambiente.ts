/**
 * Ambiente de teste: um D1 local (o mesmo motor da Cloudflare, via wrangler) com as migrations do
 * backoffice e as do pedagógico, como em produção. Contas e sessões são criadas direto nas tabelas do
 * backoffice, como o login do backoffice faria. Nada disto é usado em produção.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlatformProxy } from 'wrangler'
import { bancoD1, type BD } from '../../server/bd'
import { criarApi, type Api } from '../../server/app'
import { sha256 } from '../../server/auth'
import { acessoLocal, clientesLocais } from '../../server/integracao'
import { atender, type Env } from '../../server/paginas'
import type { Arquivos } from '../../server/contexto'
import type { Integracoes } from '../../server/confirmacoes'

export const ORIGEM = 'https://sistema.teste'
const RAIZ = fileURLToPath(new URL('../..', import.meta.url).href)

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export class Cliente {
  constructor(
    private amb: Ambiente,
    public cookie = '',
  ) {}
  async req(metodo: string, caminho: string, corpo?: unknown, opcoes: { semCabecalho?: boolean; origem?: string } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.cookie) headers.Cookie = this.cookie
    if (!opcoes.semCabecalho) headers['X-CL-App'] = '1'
    if (metodo !== 'GET') headers.Origin = opcoes.origem ?? ORIGEM
    const r = await this.amb.api(new Request(`${ORIGEM}/api/ped${caminho}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) }))
    return { status: r.status, corpo: (await r.json().catch(() => ({}))) as J, headers: r.headers }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ok(metodo: string, caminho: string, corpo?: unknown): Promise<any> {
    const r = await this.req(metodo, caminho, corpo)
    if (r.status >= 400) throw new Error(`${metodo} ${caminho} → ${r.status} ${r.corpo.erro}`)
    return r.corpo
  }
  get = (c: string) => this.ok('GET', c)
  post = (c: string, b: unknown) => this.ok('POST', c, b)
  put = (c: string, b: unknown) => this.ok('PUT', c, b)
  /** Abre uma página (/produtos/, /portal/diamante-business/) pelo Worker, sem seguir redirecionamentos. */
  async pagina(caminho: string) {
    const r = await atender(new Request(`${ORIGEM}${caminho}`, { headers: this.cookie ? { Cookie: this.cookie } : {} }), this.amb.env)
    return { status: r.status, destino: r.headers.get('Location'), texto: await r.text() }
  }
}

export interface Ambiente {
  db: BD
  api: Api
  env: Env
  clientes: ReturnType<typeof clientesLocais>
  organizacaoId: string
  /** Conta da equipe no backoffice. `perfil` vai em membro.perfil_pedagogico (null = só o papel). */
  criarEquipe(email: string, nome: string, opcoes?: { perfil?: string | null; papeis?: string[] }): Promise<string>
  /** Conta de Portal (cliente) ligada a uma pessoa de Clientes. */
  criarAcessoPortal(email: string, pessoaId: string): Promise<string>
  /** Sessão nova, como o login do backoffice faria. */
  entrar(usuarioId: string, escopo?: 'equipe' | 'portal'): Promise<Cliente>
  semLogin(): Cliente
  /** Senha de uma conta para o login da página Diamante Business (imitação local do backoffice). */
  definirSenha(email: string, senha: string): void
  /** Fecha e reabre o banco local (como reiniciar o Worker), mantendo os dados. */
  reabrir(): Promise<void>
  fechar(): Promise<void>
}

function aplicarMigrations(config: string, persistir: string) {
  execFileSync(process.execPath, [join(RAIZ, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persistir, '-c', config], {
    cwd: RAIZ,
    env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' },
    stdio: 'pipe',
  })
}

/** Arquivos em memória (no lugar do R2). */
function arquivosEmMemoria(): Arquivos {
  const m = new Map<string, ArrayBuffer>()
  return {
    async guardar(k, d) {
      m.set(k, d.slice(0))
    },
    async ler(k) {
      return m.get(k) ?? null
    },
    async apagar(ks) {
      for (const k of ks) m.delete(k)
    },
  }
}

/** `pasta`: usa (e mantém) uma pasta fixa, por exemplo .wrangler/state para o `wrangler dev`. */
export async function abrirAmbiente(opcoes: { pasta?: string; confirmacoes?: Integracoes } = {}): Promise<Ambiente> {
  const dir = opcoes.pasta ?? mkdtempSync(join(tmpdir(), 'ped-teste-'))
  aplicarMigrations('wrangler.backoffice-local.jsonc', dir)
  aplicarMigrations('wrangler.jsonc', dir)
  const arquivos = arquivosEmMemoria()
  /** Senhas das contas de teste (só em memória; o login de verdade é conferido pelo backoffice). */
  const senhas = new Map<string, string>()
  const abrir = async () => {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: join(RAIZ, 'wrangler.backoffice-local.jsonc'), persist: { path: join(dir, 'v3') }, remoteBindings: false })
    const db = bancoD1(proxy.env.DB)
    const clientes = clientesLocais(db)
    const acesso = acessoLocal(db)
    for (const [k, v] of senhas) acesso.senhas.set(k, v)
    const api = criarApi(db, { clientes, arquivos, confirmacoes: opcoes.confirmacoes, acesso })
    const env = {
      DB: proxy.env.DB,
      ASSETS: { fetch: async () => new Response('<!doctype html><title>Diamante Business</title>', { headers: { 'Content-Type': 'text/html' } }) } as unknown as Fetcher,
      ANEXOS: undefined as unknown as R2Bucket,
      BACKOFFICE: undefined as never,
    } satisfies Env
    return { proxy, db, clientes, api, env, acesso }
  }
  let atual = await abrir()
  const { db } = atual

  const organizacaoId = crypto.randomUUID()
  await db.run("INSERT INTO organizacao (id, nome) VALUES (?, 'Centro Liderar (teste)')", organizacaoId)

  const amb: Ambiente = {
    db: atual.db,
    api: atual.api,
    env: atual.env,
    clientes: atual.clientes,
    organizacaoId,
    async criarEquipe(email, nome, opcoes = {}) {
      const db = amb.db
      const id = crypto.randomUUID()
      await db.run("INSERT INTO usuario (id, email, senha_hash, senha_sal, senha_iteracoes, senha_provisoria) VALUES (?, ?, 'x', 'x', 1, 0)", id, email)
      await db.run('INSERT INTO membro (usuario_id, organizacao_id, nome, email, papeis, perfil_pedagogico) VALUES (?,?,?,?,?,?)', id, organizacaoId, nome, email, JSON.stringify(opcoes.papeis ?? ['produtos']), opcoes.perfil === undefined ? null : opcoes.perfil)
      return id
    },
    async criarAcessoPortal(email, pessoaId) {
      const db = amb.db
      const id = crypto.randomUUID()
      await db.run("INSERT INTO usuario (id, email, senha_hash, senha_sal, senha_iteracoes, senha_provisoria) VALUES (?, ?, 'x', 'x', 1, 0)", id, email)
      await db.run('INSERT INTO cliente (usuario_id, pessoa_id) VALUES (?,?)', id, pessoaId)
      return id
    },
    async entrar(usuarioId, escopo = 'equipe') {
      const db = amb.db
      const token = crypto.randomUUID() + crypto.randomUUID()
      await db.run('INSERT INTO sessao (token_hash, usuario_id, expira_em, escopo) VALUES (?,?,?,?)', await sha256(token), usuarioId, new Date(Date.now() + 12 * 3600_000).toISOString(), escopo)
      return new Cliente(amb, `__Host-cl_sessao=${token}`)
    },
    definirSenha(email, senha) {
      senhas.set(email.toLowerCase(), senha)
      atual.acesso.senhas.set(email.toLowerCase(), senha)
    },
    semLogin() {
      return new Cliente(amb)
    },
    async reabrir() {
      await atual.proxy.dispose()
      atual = await abrir()
      Object.assign(amb, { db: atual.db, api: atual.api, env: atual.env, clientes: atual.clientes })
    },
    async fechar() {
      await atual.proxy.dispose()
      if (!opcoes.pasta) rmSync(dir, { recursive: true, force: true })
    },
  }
  return amb
}
