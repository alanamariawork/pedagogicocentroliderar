import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Dialog } from './Dialog'
import { cx } from '../lib/format'

/* ---------- Avisos (toasts) ---------- */

interface Aviso {
  id: number
  tipo: 'sucesso' | 'erro'
  texto: string
}

interface FeedbackApi {
  sucesso: (texto: string) => void
  erro: (texto: string) => void
  confirmar: (opcoes: OpcoesConfirmacao) => Promise<boolean>
}

interface OpcoesConfirmacao {
  titulo: string
  mensagem: string
  rotuloConfirmar?: string
  perigo?: boolean
}

const Contexto = createContext<FeedbackApi | null>(null)

export function ProvedorFeedback({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const proximo = useRef(1)
  const [confirmacao, setConfirmacao] = useState<(OpcoesConfirmacao & { resolver: (v: boolean) => void }) | null>(
    null,
  )

  const remover = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), [])
  const adicionar = useCallback(
    (tipo: Aviso['tipo'], texto: string) => {
      const id = proximo.current++
      setAvisos((a) => [...a, { id, tipo, texto }])
      setTimeout(() => remover(id), tipo === 'erro' ? 8000 : 4500)
    },
    [remover],
  )

  const api = useRef<FeedbackApi>({
    sucesso: (t) => adicionar('sucesso', t),
    erro: (t) => adicionar('erro', t),
    confirmar: (opcoes) => new Promise((resolver) => setConfirmacao({ ...opcoes, resolver })),
  }).current

  const responder = (v: boolean) => {
    confirmacao?.resolver(v)
    setConfirmacao(null)
  }

  return (
    <Contexto.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto"
        role="status"
        aria-live="polite"
      >
        {avisos.map((a) => (
          <div
            key={a.id}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-sm shadow-[var(--shadow-overlay)]',
              a.tipo === 'sucesso'
                ? 'border-green-200 bg-success-soft text-success'
                : 'border-red-200 bg-danger-soft text-danger',
            )}
          >
            {a.tipo === 'sucesso' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <p className="flex-1 font-medium">{a.texto}</p>
            <button type="button" onClick={() => remover(a.id)} className="rounded p-0.5" aria-label="Fechar aviso">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <Dialog
        aberto={!!confirmacao}
        variante="central"
        titulo={confirmacao?.titulo ?? ''}
        onFechar={() => responder(false)}
        rodape={
          <>
            <button type="button" className="btn-secondary" onClick={() => responder(false)} data-autofocus>
              Cancelar
            </button>
            <button type="button" className={confirmacao?.perigo ? 'btn-danger' : 'btn-primary'} onClick={() => responder(true)}>
              {confirmacao?.rotuloConfirmar ?? 'Confirmar'}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">{confirmacao?.mensagem}</p>
      </Dialog>
    </Contexto.Provider>
  )
}

export function useFeedback(): FeedbackApi {
  const v = useContext(Contexto)
  if (!v) throw new Error('useFeedback fora do ProvedorFeedback')
  return v
}
