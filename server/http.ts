/**
 * Roteador mínimo sobre a API fetch (Request → Response), no lugar do Express: roda igual no Worker
 * da Cloudflare e nos testes. Mantém o formato (req, res, next) que as rotas já usavam.
 */
import type { UsuarioSessao } from './auth'

export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message)
  }
}

export interface Req {
  method: string
  /** Caminho já sem o prefixo da API (ex.: /pessoas/123). */
  path: string
  params: Record<string, string>
  query: Record<string, string>
  body: any // eslint-disable-line @typescript-eslint/no-explicit-any
  usuario?: UsuarioSessao
  cookies: Record<string, string>
  ip: string
  raw: Request
  get(cabecalho: string): string | undefined
}

export class Res {
  statusCode = 200
  headers = new Headers()
  corpo: BodyInit | null = null
  enviado = false
  status(n: number) {
    this.statusCode = n
    return this
  }
  set(k: string, v: string) {
    this.headers.set(k, v)
    return this
  }
  json(dados: unknown) {
    this.headers.set('Content-Type', 'application/json; charset=utf-8')
    this.corpo = JSON.stringify(dados ?? null)
    this.enviado = true
    return this
  }
  send(dados: BodyInit | Uint8Array | ArrayBuffer) {
    this.corpo = dados as BodyInit
    this.enviado = true
    return this
  }
  paraResponse() {
    return new Response(this.corpo, { status: this.statusCode, headers: this.headers })
  }
}

export type Next = (erro?: unknown) => void
export type Handler = (req: Req, res: Res, next: Next) => unknown

type Camada =
  | { tipo: 'mw'; prefixo: string; fn: Handler }
  | { tipo: 'router'; prefixo: string; router: Router }
  | { tipo: 'rota'; metodo: string; padrao: RegExp; nomes: string[]; fns: Handler[] }

function compilar(caminho: string) {
  const nomes: string[] = []
  const re = caminho.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:([A-Za-z_]+)/g, (_m, n: string) => {
    nomes.push(n)
    return '([^/]+)'
  })
  return { padrao: new RegExp(`^${re}/?$`), nomes }
}

/** Executa um handler no estilo Express e diz se ele pediu para continuar (next). */
async function executar(fn: Handler, req: Req, res: Res): Promise<boolean> {
  let seguir = false
  let erro: unknown
  await fn(req, res, (e?: unknown) => {
    if (e) erro = e
    else seguir = true
  })
  if (erro) throw erro
  return seguir && !res.enviado
}

export class Router {
  private camadas: Camada[] = []

  use(a: string | Handler | Router, b?: Handler | Router) {
    const prefixo = typeof a === 'string' ? a : ''
    const alvo = (typeof a === 'string' ? b : a)!
    if (alvo instanceof Router) this.camadas.push({ tipo: 'router', prefixo, router: alvo })
    else this.camadas.push({ tipo: 'mw', prefixo, fn: alvo })
    return this
  }

  private rota(metodo: string, caminho: string, fns: Handler[]) {
    this.camadas.push({ tipo: 'rota', metodo, ...compilar(caminho), fns })
    return this
  }
  get(c: string, ...fns: Handler[]) {
    return this.rota('GET', c, fns)
  }
  post(c: string, ...fns: Handler[]) {
    return this.rota('POST', c, fns)
  }
  put(c: string, ...fns: Handler[]) {
    return this.rota('PUT', c, fns)
  }
  patch(c: string, ...fns: Handler[]) {
    return this.rota('PATCH', c, fns)
  }
  delete(c: string, ...fns: Handler[]) {
    return this.rota('DELETE', c, fns)
  }

  /** Devolve true quando alguma rota respondeu. */
  async tratar(req: Req, res: Res): Promise<boolean> {
    for (const c of this.camadas) {
      if (c.tipo === 'mw') {
        if (c.prefixo && !(req.path === c.prefixo || req.path.startsWith(c.prefixo + '/'))) continue
        if (!(await executar(c.fn, req, res))) return true
      } else if (c.tipo === 'router') {
        if (c.prefixo && !(req.path === c.prefixo || req.path.startsWith(c.prefixo + '/'))) continue
        if (await c.router.tratar(req, res)) return true
      } else {
        if (c.metodo !== req.method) continue
        const m = c.padrao.exec(req.path)
        if (!m) continue
        req.params = Object.fromEntries(c.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]))
        for (const fn of c.fns) {
          if (!(await executar(fn, req, res))) return true
        }
        return true
      }
    }
    return false
  }
}

function lerCookies(cabecalho: string | null): Record<string, string> {
  const r: Record<string, string> = {}
  for (const parte of (cabecalho ?? '').split(';')) {
    const i = parte.indexOf('=')
    if (i < 0) continue
    const k = parte.slice(0, i).trim()
    if (k) r[k] = parte.slice(i + 1).trim()
  }
  return r
}

export const LIMITE_JSON = 200 * 1024

/** Monta o req a partir do Request. O corpo JSON é lido aqui; corpos binários ficam para a rota. */
export async function montarReq(request: Request, caminho: string): Promise<Req> {
  const url = new URL(request.url)
  let body: unknown = undefined
  const tipo = request.headers.get('Content-Type') ?? ''
  if (request.method !== 'GET' && request.method !== 'HEAD' && tipo.includes('application/json')) {
    const texto = await request.text()
    if (texto.length > LIMITE_JSON) throw new ErroHttp(413, 'Dados grandes demais.')
    try {
      body = texto ? JSON.parse(texto) : {}
    } catch {
      throw new ErroHttp(400, 'Dados enviados em formato inválido.')
    }
  }
  return {
    method: request.method,
    path: caminho,
    params: {},
    query: Object.fromEntries(url.searchParams.entries()),
    body: body ?? {},
    cookies: lerCookies(request.headers.get('Cookie')),
    ip: request.headers.get('CF-Connecting-IP') ?? '',
    raw: request,
    get: (k) => request.headers.get(k) ?? undefined,
  }
}
