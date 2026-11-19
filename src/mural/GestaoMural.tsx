import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Carregando, EstadoErro, Secao } from '../components/Estados'
import { Campo, FormDialog, useValores } from '../components/Form'
import { Dialog } from '../components/Dialog'
import { Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { get, mensagemDeErro, post, put, useDados, type Reg } from '../lib/api'
import { formatarData } from '../../shared/datas'
import { CANAL_MURAL, CardPublicacao, SITUACAO_MURAL } from './comum'
import { PaginaPublicacao } from './PaginaPublicacao'
import { Comentarios } from './Comentarios'
import { EditorPublicacao } from './Editor'

const BASE = '/mural' as const

const ACAO_HISTORICO: Record<string, string> = {
  enviada_pela_aluna: 'Enviada pela aluna',
  editada_pela_aluna: 'Editada pela aluna',
  arquivada_pela_aluna: 'Arquivada pela aluna',
  publicada_pela_equipe: 'Publicada pela equipe',
  editada_pela_equipe: 'Editada pela equipe',
  mural_publicar: 'Publicada',
  mural_recusar: 'Recusada',
  mural_arquivar: 'Arquivada',
}

/**
 * Gestão do Mural (equipe com "mural:moderar"): publicações de todas as situações, aprovação,
 * recusa e arquivamento, moderação de comentários, publicações da equipe e categorias.
 * As regras (publicação direta, moderada ou só pela equipe, e quem vê) ficam em Configurações.
 */
export function GestaoMural() {
  const fb = useFeedback()
  const [situacao, setSituacao] = useState('')
  const [busca, setBusca] = useState('')
  const [q, setQ] = useState('')
  const qs = new URLSearchParams({ ...(situacao ? { situacao } : {}), ...(q ? { q } : {}) }).toString()
  const { dados, erro, recarregar } = useDados<{ publicacoes: Reg[]; categorias: Reg[] }>(`${BASE}${qs ? `?${qs}` : ''}`)
  const [aberta, setAberta] = useState<string | null>(null)
  const [recusando, setRecusando] = useState<Reg | null>(null)
  const [editor, setEditor] = useState<Reg | null | false>(false)
  const [categorias, setCategorias] = useState(false)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />

  async function moderar(p: Reg, decisao: 'publicar' | 'arquivar') {
    try {
      await post(`${BASE}/${p.id}/moderar`, { decisao })
      fb.sucesso(decisao === 'publicar' ? 'Publicada no mural.' : 'Arquivada.')
      recarregar()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  async function editar(p: Reg) {
    try {
      setEditor((await get<Reg>(`${BASE}/${p.id}`)).publicacao)
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  const acoes = (p: Reg) => (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setAberta(p.id)}>
        Abrir
      </button>
      {p.situacao !== 'publicada' && (
        <button type="button" className="btn-primary btn-sm" onClick={() => moderar(p, 'publicar')}>
          Publicar
        </button>
      )}
      {p.situacao === 'pendente' && (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setRecusando(p)}>
          Recusar
        </button>
      )}
      {p.situacao !== 'arquivada' && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => moderar(p, 'arquivar')}>
          Arquivar
        </button>
      )}
      {p.da_equipe && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => editar(p)}>
          Editar
        </button>
      )}
    </>
  )

  const pendentes = dados.publicacoes.filter((p) => p.situacao === 'pendente').length

  return (
    <Secao
      titulo="Gestão do Mural"
      descricao="Aprove, recuse ou arquive publicações e modere comentários. Tudo fica registrado. As regras (publicação direta, moderada ou só pela equipe, e quem vê) ficam em Configurações › Parâmetros."
      acao={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setCategorias(true)}>
            Categorias
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditor(null)}>
            <Plus className="size-4" aria-hidden /> Publicar pela equipe
          </button>
        </div>
      }
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(busca.trim())
          }}
        >
          <label className="sr-only" htmlFor="busca-mural">
            Buscar por título ou negócio
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input id="busca-mural" type="search" className="field-control pl-9" placeholder="Buscar por título ou negócio (Enter)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </form>
        <select className="field-control sm:w-56" aria-label="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todas as situações</option>
          {Object.entries(SITUACAO_MURAL).map(([k, [r]]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {!situacao && pendentes > 0 && <p className="mb-3 text-sm text-ink-soft">{pendentes === 1 ? '1 publicação aguarda aprovação.' : `${pendentes} publicações aguardam aprovação.`}</p>}
      {!dados.publicacoes.length ? (
        <p className="text-sm text-ink-muted">Nenhuma publicação encontrada.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {dados.publicacoes.map((p) => (
            <CardPublicacao
              key={p.id}
              p={p}
              base={BASE}
              onAbrir={() => setAberta(p.id)}
              mostrarSituacao
              rodape={
                <div className="w-full space-y-1">
                  <p className="text-xs text-ink-muted">
                    {CANAL_MURAL[p.contato_canal] ?? p.contato_canal}: {p.contato_valor}
                    {p.moderada_por_nome && ` · analisada por ${p.moderada_por_nome}`}
                    {p.comentarios_removidos > 0 && ` · ${p.comentarios_removidos} comentário(s) removido(s)`}
                  </p>
                  <div className="flex flex-wrap gap-1">{acoes(p)}</div>
                </div>
              }
            />
          ))}
        </ul>
      )}
      {aberta && <DetalheEquipe id={aberta} onFechar={() => setAberta(null)} onMudou={recarregar} />}
      {recusando && <DialogRecusar p={recusando} onFechar={() => setRecusando(null)} onConcluir={recarregar} />}
      {categorias && <DialogCategorias onFechar={() => setCategorias(false)} onMudou={recarregar} />}
      {editor !== false && (
        <EditorPublicacao
          base={BASE}
          equipe
          categorias={dados.categorias}
          publicacao={editor}
          autoraNome="Equipe Centro Liderar"
          moderada={false}
          onFechar={() => setEditor(false)}
          onSalvo={() => {
            setEditor(false)
            fb.sucesso('Publicação salva.')
            recarregar()
          }}
        />
      )}
    </Secao>
  )
}

function DetalheEquipe({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const { dados, erro, recarregar } = useDados<Reg>(`${BASE}/${id}`)
  return (
    <Dialog aberto titulo="Publicação do mural" descricao="Como as alunas veem, com os comentários e o registro de moderação." onFechar={onFechar} largura="sm:max-w-4xl">
      {erro ? (
        <EstadoErro mensagem={erro} onTentar={recarregar} />
      ) : !dados ? (
        <Carregando />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Selo tom={SITUACAO_MURAL[dados.publicacao.situacao]?.[1] ?? 'neutro'}>{SITUACAO_MURAL[dados.publicacao.situacao]?.[0] ?? dados.publicacao.situacao}</Selo>
            <span className="text-ink-muted">
              {dados.publicacao.curtidas} curtida(s) · {dados.publicacao.comentarios} comentário(s) visíveis
            </span>
          </div>
          <PaginaPublicacao p={dados.publicacao} base={BASE}>
            <Comentarios
              muralId={id}
              lista={dados.comentarios}
              podeInteragir={false}
              modo="equipe"
              onMudou={() => {
                recarregar()
                onMudou()
              }}
            />
            {dados.historico?.length > 0 && (
              <section className="card p-5">
                <h2 className="font-display text-base font-semibold">Registro</h2>
                <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                  {(dados.historico as Reg[]).map((h, i) => {
                    let motivo: string | null = null
                    try {
                      motivo = h.dados ? JSON.parse(h.dados).motivo ?? null : null
                    } catch {
                      motivo = null
                    }
                    return (
                      <li key={i}>
                        {formatarData(String(h.criado_em).slice(0, 10))} · {ACAO_HISTORICO[h.acao] ?? h.acao}
                        {h.autor_nome && ` por ${h.autor_nome}`}
                        {motivo && ` · motivo: ${motivo}`}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </PaginaPublicacao>
        </div>
      )}
    </Dialog>
  )
}

function DialogRecusar({ p, onFechar, onConcluir }: { p: Reg; onFechar: () => void; onConcluir: () => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <FormDialog
      aberto
      titulo="Recusar publicação"
      descricao={`“${p.titulo}”. A aluna verá o motivo e poderá editar e enviar de novo.`}
      rotulo="Recusar"
      perigo
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`${BASE}/${p.id}/moderar`, { decisao: 'recusar', motivo })
        onConcluir()
      }}
    >
      <Campo rotulo="Motivo" obrigatorio>
        {(pr) => <textarea rows={3} maxLength={500} className="field-control" {...pr} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
      </Campo>
    </FormDialog>
  )
}

function DialogCategorias({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
  const fb = useFeedback()
  const { dados, erro, recarregar } = useDados<{ categorias: Reg[] }>(`${BASE}/categorias`)
  const [editando, setEditando] = useState<Reg | null | false>(false)

  async function alternar(c: Reg) {
    try {
      await put(`${BASE}/categorias/${c.id}`, { nome: c.nome, ordem: c.ordem, ativa: !c.ativa })
      recarregar()
      onMudou()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  return (
    <Dialog aberto titulo="Categorias do mural" descricao="As alunas escolhem uma destas ao publicar. Desativar esconde a categoria das novas publicações, sem mexer nas antigas." onFechar={onFechar}>
      {erro ? (
        <EstadoErro mensagem={erro} onTentar={recarregar} />
      ) : !dados ? (
        <Carregando />
      ) : (
        <div className="space-y-3">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(null)}>
            <Plus className="size-4" aria-hidden /> Nova categoria
          </button>
          <ul className="divide-y divide-line text-sm">
            {dados.categorias.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.nome} <span className="text-xs text-ink-muted">· ordem {c.ordem} · {c.publicacoes} publicação(ões)</span>
                  {!c.ativa && (
                    <Selo className="ml-2" tom="neutro">
                      Desativada
                    </Selo>
                  )}
                </span>
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditando(c)}>
                    Editar
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => alternar(c)}>
                    {c.ativa ? 'Desativar' : 'Ativar'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {editando !== false && (
        <DialogCategoria
          c={editando}
          onFechar={() => setEditando(false)}
          onConcluir={() => {
            recarregar()
            onMudou()
          }}
        />
      )}
    </Dialog>
  )
}

function DialogCategoria({ c, onFechar, onConcluir }: { c: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const { valores, campo } = useValores({ nome: (c?.nome as string) ?? '', ordem: String(c?.ordem ?? 50) })
  return (
    <FormDialog
      aberto
      titulo={c ? 'Editar categoria' : 'Nova categoria'}
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = { nome: valores.nome, ordem: Number(valores.ordem) || 0, ativa: c ? !!c.ativa : true }
        if (c) await put(`${BASE}/categorias/${c.id}`, corpo)
        else await post(`${BASE}/categorias`, corpo)
        onConcluir()
      }}
    >
      <Campo rotulo="Nome" obrigatorio>
        {(p) => <input {...p} className="field-control" maxLength={60} value={valores.nome} onChange={campo('nome')} />}
      </Campo>
      <Campo rotulo="Ordem" dica="Menor aparece primeiro.">
        {(p) => <input {...p} type="number" min={0} max={999} className="field-control max-w-32" value={valores.ordem} onChange={campo('ordem')} />}
      </Campo>
    </FormDialog>
  )
}
