import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { definirAoExpirar, get } from '../lib/api'
import type { Perfil, Permissao } from '../../shared/permissoes'

export interface Eu {
  id: string
  nome: string
  email: string
  perfil: Perfil
  pessoa_id: string | null
  pessoa_nome: string | null
  profissional_id: string | null
  permissoes: Permissao[]
}

interface Ctx {
  eu: Eu | null
  carregando: boolean
  /** Erro de acesso ao abrir (ex.: conta sem perfil pedagógico). */
  erro: { status: number; mensagem: string } | null
  pode: (p: Permissao) => boolean
  sair: () => Promise<void>
  recarregar: () => Promise<void>
}

const Contexto = createContext<Ctx | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [eu, setEu] = useState<Eu | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<Ctx['erro']>(null)

  const recarregar = useCallback(async () => {
    try {
      setEu(await get<Eu>('/auth/eu'))
      setErro(null)
    } catch (e) {
      setEu(null)
      const x = e as { status?: number; message?: string }
      setErro({ status: x.status ?? 0, mensagem: x.message ?? 'Não foi possível abrir.' })
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    // Sessão terminou no meio do uso: recarrega a página e o servidor leva para a tela de login.
    definirAoExpirar(() => window.location.reload())
    void recarregar()
  }, [recarregar])

  // O login e o "sair" são os do backoffice: uma sessão só para os dois sistemas.
  const sair = useCallback(async () => {
    await fetch('/api/sair', { method: 'POST', credentials: 'same-origin', headers: { 'X-CL-App': '1' } }).catch(() => null)
    window.location.assign(eu?.perfil === 'aluna' ? '/portal/entrar' : '/entrar')
  }, [eu])
  const pode = useCallback((p: Permissao) => !!eu?.permissoes.includes(p), [eu])

  return <Contexto.Provider value={{ eu, carregando, erro, pode, sair, recarregar }}>{children}</Contexto.Provider>
}

export function useSessao() {
  const v = useContext(Contexto)
  if (!v) throw new Error('useSessao fora do ProvedorSessao')
  return v
}
