/**
 * Atendimento do Worker do sistema pedagógico (o ponto de entrada é server/worker.ts, que só pode
 * exportar handlers). Não tem endereço público (workers_dev e preview_urls desligados):
 * só recebe o que o Worker do backoffice repassa pelo service binding, no mesmo domínio.
 *
 *   /api/ped/*                    API (equipe e portal da aluna)
 *   /produtos, /produtos/*        área da equipe (tela única, rotas por #)
 *   /portal/diamante-business*    portal da aluna (a mesma tela, que abre no modo portal)
 *
 * As páginas são liberadas ou redirecionadas aqui, no servidor, pela sessão do backoffice. A API
 * repete todas as verificações em cada chamada; o redirecionamento é só conforto.
 */
import { bancoD1, type BD } from './bd'
import { COOKIE, lerSessao } from './auth'
import { PREFIXO_API, criarApi, type Api } from './app'
import { arquivosR2 } from './contexto'
import { clientesPeloBackoffice, type BackofficePedagogico } from './integracao'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  ANEXOS: R2Bucket
  BACKOFFICE: BackofficePedagogico
}

export const BASE_EQUIPE = '/produtos/'
export const BASE_PORTAL = '/portal/diamante-business/'
/** Páginas antigas da vitrine estática do backoffice. */
const PAGINAS_ANTIGAS = new Set(['/produtos/diamante-business', '/produtos/mqa-master', '/produtos/empresaria-que-vende'])

let cache: { d1: D1Database; db: BD; api: Api } | null = null
export function montar(env: Env) {
  if (!cache || cache.d1 !== env.DB) {
    const db = bancoD1(env.DB)
    cache = { d1: env.DB, db, api: criarApi(db, { clientes: clientesPeloBackoffice(env.BACKOFFICE), arquivos: arquivosR2(env.ANEXOS) }) }
  }
  return cache
}

export function lerCookie(request: Request, nome: string): string | undefined {
  for (const parte of (request.headers.get('Cookie') ?? '').split(';')) {
    const i = parte.indexOf('=')
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim())
  }
  return undefined
}

function redirecionar(url: URL, destino: string) {
  return new Response(null, { status: 302, headers: { Location: new URL(destino, url).toString(), 'Cache-Control': 'no-store' } })
}

function semAcesso() {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sem acesso · Diamante Business</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#faf7f2;color:#2b1a1f;display:grid;place-items:center;min-height:100vh;padding:16px}
main{max-width:420px;background:#fff;border:1px solid #e8dccb;border-radius:12px;padding:28px;text-align:center}
h1{font-size:1.2rem;color:#6b1d2f;margin:0 0 8px}a{color:#6b1d2f;font-weight:600}</style></head>
<body><main><h1>Sem acesso ao sistema pedagógico</h1>
<p>Sua conta não tem um perfil pedagógico. Peça a uma administradora para liberar o acesso.</p>
<p><a href="/">Voltar ao backoffice</a></p></main></body></html>`
  return new Response(html, { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** Entrega a tela (index.html do build), sem cache para não prender uma versão antiga. */
async function tela(env: Env, url: URL) {
  const r = await env.ASSETS.fetch(new Request(new URL(BASE_EQUIPE, url)))
  const res = new Response(r.body, r)
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'same-origin')
  return res
}

export async function atender(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const caminho = url.pathname
  const { db, api } = montar(env)

  if (caminho === PREFIXO_API || caminho.startsWith(`${PREFIXO_API}/`)) return api(request)

  // Arquivos do build (JS, CSS, ícones): públicos, sem dado nenhum.
  if (caminho.startsWith(`${BASE_EQUIPE}assets/`)) return env.ASSETS.fetch(request)

  const ehEquipe = caminho === '/produtos' || caminho.startsWith('/produtos/')
  const ehPortal = caminho === '/portal/diamante-business' || caminho.startsWith('/portal/diamante-business/')
  if (!ehEquipe && !ehPortal) return new Response('Não encontrado.', { status: 404 })
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método não permitido.', { status: 405 })

  const s = await lerSessao(db, lerCookie(request, COOKIE))

  if (ehEquipe) {
    if (PAGINAS_ANTIGAS.has(caminho.replace(/\/$/, ''))) return redirecionar(url, BASE_EQUIPE)
    if (caminho !== BASE_EQUIPE) return redirecionar(url, BASE_EQUIPE)
    if (s.situacao === 'sem_sessao') return redirecionar(url, `/entrar?de=${encodeURIComponent(BASE_EQUIPE)}`)
    // Sessão de portal nunca vê a área da equipe, mesmo que a pessoa também seja da equipe.
    if (s.escopo === 'portal') return redirecionar(url, s.situacao === 'ok' ? BASE_PORTAL : '/portal')
    if (s.situacao === 'senha_provisoria') return redirecionar(url, '/entrar')
    if (s.situacao !== 'ok') return semAcesso()
    return tela(env, url)
  }

  // Portal da aluna.
  if (caminho !== BASE_PORTAL) return redirecionar(url, BASE_PORTAL)
  if (s.situacao === 'sem_sessao') return redirecionar(url, '/portal/entrar')
  if (s.escopo === 'equipe') return redirecionar(url, s.situacao === 'ok' ? BASE_EQUIPE : '/')
  if (s.situacao !== 'ok') return redirecionar(url, '/portal') // cliente do backoffice que não é aluna do pedagógico
  return tela(env, url)
}
