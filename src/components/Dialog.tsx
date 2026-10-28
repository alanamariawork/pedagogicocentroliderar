import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '../lib/format'

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Props {
  aberto: boolean
  titulo: string
  descricao?: string
  onFechar: () => void
  /** "painel" abre à direita; "central" abre no meio da tela. */
  variante?: 'painel' | 'central'
  /** Impede fechar (ex.: durante o salvamento). */
  bloqueado?: boolean
  children: ReactNode
  rodape?: ReactNode
  largura?: string
}

/** Modal acessível: role="dialog", foco preso, Esc fecha e o foco volta ao elemento de origem. */
export function Dialog({
  aberto,
  titulo,
  descricao,
  onFechar,
  variante = 'painel',
  bloqueado = false,
  children,
  rodape,
  largura,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const tituloId = useId()
  const descricaoId = useId()
  const onFecharRef = useRef(onFechar)
  onFecharRef.current = onFechar
  const bloqueadoRef = useRef(bloqueado)
  bloqueadoRef.current = bloqueado

  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const el = ref.current
    const primeiro =
      el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCAVEIS)
    ;(primeiro ?? el)?.focus()

    function aoTeclar(e: KeyboardEvent) {
      if (!el) return
      // Só o diálogo mais recente (topo da pilha) responde.
      const todos = document.querySelectorAll('[data-dialog]')
      if (todos[todos.length - 1] !== el) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!bloqueadoRef.current) onFecharRef.current()
      } else if (e.key === 'Tab') {
        const itens = Array.from(el.querySelectorAll<HTMLElement>(FOCAVEIS)).filter((n) => n.offsetParent !== null)
        if (itens.length === 0) {
          e.preventDefault()
          return
        }
        const a = itens[0]
        const b = itens[itens.length - 1]
        if (e.shiftKey && (document.activeElement === a || !el.contains(document.activeElement))) {
          e.preventDefault()
          b.focus()
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflow
      if (anterior && document.contains(anterior)) anterior.focus()
    }
  }, [aberto])

  if (!aberto) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-gray-900/40"
        aria-hidden="true"
        onClick={() => !bloqueado && onFechar()}
      />
      <div
        ref={ref}
        data-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        tabIndex={-1}
        className={cx(
          'absolute flex flex-col bg-surface shadow-[var(--shadow-overlay)] outline-none',
          variante === 'painel'
            ? 'inset-y-0 right-0 w-full sm:border-l sm:border-line'
            : 'top-1/2 left-1/2 max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)]',
          largura ?? (variante === 'painel' ? 'sm:max-w-lg' : 'max-w-md'),
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id={tituloId} className="font-display text-lg font-semibold text-ink">
              {titulo}
            </h2>
            {descricao && (
              <p id={descricaoId} className="mt-0.5 text-sm text-ink-muted">
                {descricao}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-ghost -mr-2 p-2"
            onClick={onFechar}
            disabled={bloqueado}
            aria-label="Fechar"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{rodape}</div>}
      </div>
    </div>,
    document.body,
  )
}
