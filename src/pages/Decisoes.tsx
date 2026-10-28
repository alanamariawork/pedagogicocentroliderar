import { useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { Campo, FormDialog, useValores } from '../components/Form'
import { Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { post, put, useDados, type Reg } from '../lib/api'
import { useSessao } from '../state/Sessao'
import { formatarData, hojeSP } from '../../shared/datas'

const SITUACAO: Record<string, string> = { aberta: 'Aberta', em_analise: 'Em análise', decidida: 'Decidida' }

export function Decisoes() {
  const { pode } = useSessao()
  const { dados, erro, recarregar } = useDados<Reg[]>('/decisoes')
  const [editando, setEditando] = useState<Reg | 'nova' | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const abertas = dados.filter((d) => d.situacao !== 'decidida').length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Questões que dependem de decisão da coordenação ou da direção antes de virarem regra no sistema. {abertas} em aberto.
        </p>
        {pode('decisoes:editar') && (
          <button type="button" className="btn-primary" onClick={() => setEditando('nova')}>
            <Plus className="size-4" aria-hidden /> Nova questão
          </button>
        )}
      </div>
      {dados.length === 0 ? (
        <EstadoVazio icone={ClipboardList} titulo="Nenhuma decisão pendente registrada." />
      ) : (
        <ul className="space-y-3">
          {dados.map((d) => (
            <li key={d.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-60 flex-1">
                  <p className="font-medium text-ink">{d.questao}</p>
                  {d.impacto && <p className="text-ink-soft">Impacto: {d.impacto}</p>}
                  <p className="text-xs text-ink-muted">Responsável: {d.responsavel ?? 'a definir'}</p>
                  {d.situacao === 'decidida' && (
                    <p className="mt-1 rounded-[var(--radius-control)] bg-success-soft px-3 py-2 text-success">
                      Decisão em {formatarData(d.data_decisao)}: {d.decisao}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Selo tom={d.situacao === 'decidida' ? 'sucesso' : d.situacao === 'em_analise' ? 'info' : 'alerta'}>{SITUACAO[d.situacao]}</Selo>
                  {pode('decisoes:editar') && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(d)}>
                      Editar
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editando && <DialogDecisao decisao={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} onConcluir={recarregar} />}
    </div>
  )
}

function DialogDecisao({ decisao, onFechar, onConcluir }: { decisao: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({
    questao: decisao?.questao ?? '',
    impacto: decisao?.impacto ?? '',
    responsavel: decisao?.responsavel ?? '',
    situacao: decisao?.situacao ?? 'aberta',
    decisao: decisao?.decisao ?? '',
    data_decisao: decisao?.data_decisao ?? '',
  })
  return (
    <FormDialog
      aberto
      titulo={decisao ? 'Editar questão' : 'Nova questão pendente'}
      largura="max-w-xl"
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = {
          ...valores,
          impacto: valores.impacto || null,
          responsavel: valores.responsavel || null,
          decisao: valores.decisao || null,
          data_decisao: valores.data_decisao || (valores.situacao === 'decidida' ? hojeSP() : null),
        }
        if (decisao) await put(`/decisoes/${decisao.id}`, corpo)
        else await post('/decisoes', corpo)
        fb.sucesso('Questão salva.')
        onConcluir()
      }}
    >
      <Campo rotulo="Questão" obrigatorio>
        {(p) => <textarea rows={2} className="field-control" {...p} value={valores.questao} onChange={campo('questao')} />}
      </Campo>
      <Campo rotulo="Impacto">
        {(p) => <input className="field-control" {...p} value={valores.impacto} onChange={campo('impacto')} />}
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Responsável pela decisão">
          {(p) => <input className="field-control" {...p} value={valores.responsavel} onChange={campo('responsavel')} />}
        </Campo>
        <Campo rotulo="Situação" obrigatorio>
          {(p) => (
            <select className="field-control" {...p} value={valores.situacao} onChange={campo('situacao')}>
              {Object.entries(SITUACAO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      {valores.situacao === 'decidida' && (
        <>
          <Campo rotulo="Decisão tomada" obrigatorio>
            {(p) => <textarea rows={2} className="field-control" {...p} value={valores.decisao} onChange={campo('decisao')} />}
          </Campo>
          <Campo rotulo="Data da decisão" obrigatorio>
            {(p) => <input type="date" className="field-control" {...p} value={valores.data_decisao || hojeSP()} onChange={campo('data_decisao')} />}
          </Campo>
        </>
      )}
    </FormDialog>
  )
}
