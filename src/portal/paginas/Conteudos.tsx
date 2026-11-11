import { BookOpen, Download, ExternalLink, Library, Repeat, ShoppingBag } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../../components/Estados'
import { useDados, type Reg } from '../../lib/api'
import { tamanhoArquivo } from '../../lib/format'

type Secao = 'rotina' | 'biblioteca' | 'livros'

const VAZIO: Record<Secao, { icone: typeof Library; titulo: string; texto: string }> = {
  rotina: { icone: Repeat, titulo: 'A rotina oficial ainda não foi publicada.', texto: 'O “Dia Extraordinário da Mulher que Age” vai aparecer aqui assim que a equipe publicar.' },
  biblioteca: { icone: Library, titulo: 'A biblioteca ainda está vazia.', texto: 'Materiais, ferramentas e modelos publicados pela equipe vão aparecer aqui.' },
  livros: { icone: BookOpen, titulo: 'Nenhum livro publicado ainda.', texto: 'As indicações de leitura, com o link de compra, vão aparecer aqui.' },
}

/** Rotina, Biblioteca (com a categoria Ferramentas) e Livros: só o que a equipe publicou. */
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
  const grupos = new Map<string, Reg[]>()
  for (const c of itens) grupos.set(c.categoria ?? '', [...(grupos.get(c.categoria ?? '') ?? []), c])
  return (
    <div className="space-y-5">
      {[...grupos].map(([cat, lista]) => (
        <section key={cat} aria-label={cat || undefined}>
          {cat && <h2 className="font-display mb-2 text-lg font-semibold">{cat}</h2>}
          <ul className={secao === 'livros' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
            {lista.map((c) => (
              <li key={c.id} className="card p-4">
                <h3 className="font-medium text-ink">{c.titulo}</h3>
                {c.descricao && <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{c.descricao}</p>}
                {c.video_url && (
                  <div className="mt-3 aspect-video overflow-hidden rounded-[var(--radius-control)] bg-black">
                    <iframe src={c.video_url} title={c.titulo} className="size-full" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
                  </div>
                )}
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
                  {c.compra_url && (
                    <a href={c.compra_url} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm">
                      <ShoppingBag className="size-4" aria-hidden /> Comprar
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
