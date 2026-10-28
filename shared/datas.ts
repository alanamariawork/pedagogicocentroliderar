/**
 * Datas no fuso America/Sao_Paulo.
 * - Data simples: 'AAAA-MM-DD'.
 * - Horário de agenda: 'AAAA-MM-DDTHH:MM' (horário local de São Paulo, sem deslocamento).
 * Comparar strings nesses formatos equivale a comparar datas.
 */
export const FUSO = 'America/Sao_Paulo'

const partesSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partes(d: Date) {
  const p = Object.fromEntries(partesSP.formatToParts(d).map((x) => [x.type, x.value]))
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>
}

/** Data de hoje em São Paulo ('AAAA-MM-DD'). */
export function hojeSP(agora: Date = new Date()): string {
  const p = partes(agora)
  return `${p.year}-${p.month}-${p.day}`
}

/** Data e hora atuais em São Paulo ('AAAA-MM-DDTHH:MM'). */
export function agoraSP(agora: Date = new Date()): string {
  const p = partes(agora)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export const RE_DATA = /^\d{4}-\d{2}-\d{2}$/
export const RE_HORARIO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
export const RE_MES = /^\d{4}-\d{2}$/

export function dataValida(s: string | null | undefined): s is string {
  if (!s || !RE_DATA.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function horarioValido(s: string | null | undefined): s is string {
  if (!s || !RE_HORARIO.test(s)) return false
  const [data, hora] = s.split('T')
  const [h, min] = hora.split(':').map(Number)
  return dataValida(data) && h < 24 && min < 60
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. Valores ausentes viram '—'. */
export function formatarData(s: string | null | undefined): string {
  if (!s) return '—'
  const [data, hora] = s.split('T')
  const [a, m, d] = data.split('-')
  if (!a || !m || !d) return s
  return hora ? `${d}/${m}/${a} ${hora.slice(0, 5)}` : `${d}/${m}/${a}`
}

/** Carimbo ISO UTC → 'DD/MM/AAAA HH:MM' em São Paulo. */
export function formatarCarimbo(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatarData(agoraSP(new Date(iso)))
}

function paraUTC(s: string): Date {
  const [data, hora = '00:00'] = s.split('T')
  const [a, m, d] = data.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  return new Date(Date.UTC(a, m - 1, d, h, min))
}

function deUTC(dt: Date, comHora: boolean): string {
  const iso = dt.toISOString()
  return comHora ? iso.slice(0, 16) : iso.slice(0, 10)
}

export function somarDias(s: string, dias: number): string {
  const dt = paraUTC(s)
  dt.setUTCDate(dt.getUTCDate() + dias)
  return deUTC(dt, s.includes('T'))
}

export function somarMinutos(horario: string, minutos: number): string {
  const dt = paraUTC(horario)
  dt.setUTCMinutes(dt.getUTCMinutes() + minutos)
  return deUTC(dt, true)
}

/** Soma meses mantendo o dia quando possível (31/01 + 1 mês = 28 ou 29/02). */
export function somarMeses(s: string, meses: number): string {
  const [a, m, d] = s.slice(0, 10).split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return deUTC(alvo, false)
}

export function diferencaDias(de: string, ate: string): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / 86_400_000)
}

export function minutosEntre(inicio: string, fim: string): number {
  return Math.round((paraUTC(fim).getTime() - paraUTC(inicio).getTime()) / 60_000)
}

/** Primeiro e último dia do mês 'AAAA-MM'. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

export function mesDe(data: string): string {
  return data.slice(0, 7)
}

export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const nome = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, 1)))
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a}`
}

/** Segunda-feira da semana que contém a data. */
export function inicioDaSemana(data: string): string {
  const dia = paraUTC(data).getUTCDay() // 0 = domingo
  return somarDias(data.slice(0, 10), dia === 0 ? -6 : 1 - dia)
}

export function diaDaSemana(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(paraUTC(data))
}

export function formatarHoras(minutos: number | null | undefined): string {
  if (minutos == null) return '—'
  const sinal = minutos < 0 ? '−' : ''
  const abs = Math.abs(minutos)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${sinal}${m} min`
  return m === 0 ? `${sinal}${h} h` : `${sinal}${h} h ${m} min`
}
