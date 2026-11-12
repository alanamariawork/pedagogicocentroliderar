/**
 * Login único com o backoffice do Centro Liderar.
 *
 * O sistema pedagógico não tem login, senha nem sessão próprios: ele lê a mesma sessão do backoffice
 * (cookie __Host-cl_sessao, tabela `sessao`, só o hash SHA-256 do token no banco), com a mesma regra
 * de validade e renovação (worker/sessao.ts do backoffice, sessaoDoToken). Entrar, sair, trocar e
 * recuperar senha continuam nas telas do backoffice (/entrar e /portal/entrar).
 *
 * Quem é quem:
 *   - sessão de escopo 'equipe' + membro com perfil pedagógico (ou administrador do backoffice) → equipe;
 *   - sessão de escopo 'portal' + cliente ligada a uma aluna (ped_alunas) → aluna.
 * Uma sessão aberta pelo Portal nunca vale como equipe, mesmo que a pessoa também seja da equipe.
 */
import type { BD } from './bd'
import type { Autor } from './contexto'
import { ErroHttp, type Handler, type Req } from './http'
import { PERFIS, PERMISSOES_PADRAO, type Perfil, type Permissao } from '../shared/permissoes'

export { ErroHttp }

export interface UsuarioSessao {
  id: string
  nome: string
  email: string
  perfil: Perfil
  pessoa_id: string | null
  profissional_id: string | null
  escopo: 'equipe' | 'portal'
  /** Mantido por compatibilidade com as telas: a troca de senha é feita no backoffice. */
  trocar_senha: boolean
  permissoes: Set<Permissao>
}

export const COOKIE = '__Host-cl_sessao'
const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000
const RENOVAR_A_CADA_MS = 5 * 60 * 1000

export async function sha256(t: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ---------------- Permissões ---------------- */

/** Usado só em bancos de teste vazios: em produção as permissões padrão vêm da migration. */
export async function garantirPermissoesPadrao(db: BD) {
  const existe = (await db.get<{ n: number }>('SELECT COUNT(*) n FROM ped_perfil_permissoes'))!
  if (existe.n > 0) return
  const lote = []
  for (const perfil of PERFIS) for (const p of PERMISSOES_PADRAO[perfil]) lote.push({ sql: 'INSERT OR IGNORE INTO ped_perfil_permissoes (perfil, permissao) VALUES (?, ?)', params: [perfil, p] })
  await db.lote(lote)
}

export async function permissoesDoPerfil(db: BD, perfil: Perfil): Promise<Set<Permissao>> {
  if (perfil === 'aluna') return new Set() // a aluna nunca recebe permissões da equipe
  const linhas = await db.all<{ permissao: Permissao }>('SELECT permissao FROM ped_perfil_permissoes WHERE perfil = ?', perfil)
  const s = new Set(linhas.map((l) => l.permissao))
  if (perfil === 'admin') s.add('usuarios:admin') // a Administração nunca perde o acesso às regras
  return s
}

/* ---------------- Sessão do backoffice ---------------- */

export type SituacaoSessao = 'sem_sessao' | 'senha_provisoria' | 'sem_perfil' | 'ok'

/** Lê a sessão do backoffice e descobre o perfil no sistema pedagógico. */
export async function lerSessao(db: BD, token: string | undefined, agora = new Date()): Promise<{ situacao: SituacaoSessao; usuario?: UsuarioSessao; escopo?: 'equipe' | 'portal' }> {
  if (!token || token.length > 100) return { situacao: 'sem_sessao' }
  const hash = await sha256(token)
  const s = await db.get<{ usuario_id: string; email: string; senha_provisoria: number; escopo: 'equipe' | 'portal'; expira_em: string; ultimo_uso_em: string }>(
    `SELECT s.usuario_id, u.email, u.senha_provisoria, s.escopo, s.expira_em, s.ultimo_uso_em
     FROM sessao s JOIN usuario u ON u.id = s.usuario_id WHERE s.token_hash = ?`,
    hash,
  )
  if (!s || s.expira_em <= agora.toISOString()) return { situacao: 'sem_sessao' }
  // Mesma renovação do backoffice: 12 h desde o último uso, gravando no máximo a cada 5 minutos.
  if (agora.getTime() - Date.parse(s.ultimo_uso_em) > RENOVAR_A_CADA_MS) {
    await db.run('UPDATE sessao SET expira_em = ?, ultimo_uso_em = ? WHERE token_hash = ?', new Date(agora.getTime() + DURACAO_SESSAO_MS).toISOString(), agora.toISOString(), hash)
  }
  if (s.senha_provisoria) return { situacao: 'senha_provisoria', escopo: s.escopo }

  if (s.escopo === 'equipe') {
    const m = await db.get<{ nome: string; email: string; papeis: string; perfil_pedagogico: string | null }>(
      'SELECT nome, email, papeis, perfil_pedagogico FROM membro WHERE usuario_id = ?',
      s.usuario_id,
    )
    if (!m) return { situacao: 'sem_perfil', escopo: 'equipe' }
    let papeis: string[] = []
    try {
      papeis = JSON.parse(m.papeis)
    } catch {
      papeis = []
    }
    const perfil = (m.perfil_pedagogico ?? (papeis.includes('admin') ? 'admin' : null)) as Perfil | null
    if (!perfil || perfil === 'aluna' || !PERFIS.includes(perfil)) return { situacao: 'sem_perfil', escopo: 'equipe' }
    const prof = await db.get<{ id: string }>('SELECT id FROM ped_profissionais WHERE usuario_id = ? AND ativo = 1', s.usuario_id)
    return {
      situacao: 'ok',
      escopo: 'equipe',
      usuario: {
        id: s.usuario_id,
        nome: m.nome,
        email: m.email,
        perfil,
        pessoa_id: null,
        profissional_id: prof?.id ?? null,
        escopo: 'equipe',
        trocar_senha: false,
        permissoes: await permissoesDoPerfil(db, perfil),
      },
    }
  }

  // Portal: a conta precisa ser de uma cliente que é aluna do sistema pedagógico.
  const c = await db.get<{ pessoa_id: string; nome: string }>(
    'SELECT c.pessoa_id, p.nome FROM cliente c JOIN ped_alunas a ON a.id = c.pessoa_id JOIN pessoa p ON p.id = c.pessoa_id WHERE c.usuario_id = ?',
    s.usuario_id,
  )
  if (!c) return { situacao: 'sem_perfil', escopo: 'portal' }
  return {
    situacao: 'ok',
    escopo: 'portal',
    usuario: {
      id: s.usuario_id,
      nome: c.nome,
      email: s.email,
      perfil: 'aluna',
      pessoa_id: c.pessoa_id,
      profissional_id: null,
      escopo: 'portal',
      trocar_senha: false,
      permissoes: new Set(),
    },
  }
}

/* ---------------- Middlewares ---------------- */

/**
 * Proteção contra requisição forjada vinda de outro site (o mesmo critério do backoffice): toda
 * chamada que altera algo precisa do cabeçalho do próprio app e, quando o navegador informa a
 * origem, ela tem de ser esta.
 */
export const exigirCabecalhoApp: Handler = (req, _res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.get('X-CL-App') !== '1') throw new ErroHttp(403, 'Requisição recusada: origem não reconhecida.')
    const origem = req.get('Origin')
    if (origem && origem !== new URL(req.raw.url).origin) throw new ErroHttp(403, 'Requisição recusada: origem não reconhecida.')
  }
  next()
}

export const exigirLogin: Handler = (req, _res, next) => {
  if (!req.usuario) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.')
  next()
}

/** Rotas da equipe: exigem sessão de equipe (do backoffice) e um perfil interno. */
export const exigirEquipe: Handler = (req, _res, next) => {
  if (!req.usuario) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.')
  if (req.usuario.perfil === 'aluna' || req.usuario.escopo !== 'equipe') throw new ErroHttp(403, 'Acesso não permitido para este perfil.')
  next()
}

/** Quem pede, para as chamadas a Clientes: a conta e o escopo da sessão. */
export function autorDe(req: Req): Autor {
  if (!req.usuario) throw new ErroHttp(401, 'Sua sessão terminou. Entre novamente.')
  return { usuarioId: req.usuario.id, escopo: req.usuario.escopo }
}

export function tem(req: Req, p: Permissao): boolean {
  return !!req.usuario?.permissoes.has(p)
}

export function exigir(req: Req, ...ps: Permissao[]) {
  for (const p of ps) {
    if (!tem(req, p)) throw new ErroHttp(403, 'Você não tem permissão para esta operação.')
  }
}
