/**
 * Acesso ao banco D1 (Cloudflare). Todas as consultas são assíncronas.
 *
 * O D1 não tem transação interativa: o que precisa ser "tudo ou nada" é montado como um lote
 * (`transacao`), em que as gravações ficam guardadas e vão juntas, num único `batch`, no fim.
 * Leituras dentro de uma transação enxergam o banco como estava ANTES dela: nenhuma regra pode
 * depender de ler, na mesma transação, algo que ela mesma acabou de gravar.
 */

export type Valor = string | number | null | boolean | ArrayBuffer | Uint8Array
export interface Instrucao {
  sql: string
  params: Valor[]
}

export interface Leitura {
  get<T = Record<string, any>>(sql: string, ...params: unknown[]): Promise<T | undefined> // eslint-disable-line @typescript-eslint/no-explicit-any
  all<T = Record<string, any>>(sql: string, ...params: unknown[]): Promise<T[]> // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Banco fora de transação: grava na hora e informa quantas linhas mudaram. */
export interface BD extends Leitura {
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>
  /** Grava tudo ou nada, na ordem. */
  lote(instrucoes: Instrucao[]): Promise<void>
}

/** Banco dentro de transação: as gravações só acontecem no fim, todas juntas. */
export interface TX extends Leitura {
  run(sql: string, ...params: unknown[]): void
}

/** Banco aceito por funções que tanto podem gravar na hora quanto entrar numa transação. */
export type BDouTX = BD | TX

const valor = (p: unknown): Valor => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : (p as Valor))

const ehObjetoSimples = (p: unknown): p is Record<string, unknown> =>
  !!p && typeof p === 'object' && !Array.isArray(p) && !(p instanceof ArrayBuffer) && !(p instanceof Uint8Array)

/**
 * O D1 só aceita parâmetros por posição (?). Parâmetros com nome (@id), passados num objeto,
 * viram posicionais aqui, fora de trechos entre aspas.
 */
export function preparar(sql: string, params: unknown[]): Instrucao {
  if (params.length === 1 && ehObjetoSimples(params[0])) {
    const obj = params[0]
    const lista: Valor[] = []
    let out = ''
    let i = 0
    while (i < sql.length) {
      const ch = sql[i]
      if (ch === "'" || ch === '"') {
        const fim = sql.indexOf(ch, i + 1)
        const ate = fim < 0 ? sql.length : fim + 1
        out += sql.slice(i, ate)
        i = ate
        continue
      }
      const m = ch === '@' ? /^@([A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(i)) : null
      if (m) {
        if (!(m[1] in obj)) throw new Error(`Parâmetro @${m[1]} sem valor`)
        lista.push(valor(obj[m[1]]))
        out += '?'
        i += m[0].length
        continue
      }
      out += ch
      i++
    }
    return { sql: out, params: lista }
  }
  return { sql, params: params.map(valor) }
}


export function bancoD1(d1: D1Database): BD {
  const prep = (sql: string, params: unknown[]) => {
    const p = preparar(sql, params)
    return d1.prepare(p.sql).bind(...p.params)
  }
  return {
    async get(sql, ...params) {
      return ((await prep(sql, params).first()) ?? undefined) as never
    },
    async all(sql, ...params) {
      return (await prep(sql, params).all()).results as never
    },
    async run(sql, ...params) {
      const r = await prep(sql, params).run()
      return { changes: r.meta.changes ?? 0 }
    },
    async lote(instrucoes) {
      if (!instrucoes.length) return
      await d1.batch(instrucoes.map((i) => d1.prepare(i.sql).bind(...i.params)))
    },
  }
}

/**
 * Executa `fn` com um banco de transação. As leituras vão direto ao banco; as gravações ficam
 * guardadas e são enviadas num único lote quando `fn` termina sem erro. Se `fn` lançar erro,
 * nada é gravado.
 */
export async function transacao<R>(db: BD, fn: (tx: TX) => Promise<R>): Promise<R> {
  const pendentes: Instrucao[] = []
  const tx: TX = {
    get: (sql, ...p) => db.get(sql, ...p),
    all: (sql, ...p) => db.all(sql, ...p),
    run: (sql, ...p) => {
      pendentes.push(preparar(sql, p))
    },
  }
  const r = await fn(tx)
  await db.lote(pendentes)
  return r
}

/** Grava já (fora de transação) ou junta ao lote (dentro dela). */
export async function gravar(db: BDouTX, sql: string, ...params: unknown[]): Promise<void> {
  await db.run(sql, ...params)
}
