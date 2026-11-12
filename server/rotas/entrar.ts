/**
 * Login da página Diamante Business (/diamante/entrar): alunas e mentoras entram por aqui.
 * Administração, Coordenação e Suporte entram pelo backoffice do Centro Liderar.
 *
 * O sistema pedagógico não guarda senha: quem confere e-mail e senha (com o mesmo bloqueio por
 * tentativas) e abre a sessão é o backoffice, pelo service binding. A sessão é a mesma do
 * backoffice (cookie __Host-cl_sessao), então sair por qualquer um dos lados encerra as duas.
 *
 * Quem entra como o quê:
 *   - conta da equipe com perfil pedagógico Mentora (ou e-mail liberado como Mentora) → sessão de equipe,
 *     área da mentora em /diamante/mentora/;
 *   - conta de Portal ligada a uma aluna do pedagógico → sessão de Portal, portal da aluna;
 *   - demais contas da equipe → senha conferida, sessão desfeita e aviso para usar o backoffice.
 */
import { z } from 'zod'
import { Router } from '../http'
import { COOKIE, ErroHttp, lerSessao, sha256 } from '../auth'
import type { BD } from '../bd'
import type { ContextoApp } from '../contexto'
import { validar } from '../servicos'

export const BASE_MENTORA = '/diamante/mentora/'
export const PAGINA_ENTRAR = '/diamante/entrar'
const BASE_PORTAL = '/portal/diamante-business/'
const DURACAO_COOKIE_S = 12 * 60 * 60
const MSG_EQUIPE = 'Administração, Coordenação e Suporte entram pelo backoffice do Centro Liderar.'
const MSG_SEM_ACESSO = 'Sua conta ainda não tem acesso ao Diamante Business. Fale com a equipe.'

export const cookieSessao = (token: string) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACAO_COOKIE_S}`

/** Quem é a conta deste e-mail, só para escolher o escopo da sessão (a senha é conferida depois). */
async function perfilDoEmail(db: BD, email: string) {
  const l = await db.get<{ membro: number | null; perfil: string | null; papeis: string | null; liberado: number | null; perfil_liberado: string | null; cliente: number | null }>(
    `SELECT (SELECT 1 FROM membro m WHERE m.usuario_id = u.id) AS membro,
            (SELECT m.perfil_pedagogico FROM membro m WHERE m.usuario_id = u.id) AS perfil,
            (SELECT m.papeis FROM membro m WHERE m.usuario_id = u.id) AS papeis,
            (SELECT 1 FROM acesso_permitido a WHERE lower(a.email) = u.email) AS liberado,
            (SELECT a.perfil_pedagogico FROM acesso_permitido a WHERE lower(a.email) = u.email) AS perfil_liberado,
            (SELECT 1 FROM cliente c WHERE c.usuario_id = u.id) AS cliente
       FROM usuario u WHERE u.email = ?`,
    email,
  )
  if (!l) return { tipo: 'desconhecido' as const }
  const equipe = !!(l.membro || l.liberado)
  const perfil = l.membro ? l.perfil : l.perfil_liberado
  if (equipe && perfil === 'mentora') return { tipo: 'mentora' as const }
  if (l.cliente) return { tipo: 'aluna' as const }
  if (equipe) return { tipo: 'equipe' as const }
  return { tipo: 'desconhecido' as const }
}

export function rotaEntrar(db: BD, ctx: ContextoApp) {
  const r = Router()

  r.post('/entrar', async (req, res) => {
    const d = validar(z.object({ email: z.string().trim().min(3, 'Informe o e-mail.').max(200), senha: z.string().min(1, 'Informe a senha.').max(200) }), req.body)
    if (!ctx.acesso) throw new ErroHttp(503, 'O login está indisponível no momento. Tente novamente em instantes.')
    const email = d.email.toLowerCase()
    const quem = await perfilDoEmail(db, email)
    // E-mail sem conta segue para o backoffice também: mesma resposta e mesmo tempo de senha errada.
    const escopo = quem.tipo === 'aluna' || quem.tipo === 'desconhecido' ? 'portal' : 'equipe'
    const { token, senhaProvisoria } = await ctx.acesso.entrar(email, d.senha, escopo)
    const desfazer = async () => {
      await db.run('DELETE FROM sessao WHERE token_hash = ?', await sha256(token))
    }

    if (quem.tipo === 'equipe') {
      await desfazer()
      throw new ErroHttp(403, MSG_EQUIPE)
    }
    let destino = escopo === 'equipe' ? BASE_MENTORA : BASE_PORTAL
    if (senhaProvisoria) destino = '/definir-senha'
    else {
      const s = await lerSessao(db, token)
      const ok = s.situacao === 'ok' && (escopo === 'portal' ? s.usuario?.perfil === 'aluna' : s.usuario?.perfil === 'mentora')
      if (!ok) {
        await desfazer()
        throw new ErroHttp(403, MSG_SEM_ACESSO)
      }
    }
    res.set('Set-Cookie', cookieSessao(token))
    res.json({ destino })
  })

  return r
}
