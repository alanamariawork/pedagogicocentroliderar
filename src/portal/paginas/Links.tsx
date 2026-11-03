import { ExternalLink, Link as LinkIcon } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { useDados, type Reg } from '../../lib/api'
import { Ajuda } from '../../pages/Portal'

/** Links importantes, agrupados por categoria, cadastrados pela equipe. */
export function LinksImportantes() {
  const { dados, erro, recarregar } = useDados<{ links: Reg[]; ajuda: string }>('/portal/links')
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const grupos = new Map<string, Reg[]>()
  for (const l of dados.links) grupos.set(l.categoria || 'Outros', [...(grupos.get(l.categoria || 'Outros') ?? []), l])
  return (
    <div className="space-y-4">
      {dados.links.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
            <LinkIcon className="size-6" aria-hidden />
          </span>
          <p className="max-w-md text-sm font-medium text-ink-soft">A equipe ainda não cadastrou os links importantes, como a área de membros e o grupo de avisos.</p>
          <a href="#/inicio" className="btn-secondary mt-5">
            Voltar ao início
          </a>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[...grupos].map(([categoria, links]) => (
            <section key={categoria} className="card p-4">
              <h2 className="font-display text-base font-semibold">{categoria}</h2>
              <ul className="mt-2 space-y-2">
                {links.map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2 hover:border-brand-500/50 hover:bg-brand-50/50">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{l.titulo}</span>
                        {l.descricao && <span className="block text-xs text-ink-muted">{l.descricao}</span>}
                      </span>
                      <ExternalLink className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <section className="card p-4">
        <Ajuda texto={dados.ajuda} />
      </section>
    </div>
  )
}
