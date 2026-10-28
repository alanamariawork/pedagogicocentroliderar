import express, { type NextFunction, type Request, type Response } from 'express'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BD } from './db'
import { ErroHttp, carregarUsuario, exigirCabecalhoApp, garantirPermissoesPadrao } from './auth'
import { rotasAcesso } from './rotas/acesso'
import { rotasConfiguracao } from './rotas/configuracao'
import { rotasAlunas } from './rotas/alunas'
import { rotasOperacao } from './rotas/operacao'
import { rotasPedagogico } from './rotas/pedagogico'
import { rotasPortal } from './rotas/portal'

export function criarApp(db: BD) {
  garantirPermissoesPadrao(db)
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', process.env.TRUST_PROXY === 'true')
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Referrer-Policy', 'same-origin')
    res.set('X-Frame-Options', 'DENY')
    next()
  })

  const api = express.Router()
  api.use(express.json({ limit: '200kb' }))
  api.use(cookieParser())
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  api.use(exigirCabecalhoApp)
  api.use(carregarUsuario(db))
  api.get('/saude', (_req, res) => res.json({ ok: true }))
  api.use(rotasAcesso(db))
  api.use(rotasPortal(db)) // antes das rotas da equipe: /portal só atende a aluna
  api.use(rotasConfiguracao(db))
  api.use(rotasAlunas(db))
  api.use(rotasOperacao(db))
  api.use(rotasPedagogico(db))
  api.use((_req, _res, next) => next(new ErroHttp(404, 'Endereço não encontrado.')))
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ErroHttp) return res.status(err.status).json({ erro: err.message })
    if ((err as { type?: string })?.type === 'entity.too.large') return res.status(413).json({ erro: 'O arquivo passa de 10 MB. Envie um arquivo menor ou compartilhe por link.' })
    if (err instanceof SyntaxError) return res.status(400).json({ erro: 'Dados enviados em formato inválido.' })
    const msg = (err as Error)?.message ?? ''
    if (msg.includes('FOREIGN KEY')) return res.status(400).json({ erro: 'Um dos registros selecionados não existe mais. Recarregue a página.' })
    console.error(err)
    res.status(500).json({ erro: 'Erro interno. Tente novamente; se persistir, avise a administração.' })
  })
  app.use('/api', api)

  // Em produção o próprio servidor entrega o app compilado (npm run build).
  const dist = resolve(process.cwd(), 'dist')
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }))
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')))
  }
  return app
}
