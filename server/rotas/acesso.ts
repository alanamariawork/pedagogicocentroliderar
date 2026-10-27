import { Router } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import {
  COOKIE,
  ErroHttp,
  bloqueadoPorTentativas,
  conferirSenha,
  criarSessao,
  encerrarSessao,
  encerrarSessoesDoUsuario,
  exigir,
  exigirEquipe,
  exigirLogin,
  gerarHashSenha,
  registrarTentativa,
  validarForcaSenha,
} from '../auth'
import { auditar, booleano, id, textoObrig, validar } from '../servicos'
import { PERFIS, PERMISSOES, type Perfil, type Permissao } from '../../shared/permissoes'

const HASH_FALSO = gerarHashSenha('senha-inexistente-para-tempo-constante')

export function rotasAcesso(db: BD) {
  const r = Router()
  const seguro = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production'

  r.post('/auth/login', (req, res) => {
    const { email, senha } = validar(
      z.object({ email: z.string().trim().toLowerCase().min(3, 'Informe o e-mail.'), senha: z.string().min(1, 'Informe a senha.') }),
      req.body,
    )
    const chave = `${email}|${req.ip}`
    if (bloqueadoPorTentativas(chave)) throw new ErroHttp(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.')
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email) as Record<string, string> | undefined
    const ok = conferirSenha(senha, u?.senha_hash ?? HASH_FALSO) && !!u
    registrarTentativa(chave, ok)
    if (!ok || !u) throw new ErroHttp(401, 'E-mail ou senha incorretos.')
    const { token, expira } = criarSessao(db, u.id)
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: seguro, expires: expira, path: '/' })
    res.json({ ok: true })
  })

  r.post('/auth/logout', (req, res) => {
    const token = req.cookies?.[COOKIE]
    if (token) encerrarSessao(db, token)
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  })

  r.get('/auth/eu', exigirLogin, (req, res) => {
    const u = req.usuario!
    let pessoaNome: string | null = null
    if (u.pessoa_id) pessoaNome = (db.prepare('SELECT nome FROM pessoas WHERE id = ?').get(u.pessoa_id) as { nome: string } | undefined)?.nome ?? null
    res.json({
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: u.perfil,
      pessoa_id: u.pessoa_id,
      pessoa_nome: pessoaNome,
      profissional_id: u.profissional_id,
      trocar_senha: u.trocar_senha,
      permissoes: [...u.permissoes],
    })
  })

  r.post('/auth/senha', exigirLogin, (req, res) => {
    const { atual, nova } = validar(z.object({ atual: z.string().min(1, 'Informe a senha atual.'), nova: z.string() }), req.body)
    const u = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(req.usuario!.id) as { senha_hash: string }
    if (!conferirSenha(atual, u.senha_hash)) throw new ErroHttp(400, 'A senha atual não confere.')
    const erro = validarForcaSenha(nova)
    if (erro) throw new ErroHttp(400, erro)
    db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 0, atualizado_em = ? WHERE id = ?').run(gerarHashSenha(nova), agoraIso(), req.usuario!.id)
    auditar(db, req, { entidade: 'usuario', entidade_id: req.usuario!.id, acao: 'senha_alterada' })
    res.json({ ok: true })
  })

  /* ---------------- Usuários (Administração) ---------------- */

  const esquemaUsuario = z.object({
    nome: textoObrig('o nome', 200),
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    perfil: z.enum(PERFIS, { error: 'Selecione o perfil.' }),
    pessoa_id: id(),
    profissional_id: id(),
    ativo: booleano().optional(),
  })

  function conferirVinculos(dados: z.infer<typeof esquemaUsuario>) {
    if (dados.perfil === 'aluna' && !dados.pessoa_id) throw new ErroHttp(400, 'Usuário do perfil Aluna precisa estar vinculado a uma aluna.')
    if (dados.perfil !== 'aluna' && dados.pessoa_id) throw new ErroHttp(400, 'Somente o perfil Aluna é vinculado a uma aluna.')
    if (dados.perfil === 'mentora' && !dados.profissional_id)
      throw new ErroHttp(400, 'Usuário do perfil Mentora precisa estar vinculado a uma profissional.')
  }

  r.get('/usuarios', exigirEquipe, (req, res) => {
    // Lista resumida (nome e perfil) é usada para escolher responsáveis; detalhes só para a Administração.
    const admin = req.usuario!.permissoes.has('usuarios:admin')
    const linhas = db
      .prepare(
        `SELECT u.id, u.nome, u.perfil, u.ativo ${admin ? ', u.email, u.pessoa_id, u.profissional_id, u.trocar_senha, p.nome AS pessoa_nome, pr.nome AS profissional_nome' : ''}
         FROM usuarios u LEFT JOIN pessoas p ON p.id = u.pessoa_id LEFT JOIN profissionais pr ON pr.id = u.profissional_id
         ${admin ? '' : "WHERE u.perfil <> 'aluna' AND u.ativo = 1"} ORDER BY u.nome`,
      )
      .all()
    res.json(linhas)
  })

  r.post('/usuarios', exigirEquipe, (req, res) => {
    exigir(req, 'usuarios:admin')
    const dados = validar(esquemaUsuario.extend({ senha_inicial: z.string() }), req.body)
    conferirVinculos(dados)
    const erro = validarForcaSenha(dados.senha_inicial)
    if (erro) throw new ErroHttp(400, erro)
    if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(dados.email)) throw new ErroHttp(409, 'Já existe um usuário com este e-mail.')
    const novo = novoId()
    const agora = agoraIso()
    db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, perfil, pessoa_id, profissional_id, ativo, trocar_senha, criado_em, atualizado_em)
       VALUES (?,?,?,?,?,?,?,1,1,?,?)`,
    ).run(novo, dados.nome, dados.email, gerarHashSenha(dados.senha_inicial), dados.perfil, dados.pessoa_id ?? null, dados.profissional_id ?? null, agora, agora)
    auditar(db, req, { entidade: 'usuario', entidade_id: novo, acao: 'criado', pessoa_id: dados.pessoa_id, dados: { nome: dados.nome, perfil: dados.perfil } })
    res.status(201).json({ id: novo })
  })

  r.put('/usuarios/:id', exigirEquipe, (req, res) => {
    exigir(req, 'usuarios:admin')
    const dados = validar(esquemaUsuario.extend({ nova_senha: z.string().optional() }), req.body)
    conferirVinculos(dados)
    const atual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!atual) throw new ErroHttp(404, 'Usuário não encontrado.')
    if (atual.id === req.usuario!.id && (dados.perfil !== 'admin' || dados.ativo === false))
      throw new ErroHttp(400, 'Você não pode remover o próprio acesso de Administração.')
    const outro = db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND id <> ?').get(dados.email, req.params.id)
    if (outro) throw new ErroHttp(409, 'Já existe um usuário com este e-mail.')
    db.prepare(
      `UPDATE usuarios SET nome=?, email=?, perfil=?, pessoa_id=?, profissional_id=?, ativo=?, atualizado_em=? WHERE id=?`,
    ).run(dados.nome, dados.email, dados.perfil, dados.pessoa_id ?? null, dados.profissional_id ?? null, dados.ativo === false ? 0 : 1, agoraIso(), req.params.id)
    if (dados.nova_senha) {
      const erro = validarForcaSenha(dados.nova_senha)
      if (erro) throw new ErroHttp(400, erro)
      db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?').run(gerarHashSenha(dados.nova_senha), req.params.id)
    }
    if (dados.nova_senha || dados.ativo === false || dados.perfil !== atual.perfil) encerrarSessoesDoUsuario(db, req.params.id as string)
    auditar(db, req, { entidade: 'usuario', entidade_id: req.params.id as string, acao: 'atualizado', dados: { perfil: dados.perfil, ativo: dados.ativo !== false, senha_redefinida: !!dados.nova_senha } })
    res.json({ ok: true })
  })

  /* ---------------- Regras de acesso ---------------- */

  r.get('/permissoes', exigirEquipe, (req, res) => {
    exigir(req, 'usuarios:admin')
    const linhas = db.prepare('SELECT perfil, permissao FROM perfil_permissoes').all() as { perfil: Perfil; permissao: Permissao }[]
    const mapa: Record<string, string[]> = {}
    for (const p of PERFIS) mapa[p] = []
    for (const l of linhas) mapa[l.perfil]?.push(l.permissao)
    res.json({ perfis: PERFIS, permissoes: PERMISSOES, mapa })
  })

  r.put('/permissoes', exigirEquipe, (req, res) => {
    exigir(req, 'usuarios:admin')
    const nomes = Object.keys(PERMISSOES) as [Permissao, ...Permissao[]]
    const { mapa } = validar(z.object({ mapa: z.record(z.enum(PERFIS), z.array(z.enum(nomes))) }), req.body)
    db.transaction(() => {
      db.prepare('DELETE FROM perfil_permissoes').run()
      const ins = db.prepare('INSERT OR IGNORE INTO perfil_permissoes (perfil, permissao) VALUES (?,?)')
      for (const perfil of PERFIS) {
        if (perfil === 'aluna') continue // a aluna usa somente o portal
        const lista = new Set(mapa[perfil] ?? [])
        if (perfil === 'admin') lista.add('usuarios:admin')
        for (const p of lista) ins.run(perfil, p)
      }
      auditar(db, req, { entidade: 'regras_acesso', entidade_id: 'perfis', acao: 'atualizado', dados: mapa })
    })()
    res.json({ ok: true })
  })

  return r
}
