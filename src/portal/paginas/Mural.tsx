import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Heart, Newspaper, Plus, Search } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { get, mensagemDeErro, post, useDados, type Reg } from '../../lib/api'
import { cx } from '../../lib/format'
import { useSessao } from '../../state/Sessao'
import { hrefAluna } from '../rotas'
import { CardPublicacao, SITUACAO_MURAL } from '../../mural/comum'
import { PaginaPublicacao } from '../../mural/PaginaPublicacao'
import { Comentarios } from '../../mural/Comentarios'
import { EditorPublicacao } from '../../mural/Editor'

export { CANAL_MURAL, CATEGORIA_ANTIGA as CATEGORIA_MURAL } from '../../mural/comum'

const BASE = '/portal/mural' as const

/**
 * Mural de oportunidades: feed com as publicações das alunas (Explorar), as próprias publicações
 * (Minhas publicações) e a página completa de cada publicação (`#/mural/<id>`).
 */
export function Mural({ id }: { id?: string }) {
  if (id && id !== 'minhas') return <Publicacao key={id} id={id} />
  return <Feed aba={id === 'minhas' ? 'minhas' : 'explorar'} />
}

function useDebounce<T>(valor: T, ms = 300) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

function Feed({ aba }: { aba: 'explorar' | 'minhas' }) {
  const { eu } = useSessao()
  const fb = useFeedback()
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [tipo, setTipo] = useState('')
  const q = useDebounce(busca)
  const qs = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(categoria ? { categoria } : {}), ...(tipo ? { tipo } : {}) }).toString()
  const { dados, erro, recarregar } = useDados<Reg>(`${BASE}${qs ? `?${qs}` : ''}`)
  const [mais, setMais] = useState<Reg[]>([])
  const [temMais, setTemMais] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [editor, setEditor] = useState<Reg | null | false>(false)

  useEffect(() => {
    setMais([])
    setTemMais(!!dados?.tem_mais)
  }, [dados])

  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const publicadas = [...(dados.publicadas as Reg[]), ...mais]
  const minhas = dados.minhas as Reg[]
  const filtrando = !!(q.trim() || categoria || tipo)

  async function carregarMais() {
    setCarregandoMais(true)
    try {
      const r = await get<Reg>(`${BASE}?${new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(categoria ? { categoria } : {}), ...(tipo ? { tipo } : {}), offset: String(publicadas.length) })}`)
      setMais((m) => [...m, ...(r.publicadas as Reg[])])
      setTemMais(!!r.tem_mais)
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    } finally {
      setCarregandoMais(false)
    }
  }

  async function arquivar(p: Reg) {
    if (!(await fb.confirmar({ titulo: 'Arquivar publicação', mensagem: `“${p.titulo}” sai do mural. Essa ação não pode ser desfeita por você.`, rotuloConfirmar: 'Arquivar', perigo: true }))) return
    try {
      await post(`${BASE}/${p.id}/arquivar`)
      fb.sucesso('Publicação arquivada.')
      recarregar()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  async function abrirEdicao(p: Reg) {
    try {
      const r = await get<Reg>(`${BASE}/${p.id}`)
      setEditor(r.publicacao)
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  return (
    <div className="space-y-4">
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-r from-brand-700 to-brand-600 px-5 py-5 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-widest text-gold-line uppercase">Comunidade Diamante</p>
              <h2 className="font-display text-xl font-semibold">Mural de oportunidades</h2>
              <p className="mt-1 max-w-xl text-sm text-white/85">Produtos e serviços das alunas. Conheça os negócios, curta e comente. {dados.moderada && 'Cada publicação passa pela equipe antes de aparecer.'}</p>
            </div>
            {dados.pode_publicar && (
              <button type="button" className="btn inline-flex items-center gap-1.5 bg-white text-brand-700 hover:bg-gold-soft" onClick={() => setEditor(null)}>
                <Plus className="size-4" aria-hidden /> Nova publicação
              </button>
            )}
          </div>
        </div>
        <div role="tablist" aria-label="Mural" className="flex gap-1 border-t border-line px-3 pt-2">
          {(
            [
              ['explorar', 'Explorar', hrefAluna('mural')],
              ['minhas', `Minhas publicações${minhas.length ? ` (${minhas.length})` : ''}`, hrefAluna('mural', 'minhas')],
            ] as const
          ).map(([k, r, href]) => (
            <a key={k} role="tab" aria-selected={aba === k} href={href} className={cx('-mb-px border-b-2 px-3 py-2 text-sm font-medium', aba === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink')}>
              {r}
            </a>
          ))}
        </div>
      </section>

      {aba === 'explorar' ? (
        !dados.pode_ver ? (
          <p className="card p-4 text-sm text-ink-muted">O mural é para alunas com matrícula ativa.</p>
        ) : (
          <>
            <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <label className="relative flex-1">
                <span className="sr-only">Buscar por título ou nome do negócio</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
                <input type="search" className="field-control pl-9" placeholder="Buscar por título ou negócio" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </label>
              <label className="sm:w-56">
                <span className="sr-only">Categoria</span>
                <select className="field-control" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="">Todas as categorias</option>
                  {(dados.categorias as Reg[]).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-1" role="group" aria-label="Tipo de oferta">
                {[
                  ['', 'Todos'],
                  ['produto', 'Produtos'],
                  ['servico', 'Serviços'],
                ].map(([k, r]) => (
                  <button key={k} type="button" aria-pressed={tipo === k} className={tipo === k ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setTipo(k)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {publicadas.length === 0 ? (
              <div className="card flex flex-col items-center px-6 py-12 text-center">
                <Newspaper className="size-8 text-ink-muted" aria-hidden />
                <p className="mt-2 text-sm text-ink-soft">{filtrando ? 'Nenhuma publicação encontrada com esses filtros.' : 'Nenhuma publicação ainda. Que tal ser a primeira?'}</p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {publicadas.map((p) => (
                  <CardPublicacao key={p.id} p={p} base={BASE} href={hrefAluna('mural', p.id)} />
                ))}
              </ul>
            )}
            {temMais && (
              <div className="flex justify-center">
                <button type="button" className="btn-secondary" onClick={carregarMais} disabled={carregandoMais}>
                  {carregandoMais ? 'Carregando…' : 'Ver mais publicações'}
                </button>
              </div>
            )}
          </>
        )
      ) : minhas.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Newspaper className="size-8 text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-soft">Você ainda não publicou no mural.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {minhas.map((p) => (
            <CardPublicacao
              key={p.id}
              p={p}
              base={BASE}
              href={hrefAluna('mural', p.id)}
              mostrarSituacao
              rodape={
                p.situacao !== 'arquivada' && (
                  <>
                    {dados.pode_publicar && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => abrirEdicao(p)}>
                        Editar
                      </button>
                    )}
                    <button type="button" className="btn-ghost btn-sm" onClick={() => arquivar(p)}>
                      Arquivar
                    </button>
                  </>
                )
              }
            />
          ))}
        </ul>
      )}

      {editor !== false && (
        <EditorPublicacao
          base={BASE}
          categorias={dados.categorias as Reg[]}
          publicacao={editor}
          autoraNome={eu?.pessoa_nome ?? eu?.nome ?? ''}
          moderada={dados.moderada}
          onFechar={() => setEditor(false)}
          onSalvo={(r) => {
            setEditor(false)
            fb.sucesso(r.situacao === 'publicada' ? 'Publicado no mural.' : 'Enviado. A equipe vai aprovar antes de aparecer no mural.')
            if (aba !== 'minhas') window.location.hash = hrefAluna('mural', 'minhas')
            else recarregar()
          }}
        />
      )}
    </div>
  )
}

function Publicacao({ id }: { id: string }) {
  const fb = useFeedback()
  const { eu } = useSessao()
  const { dados, erro, recarregar } = useDados<Reg>(`${BASE}/${id}`)
  const [curtida, setCurtida] = useState<{ curti: boolean; curtidas: number } | null>(null)
  const [editor, setEditor] = useState(false)
  const [categorias, setCategorias] = useState<Reg[]>([])
  const enviando = useRef(false)

  useEffect(() => {
    if (dados) setCurtida({ curti: !!dados.publicacao.curti, curtidas: dados.publicacao.curtidas })
  }, [dados])

  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados || !curtida) return <Carregando />
  const p = dados.publicacao as Reg
  const situacao = SITUACAO_MURAL[p.situacao]

  async function alternarCurtida() {
    if (enviando.current || !curtida) return
    enviando.current = true
    const antes = curtida
    setCurtida({ curti: !antes.curti, curtidas: antes.curtidas + (antes.curti ? -1 : 1) })
    try {
      const r = await post<Reg>(`${BASE}/${id}/curtir`, { curtir: !antes.curti })
      setCurtida({ curti: r.curti, curtidas: r.curtidas })
    } catch (e) {
      setCurtida(antes)
      fb.erro(mensagemDeErro(e))
    } finally {
      enviando.current = false
    }
  }

  async function editar() {
    try {
      const r = await get<Reg>(BASE)
      setCategorias(r.categorias as Reg[])
      setEditor(true)
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  async function arquivar() {
    if (!(await fb.confirmar({ titulo: 'Arquivar publicação', mensagem: `“${p.titulo}” sai do mural. Essa ação não pode ser desfeita por você.`, rotuloConfirmar: 'Arquivar', perigo: true }))) return
    try {
      await post(`${BASE}/${id}/arquivar`)
      fb.sucesso('Publicação arquivada.')
      window.location.hash = hrefAluna('mural', 'minhas')
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  return (
    <div className="space-y-4">
      <a href={hrefAluna('mural', dados.minha ? 'minhas' : undefined)} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Voltar ao mural
      </a>
      {dados.minha && p.situacao !== 'publicada' && situacao && (
        <div className="card flex flex-wrap items-center gap-2 p-3 text-sm">
          <Selo tom={situacao[1]}>{situacao[0]}</Selo>
          {p.situacao === 'pendente' && <span className="text-ink-soft">Só você vê esta publicação até a equipe aprovar.</span>}
          {p.situacao === 'recusada' && p.motivo_moderacao && <span className="text-ink-soft">Motivo: {p.motivo_moderacao}. Edite e envie de novo.</span>}
        </div>
      )}
      <PaginaPublicacao
        p={p}
        base={BASE}
        acoes={
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {p.situacao === 'publicada' && (
              <button type="button" onClick={alternarCurtida} disabled={!dados.pode_interagir} aria-pressed={curtida.curti} className={cx('btn-secondary btn-sm', curtida.curti && 'border-brand-600 text-brand-700')}>
                <Heart className={cx('size-4', curtida.curti && 'fill-brand-600 text-brand-600')} aria-hidden />
                {curtida.curti ? 'Curtido' : 'Curtir'} · {curtida.curtidas}
              </button>
            )}
            {dados.minha && dados.pode_editar && (
              <button type="button" className="btn-ghost btn-sm" onClick={editar}>
                Editar
              </button>
            )}
            {dados.minha && p.situacao !== 'arquivada' && (
              <button type="button" className="btn-ghost btn-sm" onClick={arquivar}>
                Arquivar
              </button>
            )}
          </div>
        }
      >
        {p.situacao === 'publicada' && <Comentarios muralId={id} lista={dados.comentarios as Reg[]} podeInteragir={!!dados.pode_interagir} modo="aluna" onMudou={recarregar} />}
      </PaginaPublicacao>
      {editor && (
        <EditorPublicacao
          base={BASE}
          categorias={categorias}
          publicacao={p}
          autoraNome={eu?.pessoa_nome ?? eu?.nome ?? ''}
          moderada={dados.moderada}
          onFechar={() => setEditor(false)}
          onSalvo={(r) => {
            setEditor(false)
            fb.sucesso(r.situacao === 'pendente' ? 'Alterações enviadas. A equipe vai aprovar antes de aparecer no mural.' : 'Publicação atualizada.')
            recarregar()
          }}
        />
      )}
    </div>
  )
}
