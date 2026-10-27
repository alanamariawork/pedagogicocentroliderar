import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, Plus, type LucideIcon } from 'lucide-react'

export function EstadoVazio({
  icone: Icone,
  titulo,
  acao,
  onAcao,
  children,
}: {
  icone: LucideIcon
  titulo: string
  acao?: string
  onAcao?: () => void
  children?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
        <Icone className="size-6" aria-hidden />
      </span>
      <p className="max-w-md text-sm font-medium text-ink-soft">{titulo}</p>
      {children}
      {acao && onAcao && (
        <button type="button" className="btn-primary mt-5" onClick={onAcao}>
          <Plus className="size-4" aria-hidden />
          {acao}
        </button>
      )}
    </div>
  )
}

export function Carregando({ texto = 'Carregando dados…' }: { texto?: string }) {
  return (
    <div className="card flex items-center justify-center gap-3 px-6 py-16 text-sm text-ink-muted" role="status">
      <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
      {texto}
    </div>
  )
}

export function EstadoErro({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  return (
    <div className="card flex flex-col items-center border-red-200 px-6 py-12 text-center" role="alert">
      <AlertTriangle className="mb-3 size-8 text-danger" aria-hidden />
      <p className="font-medium text-ink">Não foi possível carregar os dados.</p>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{mensagem}</p>
      <button type="button" className="btn-secondary mt-5" onClick={onTentar}>
        Tentar novamente
      </button>
    </div>
  )
}

/** Alerta de erro exibido dentro de formulários (campos preservados). */
export function AlertaErro({ mensagem }: { mensagem: string }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-[var(--radius-control)] border border-red-200 bg-danger-soft px-3 py-2.5 text-sm text-danger"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{mensagem}</p>
    </div>
  )
}

export function Secao({ titulo, acao, children, descricao }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode; descricao?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-xs text-ink-muted">{descricao}</p>}
        </div>
        {acao}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface-muted/50 px-4 py-6 text-center text-sm text-ink-muted">{children}</p>
}
