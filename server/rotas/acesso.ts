import { Router } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, transacao, type BD } from '../db'
import { autorDe, ErroHttp, exigir, exigirEquipe, exigirLogin } from '../auth'
import { auditar, id, validar } from '../servicos'
import { PERFIS, PERMISSOES, type Perfil, type Permissao } from '../../shared/permissoes'

/** Perfis que uma pessoa da equipe pode ter no sistema pedagógico (a aluna é uma cliente do Portal). */
const PERFIS_EQUIPE = PERFIS.filter((p) => p !== 'aluna') as [Exclude<Perfil, 'aluna'>, ...Exclude<Perfil, 'aluna'>[]]

export function rotasAcesso(db: BD, ctx: ContextoApp) {
  const r = Router()

  r.get('/auth/eu', exigirLogin, async (req, res) => {
    const u = req.usuario!
    let pessoaNome: string | null = null
    if (u.pessoa_id) pessoaNome = (await db.get<{ nome: string }>('SELECT nome FROM ped_pessoas WHERE id = ?', u.pessoa_id))?.nome ?? null
    res.json({
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: u.perfil,
      pessoa_id: u.pessoa_id,
      pessoa_nome: pessoaNome,
      profissional_id: u.profissional_id,
      trocar_senha: false,
      permissoes: [...u.permissoes],
    })
  })

  /* ---------------- Equipe (contas do backoffice) ---------------- */

  // As contas são do backoffice (Configurações › Equipe, lá). Aqui a Administração escolhe o perfil
  // de cada pessoa da equipe no sistema pedagógico e, para a mentora, a profissional que ela é.

  r.get('/usuarios', exigirEquipe, async (req, res) => {
    // Lista resumida (nome e perfil) é usada para escolher responsáveis; detalhes só para a Administração.
    const admin = req.usuario!.permissoes.has('usuarios:admin')
    const linhas = admin
      ? await db.all(
          `SELECT m.usuario_id AS id, m.nome, m.email, u.perfil, u.ativo, m.perfil_pedagogico, m.papeis,
                  u.profissional_id, pr.nome AS profissional_nome
           FROM membro m JOIN ped_usuarios u ON u.id = m.usuario_id LEFT JOIN ped_profissionais pr ON pr.id = u.profissional_id
           ORDER BY m.nome`,
        )
      : await db.all("SELECT id, nome, perfil, ativo FROM ped_usuarios WHERE perfil IS NOT NULL AND perfil <> 'aluna' AND ativo = 1 ORDER BY nome")
    res.json(linhas)
  })

  r.put('/usuarios/:id', exigirEquipe, async (req, res) => {
    exigir(req, 'usuarios:admin')
    const dados = validar(
      z.object({
        perfil: z.enum(PERFIS_EQUIPE).nullable(),
        profissional_id: id(),
      }),
      req.body,
    )
    const alvo = req.params.id
    const membro = await db.get<{ usuario_id: string; perfil_pedagogico: string | null }>('SELECT usuario_id, perfil_pedagogico FROM membro WHERE usuario_id = ?', alvo)
    if (!membro) throw new ErroHttp(404, 'Pessoa da equipe não encontrada. As contas são criadas no backoffice, em Configurações › Equipe.')
    if (alvo === req.usuario!.id && dados.perfil !== 'admin') throw new ErroHttp(400, 'Você não pode remover o próprio acesso de Administração.')
    if (dados.perfil === 'mentora' && !dados.profissional_id) throw new ErroHttp(400, 'Escolha a profissional que esta mentora é.')
    if (dados.profissional_id) {
      const pr = await db.get<{ usuario_id: string | null }>('SELECT usuario_id FROM ped_profissionais WHERE id = ?', dados.profissional_id)
      if (!pr) throw new ErroHttp(400, 'Profissional não encontrada.')
      if (pr.usuario_id && pr.usuario_id !== alvo) throw new ErroHttp(409, 'Esta profissional já está ligada a outra pessoa da equipe.')
    }
    await transacao(db, async (tx) => {
      tx.run('UPDATE membro SET perfil_pedagogico = ? WHERE usuario_id = ?', dados.perfil, alvo)
      tx.run('UPDATE ped_profissionais SET usuario_id = NULL WHERE usuario_id = ?', alvo)
      if (dados.profissional_id) tx.run('UPDATE ped_profissionais SET usuario_id = ?, atualizado_em = ? WHERE id = ?', alvo, agoraIso(), dados.profissional_id)
      await auditar(tx, req, { entidade: 'usuario', entidade_id: alvo, acao: 'perfil_pedagogico', dados: { antes: membro.perfil_pedagogico, perfil: dados.perfil, profissional_id: dados.profissional_id ?? null } })
    })
    res.json({ ok: true })
  })

  /* ---------------- Regras de acesso ---------------- */

  r.get('/permissoes', exigirEquipe, async (req, res) => {
    exigir(req, 'usuarios:admin')
    const linhas = await db.all<{ perfil: Perfil; permissao: Permissao }>('SELECT perfil, permissao FROM ped_perfil_permissoes')
    const mapa: Record<string, string[]> = {}
    for (const p of PERFIS) mapa[p] = []
    for (const l of linhas) mapa[l.perfil]?.push(l.permissao)
    res.json({ perfis: PERFIS, permissoes: PERMISSOES, mapa })
  })

  r.put('/permissoes', exigirEquipe, async (req, res) => {
    exigir(req, 'usuarios:admin')
    const nomes = Object.keys(PERMISSOES) as [Permissao, ...Permissao[]]
    const { mapa } = validar(z.object({ mapa: z.record(z.enum(PERFIS), z.array(z.enum(nomes))) }), req.body)
    await transacao(db, async (tx) => {
      tx.run('DELETE FROM ped_perfil_permissoes')
      for (const perfil of PERFIS) {
        if (perfil === 'aluna') continue // a aluna usa somente o portal
        const lista = new Set(mapa[perfil] ?? [])
        if (perfil === 'admin') lista.add('usuarios:admin')
        for (const p of lista) tx.run('INSERT OR IGNORE INTO ped_perfil_permissoes (perfil, permissao) VALUES (?,?)', perfil, p)
      }
      await auditar(tx, req, { entidade: 'regras_acesso', entidade_id: 'perfis', acao: 'atualizado', dados: mapa })
    })
    res.json({ ok: true })
  })

  /* ---------------- Acesso da aluna ao Portal ---------------- */

  // O acesso é o do Portal do backoffice: convite por e-mail, primeiro acesso com aceite dos termos.
  r.post('/pessoas/:id/convite-portal', exigirEquipe, async (req, res) => {
    exigir(req, 'usuarios:admin')
    const aluna = await db.get<{ id: string; email: string | null }>('SELECT id, email FROM ped_pessoas WHERE id = ?', req.params.id)
    if (!aluna) throw new ErroHttp(404, 'Aluna não encontrada.')
    if (!aluna.email) throw new ErroHttp(400, 'Cadastre o e-mail da aluna antes de convidar para o portal.')
    const r2 = await ctx.clientes.convidarPortal(autorDe(req), aluna.id, req.body?.reenviar === true)
    await auditar(db, req, { entidade: 'pessoa', entidade_id: aluna.id, acao: 'convite_portal', pessoa_id: aluna.id, dados: { situacao: r2.situacao } })
    res.json({ ...r2, email: aluna.email })
  })

  return r
}
