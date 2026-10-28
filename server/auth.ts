import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { agoraIso, type BD } from './db'
import { PERFIS, PERMISSOES_PADRAO, type Perfil, type Permissao } from '../shared/permissoes'

export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message)
  }
}

export interface UsuarioSessao {
  id: string
  nome: string
  email: string
  perfil: Perfil
  pessoa_id: string | null
  profissional_id: string | null
  trocar_senha: boolean
  permissoes: Set<Permissao>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioSessao
    }
  }
}

export const COOKIE = 'ed_sessao'
const DURACAO_SESSAO_H = 12

/* ---------------- Senhas ---------------- */

export function gerarHashSenha(senha: string): string {
  const sal = randomBytes(16)
  const hash = scryptSync(senha, sal, 64)
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`
}

export function conferirSenha(senha: string, guardado: string): boolean {
  const [alg, salHex, hashHex] = guardado.split('$')
  if (alg !== 'scrypt' || !salHex || !hashHex) return false
  const esperado = Buffer.from(hashHex, 'hex')
  const obtido = scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length)
  return timingSafeEqual(esperado, obtido)
}

export function validarForcaSenha(senha: string): string | null {
  if (senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.'
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'A senha precisa ter letras e números.'
  return null
}

/* ---------------- Sessões ---------------- */

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

export function criarSessao(db: BD, usuarioId: string): { token: string; expira: Date } {
  const token = randomBytes(32).toString('base64url')
  const expira = new Date(Date.now() + DURACAO_SESSAO_H * 3600_000)
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em, criado_em) VALUES (?,?,?,?)').run(
    hashToken(token),
    usuarioId,
    expira.toISOString(),
    agoraIso(),
  )
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(agoraIso())
  return { token, expira }
}

export function encerrarSessao(db: BD, token: string) {
  db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token))
}

export function encerrarSessoesDoUsuario(db: BD, usuarioId: string) {
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId)
}

/* ---------------- Permissões ---------------- */

export function garantirPermissoesPadrao(db: BD) {
  const existe = db.prepare('SELECT COUNT(*) n FROM perfil_permissoes').get() as { n: number }
  if (existe.n > 0) return
  const ins = db.prepare('INSERT OR IGNORE INTO perfil_permissoes (perfil, permissao) VALUES (?, ?)')
  db.transaction(() => {
    for (const perfil of PERFIS) for (const p of PERMISSOES_PADRAO[perfil]) ins.run(perfil, p)
  })()
}

export function permissoesDoPerfil(db: BD, perfil: Perfil): Set<Permissao> {
  if (perfil === 'aluna') return new Set() // a aluna nunca recebe permissões da equipe
  const linhas = db.prepare('SELECT permissao FROM perfil_permissoes WHERE perfil = ?').all(perfil) as {
    permissao: Permissao
  }[]
  const s = new Set(linhas.map((l) => l.permissao))
  if (perfil === 'admin') s.add('usuarios:admin') // a Administração nunca perde o acesso às regras
  return s
}

/* ---------------- Middlewares ---------------- */

export function carregarUsuario(db: BD) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.cookies?.[COOKIE] as string | undefined
    if (token) {
      const linha = db
        .prepare(
          `SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
           WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`,
        )
        .get(hashToken(token), agoraIso()) as Record<string, unknown> | undefined
      if (linha) {
        const perfil = linha.perfil as Perfil
        req.usuario = {
          id: linha.id as string,
          nome: linha.nome as string,
          email: linha.email as string,
          perfil,
          pessoa_id: (linha.pessoa_id as string) ?? null,
          profissional_id: (linha.profissional_id as string) ?? null,
          trocar_senha: !!linha.trocar_senha,
          permissoes: permissoesDoPerfil(db, perfil),
        }
      }
    }
    next()
  }
}

/** Proteção contra CSRF: toda alteração precisa do cabeçalho enviado pelo próprio app. */
export function exigirCabecalhoApp(req: Request, _res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('X-Requested-With') !== 'diamante-business') {
    throw new ErroHttp(403, 'Requisição recusada: origem não reconhecida.')
  }
  next()
}

export function exigirLogin(req: Request, _res: Response, next: NextFunction) {
  if (!req.usuario) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.')
  next()
}

/** Bloqueia o perfil Aluna nas rotas da equipe, mesmo que alguém tente chamar a API diretamente. */
export function exigirEquipe(req: Request, _res: Response, next: NextFunction) {
  if (!req.usuario) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.')
  if (req.usuario.perfil === 'aluna') throw new ErroHttp(403, 'Acesso não permitido para este perfil.')
  next()
}

export function tem(req: Request, p: Permissao): boolean {
  return !!req.usuario?.permissoes.has(p)
}

export function exigir(req: Request, ...ps: Permissao[]) {
  for (const p of ps) {
    if (!tem(req, p)) throw new ErroHttp(403, 'Você não tem permissão para esta operação.')
  }
}

/* ---------------- Limite de tentativas de login ---------------- */

const tentativas = new Map<string, { n: number; desde: number }>()
const JANELA_MS = 15 * 60_000
const MAX_TENTATIVAS = 10

export function registrarTentativa(chave: string, sucesso: boolean): void {
  if (sucesso) {
    tentativas.delete(chave)
    return
  }
  const agora = Date.now()
  const t = tentativas.get(chave)
  if (!t || agora - t.desde > JANELA_MS) tentativas.set(chave, { n: 1, desde: agora })
  else t.n++
}

export function bloqueadoPorTentativas(chave: string): boolean {
  const t = tentativas.get(chave)
  return !!t && Date.now() - t.desde <= JANELA_MS && t.n >= MAX_TENTATIVAS
}
