import { diferencaDias } from './datas'

/** Janela padrão (dias) para "próxima do término": equipe e portal usam a mesma referência. */
export const JANELA_TERMINO_PADRAO = 45

export interface SituacaoVigencia {
  /** Data de término efetiva da matrícula (já inclui extensões registradas), ou null = sem prazo. */
  data_fim: string | null
  /** Dias até o término (0 = termina hoje; negativo = já terminou). */
  dias_restantes: number | null
  /** Destacar o encerramento: faltam de 0 a `janela` dias (inclusive). */
  destacar: boolean
  texto: string
}

/**
 * Situação da vigência de uma matrícula em relação a hoje. Com 45 dias de janela, destaca a partir de
 * 45 dias restantes (inclusive) até o dia do término; com 46 dias, ainda não.
 */
export function situacaoVigencia(dataFim: string | null | undefined, hoje: string, janela = JANELA_TERMINO_PADRAO): SituacaoVigencia {
  if (!dataFim) return { data_fim: null, dias_restantes: null, destacar: false, texto: 'Sem prazo definido' }
  const dias = diferencaDias(hoje, dataFim)
  const destacar = dias >= 0 && dias <= janela
  const texto = dias < 0 ? 'Vigência encerrada' : dias === 0 ? 'Termina hoje' : dias === 1 ? 'Termina amanhã' : `Faltam ${dias} dias`
  return { data_fim: dataFim, dias_restantes: dias, destacar, texto }
}
