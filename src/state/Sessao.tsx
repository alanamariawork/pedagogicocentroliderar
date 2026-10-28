import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { definirAoExpirar, get, post } from '../lib/api'
import type { Perfil, Permissao } from '../../shared/permissoes'

export interface Eu {
  id: string
  nome: string
  email: string
  perfil: Perfil
  pessoa_id: string | null
  pessoa_nome: string | null
  profissional_id: string | null
  trocar_senha: boolean
  permissoes: Permissao[]
}

interface Ctx {
  eu: Eu | null
  carregando: boolean
  pode: (p: Permissao) => boolean
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => Promise<void>
  recarregar: () => Promise<void>
}

const Contexto = createContext<Ctx | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [eu, setEu] = useState<Eu | null>(null)
  const [carregando, setCarregando] = useState(true)

  const recarregar = useCallback(async () => {
    try {
      setEu(await get<Eu>('/auth/eu'))
    } catch {
      setEu(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    definirAoExpirar(() => setEu(null))
    void recarregar()
  }, [recarregar])

  const entrar = useCallback(
    async (email: string, senha: string) => {
      await post('/auth/login', { email, senha })
      await recarregar()
    },
    [recarregar],
  )
  const sair = useCallback(async () => {
    await post('/auth/logout').catch(() => null)
    setEu(null)
    window.location.hash = ''
  }, [])
  const pode = useCallback((p: Permissao) => !!eu?.permissoes.includes(p), [eu])

  return <Contexto.Provider value={{ eu, carregando, pode, entrar, sair, recarregar }}>{children}</Contexto.Provider>
}

export function useSessao() {
  const v = useContext(Contexto)
  if (!v) throw new Error('useSessao fora do ProvedorSessao')
  return v
}
