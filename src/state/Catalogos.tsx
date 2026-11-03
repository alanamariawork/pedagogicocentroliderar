import { useEffect, useState } from 'react'
import { get, type Reg } from '../lib/api'

export interface Catalogos {
  programas: Reg[]
  profissionais: Reg[]
  'tipos-entregavel': Reg[]
  'motivos-impedimento': Reg[]
  trilhas: Reg[]
  pilares: Reg[]
  turmas: Reg[]
  links: Reg[]
  frases: Reg[]
  'status-aluna': Reg[]
  saude: Reg[]
  engajamento: Reg[]
  segmentos: Reg[]
  'canais-venda': Reg[]
  'tipos-reuniao': Reg[]
  campos_visibilidade: { campo: string; visivel_aluna: number }[]
  configuracoes: Record<string, string>
  usuarios: Reg[]
}

let cache: Promise<Catalogos> | null = null
const ouvintes = new Set<() => void>()

async function carregar(): Promise<Catalogos> {
  const [c, usuarios] = await Promise.all([get<Omit<Catalogos, 'usuarios'>>('/catalogos'), get<Reg[]>('/usuarios')])
  return { ...c, usuarios }
}

/** Invalida o cache depois de alterar cadastros em Configurações. */
export function invalidarCatalogos() {
  cache = null
  ouvintes.forEach((f) => f())
}

/** Cadastros de apoio (programas, profissionais, motivos, trilhas…) compartilhados pelas telas. */
export function useCatalogos(): Catalogos | null {
  const [dados, setDados] = useState<Catalogos | null>(null)
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    const f = () => setVersao((v) => v + 1)
    ouvintes.add(f)
    return () => {
      ouvintes.delete(f)
    }
  }, [])
  useEffect(() => {
    let vivo = true
    cache ??= carregar().catch((e) => {
      cache = null
      throw e
    })
    cache.then((d) => vivo && setDados(d)).catch(() => null)
    return () => {
      vivo = false
    }
  }, [versao])
  return dados
}

export const ativos = (lista: Reg[] | undefined) => (lista ?? []).filter((x) => x.ativo !== 0)
export const equipe = (c: Catalogos | null) => (c?.usuarios ?? []).filter((u) => u.perfil !== 'aluna' && u.ativo !== 0)

/** Todas as opções das listas configuráveis, por id (status, saúde, engajamento, segmento, canal, categoria). */
export function opcoesPorId(c: Catalogos | null): Map<string, Reg> {
  const m = new Map<string, Reg>()
  if (!c) return m
  for (const k of ['status-aluna', 'saude', 'engajamento', 'segmentos', 'canais-venda', 'tipos-reuniao'] as const) for (const o of c[k] ?? []) m.set(o.id, o)
  return m
}
