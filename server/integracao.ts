/**
 * Clientes (backoffice) para o sistema pedagógico.
 *
 * Produção: `clientesPeloBackoffice` chama o Worker do backoffice pelo service binding BACKOFFICE
 * (entrypoint "Pedagogico"). Toda criação ou alteração de pessoa passa pela regra que o backoffice já
 * usa na tela Clientes: validação, CPF único, auditoria e fila de gravação.
 *
 * Testes e desenvolvimento local: `clientesLocais` grava direto na tabela pessoa com as mesmas
 * restrições básicas do esquema. Nunca é usado em produção (ver server/worker.ts).
 */
import { ErroHttp } from './http'
import type { BD } from './bd'
import type { Autor, AvisoEmail, Clientes, ConvitePortal, DadosPessoa, ResultadoEmailAviso } from './contexto'

/** O que o backoffice responde pelo RPC. Erros de regra voltam como dado, não como exceção. */
export type RespostaRpc<T> = { ok: true; dados: T } | { ok: false; status: number; erro: string }

/** Métodos que o entrypoint "Pedagogico" do backoffice expõe. */
export interface BackofficePedagogico {
  criarPessoa(autor: Autor, dados: DadosPessoa): Promise<RespostaRpc<{ id: string }>>
  atualizarPessoa(autor: Autor, pessoaId: string, dados: Partial<DadosPessoa>): Promise<RespostaRpc<null>>
  convidarPortal(autor: Autor, pessoaId: string, reenviar?: boolean): Promise<RespostaRpc<ConvitePortal>>
  enviarAvisoAluna(pessoaId: string, aviso: AvisoEmail): Promise<RespostaRpc<ResultadoEmailAviso>>
}

function abrir<T>(r: RespostaRpc<T>): T {
  if (r.ok) return r.dados
  // 4xx do backoffice (validação, CPF repetido, sem e-mail) chega à tela com a mensagem original.
  throw new ErroHttp(r.status >= 400 && r.status < 500 ? r.status : 502, r.erro || 'O cadastro de Clientes não respondeu. Tente novamente.')
}

export function clientesPeloBackoffice(bo: BackofficePedagogico): Clientes {
  return {
    async criarPessoa(autor, dados) {
      return abrir(await bo.criarPessoa(autor, dados))
    },
    async atualizarPessoa(autor, pessoaId, dados) {
      abrir(await bo.atualizarPessoa(autor, pessoaId, dados))
    },
    async convidarPortal(autor, pessoaId, reenviar = false) {
      return abrir(await bo.convidarPortal(autor, pessoaId, reenviar))
    },
    async enviarAvisoAluna(pessoaId, aviso) {
      return abrir(await bo.enviarAvisoAluna(pessoaId, aviso))
    },
  }
}

/* ---------------- Somente testes e desenvolvimento local ---------------- */

function normalizar(d: Partial<DadosPessoa>): Partial<DadosPessoa> {
  const out: Partial<DadosPessoa> = {}
  if (d.nome !== undefined) {
    const nome = d.nome.trim()
    if (nome.length < 1 || nome.length > 160) throw new ErroHttp(400, 'Informe o nome (até 160 caracteres).')
    out.nome = nome
  }
  if (d.email !== undefined) {
    const email = d.email?.trim().toLowerCase() || null
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErroHttp(400, 'E-mail inválido.')
    out.email = email
  }
  if (d.telefone !== undefined) {
    const tel = d.telefone?.replace(/\D/g, '') || null
    if (tel && (tel.length < 8 || tel.length > 15)) throw new ErroHttp(400, 'Telefone inválido: use de 8 a 15 dígitos.')
    out.telefone = tel
  }
  if (d.cpf !== undefined) {
    const cpf = d.cpf?.replace(/\D/g, '') || null
    if (cpf && cpf.length !== 11) throw new ErroHttp(400, 'CPF inválido.')
    out.cpf = cpf
  }
  return out
}

/**
 * Imitação local da regra de Clientes, para testes. Convites não enviam e-mail: ficam em `convites`.
 */
export function clientesLocais(db: BD): Clientes & { convites: { pessoaId: string; email: string }[]; autores: Autor[]; emailsAviso: { pessoaId: string; email: string; aviso: AvisoEmail }[]; emailDesativado: boolean } {
  const convites: { pessoaId: string; email: string }[] = []
  /** E-mails de aviso que o backoffice enviaria (nada sai daqui). */
  const emailsAviso: { pessoaId: string; email: string; aviso: AvisoEmail }[] = []
  /** Quem pediu cada alteração (para os testes conferirem o escopo enviado ao backoffice). */
  const autores: Autor[] = []
  return {
    convites,
    autores,
    emailsAviso,
    emailDesativado: false,
    async enviarAvisoAluna(pessoaId, aviso) {
      const p = await db.get<{ email: string | null }>('SELECT email FROM pessoa WHERE id = ?', pessoaId)
      if (!p) throw new ErroHttp(404, 'Pessoa não encontrada em Clientes.')
      if (!p.email) return { enviado: false, motivo: 'sem_email', explicacao: 'a aluna não tem e-mail cadastrado em Clientes' }
      if (this.emailDesativado) return { enviado: false, motivo: 'envio_desativado', explicacao: 'o envio de e-mail está desativado neste ambiente' }
      emailsAviso.push({ pessoaId, email: p.email, aviso })
      return { enviado: true, provedor_id: `local-${emailsAviso.length}` }
    },
    async criarPessoa(autor, dados) {
      autores.push(autor)
      const d = normalizar(dados)
      if (!d.nome) throw new ErroHttp(400, 'Informe o nome.')
      if (d.cpf && (await db.get('SELECT 1 FROM pessoa WHERE cpf = ?', d.cpf))) throw new ErroHttp(409, 'Já existe uma pessoa com este CPF.')
      const org = (await db.get<{ id: string }>('SELECT id FROM organizacao LIMIT 1'))?.id
      if (!org) throw new ErroHttp(500, 'Organização não cadastrada.')
      const id = crypto.randomUUID()
      await db.run('INSERT INTO pessoa (id, organizacao_id, nome, email, telefone, cpf) VALUES (?,?,?,?,?,?)', id, org, d.nome, d.email ?? null, d.telefone ?? null, d.cpf ?? null)
      return { id }
    },
    async atualizarPessoa(autor, pessoaId, dados) {
      autores.push(autor)
      const d = normalizar(dados)
      const campos = Object.keys(d) as (keyof DadosPessoa)[]
      if (!campos.length) return
      if (d.cpf && (await db.get('SELECT 1 FROM pessoa WHERE cpf = ? AND id <> ?', d.cpf, pessoaId))) throw new ErroHttp(409, 'Já existe uma pessoa com este CPF.')
      const r = await db.run(
        `UPDATE pessoa SET ${campos.map((c) => `${c} = ?`).join(', ')}, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        ...campos.map((c) => d[c] ?? null),
        pessoaId,
      )
      if (!r.changes) throw new ErroHttp(404, 'Pessoa não encontrada em Clientes.')
    },
    async convidarPortal(_autor, pessoaId) {
      const p = await db.get<{ email: string | null }>('SELECT email FROM pessoa WHERE id = ?', pessoaId)
      if (!p) throw new ErroHttp(404, 'Pessoa não encontrada em Clientes.')
      if (!p.email) throw new ErroHttp(400, 'Cadastre o e-mail da aluna antes de convidar para o portal.')
      if (await db.get('SELECT 1 FROM cliente WHERE pessoa_id = ?', pessoaId)) return { situacao: 'ja_tem_acesso', mensagem: 'Esta pessoa já ativou o acesso ao Portal.' }
      convites.push({ pessoaId, email: p.email })
      return { situacao: 'enviado', mensagem: `Convite enviado para ${p.email}.` }
    },
  }
}
