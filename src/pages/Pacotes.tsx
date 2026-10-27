import { useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { EditorItens, itemParaApi, itemVazio, type ItemForm } from '../forms/FormMatricula'
import { post, put, useDados, type Reg } from '../lib/api'
import { ORIGEM_ITEM } from '../lib/format'
import { ativos, useCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'
import { formatarHoras } from '../../shared/datas'

export function Pacotes() {
  const { pode } = useSessao()
  const { dados, erro, recarregar } = useDados<Reg[]>('/pacotes')
  const [editando, setEditando] = useState<Reg | 'novo' | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const editar = pode('config:editar')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Modelos de pacote servem de ponto de partida. Ao criar uma matrícula, os itens são copiados para ela; alterar um modelo depois não muda matrículas existentes.
        </p>
        {editar && (
          <button type="button" className="btn-primary" onClick={() => setEditando('novo')}>
            <Plus className="size-4" aria-hidden /> Novo pacote
          </button>
        )}
      </div>
      {dados.length === 0 ? (
        <EstadoVazio icone={Package} titulo="Nenhum modelo de pacote cadastrado." acao={editar ? 'Cadastrar pacote' : undefined} onAcao={() => setEditando('novo')}>
          <p className="mt-1 max-w-md text-xs text-ink-muted">Cadastre os pacotes oficiais com a quantidade de cada entregável. Matrículas também podem ser criadas sem pacote.</p>
        </EstadoVazio>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {dados.map((p) => (
            <article key={p.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-semibold">
                    {p.nome} {!p.ativo && <Selo>Inativo</Selo>}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    {p.programa_nome ?? 'Sem programa'} · {p.duracao_meses ? `${p.duracao_meses} meses` : 'duração não definida'} · usado em {p.matriculas_que_usaram} matrícula(s)
                  </p>
                  {p.descricao && <p className="mt-1 text-sm text-ink-soft">{p.descricao}</p>}
                </div>
                {editar && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(p)}>
                    Editar
                  </button>
                )}
              </div>
              {(p.itens as Reg[]).length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">Sem itens.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {(p.itens as Reg[]).map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span>
                        <span className="font-medium">{i.quantidade}×</span> {i.descricao} {i.origem === 'bonus' && <Selo tom="dourado">{ORIGEM_ITEM.bonus}</Selo>}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {i.profissional_nome ?? 'profissional a definir'} · {i.duracao_min ? formatarHoras(i.duracao_min) : 'duração não informada'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
      {editando && <DialogPacote pacote={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} onConcluir={recarregar} />}
    </div>
  )
}

function paraForm(i: Reg): ItemForm {
  return {
    tipo_id: i.tipo_id ?? '',
    descricao: i.descricao ?? '',
    quantidade: String(i.quantidade ?? 1),
    profissional_id: i.profissional_id ?? '',
    duracao_min: i.duracao_min ? String(i.duracao_min) : '',
    origem: i.origem === 'bonus' ? 'bonus' : 'pacote',
    referencia_comercial: '',
  }
}

function DialogPacote({ pacote, onFechar, onConcluir }: { pacote: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo } = useValores({
    nome: pacote?.nome ?? '',
    programa_id: pacote?.programa_id ?? '',
    descricao: pacote?.descricao ?? '',
    duracao_meses: pacote?.duracao_meses ? String(pacote.duracao_meses) : '',
    ativo: pacote ? !!pacote.ativo : true,
  })
  const [itens, setItens] = useState<ItemForm[]>(pacote ? (pacote.itens as Reg[]).map(paraForm) : [itemVazio('pacote')])
  return (
    <FormDialog
      aberto
      titulo={pacote ? 'Editar pacote' : 'Novo pacote'}
      descricao={pacote?.matriculas_que_usaram ? `Matrículas já criadas com este pacote (${pacote.matriculas_que_usaram}) não serão alteradas.` : undefined}
      largura="max-w-3xl"
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = {
          ...valores,
          programa_id: valores.programa_id || null,
          descricao: valores.descricao || null,
          duracao_meses: valores.duracao_meses || null,
          itens: itens.map(itemParaApi),
        }
        if (pacote) await put(`/pacotes/${pacote.id}`, corpo)
        else await post('/pacotes', corpo)
        fb.sucesso('Pacote salvo.')
        onConcluir()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" obrigatorio>
          {(p) => <input className="field-control" {...p} value={valores.nome} onChange={campo('nome')} />}
        </Campo>
        <Campo rotulo="Programa">
          {(p) => (
            <select className="field-control" {...p} value={valores.programa_id} onChange={campo('programa_id')}>
              <Opcoes itens={ativos(cat?.programas)} vazio="Sem programa" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Duração (meses)" dica="Usada para sugerir o término da vigência.">
          {(p) => <input type="number" min={1} max={60} className="field-control" {...p} value={valores.duracao_meses} onChange={campo('duracao_meses')} />}
        </Campo>
        {pacote && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={valores.ativo} onChange={campo('ativo')} /> Disponível para novas matrículas
          </label>
        )}
      </div>
      <Campo rotulo="Descrição">
        {(p) => <input className="field-control" {...p} value={valores.descricao} onChange={campo('descricao')} />}
      </Campo>
      <h3 className="text-sm font-medium text-ink-soft">Entregáveis do pacote</h3>
      <EditorItens itens={itens} onChange={setItens} origens={['pacote', 'bonus']} />
    </FormDialog>
  )
}
