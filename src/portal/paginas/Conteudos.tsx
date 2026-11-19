import { useEffect } from 'react'
import { BookOpen, CheckCircle2, Download, ExternalLink, Library, LibraryBig, Repeat, ShoppingBag } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../../components/Estados'
import { useDados, type Reg } from '../../lib/api'
import { tamanhoArquivo } from '../../lib/format'
import { PlayerVideo } from '../PlayerVideo'

type Secao = 'rotina' | 'biblioteca' | 'livros'

const VAZIO: Record<Secao, { icone: typeof Library; titulo: string; texto: string }> = {
  rotina: { icone: Repeat, titulo: 'A rotina oficial ainda não foi publicada.', texto: 'O “Dia Extraordinário da Mulher que Age” vai aparecer aqui assim que a equipe publicar.' },
  biblioteca: { icone: Library, titulo: 'A biblioteca ainda está vazia.', texto: 'Materiais, ferramentas e modelos publicados pela equipe vão aparecer aqui.' },
  livros: { icone: BookOpen, titulo: 'Nenhum livro publicado ainda.', texto: 'As indicações de leitura, com o link de compra, vão aparecer aqui.' },
}

/** Rotina, Biblioteca (estantes e categorias, como Ferramentas) e Livros: só o que a equipe publicou. */
export function Conteudos({ secao, destaqueId }: { secao: Secao; destaqueId?: string }) {
  const { dados, erro, recarregar } = useDados<Reg>(`/portal/conteudos/${secao}`)
  // Vindo de "Ir à Biblioteca" (Plano de Ação): rola até o livro indicado e põe o foco nele.
  useEffect(() => {
    if (!dados || !destaqueId) return
    const el = document.getElementById(`material-${destaqueId}`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus({ preventScroll: true })
    }
  }, [dados, destaqueId])
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const itens = dados.itens as Reg[]
  if (itens.length === 0) {
    const v = VAZIO[secao]
    return (
      <EstadoVazio icone={v.icone} titulo={v.titulo}>
        <p className="mt-1 max-w-md text-sm text-ink-muted">{v.texto}</p>
      </EstadoVazio>
    )
  }
  const limite = Number(dados.percentual_assistida ?? 90)
  const estantes = (dados.estantes ?? []) as Reg[]
  const doItem = (c: Reg) => <Item key={c.id} c={c} limite={limite} onAssistido={recarregar} destaque={c.id === destaqueId} />
  const destaqueAusente = !!destaqueId && !itens.some((c) => c.id === destaqueId)
  const soltos = itens.filter((c) => !c.estante_id)
  const grupos = new Map<string, Reg[]>()
  for (const c of soltos) grupos.set(c.categoria ?? '', [...(grupos.get(c.categoria ?? '') ?? []), c])
  return (
    <div className="space-y-5">
      {destaqueAusente && (
        <p role="status" className="rounded-lg border border-line bg-surface-muted/60 px-4 py-3 text-sm text-ink-soft">
          O livro indicado na sua ação não está disponível na Biblioteca agora. Fale com a equipe se precisar dele.
        </p>
      )}
      {estantes.map((e) => {
        const lista = itens.filter((c) => c.estante_id === e.id)
        if (!lista.length) return null
        const videos = lista.filter((c) => c.video_url)
        const vistos = videos.filter((c) => c.percentual >= limite).length
        return (
          <section key={e.id} aria-label={`Estante ${e.titulo}`} className="rounded-[var(--radius-card)] border border-line bg-surface-muted/40 p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
                  <LibraryBig className="size-5 text-gold" aria-hidden /> {e.titulo}
                </h2>
                {e.descricao && <p className="mt-0.5 text-sm whitespace-pre-line text-ink-soft">{e.descricao}</p>}
              </div>
              {videos.length > 0 && (
                <span className="text-sm text-ink-muted">
                  {vistos} de {videos.length} {videos.length === 1 ? 'vídeo assistido' : 'vídeos assistidos'}
                </span>
              )}
            </div>
            <ul className="grid items-start gap-3 lg:grid-cols-2">{lista.map(doItem)}</ul>
          </section>
        )
      })}
      {[...grupos].map(([cat, lista]) => (
        <section key={cat} aria-label={cat || undefined}>
          {cat && <h2 className="font-display mb-2 text-lg font-semibold">{cat}</h2>}
          <ul className={secao === 'livros' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'grid items-start gap-3 lg:grid-cols-2'}>{lista.map(doItem)}</ul>
        </section>
      ))}
    </div>
  )
}

/** Um material: vídeo assistido aqui mesmo (com o progresso gravado), arquivo para baixar, link ou compra. */
function Item({ c, limite, onAssistido, destaque = false }: { c: Reg; limite: number; onAssistido: () => void; destaque?: boolean }) {
  const assistido = c.percentual >= limite
  return (
    <li id={`material-${c.id}`} tabIndex={destaque ? -1 : undefined} aria-current={destaque ? 'true' : undefined} className={`card overflow-hidden scroll-mt-24 outline-none ${destaque ? 'ring-2 ring-gold ring-offset-2 ring-offset-surface' : ''}`}>
      {c.video_url && <PlayerVideo id={c.id} videoUrl={c.video_url} titulo={c.titulo} percentual={c.percentual ?? 0} limite={limite} endpoint={`/portal/conteudos/${c.id}/progresso`} onAssistido={onAssistido} />}
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-ink">{c.titulo}</h3>
          {destaque && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-ink">Indicado no seu Plano de Ação</span>}
          {c.video_url &&
            (assistido ? (
              <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" aria-hidden /> Assistido
              </span>
            ) : (
              <span className="text-sm text-ink-muted">{c.percentual ? `${c.percentual}% assistido` : 'Ainda não assistido'}</span>
            ))}
        </div>
        {c.descricao && <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{c.descricao}</p>}
        {(c.link || c.arquivo_nome || c.compra_url || c.editora?.length) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {c.link && (
              <a href={c.link} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                <ExternalLink className="size-4" aria-hidden /> Abrir
              </a>
            )}
            {c.arquivo_nome && (
              <a href={`/api/ped/portal/conteudos/arquivo/${c.id}`} className="btn-secondary btn-sm">
                <Download className="size-4" aria-hidden /> {c.arquivo_nome} {c.arquivo_tamanho ? `(${tamanhoArquivo(c.arquivo_tamanho)})` : ''}
              </a>
            )}
            {/* Produto da Editora Prosperar ligado ao material: substitui o link de compra avulso. */}
            {(c.editora as ProdutoEditora[] | undefined)?.map((p) => <BotaoEditora key={p.url} p={p} />)}
            {c.compra_url && !c.editora?.length && (
              <a href={c.compra_url} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
                <ShoppingBag className="size-4" aria-hidden /> Comprar
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

interface ProdutoEditora {
  rotulo: string
  titulo: string
  tipo: 'produto' | 'colecao'
  url: string
  preco_a_partir_centavos: number | null
  situacao: 'disponivel' | 'pre_venda' | 'esgotado'
}

const SITUACAO: Record<ProdutoEditora['situacao'], string> = { disponivel: 'Disponível', pre_venda: 'Pré-venda', esgotado: 'Esgotado no momento' }
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * "Adquirir um livro": abre, em nova aba, a página do produto na Editora Prosperar, com origem=biblioteca
 * e o id do material (atribuição da venda). Sem estoque, não há link: a aluna vê a indisponibilidade.
 */
function BotaoEditora({ p }: { p: ProdutoEditora }) {
  const preco = p.preco_a_partir_centavos ? `${p.tipo === 'colecao' ? 'a partir de ' : ''}${reais(p.preco_a_partir_centavos)}` : ''
  if (p.situacao === 'esgotado')
    return (
      <span className="btn-secondary btn-sm cursor-not-allowed opacity-80" aria-disabled="true" role="note">
        <ShoppingBag className="size-4" aria-hidden /> Livro indisponível no momento
      </span>
    )
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener"
      className="btn-primary btn-sm h-auto max-w-full flex-wrap"
      aria-label={`Adquirir um livro: ${p.titulo}, na Editora Prosperar (abre em nova aba). ${SITUACAO[p.situacao]}${preco ? `, ${preco}` : ''}`}
    >
      <ShoppingBag className="size-4" aria-hidden /> Adquirir um livro
      {(preco || p.situacao === 'pre_venda') && (
        <span className="text-xs font-normal opacity-90">
          · {[p.situacao === 'pre_venda' ? 'Pré-venda' : null, preco || null].filter(Boolean).join(' · ')}
        </span>
      )}
    </a>
  )
}
