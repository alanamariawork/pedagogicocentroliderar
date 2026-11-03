import type { Reg } from '../../lib/api'
import { agoraSP, formatarData } from '../../../shared/datas'

/**
 * Topo da ficha: o essencial da matrícula selecionada. Todos os entregáveis são mentorias.
 * Sem dado, mostra "sem registro", nunca um zero inventado.
 */
export function ResumoExecutivo({ m, pessoa }: { m: Reg; pessoa: Reg }) {
  const itens = m.itens as Reg[]
  const ocorrencias = m.ocorrencias as Reg[]
  const total = itens.reduce((t, i) => ({ c: t.c + i.contratada, r: t.r + i.realizadas }), { c: 0, r: 0 })
  const agora = agoraSP()
  const proxima = ocorrencias
    .filter((o) => o.situacao === 'agendada' && o.data_agendada && o.data_agendada >= agora)
    .sort((a, b) => a.data_agendada.localeCompare(b.data_agendada))[0]
  const ultima = ocorrencias
    .filter((o) => o.situacao === 'realizada' && o.data_realizada)
    .sort((a, b) => b.data_realizada.localeCompare(a.data_realizada))[0]

  const blocos: { rotulo: string; valor: React.ReactNode; detalhe?: string }[] = [
    { rotulo: 'Mentorias', valor: total.c ? `${total.r}/${total.c}` : '—', detalhe: total.c ? 'realizadas / contratadas' : 'nenhuma contratada' },
    { rotulo: 'Próxima mentoria', valor: proxima ? formatarData(proxima.data_agendada) : 'Não agendada', detalhe: proxima && [proxima.tipo_nome ?? proxima.item_descricao, proxima.profissional_nome].filter(Boolean).join(' · ') },
    { rotulo: 'Última mentoria', valor: ultima ? formatarData(ultima.data_realizada) : 'Nenhuma', detalhe: ultima?.tipo_nome ?? ultima?.item_descricao },
    { rotulo: 'Presença', valor: 'Sem registro', detalhe: 'entra na fase de agenda e encontros' },
    { rotulo: 'Próxima ação', valor: m.proximo_passo || 'Não definida' },
  ]
  return (
    <section className="card p-4" aria-label="Resumo executivo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">Resumo executivo</h2>
        {pessoa.responsavel_nome && <p className="text-xs text-ink-muted">Responsável: {pessoa.responsavel_nome}</p>}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
        {blocos.map((b) => (
          <div key={b.rotulo} className="min-w-0">
            <dt className="text-xs text-ink-muted">{b.rotulo}</dt>
            <dd className={b.rotulo === 'Próxima ação' ? 'text-sm text-ink' : 'font-display text-lg font-semibold text-ink tabular-nums'}>{b.valor}</dd>
            {b.detalhe && <dd className="truncate text-xs text-ink-muted">{b.detalhe}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}
