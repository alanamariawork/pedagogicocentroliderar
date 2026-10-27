import { useEffect, useState } from 'react'

export type PaginaId =
  | 'visao-geral'
  | 'entregas'
  | 'alunas'
  | 'ficha'
  | 'agenda'
  | 'validacoes'
  | 'alertas'
  | 'jornada'
  | 'pacotes'
  | 'configuracoes'
  | 'decisoes'
  | 'conta'
  | 'portal'

export interface Rota {
  pagina: PaginaId
  id?: string
  aba?: string
}

const VALIDAS = new Set<PaginaId>(['visao-geral', 'entregas', 'alunas', 'ficha', 'agenda', 'validacoes', 'alertas', 'jornada', 'pacotes', 'configuracoes', 'decisoes', 'conta', 'portal'])

export function lerRota(hash = window.location.hash): Rota | null {
  const [pagina, id, aba] = hash.replace(/^#\/?/, '').split('/')
  if (!pagina) return null
  if (pagina === 'alunas' && id) return { pagina: 'ficha', id, aba }
  return VALIDAS.has(pagina as PaginaId) ? { pagina: pagina as PaginaId, id, aba } : null
}

export function href(r: Rota): string {
  if (r.pagina === 'ficha') return `#/alunas/${r.id}${r.aba ? `/${r.aba}` : ''}`
  return `#/${r.pagina}${r.id ? `/${r.id}` : ''}`
}

export function irPara(r: Rota) {
  window.location.hash = href(r)
}

export function useRota(): Rota | null {
  const [rota, setRota] = useState(() => lerRota())
  useEffect(() => {
    const f = () => setRota(lerRota())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return rota
}
