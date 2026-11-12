import { diferencaDias, somarDias, somarMeses } from './datas'

/** Um mês do plano contratado: o 1º mês começa na data de início da matrícula. */
export interface MesDoPlano {
  numero: number
  inicio: string
  fim: string
  situacao: 'concluido' | 'atual' | 'futuro'
}

/** Limite de segurança: nenhum plano tem mais que isso. */
export const MESES_MAXIMO = 36

/** Um pedaço final menor que isso não vira um mês próprio. */
const SOBRA_MINIMA_DIAS = 7

/**
 * Divide a vigência em meses. Cada mês vai do dia de início até a véspera do mesmo dia no mês seguinte;
 * o último termina na data de encerramento. Sem início ou sem encerramento, não há linha do tempo.
 */
export function mesesDoPlano(dataInicio: string | null | undefined, dataFim: string | null | undefined, hoje: string): MesDoPlano[] {
  if (!dataInicio || !dataFim || dataFim < dataInicio) return []
  const meses: MesDoPlano[] = []
  for (let i = 0; i < MESES_MAXIMO; i++) {
    const inicio = somarMeses(dataInicio, i)
    if (inicio > dataFim) break
    const proximo = somarMeses(dataInicio, i + 1)
    let fim = somarDias(proximo, -1)
    if (fim > dataFim || proximo > dataFim) fim = dataFim
    meses.push({ numero: i + 1, inicio, fim, situacao: 'futuro' })
    if (fim === dataFim) break
  }
  // Sobra de poucos dias no fim (ex.: contrato até o mesmo dia do mês de início) entra no último mês.
  const ultimo = meses[meses.length - 1]
  if (meses.length > 1 && diferencaDias(ultimo.inicio, ultimo.fim) < SOBRA_MINIMA_DIAS) {
    meses.pop()
    meses[meses.length - 1].fim = dataFim
  }
  for (const m of meses) m.situacao = hoje > m.fim ? 'concluido' : hoje >= m.inicio ? 'atual' : 'futuro'
  return meses
}

/** Considera a aula assistida a partir deste ponto do vídeo (créditos finais não contam). */
export const PERCENTUAL_ASSISTIDA = 90

/** Progresso do mês (0 a 100) pelas aulas: aula assistida conta inteira; as outras, pelo quanto foi visto. */
export function progressoDoMes(percentuais: number[]): number | null {
  if (!percentuais.length) return null
  const soma = percentuais.reduce((s, p) => s + (p >= PERCENTUAL_ASSISTIDA ? 100 : Math.max(0, Math.min(100, p))), 0)
  return Math.round(soma / percentuais.length)
}
