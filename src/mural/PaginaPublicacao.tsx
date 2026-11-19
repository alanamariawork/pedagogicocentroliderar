import { useState, type ReactNode } from 'react'
import { Check, ExternalLink, MapPin, MessageSquare, Monitor } from 'lucide-react'
import type { Reg } from '../lib/api'
import { cx } from '../lib/format'
import { formatarData } from '../../shared/datas'
import { CANAL_MURAL, Capa, FORMATO_SERVICO, Logo, SeloTipo, linkContato, linkSeguro, nomeCategoria, textoPreco, urlImagem, type BaseMural } from './comum'

/**
 * Página completa da publicação, nos dois modelos: produto (fotos, características, preço e como
 * comprar) e serviço (atendimento, benefícios, formato ou local e contato). Também serve de prévia
 * no editor. Só o contato escolhido pela autora para esta publicação aparece.
 */
export function PaginaPublicacao({ p, base, acoes, children }: { p: Reg; base: BaseMural; acoes?: ReactNode; children?: ReactNode }) {
  const imagens: string[] = [p.capa_id, ...(p.galeria_ids ?? [])].filter(Boolean)
  const [atual, setAtual] = useState(0)
  const negocio = p.negocio_nome || p.autora_nome
  const preco = textoPreco(p)
  const d: Reg = p.detalhes ?? {}
  const contato = linkContato(p.contato_canal, p.contato_valor)
  const externo = linkSeguro(p.link_externo)
  const produto = p.tipo === 'produto'
  const lista = (produto ? d.caracteristicas : d.beneficios) as string[] | undefined
  const indice = Math.min(atual, Math.max(0, imagens.length - 1))

  return (
    <article className="space-y-4">
      <div className="card overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="bg-surface-muted">
            <div className="aspect-[4/3] w-full overflow-hidden">
              {imagens.length ? (
                <img src={urlImagem(base, imagens[indice])} alt={`Imagem ${indice + 1} de ${imagens.length} de ${p.titulo}`} className="size-full object-contain" />
              ) : (
                <Capa base={base} nome={negocio} />
              )}
            </div>
            {imagens.length > 1 && (
              <ul className="flex gap-2 overflow-x-auto p-2" aria-label="Galeria">
                {imagens.map((id, i) => (
                  <li key={id} className="shrink-0">
                    <button type="button" onClick={() => setAtual(i)} aria-label={`Ver imagem ${i + 1}`} aria-current={i === indice} className={cx('block size-16 overflow-hidden rounded-md border-2', i === indice ? 'border-brand-600' : 'border-transparent opacity-80 hover:opacity-100')}>
                      <img src={urlImagem(base, id)} alt="" className="size-full object-cover" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <SeloTipo tipo={p.tipo} />
              <span className="text-xs font-medium tracking-wide text-gold uppercase">{nomeCategoria(p)}</span>
            </div>
            <h1 className="font-display text-2xl leading-tight font-semibold text-ink">{p.titulo}</h1>
            <div className="flex items-center gap-3">
              <Logo base={base} id={p.logo_id} nome={negocio} className="border-gold-line" />
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-700">{negocio}</p>
                <p className="text-xs text-ink-muted">
                  por {p.autora_nome}
                  {p.criado_em && ` · ${formatarData(String(p.criado_em).slice(0, 10))}`}
                  {p.editada_em && ' · editada'}
                </p>
              </div>
            </div>
            {preco && (
              <p className="rounded-lg bg-gold-soft px-3 py-2">
                <span className="block text-xs text-ink-muted">{produto ? 'Preço' : 'Investimento'}</span>
                <span className="font-display text-xl font-semibold text-brand-700">{preco}</span>
              </p>
            )}
            {!produto && (d.formato || d.local) && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
                {d.formato && (
                  <span className="inline-flex items-center gap-1">
                    <Monitor className="size-4 text-gold" aria-hidden /> {FORMATO_SERVICO[d.formato] ?? d.formato}
                  </span>
                )}
                {d.local && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-4 text-gold" aria-hidden /> {d.local}
                  </span>
                )}
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              {contato ? (
                <a href={contato} target="_blank" rel="noopener noreferrer" className="btn-primary">
                  <MessageSquare className="size-4" aria-hidden /> Falar pelo {CANAL_MURAL[p.contato_canal]}
                </a>
              ) : (
                <p className="text-sm text-ink-soft">
                  <span className="text-ink-muted">{CANAL_MURAL[p.contato_canal] ?? 'Contato'}: </span>
                  {p.contato_valor}
                </p>
              )}
              {externo && (
                <a href={externo} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                  <ExternalLink className="size-4" aria-hidden /> {produto ? 'Comprar pelo link' : 'Saiba mais'}
                </a>
              )}
            </div>
            {acoes}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card space-y-4 p-5">
          <div>
            <h2 className="font-display text-base font-semibold">{produto ? 'Sobre o produto' : p.tipo ? 'Sobre o serviço' : 'Descrição'}</h2>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{p.descricao}</p>
          </div>
          {!produto && d.atendimento && (
            <div>
              <h2 className="font-display text-base font-semibold">Como é o atendimento</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{d.atendimento}</p>
            </div>
          )}
          {produto && d.como_comprar && (
            <div>
              <h2 className="font-display text-base font-semibold">Como comprar</h2>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{d.como_comprar}</p>
            </div>
          )}
        </section>
        {lista && lista.length > 0 && (
          <section className="card p-5">
            <h2 className="font-display text-base font-semibold">{produto ? 'Características' : 'Benefícios'}</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
              {lista.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {children}
    </article>
  )
}
