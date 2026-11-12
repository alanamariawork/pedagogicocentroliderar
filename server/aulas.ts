/**
 * Linha do tempo do plano: os meses da vigência da matrícula e, em cada mês, as aulas gravadas
 * (Vimeo) que a equipe publicou para aquele mês, com quanto a aluna já assistiu.
 */
import type { BDouTX } from './db'
import { mesesDoPlano, progressoDoMes, PERCENTUAL_ASSISTIDA } from '../shared/linhaTempo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

/** Aulas publicadas do programa (ou gerais) com o progresso da aluna. */
export async function aulasDaAluna(db: BDouTX, programaId: string | null, pessoaId: string, mes?: number): Promise<Linha[]> {
  return (await db.all(
    `SELECT a.id, a.mes, a.titulo, a.descricao, a.video_url, a.ordem,
            COALESCE(p.percentual, 0) AS percentual, p.concluida_em
       FROM ped_aulas a LEFT JOIN ped_aulas_progresso p ON p.aula_id = a.id AND p.pessoa_id = ?
      WHERE a.publicado = 1 AND (a.programa_id IS NULL OR a.programa_id = ?) ${mes ? 'AND a.mes = ?' : ''}
      ORDER BY a.mes, a.ordem, a.titulo`,
    ...(mes ? [pessoaId, programaId, mes] : [pessoaId, programaId]),
  )) as Linha[]
}

export async function linhaDoTempo(db: BDouTX, m: Linha, pessoaId: string, hoje: string) {
  const meses = mesesDoPlano(m.data_inicio, m.data_fim, hoje)
  if (!meses.length) return { meses: [], aulas_total: 0 }
  const aulas = await aulasDaAluna(db, m.programa_id ?? null, pessoaId)
  return {
    aulas_total: aulas.length,
    meses: meses.map((mes) => {
      const doMes = aulas.filter((a) => a.mes === mes.numero)
      return {
        ...mes,
        aulas: doMes.length,
        assistidas: doMes.filter((a) => a.percentual >= PERCENTUAL_ASSISTIDA).length,
        // null = o mês não tem aulas cadastradas, então não contabiliza progresso.
        progresso: progressoDoMes(doMes.map((a) => a.percentual)),
      }
    }),
  }
}
