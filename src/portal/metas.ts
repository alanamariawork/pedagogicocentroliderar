import type { Reg } from '../lib/api'

const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Valor com a unidade: "R$ 34.000" quando a unidade é moeda, "4 reuniões" nos demais casos. */
export function valorMeta(v: number | null | undefined, unidade?: string | null): string {
  if (v === null || v === undefined) return '—'
  const n = fmt.format(v)
  if (!unidade) return n
  return /^(R\$|US\$|€)$/.test(unidade.trim()) ? `${unidade.trim()} ${n}` : `${n} ${unidade}`
}

/**
 * Quanto do caminho entre o valor inicial e o alvo já foi percorrido. Nunca é um "percentual de transformação":
 * o texto sempre mostra os três números (inicial, atual e alvo).
 */
export function progressoMeta(m: Reg): { pct: number | null; texto: string } {
  const atual = m.valor_atual
  const base = `início ${valorMeta(m.valor_inicial, m.unidade)} · alvo ${valorMeta(m.valor_alvo, m.unidade)}`
  if (atual === null || atual === undefined) return { pct: null, texto: `Valor atual não informado · ${base}` }
  const pct = Math.round(((atual - m.valor_inicial) / (m.valor_alvo - m.valor_inicial)) * 100)
  return { pct: Math.max(0, Math.min(100, pct)), texto: `Atual ${valorMeta(atual, m.unidade)} · ${base}` }
}
