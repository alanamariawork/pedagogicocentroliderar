import type { Request } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from './db'
import { ErroHttp, tem } from './auth'
import { dataValida, horarioValido, hojeSP } from '../shared/datas'

/* ---------------- Validação ---------------- */

export function validar<T extends z.ZodType>(schema: T, dados: unknown): z.infer<T> {
  const r = schema.safeParse(dados)
  if (!r.success) {
    const primeiro = r.error.issues[0]
    const campo = primeiro?.path.join('.')
    throw new ErroHttp(400, primeiro?.message ? `${primeiro.message}${campo ? ` (${campo})` : ''}` : 'Dados inválidos.', r.error.issues)
  }
  return r.data
}

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

/** Aceita true/false e também 1/0 (como vem do banco). */
export const booleano = () => z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => !!v)

export const texto = (max = 2000) => z.preprocess(vazioParaNulo, z.string().trim().max(max).nullable().optional())
export const textoObrig = (rotulo: string, max = 500) =>
  z.string({ error: `Informe ${rotulo}.` }).trim().min(1, `Informe ${rotulo}.`).max(max)
export const data = (rotulo = 'a data') =>
  z.preprocess(
    vazioParaNulo,
    z
      .string()
      .refine(dataValida, `Data inválida: ${rotulo}. Use DD/MM/AAAA.`)
      .nullable()
      .optional(),
  )
export const dataObrig = (rotulo = 'a data') =>
  z.string({ error: `Informe ${rotulo}.` }).refine(dataValida, `Informe ${rotulo} válida.`)
export const horarioObrig = (rotulo = 'o horário') =>
  z.string({ error: `Informe ${rotulo}.` }).refine(horarioValido, `Informe ${rotulo} válido.`)
export const id = () => z.preprocess(vazioParaNulo, z.string().uuid().nullable().optional())
export const idObrig = (rotulo: string) => z.string({ error: `Selecione ${rotulo}.` }).uuid(`Selecione ${rotulo}.`)
export const minutos = () =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number().int('Duração em minutos inteiros.').positive('A duração precisa ser maior que zero.').max(24 * 60).nullable(),
  )
export const link = () =>
  z.preprocess(
    vazioParaNulo,
    z
      .string()
      .trim()
      .max(1000)
      .refine((v) => {
        try {
          const u = new URL(v)
          return u.protocol === 'https:' || u.protocol === 'http:'
        } catch {
          return false
        }
      }, 'Link inválido. Use um endereço começando com https://')
      .nullable()
      .optional(),
  )

/* ---------------- Auditoria ---------------- */

export function auditar(
  db: BD,
  req: Request,
  ev: { entidade: string; entidade_id: string; acao: string; matricula_id?: string | null; pessoa_id?: string | null; dados?: unknown },
) {
  let pessoaId = ev.pessoa_id ?? null
  if (!pessoaId && ev.matricula_id) {
    pessoaId = (db.prepare('SELECT pessoa_id FROM matriculas WHERE id = ?').get(ev.matricula_id) as { pessoa_id: string } | undefined)?.pessoa_id ?? null
  }
  db.prepare(
    `INSERT INTO auditoria (id, entidade, entidade_id, acao, pessoa_id, matricula_id, dados, autor_id, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(novoId(), ev.entidade, ev.entidade_id, ev.acao, pessoaId, ev.matricula_id ?? null, ev.dados === undefined ? null : JSON.stringify(ev.dados), req.usuario?.id ?? null, agoraIso())
}

/* ---------------- Escopo de acesso ---------------- */

/**
 * Condição SQL para as matrículas que o usuário pode ver.
 * Mentora: somente as matrículas em que é mentora responsável ou profissional de algum item/ocorrência.
 */
export function escopoMatriculas(req: Request, alias = 'm'): { sql: string; params: Record<string, unknown> } {
  const u = req.usuario!
  if (u.perfil === 'mentora') {
    return {
      sql: `${alias}.id IN (
        SELECT id FROM matriculas WHERE mentora_id = @escopo_prof
        UNION SELECT matricula_id FROM itens_contratados WHERE profissional_id = @escopo_prof
        UNION SELECT matricula_id FROM ocorrencias WHERE profissional_id = @escopo_prof)`,
      params: { escopo_prof: u.profissional_id ?? '__nenhum__' },
    }
  }
  return { sql: '1=1', params: {} }
}

export function exigirAcessoMatricula(db: BD, req: Request, matriculaId: string) {
  const esc = escopoMatriculas(req)
  const m = db.prepare(`SELECT m.* FROM matriculas m WHERE m.id = @id AND ${esc.sql}`).get({ id: matriculaId, ...esc.params }) as
    | Record<string, unknown>
    | undefined
  if (!m) throw new ErroHttp(404, 'Matrícula não encontrada ou sem acesso.')
  return m as Matricula
}

export interface Matricula {
  id: string
  pessoa_id: string
  situacao: 'ativa' | 'pausada' | 'encerrada' | 'cancelada'
  data_inicio: string | null
  data_fim: string | null
  matricula_anterior_id: string | null
  [k: string]: unknown
}

/* ---------------- Itens e ocorrências ---------------- */

export function resumoItem(db: BD, itemId: string) {
  return db
    .prepare(
      `SELECT i.quantidade + COALESCE((SELECT SUM(delta) FROM ajustes_obrigacao a WHERE a.item_id = i.id), 0) AS contratada,
              (SELECT COUNT(*) FROM ocorrencias o WHERE o.item_id = i.id AND o.situacao = 'realizada') AS realizadas,
              (SELECT COUNT(*) FROM ocorrencias o WHERE o.item_id = i.id AND o.situacao <> 'cancelada') AS ativas
       FROM itens_contratados i WHERE i.id = ?`,
    )
    .get(itemId) as { contratada: number; realizadas: number; ativas: number }
}

/**
 * Mantém a regra: nº de ocorrências não canceladas = quantidade contratada (+ ajustes).
 * Faltando, cria ocorrências sem previsão. Sobrando, cancela as abertas sem agendamento
 * (as últimas primeiro) com o motivo informado. Nunca toca em ocorrências realizadas ou agendadas.
 */
export function sincronizarOcorrencias(db: BD, req: Request, itemId: string, motivo: string) {
  const item = db.prepare('SELECT * FROM itens_contratados WHERE id = ?').get(itemId) as { id: string; matricula_id: string }
  const r = resumoItem(db, itemId)
  const agora = agoraIso()
  if (r.ativas < r.contratada) {
    const maxNum = (db.prepare('SELECT COALESCE(MAX(numero),0) n FROM ocorrencias WHERE item_id = ?').get(itemId) as { n: number }).n
    const ins = db.prepare(
      `INSERT INTO ocorrencias (id, item_id, matricula_id, numero, situacao, criado_em, atualizado_em, autor_id)
       VALUES (?,?,?,?, 'prevista', ?, ?, ?)`,
    )
    for (let k = 1; k <= r.contratada - r.ativas; k++) ins.run(novoId(), itemId, item.matricula_id, maxNum + k, agora, agora, req.usuario?.id ?? null)
  } else if (r.ativas > r.contratada) {
    const excesso = r.ativas - r.contratada
    const candidatas = db
      .prepare(
        `SELECT id FROM ocorrencias WHERE item_id = ? AND situacao NOT IN ('realizada','cancelada','agendada')
         ORDER BY (data_prevista IS NULL) DESC, numero DESC LIMIT ?`,
      )
      .all(itemId, excesso) as { id: string }[]
    if (candidatas.length < excesso) {
      throw new ErroHttp(
        409,
        'Não é possível reduzir: as ocorrências restantes já estão agendadas ou realizadas. Desmarque um agendamento antes.',
      )
    }
    for (const c of candidatas) {
      db.prepare(`UPDATE ocorrencias SET situacao = 'cancelada', cancelamento_motivo = ?, atualizado_em = ? WHERE id = ?`).run(motivo, agora, c.id)
      historico(db, req, c.id, 'cancelada', null, null, motivo)
    }
  }
}

export function historico(
  db: BD,
  req: Request,
  ocorrenciaId: string,
  tipo: string,
  anterior: string | null,
  novo: string | null,
  motivo: string | null,
) {
  const o = db.prepare('SELECT data_prevista_original, data_prevista FROM ocorrencias WHERE id = ?').get(ocorrenciaId) as
    | { data_prevista_original: string | null; data_prevista: string | null }
    | undefined
  db.prepare(
    `INSERT INTO ocorrencia_historico (id, ocorrencia_id, tipo, valor_anterior, valor_novo, previsao_original, motivo, autor_id, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(novoId(), ocorrenciaId, tipo, anterior, novo, o?.data_prevista_original ?? o?.data_prevista ?? null, motivo, req.usuario?.id ?? null, agoraIso())
}

/** Consulta de ocorrências com tudo o que o painel precisa, sem multiplicar linhas por contatos. */
export const SQL_OCORRENCIAS = `
SELECT o.*,
  i.descricao AS item_descricao, i.tipo_id, t.nome AS tipo_nome, i.origem AS item_origem, i.especialidade,
  COALESCE(o.duracao_min, i.duracao_min) AS duracao_efetiva,
  COALESCE(o.profissional_id, i.profissional_id) AS profissional_efetivo_id,
  pr.nome AS profissional_nome,
  m.pessoa_id, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.demonstracao, m.data_inicio, m.data_fim, m.situacao AS matricula_situacao,
  m.programa_id, prog.nome AS programa_nome, m.responsavel_id, m.matricula_anterior_id,
  r.id AS reserva_id, r.inicio AS reserva_inicio, r.fim AS reserva_fim,
  imp.id AS impedimento_id, mi.nome AS impedimento_motivo, imp.descricao AS impedimento_descricao,
  imp.responsavel_id AS impedimento_responsavel_id, ui.nome AS impedimento_responsavel_nome,
  ur.nome AS responsavel_resolucao_nome,
  (SELECT MAX(c.data) FROM contatos c WHERE c.matricula_id = o.matricula_id AND (c.ocorrencia_id = o.id OR c.ocorrencia_id IS NULL)) AS ultimo_contato,
  (SELECT c.proxima_tentativa FROM contatos c WHERE c.matricula_id = o.matricula_id AND (c.ocorrencia_id = o.id OR c.ocorrencia_id IS NULL)
     ORDER BY c.data DESC, c.criado_em DESC LIMIT 1) AS proxima_tentativa,
  (SELECT i.quantidade + COALESCE(SUM(a.delta),0) FROM ajustes_obrigacao a WHERE a.item_id = i.id) AS item_contratada,
  (SELECT COUNT(*) FROM ocorrencias o2 WHERE o2.item_id = i.id AND o2.situacao = 'realizada') AS item_realizadas
FROM ocorrencias o
JOIN itens_contratados i ON i.id = o.item_id
JOIN matriculas m ON m.id = o.matricula_id
JOIN pessoas p ON p.id = m.pessoa_id
LEFT JOIN tipos_entregavel t ON t.id = i.tipo_id
LEFT JOIN profissionais pr ON pr.id = COALESCE(o.profissional_id, i.profissional_id)
LEFT JOIN programas prog ON prog.id = m.programa_id
LEFT JOIN reservas r ON r.ocorrencia_id = o.id AND r.ativa = 1
LEFT JOIN impedimentos imp ON imp.id = (SELECT id FROM impedimentos x WHERE x.ocorrencia_id = o.id AND x.ativo = 1 ORDER BY x.criado_em DESC LIMIT 1)
LEFT JOIN motivos_impedimento mi ON mi.id = imp.motivo_id
LEFT JOIN usuarios ui ON ui.id = imp.responsavel_id
LEFT JOIN usuarios ur ON ur.id = o.responsavel_resolucao_id
`

export function hoje(): string {
  return process.env.HOJE_FIXO && dataValida(process.env.HOJE_FIXO) ? process.env.HOJE_FIXO : hojeSP()
}

export function config(db: BD, chave: string, padrao: string): string {
  const r = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave) as { valor: string } | undefined
  return r?.valor ?? padrao
}

/** Remove campos que o usuário não pode ver. */
export function filtrarNotas<T extends Record<string, unknown>>(req: Request, linha: T): T {
  if (!tem(req, 'notas:internas')) {
    const c = { ...linha }
    delete c.notas_internas
    return c
  }
  return linha
}
