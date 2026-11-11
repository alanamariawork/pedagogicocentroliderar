import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { Selo } from '../../components/Selos'
import { useDados, type Reg } from '../../lib/api'
import { formatarData } from '../../../shared/datas'
import { hrefAluna } from '../rotas'
import { DialogDesmarcar, EscolherHorario, dataHora } from './Mentorias'

/** Agenda da aluna: os encontros marcados (os mesmos que a equipe vê na agenda) e os já realizados. */
export function Agenda() {
  const { dados, erro, recarregar } = useDados<Reg>('/portal/agenda')
  const [remarcar, setRemarcar] = useState<Reg | null>(null)
  const [desmarcar, setDesmarcar] = useState<Reg | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const encontros = dados.encontros as Reg[]
  const proximos = encontros.filter((e) => e.situacao === 'agendada').reverse()
  const realizados = encontros.filter((e) => e.situacao === 'realizada')
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="size-5 text-gold" aria-hidden /> Próximos encontros
          </h2>
          <a href={hrefAluna('mentorias')} className="btn-secondary btn-sm">
            Marcar um encontro
          </a>
        </div>
        {proximos.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Nenhum encontro marcado. Em Mentorias você vê o seu saldo e escolhe um horário livre.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {proximos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{e.tipo}</span>
                  <span className="block text-xs text-ink-muted">
                    {dataHora(e.inicio ?? e.data_agendada)}
                    {e.fim && `–${e.fim.slice(11, 16)}`}
                    {e.profissional_nome && ` · ${e.profissional_nome}`}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Selo tom="vinho">Agendado</Selo>
                  {e.pode_alterar ? (
                    <>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setRemarcar(e)}>
                        Remarcar
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setDesmarcar(e)}>
                        Desmarcar
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-ink-muted">Menos de {dados.antecedencia_horas} h: fale com a equipe</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {realizados.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-lg font-semibold">Encontros realizados</h2>
          <ul className="mt-2 divide-y divide-line">
            {realizados.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>
                  {e.tipo}
                  {e.profissional_nome && <span className="text-ink-muted"> · {e.profissional_nome}</span>}
                </span>
                <span className="text-xs text-ink-muted tabular-nums">{formatarData(e.data_realizada)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {remarcar && <EscolherHorario itemId={remarcar.item_id} encontro={remarcar} titulo={`Remarcar: ${remarcar.tipo}`} onFechar={() => setRemarcar(null)} onConcluir={recarregar} />}
      {desmarcar && <DialogDesmarcar encontro={desmarcar} onFechar={() => setDesmarcar(null)} onConcluir={recarregar} />}
    </div>
  )
}
