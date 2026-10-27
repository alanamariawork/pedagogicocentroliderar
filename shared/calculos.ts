import { limitesDoMes, minutosEntre, somarDias } from './datas'

/* ---------------- Intervalos de horário (IN05, IN07) ---------------- */

export interface Intervalo {
  inicio: string // 'AAAA-MM-DDTHH:MM'
  fim: string
}

/** Une intervalos sobrepostos ou encostados, para não contar o mesmo horário duas vezes. */
export function mesclarIntervalos(lista: Intervalo[]): Intervalo[] {
  const ordenados = lista.filter((i) => i.fim > i.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio))
  const saida: Intervalo[] = []
  for (const i of ordenados) {
    const ultimo = saida[saida.length - 1]
    if (ultimo && i.inicio <= ultimo.fim) {
      if (i.fim > ultimo.fim) ultimo.fim = i.fim
    } else {
      saida.push({ inicio: i.inicio, fim: i.fim })
    }
  }
  return saida
}

export function recortar(lista: Intervalo[], inicio: string, fim: string): Intervalo[] {
  return lista
    .map((i) => ({ inicio: i.inicio < inicio ? inicio : i.inicio, fim: i.fim > fim ? fim : i.fim }))
    .filter((i) => i.fim > i.inicio)
}

export function somaMinutos(lista: Intervalo[]): number {
  return mesclarIntervalos(lista).reduce((t, i) => t + minutosEntre(i.inicio, i.fim), 0)
}

/** Minutos em comum entre dois conjuntos de intervalos (cada um mesclado antes). */
export function minutosEmComum(a: Intervalo[], b: Intervalo[]): number {
  const x = mesclarIntervalos(a)
  const y = mesclarIntervalos(b)
  let total = 0
  let i = 0
  let j = 0
  while (i < x.length && j < y.length) {
    const ini = x[i].inicio > y[j].inicio ? x[i].inicio : y[j].inicio
    const fim = x[i].fim < y[j].fim ? x[i].fim : y[j].fim
    if (fim > ini) total += minutosEntre(ini, fim)
    if (x[i].fim < y[j].fim) i++
    else j++
  }
  return total
}

export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fim && a.fim > b.inicio
}

export function contido(i: Intervalo, lista: Intervalo[]): boolean {
  return mesclarIntervalos(lista).some((d) => d.inicio <= i.inicio && d.fim >= i.fim)
}

/* ---------------- Ocorrências: grupos do painel e atraso ---------------- */

export interface OcorrenciaBase {
  situacao: string
  data_prevista: string | null
  data_agendada: string | null
  data_realizada: string | null
}

export type GrupoPainel = 'previstos' | 'anteriores' | 'sem_previsao' | 'agendados' | 'realizados' | 'fora'

export const NOME_GRUPO: Record<Exclude<GrupoPainel, 'fora'>, string> = {
  previstos: 'Previstos para o mês',
  anteriores: 'Pendências anteriores',
  sem_previsao: 'Sem previsão',
  agendados: 'Agendados',
  realizados: 'Realizados',
}

export function emAberto(o: OcorrenciaBase): boolean {
  return o.situacao !== 'realizada' && o.situacao !== 'cancelada'
}

/**
 * Classifica uma ocorrência em um único grupo do painel mensal, para que cada
 * ocorrência seja contada uma vez só (CA12).
 */
export function grupoDoMes(o: OcorrenciaBase, mes: string): GrupoPainel {
  const { inicio, fim } = limitesDoMes(mes)
  if (o.situacao === 'realizada') {
    return o.data_realizada && o.data_realizada >= inicio && o.data_realizada <= fim ? 'realizados' : 'fora'
  }
  if (o.situacao === 'cancelada') return 'fora'
  if (o.situacao === 'agendada' && o.data_agendada) {
    const dia = o.data_agendada.slice(0, 10)
    if (dia >= inicio && dia <= fim) return 'agendados'
    if (dia < inicio) return 'anteriores' // agendada no passado e não registrada como realizada
    return 'fora' // agendada para depois do mês
  }
  if (!o.data_prevista) return 'sem_previsao'
  if (o.data_prevista < inicio) return 'anteriores'
  if (o.data_prevista <= fim) return 'previstos'
  return 'fora'
}

/**
 * Indicador de atraso, separado da situação operacional:
 * previsão vencida + ainda não realizada + obrigação ainda devida.
 * Sem previsão nunca é "em dia": retorna 'sem_previsao'.
 */
export function indicadorAtraso(
  o: OcorrenciaBase,
  hoje: string,
): { tipo: 'vencida'; dias: number } | { tipo: 'em_dia' } | { tipo: 'sem_previsao' } | { tipo: 'nao_se_aplica' } {
  if (!emAberto(o)) return { tipo: 'nao_se_aplica' }
  if (!o.data_prevista) return { tipo: 'sem_previsao' }
  if (o.data_prevista < hoje) {
    const dias = Math.round(
      (Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${o.data_prevista}T00:00:00Z`)) / 86_400_000,
    )
    return { tipo: 'vencida', dias }
  }
  return { tipo: 'em_dia' }
}

/* ---------------- Sugestão de datas (RN10) ---------------- */

/**
 * Sugere previsões a partir do primeiro encontro e de um intervalo em dias.
 * É só uma sugestão: a tela mostra as datas para revisão antes de salvar.
 */
export function sugerirDatas(primeira: string, intervaloDias: number, quantidade: number): string[] {
  const saida: string[] = []
  for (let i = 0; i < quantidade; i++) saida.push(somarDias(primeira, i * intervaloDias))
  return saida
}

/* ---------------- Pré-requisitos sem ciclo (RF07) ---------------- */

/**
 * Verifica se definir `requisitos` para `etapaId` criaria uma dependência circular.
 * `grafo` mapeia etapa → etapas de que ela depende.
 */
export function criaCiclo(grafo: Map<string, string[]>, etapaId: string, requisitos: string[]): boolean {
  const g = new Map(grafo)
  g.set(etapaId, requisitos)
  const visitando = new Set<string>()
  const visitados = new Set<string>()
  const temCiclo = (n: string): boolean => {
    if (visitando.has(n)) return true
    if (visitados.has(n)) return false
    visitando.add(n)
    for (const r of g.get(n) ?? []) if (temCiclo(r)) return true
    visitando.delete(n)
    visitados.add(n)
    return false
  }
  return temCiclo(etapaId)
}

/* ---------------- Quantidades (IN08) ---------------- */

export interface ResumoItem {
  contratada: number // quantidade original + ajustes
  realizadas: number
  restantes: number
}

export function resumoQuantidades(quantidade: number, somaAjustes: number, realizadas: number): ResumoItem {
  const contratada = quantidade + somaAjustes
  return { contratada, realizadas, restantes: Math.max(contratada - realizadas, 0) }
}
