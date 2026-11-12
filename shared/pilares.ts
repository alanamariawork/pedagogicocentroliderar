/**
 * Cor de cada pilar (Ação, Gestão, Escala). A cor fica cadastrada no pilar; sem cor cadastrada, os três
 * pilares conhecidos são reconhecidos pelo nome e os demais seguem a ordem. A mesma regra vale para a
 * equipe e para o portal, para o pilar ter sempre a mesma cor.
 */
export const CORES_PILAR = ['vinho', 'dourado', 'verde', 'azul', 'roxo'] as const
export type CorPilar = (typeof CORES_PILAR)[number]

export const NOME_COR_PILAR: Record<CorPilar, string> = { vinho: 'Vinho', dourado: 'Dourado', verde: 'Verde', azul: 'Azul', roxo: 'Roxo' }

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function corDoPilar(p: { nome?: string | null; cor?: string | null; ordem?: number | null } | null | undefined): CorPilar | null {
  if (!p) return null
  if (p.cor && (CORES_PILAR as readonly string[]).includes(p.cor)) return p.cor as CorPilar
  const n = sem(p.nome ?? '')
  if (/\bacao\b/.test(n)) return 'vinho'
  if (/\bgestao\b/.test(n)) return 'dourado'
  if (/\bescala\b/.test(n)) return 'verde'
  if (!p.nome) return null
  return CORES_PILAR[Math.abs(p.ordem ?? 0) % CORES_PILAR.length]
}
