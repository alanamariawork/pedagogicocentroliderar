import type { Reg } from '../../lib/api'
import { opcoesPorId, useCatalogos } from '../../state/Catalogos'
import { useSessao } from '../../state/Sessao'
import { agoraSP, formatarData } from '../../../shared/datas'

/**
 * Topo da ficha: o essencial da matrícula selecionada. As reuniões são agrupadas pela categoria
 * do tipo de entregável (Configurações → Cadastros). Sem dado, mostra "sem registro", nunca zero inventado.
 */
export function ResumoExecutivo({ m, pessoa }: { m: Reg; pessoa: Reg }) {
  const cat = useCatalogos()
  const { pode } = useSessao()
  const ops = opcoesPorId(cat)
  const codigoCat = (id: string | null) => (id ? ops.get(id)?.codigo : null)
  const itens = m.itens as Reg[]
  const ocorrencias = m.ocorrencias as Reg[]
  const doTipo = (codigo: string) => itens.filter((i) => codigoCat(i.tipo_categoria_id) === codigo)
  const soma = (lista: Reg[]) => lista.reduce((t, i) => ({ c: t.c + i.contratada, r: t.r + i.realizadas }), { c: 0, r: 0 })
  const mentorias = soma(doTipo('mentoria'))
  const consultorias = soma(doTipo('consultoria'))
  const semCategoria = itens.length > 0 && itens.every((i) => !i.tipo_categoria_id)
  const agora = agoraSP()
  const proximaMentoria = ocorrencias
    .filter((o) => o.situacao === 'agendada' && o.data_agendada && o.data_agendada >= agora && codigoCat(o.tipo_categoria_id) === 'mentoria')
    .sort((a, b) => a.data_agendada.localeCompare(b.data_agendada))[0]
  const ultima = ocorrencias
    .filter((o) => o.situacao === 'realizada' && o.data_realizada)
    .sort((a, b) => b.data_realizada.localeCompare(a.data_realizada))[0]

  const blocos: { rotulo: string; valor: React.ReactNode; detalhe?: string }[] = [
    { rotulo: 'Mentorias', valor: mentorias.c ? `${mentorias.r}/${mentorias.c}` : '—', detalhe: mentorias.c ? 'realizadas / contratadas' : 'nenhuma contratada' },
    {
      rotulo: 'Próxima mentoria',
      valor: proximaMentoria ? formatarData(proximaMentoria.data_agendada) : 'Não agendada',
      detalhe: proximaMentoria?.profissional_nome,
    },
    { rotulo: 'Reuniões com consultores', valor: consultorias.c ? `${consultorias.r}/${consultorias.c}` : '—', detalhe: consultorias.c ? 'realizadas / contratadas' : 'nenhuma contratada' },
    { rotulo: 'Última reunião', valor: ultima ? formatarData(ultima.data_realizada) : 'Nenhuma', detalhe: ultima?.tipo_nome ?? ultima?.item_descricao },
    { rotulo: 'Presença', valor: 'Sem registro', detalhe: 'entra na fase de agenda e encontros' },
    { rotulo: 'Próxima ação', valor: m.proximo_passo || 'Não definida' },
  ]
  return (
    <section className="card p-4" aria-label="Resumo executivo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow">Resumo executivo</h2>
        {pessoa.responsavel_nome && <p className="text-xs text-ink-muted">Responsável: {pessoa.responsavel_nome}</p>}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
        {blocos.map((b) => (
          <div key={b.rotulo} className="min-w-0">
            <dt className="text-xs text-ink-muted">{b.rotulo}</dt>
            <dd className={b.rotulo === 'Próxima ação' ? 'text-sm text-ink' : 'font-display text-lg font-semibold text-ink tabular-nums'}>{b.valor}</dd>
            {b.detalhe && <dd className="truncate text-xs text-ink-muted">{b.detalhe}</dd>}
          </div>
        ))}
      </dl>
      {semCategoria && (
        <p className="mt-3 text-xs text-warning">
          Os tipos de entregável desta matrícula ainda não têm categoria (mentoria, consultoria…).{' '}
          {pode('config:editar') ? 'Classifique em Configurações → Cadastros → Tipos de entregável.' : 'Peça à administração para classificar.'}
        </p>
      )}
    </section>
  )
}
