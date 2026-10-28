import { useState } from 'react'
import { Plus, Route, Trash2 } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio, Secao } from '../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { post, put, useDados, type Reg } from '../lib/api'
import { invalidarCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'

interface Modelo {
  trilhas: Reg[]
  pilares: Reg[]
  etapas: Reg[]
  prerequisitos: { etapa_id: string; requer_etapa_id: string }[]
  atividades_modelo: Reg[]
}

export function ModeloPedagogico() {
  const { pode } = useSessao()
  const { dados, erro, recarregar } = useDados<Modelo>('/pedagogico/modelo')
  const [etapa, setEtapa] = useState<Reg | 'nova' | null>(null)
  const [cadastro, setCadastro] = useState<{ tipo: 'trilhas' | 'pilares'; reg: Reg | null } | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const config = pode('pedagogico:configurar')
  const nomeEtapa = new Map(dados.etapas.map((e) => [e.id, e.titulo]))

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-soft">
        Trilha e pilar são campos separados e configuráveis. O conteúdo oficial (aulas, critérios e materiais) deve ser cadastrado pela coordenação: os itens marcados com “[Demo]” são exemplos fictícios.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['trilhas', 'pilares'] as const).map((tipo) => (
          <Secao
            key={tipo}
            titulo={tipo === 'trilhas' ? 'Trilhas' : 'Pilares'}
            acao={
              config && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setCadastro({ tipo, reg: null })}>
                  <Plus className="size-4" aria-hidden /> Adicionar
                </button>
              )
            }
          >
            <ul className="divide-y divide-line text-sm">
              {dados[tipo].map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    <span className="font-medium">{t.nome}</span> {!t.ativo && <Selo>Inativo</Selo>}
                    {t.descricao && <span className="block text-xs text-ink-muted">{t.descricao}</span>}
                  </span>
                  {config && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setCadastro({ tipo, reg: t })}>
                      Editar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Secao>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="font-display text-lg font-semibold">Etapas</h2>
        {config && dados.trilhas.length > 0 && (
          <button type="button" className="btn-primary" onClick={() => setEtapa('nova')}>
            <Plus className="size-4" aria-hidden /> Nova etapa
          </button>
        )}
      </div>
      {dados.etapas.length === 0 ? (
        <EstadoVazio icone={Route} titulo={dados.trilhas.length ? 'Nenhuma etapa cadastrada.' : 'Cadastre uma trilha antes de criar etapas.'} />
      ) : (
        dados.trilhas.map((t) => {
          const etapas = dados.etapas.filter((e) => e.trilha_id === t.id)
          if (!etapas.length) return null
          return (
            <section key={t.id} className="space-y-2">
              <h3 className="text-sm font-semibold text-brand-700">{t.nome}</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {etapas.map((e) => {
                  const reqs = dados.prerequisitos.filter((p) => p.etapa_id === e.id)
                  const ativs = dados.atividades_modelo.filter((a) => a.etapa_id === e.id && a.ativo !== 0)
                  return (
                    <article key={e.id} className="card p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-ink">
                            {e.titulo} {!e.ativo && <Selo>Inativa</Selo>}
                          </p>
                          <p className="text-xs text-ink-muted">Pilar: {dados.pilares.find((p) => p.id === e.pilar_id)?.nome ?? '—'} · ordem {e.ordem}</p>
                        </div>
                        {config && (
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setEtapa(e)}>
                            Editar
                          </button>
                        )}
                      </div>
                      {e.objetivo && <p className="mt-1 text-ink-soft">{e.objetivo}</p>}
                      {e.criterio_conclusao && <p className="mt-1 text-xs text-ink-soft">Critério: {e.criterio_conclusao}</p>}
                      <p className="mt-1 text-xs text-ink-muted">Pré-requisitos: {reqs.length ? reqs.map((r) => nomeEtapa.get(r.requer_etapa_id)).join(', ') : 'nenhum'}</p>
                      <p className="text-xs text-ink-muted">{ativs.length} atividade(s) modelo · {e.links.length} link(s)</p>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
      {etapa && <DialogEtapa modelo={dados} etapa={etapa === 'nova' ? null : etapa} onFechar={() => setEtapa(null)} onConcluir={recarregar} />}
      {cadastro && (
        <DialogCadastro
          tipo={cadastro.tipo}
          reg={cadastro.reg}
          onFechar={() => setCadastro(null)}
          onConcluir={() => {
            invalidarCatalogos()
            void recarregar()
          }}
        />
      )}
    </div>
  )
}

function DialogCadastro({ tipo, reg, onFechar, onConcluir }: { tipo: 'trilhas' | 'pilares'; reg: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ nome: reg?.nome ?? '', descricao: reg?.descricao ?? '', ordem: String(reg?.ordem ?? 0), ativo: reg ? !!reg.ativo : true })
  const nome = tipo === 'trilhas' ? 'trilha' : 'pilar'
  return (
    <FormDialog
      aberto
      titulo={reg ? `Editar ${nome}` : `Nova ${tipo === 'trilhas' ? 'trilha' : 'pilar'}`.replace('Nova pilar', 'Novo pilar')}
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = { ...valores, descricao: valores.descricao || null, ordem: Number(valores.ordem) || 0 }
        if (reg) await put(`/catalogos/${tipo}/${reg.id}`, corpo)
        else await post(`/catalogos/${tipo}`, corpo)
        fb.sucesso('Salvo.')
        onConcluir()
      }}
    >
      <Campo rotulo="Nome" obrigatorio>
        {(p) => <input className="field-control" {...p} value={valores.nome} onChange={campo('nome')} />}
      </Campo>
      <Campo rotulo="Descrição">
        {(p) => <input className="field-control" {...p} value={valores.descricao} onChange={campo('descricao')} />}
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Ordem">
          {(p) => <input type="number" min={0} className="field-control" {...p} value={valores.ordem} onChange={campo('ordem')} />}
        </Campo>
        {reg && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={valores.ativo} onChange={campo('ativo')} /> Ativo
          </label>
        )}
      </div>
    </FormDialog>
  )
}

interface AtivModelo {
  id?: string
  titulo: string
  descricao: string
  link: string
}

function DialogEtapa({ modelo, etapa, onFechar, onConcluir }: { modelo: Modelo; etapa: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({
    trilha_id: etapa?.trilha_id ?? modelo.trilhas[0]?.id ?? '',
    pilar_id: etapa?.pilar_id ?? '',
    titulo: etapa?.titulo ?? '',
    objetivo: etapa?.objetivo ?? '',
    criterio_conclusao: etapa?.criterio_conclusao ?? '',
    ordem: String(etapa?.ordem ?? 0),
    ativo: etapa ? !!etapa.ativo : true,
  })
  const [reqs, setReqs] = useState<string[]>(etapa ? modelo.prerequisitos.filter((p) => p.etapa_id === etapa.id).map((p) => p.requer_etapa_id) : [])
  const [links, setLinks] = useState<{ titulo: string; url: string }[]>(etapa?.links ?? [])
  const [ativs, setAtivs] = useState<AtivModelo[]>(
    etapa ? modelo.atividades_modelo.filter((a) => a.etapa_id === etapa.id && a.ativo !== 0).map((a) => ({ id: a.id, titulo: a.titulo, descricao: a.descricao ?? '', link: a.link ?? '' })) : [],
  )
  const outras = modelo.etapas.filter((e) => e.id !== etapa?.id)

  return (
    <FormDialog
      aberto
      titulo={etapa ? 'Editar etapa' : 'Nova etapa'}
      descricao="Mudanças no modelo não alteram atividades já copiadas para jornadas individuais."
      largura="max-w-3xl"
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = {
          ...valores,
          pilar_id: valores.pilar_id || null,
          objetivo: valores.objetivo || null,
          criterio_conclusao: valores.criterio_conclusao || null,
          ordem: Number(valores.ordem) || 0,
          prerequisitos: reqs,
          links: links.filter((l) => l.titulo || l.url),
          atividades_modelo: ativs.map((a) => ({ id: a.id ?? null, titulo: a.titulo, descricao: a.descricao || null, link: a.link || null })),
        }
        if (etapa) await put(`/etapas/${etapa.id}`, corpo)
        else await post('/etapas', corpo)
        fb.sucesso('Etapa salva.')
        onConcluir()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Trilha" obrigatorio>
          {(p) => (
            <select className="field-control" {...p} value={valores.trilha_id} onChange={campo('trilha_id')}>
              <Opcoes itens={modelo.trilhas} />
            </select>
          )}
        </Campo>
        <Campo rotulo="Pilar">
          {(p) => (
            <select className="field-control" {...p} value={valores.pilar_id} onChange={campo('pilar_id')}>
              <Opcoes itens={modelo.pilares} vazio="Sem pilar" />
            </select>
          )}
        </Campo>
      </div>
      <Campo rotulo="Título" obrigatorio>
        {(p) => <input className="field-control" {...p} value={valores.titulo} onChange={campo('titulo')} />}
      </Campo>
      <Campo rotulo="Objetivo">
        {(p) => <textarea rows={2} className="field-control" {...p} value={valores.objetivo} onChange={campo('objetivo')} />}
      </Campo>
      <Campo rotulo="Critério de conclusão">
        {(p) => <textarea rows={2} className="field-control" {...p} value={valores.criterio_conclusao} onChange={campo('criterio_conclusao')} />}
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Ordem">
          {(p) => <input type="number" min={0} className="field-control" {...p} value={valores.ordem} onChange={campo('ordem')} />}
        </Campo>
        {etapa && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={valores.ativo} onChange={campo('ativo')} /> Ativa
          </label>
        )}
      </div>

      <fieldset className="rounded-[var(--radius-control)] border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink-soft">Pré-requisitos</legend>
        {outras.length === 0 ? (
          <p className="text-xs text-ink-muted">Não há outras etapas.</p>
        ) : (
          <div className="grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
            {outras.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={reqs.includes(e.id)} onChange={(ev) => setReqs(ev.target.checked ? [...reqs, e.id] : reqs.filter((x) => x !== e.id))} />
                {e.titulo}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-ink-muted">Dependências circulares são recusadas.</p>
      </fieldset>

      <fieldset className="space-y-2 rounded-[var(--radius-control)] border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink-soft">Links de conteúdo</legend>
        {links.map((l, n) => (
          <div key={n} className="flex flex-wrap gap-2">
            <input className="field-control flex-1" aria-label={`Título do link ${n + 1}`} placeholder="Título" value={l.titulo} onChange={(e) => setLinks(links.map((x, i) => (i === n ? { ...x, titulo: e.target.value } : x)))} />
            <input className="field-control flex-[2]" aria-label={`Endereço do link ${n + 1}`} placeholder="https://" value={l.url} onChange={(e) => setLinks(links.map((x, i) => (i === n ? { ...x, url: e.target.value } : x)))} />
            <button type="button" className="btn-ghost btn-sm text-danger" aria-label={`Remover link ${n + 1}`} onClick={() => setLinks(links.filter((_, i) => i !== n))}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" className="btn-secondary btn-sm" onClick={() => setLinks([...links, { titulo: '', url: '' }])}>
          <Plus className="size-4" aria-hidden /> Adicionar link
        </button>
      </fieldset>

      <fieldset className="space-y-2 rounded-[var(--radius-control)] border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink-soft">Atividades modelo</legend>
        {ativs.map((a, n) => (
          <div key={a.id ?? n} className="grid gap-2 rounded border border-line p-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className="field-control" aria-label={`Título da atividade ${n + 1}`} placeholder="Título" value={a.titulo} onChange={(e) => setAtivs(ativs.map((x, i) => (i === n ? { ...x, titulo: e.target.value } : x)))} />
            <input className="field-control" aria-label={`Link da atividade ${n + 1}`} placeholder="Link (opcional)" value={a.link} onChange={(e) => setAtivs(ativs.map((x, i) => (i === n ? { ...x, link: e.target.value } : x)))} />
            <button type="button" className="btn-ghost btn-sm text-danger" aria-label={`Remover atividade ${n + 1}`} onClick={() => setAtivs(ativs.filter((_, i) => i !== n))}>
              <Trash2 className="size-4" aria-hidden />
            </button>
            <textarea rows={2} className="field-control sm:col-span-3" aria-label={`Orientação da atividade ${n + 1}`} placeholder="Orientação para a aluna (opcional)" value={a.descricao} onChange={(e) => setAtivs(ativs.map((x, i) => (i === n ? { ...x, descricao: e.target.value } : x)))} />
          </div>
        ))}
        <button type="button" className="btn-secondary btn-sm" onClick={() => setAtivs([...ativs, { titulo: '', descricao: '', link: '' }])}>
          <Plus className="size-4" aria-hidden /> Adicionar atividade
        </button>
      </fieldset>
    </FormDialog>
  )
}
