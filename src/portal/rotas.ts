import { useEffect, useState } from 'react'

/** Rotas do portal da aluna (por hash, como no restante do sistema): `#/inicio`, `#/jornada/<etapa>`, `#/mentorias/<tipo>`… */
export const PAGINAS_ALUNA = [
  'inicio',
  'perfil',
  'diagnostico',
  'jornada',
  'trilhas',
  'biblioteca',
  'acoes',
  'tarefas',
  'rotina',
  'mentorias',
  'mentoria',
  'nivel',
  'vitorias',
  'plano-90',
  'balanco',
  'mural',
  'ranking',
  'casos',
  'agenda',
  'links',
  'conta',
] as const

export type PaginaAluna = (typeof PAGINAS_ALUNA)[number]

export interface RotaAluna {
  pagina: PaginaAluna
  id?: string
}

const VALIDAS = new Set<string>(PAGINAS_ALUNA)

export function lerRotaAluna(hash = window.location.hash): RotaAluna {
  const [pagina, id] = hash.replace(/^#\/?/, '').split('/')
  return VALIDAS.has(pagina) ? { pagina: pagina as PaginaAluna, id: id || undefined } : { pagina: 'inicio' }
}

export function hrefAluna(pagina: PaginaAluna, id?: string): string {
  return `#/${pagina}${id ? `/${id}` : ''}`
}

export function useRotaAluna(): RotaAluna {
  const [rota, setRota] = useState(() => lerRotaAluna())
  useEffect(() => {
    const f = () => {
      setRota(lerRotaAluna())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return rota
}
