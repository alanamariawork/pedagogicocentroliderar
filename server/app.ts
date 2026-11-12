import type { BD } from './bd'
import { ErroHttp, Res, Router, montarReq } from './http'
import { COOKIE, exigirCabecalhoApp, lerSessao } from './auth'
import type { ContextoApp } from './contexto'
import { rotasAcesso } from './rotas/acesso'
import { rotasConfiguracao } from './rotas/configuracao'
import { rotasAlunas } from './rotas/alunas'
import { rotasOperacao } from './rotas/operacao'
import { rotasPedagogico } from './rotas/pedagogico'
import { rotasPortal } from './rotas/portal'
import { rotasPortalServicos } from './rotas/portalServicos'
import { rotasAvisos } from './rotas/avisos'
import { rotasAcompanhamento } from './rotas/acompanhamento'
import { rotasAulas } from './rotas/aulas'

/** Prefixo da API do sistema pedagógico no endereço do backoffice. */
export const PREFIXO_API = '/api/ped'

export type Api = (request: Request) => Promise<Response>

/** Monta a API (/api/ped/*). Recebe o Request já sem alteração e devolve a Response. */
export function criarApi(db: BD, ctx: ContextoApp): Api {
  const api = Router()
  api.use(exigirCabecalhoApp)
  api.use(async (req, _res, next) => {
    const s = await lerSessao(db, req.cookies[COOKIE])
    req.usuario = s.usuario
    if (!s.usuario && s.situacao === 'senha_provisoria') throw new ErroHttp(403, 'Crie sua senha no backoffice antes de continuar.')
    if (!s.usuario && s.situacao === 'sem_perfil') throw new ErroHttp(403, 'Sua conta não tem acesso ao sistema pedagógico. Peça a uma administradora.')
    next()
  })
  api.get('/saude', (_req, res) => res.json({ ok: true }))
  api.use(rotasAcesso(db, ctx))
  api.use(rotasPortal(db, ctx)) // antes das rotas da equipe: /portal só atende a aluna
  api.use(rotasPortalServicos(db, ctx))
  api.use(rotasAulas(db, ctx))
  api.use(rotasConfiguracao(db, ctx))
  api.use(rotasAvisos(db, ctx))
  api.use(rotasAlunas(db, ctx))
  api.use(rotasOperacao(db, ctx))
  api.use(rotasPedagogico(db, ctx))
  api.use(rotasAcompanhamento(db, ctx))

  return async (request) => {
    const res = new Res()
    res.set('Cache-Control', 'no-store')
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Referrer-Policy', 'same-origin')
    res.set('X-Frame-Options', 'DENY')
    try {
      const caminho = new URL(request.url).pathname.slice(PREFIXO_API.length) || '/'
      const req = await montarReq(request, caminho)
      if (!(await api.tratar(req, res))) throw new ErroHttp(404, 'Endereço não encontrado.')
    } catch (err) {
      res.headers.delete('Content-Disposition')
      if (err instanceof ErroHttp) res.status(err.status).json({ erro: err.message })
      else {
        const msg = (err as Error)?.message ?? ''
        if (msg.includes('FOREIGN KEY')) res.status(400).json({ erro: 'Um dos registros selecionados não existe mais. Recarregue a página.' })
        else {
          console.error('[api] erro inesperado', err)
          res.status(500).json({ erro: 'Erro interno. Tente novamente; se persistir, avise a administração.' })
        }
      }
    }
    return res.paraResponse()
  }
}
