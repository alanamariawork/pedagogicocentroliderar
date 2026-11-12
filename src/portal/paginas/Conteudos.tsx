import { BookOpen, CheckCircle2, Download, ExternalLink, Library, LibraryBig, Repeat, ShoppingBag } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../../components/Estados'
import { useDados, type Reg } from '../../lib/api'
import { tamanhoArquivo } from '../../lib/format'
import { PlayerVimeo } from '../PlayerVimeo'

type Secao = 'rotina' | 'biblioteca' | 'livros'

const VAZIO: Record<Secao, { icone: typeof Library; titulo: string; texto: string }> = {
  rotina: { icone: Repeat, titulo: 'A rotina oficial ainda não foi publicada.', texto: 'O “Dia Extraordinário da Mulher que Age” vai aparecer aqui assim que a equipe publicar.' },
  biblioteca: { icone: Library, titulo: 'A biblioteca ainda está vazia.', texto: 'Materiais, ferramentas e modelos publicados pela equipe vão aparecer aqui.' },
  livros: { icone: BookOpen, titulo: 'Nenhum livro publicado ainda.', texto: 'As indicações de leitura, com o link de compra, vão aparecer aqui.' },
}

/** Rotina, Biblioteca (estantes e categorias, como Ferramentas) e Livros: só o que a equipe publicou. */
export function Conteudos({ secao }: { secao: Secao }) {
  const { dados, erro, recarregar } = useDados<Reg>(`/portal/conteudos/${secao}`)
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
  const doItem = (c: Reg) => <Item key={c.id} c={c} limite={limite} onAssistido={recarregar} />
  const soltos = itens.filter((c) => !c.estante_id)
  const grupos = new Map<string, Reg[]>()
  for (const c of soltos) grupos.set(c.categoria ?? '', [...(grupos.get(c.categoria ?? '') ?? []), c])
  return (
    <div className="space-y-5">
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
function Item({ c, limite, onAssistido }: { c: Reg; limite: number; onAssistido: () => void }) {
  const assistido = c.percentual >= limite
  return (
    <li className="card overflow-hidden">
      {c.video_url && <PlayerVimeo id={c.id} videoUrl={c.video_url} titulo={c.titulo} percentual={c.percentual ?? 0} limite={limite} endpoint={`/portal/conteudos/${c.id}/progresso`} onAssistido={onAssistido} />}
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-ink">{c.titulo}</h3>
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

/** "COMPRAR NA EDITORA PROSPERAR": abre a loja com origem=biblioteca e o id do material (atribuição da venda). */
function BotaoEditora({ p }: { p: ProdutoEditora }) {
  const esgotado = p.situacao === 'esgotado'
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener"
      className={esgotado ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
      aria-label={`${p.rotulo}: ${p.titulo}. ${SITUACAO[p.situacao]}${p.preco_a_partir_centavos ? `, a partir de ${reais(p.preco_a_partir_centavos)}` : ''}`}
    >
      <ShoppingBag className="size-4" aria-hidden /> {p.rotulo}
      <span className="text-xs font-normal opacity-90">
        · {SITUACAO[p.situacao]}
        {p.preco_a_partir_centavos ? ` · ${p.tipo === 'colecao' ? 'a partir de ' : ''}${reais(p.preco_a_partir_centavos)}` : ''}
      </span>
    </a>
  )
}
