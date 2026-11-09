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

const normalizar = (params: unknown[]): Valor[] =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : (p as Valor)))

export function bancoD1(d1: D1Database): BD {
  const prep = (sql: string, params: unknown[]) => d1.prepare(sql).bind(...normalizar(params))
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
      await d1.batch(instrucoes.map((i) => prep(i.sql, i.params)))
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
      pendentes.push({ sql, params: normalizar(p) })
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
