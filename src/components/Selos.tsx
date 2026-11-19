import type { ReactNode } from 'react'
import { corDoPilar, type CorPilar } from '../../shared/pilares'
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

/** ID da aluna (ordem de matrícula). */
export function IdAluna({ codigo, className }: { codigo: number | null | undefined; className?: string }) {
  if (!codigo) return null
  return <span className={`mr-1.5 font-mono text-xs font-normal text-ink-muted tabular-nums ${className ?? ''}`}>#{String(codigo).padStart(3, '0')}</span>
}

/* Pilares (Ação, Gestão, Escala): cor própria + nome sempre escrito, igual na equipe e no portal. */
const CORES_PILAR_CSS: Record<CorPilar, string> = {
  vinho: 'bg-[#f6e3ea] text-[#6b1530] border-[#e7bfcc]',
  dourado: 'bg-[#f7ecd4] text-[#6e4f10] border-[#e3cc96]',
  verde: 'bg-[#e1f1ea] text-[#1d5a45] border-[#b5dccb]',
  azul: 'bg-[#e3edf7] text-[#24496d] border-[#bcd2ea]',
  roxo: 'bg-[#ece6f5] text-[#4b3175] border-[#d1c4e6]',
}
const PONTO_PILAR: Record<CorPilar, string> = { vinho: 'bg-[#8a1c3a]', dourado: 'bg-[#b08423]', verde: 'bg-[#2b8a68]', azul: 'bg-[#3a6fa3]', roxo: 'bg-[#6b4aa0]' }

export function classePilar(p: { nome?: string | null; cor?: string | null; ordem?: number | null } | null | undefined) {
  const c = corDoPilar(p)
  return c ? CORES_PILAR_CSS[c] : CORES.neutro
}

export function SeloPilar({ pilar, prefixo = 'Pilar', className }: { pilar: { nome?: string | null; cor?: string | null; ordem?: number | null } | null | undefined; prefixo?: string; className?: string }) {
  if (!pilar?.nome) return null
  const c = corDoPilar(pilar)
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', c ? CORES_PILAR_CSS[c] : CORES.neutro, className)}>
      <span className={cx('size-2 rounded-full', c ? PONTO_PILAR[c] : 'bg-ink-muted')} aria-hidden />
      {prefixo ? `${prefixo} ${pilar.nome}` : pilar.nome}
    </span>
  )
}
