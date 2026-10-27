import type { ReactNode } from 'react'
import { Lock, FileX2 } from 'lucide-react'
import { cx } from '../lib/format'

export type Tom = 'neutro' | 'sucesso' | 'alerta' | 'perigo' | 'info' | 'vinho' | 'dourado'

const CORES: Record<Tom, string> = {
  neutro: 'bg-surface-muted text-ink-soft border-line',
  sucesso: 'bg-success-soft text-success border-green-200',
  alerta: 'bg-warning-soft text-warning border-amber-200',
  perigo: 'bg-danger-soft text-danger border-red-200',
  info: 'bg-info-soft text-info border-blue-200',
  vinho: 'bg-brand-50 text-brand-700 border-brand-100',
  dourado: 'bg-gold-soft text-gold border-gold-line',
}

export function Selo({ tom = 'neutro', children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', CORES[tom], className)}>
      {children}
    </span>
  )
}

export const TOM_OCORRENCIA: Record<string, Tom> = {
  prevista: 'neutro',
  aguardando_agenda: 'alerta',
  disponivel_agendar: 'info',
  agendada: 'vinho',
  realizada: 'sucesso',
  cancelada: 'neutro',
  conferencia: 'alerta',
}
export const TOM_MATRICULA: Record<string, Tom> = { ativa: 'sucesso', pausada: 'alerta', encerrada: 'neutro', cancelada: 'perigo' }
export const TOM_ATIVIDADE: Record<string, Tom> = { pendente: 'neutro', em_execucao: 'info', enviada: 'dourado', validada: 'sucesso', em_revisao: 'alerta' }
export const TOM_ETAPA: Record<string, Tom> = { bloqueada: 'neutro', liberada: 'vinho', concluida: 'sucesso' }

/** Cadeado pedagógico (pré-requisito) — nunca usado para "não contratado". */
export function SeloCadeado({ children = 'Bloqueada' }: { children?: ReactNode }) {
  return (
    <Selo tom="neutro">
      <Lock className="size-3" aria-hidden />
      {children}
    </Selo>
  )
}

/** Direito contratual ausente — visual diferente do cadeado pedagógico (RN08). */
export function SeloNaoIncluido() {
  return (
    <Selo tom="dourado" className="border-dashed">
      <FileX2 className="size-3" aria-hidden />
      Não incluído no contrato
    </Selo>
  )
}

export function Atraso({ atraso }: { atraso: { tipo: string; dias?: number } | undefined }) {
  if (!atraso) return null
  if (atraso.tipo === 'vencida') return <Selo tom="perigo">Vencida há {atraso.dias} dia(s)</Selo>
  if (atraso.tipo === 'sem_previsao') return <Selo tom="alerta">Sem previsão</Selo>
  if (atraso.tipo === 'em_dia') return <Selo tom="sucesso">No prazo</Selo>
  return null
}
