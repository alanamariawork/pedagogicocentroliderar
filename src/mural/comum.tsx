import type { ReactNode } from 'react'
import { Heart, MessageCircle, Package, Sparkles } from 'lucide-react'
import { API, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { Selo, type Tom } from '../components/Selos'
import { formatarData } from '../../shared/datas'

/** Telas do Mural compartilhadas entre o portal da aluna e a gestão da equipe. */

export const CANAL_MURAL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'E-mail', instagram: 'Instagram', site: 'Site', outro: 'Outro' }
export const TIPO_OFERTA: Record<string, string> = { produto: 'Produto', servico: 'Serviço' }
export const FORMATO_SERVICO: Record<string, string> = { online: 'On-line', presencial: 'Presencial', hibrido: 'On-line e presencial' }
/** Publicações antigas (antes do feed) usavam só esta categoria. */
export const CATEGORIA_ANTIGA: Record<string, string> = { oportunidade: 'Oportunidade', produto: 'Produto', servico: 'Serviço' }
export const SITUACAO_MURAL: Record<string, [string, Tom]> = { pendente: ['Aguardando aprovação', 'dourado'], publicada: ['Publicada', 'sucesso'], recusada: ['Não aprovada', 'neutro'], arquivada: ['Arquivada', 'neutro'] }

/** Base da API do mural: o portal usa as rotas da aluna; a equipe, as de gestão. */
export type BaseMural = '/portal/mural' | '/mural'

export const urlImagem = (base: BaseMural, id: string) => `${API}${base}/imagens/${encodeURIComponent(id)}`

/** Link do botão de contato. Só endereços conhecidos viram link (nunca javascript: ou similares). */
export function linkContato(canal: string, valor: string): string | null {
  const v = String(valor ?? '').trim()
  if (canal === 'whatsapp') {
    const d = v.replace(/\D/g, '')
    return d.length >= 10 ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null
  }
  if (canal === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? `mailto:${v}` : null
  if (canal === 'instagram') {
    const perfil = v.replace(/^https:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').replace(/\/$/, '')
    return /^[A-Za-z0-9._]{1,30}$/.test(perfil) ? `https://instagram.com/${perfil}` : null
  }
  if (canal === 'site') return /^https:\/\//.test(v) ? v : null
  return null
}

export function linkSeguro(url: string | null | undefined): string | null {
  return url && /^https:\/\//.test(url) ? url : null
}

export function textoPreco(p: Reg): string | null {
  if (p.preco_consultar) return 'Consultar valor'
  if (p.preco_centavos === null || p.preco_centavos === undefined) return null
  return (Number(p.preco_centavos) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function nomeCategoria(p: Reg) {
  return p.categoria_nome ?? CATEGORIA_ANTIGA[p.categoria] ?? p.categoria
}

/** Capa da publicação; sem imagem, um fundo com a inicial do negócio nas cores do portal. */
export function Capa({ base, id, nome, className }: { base: BaseMural; id?: string | null; nome: string; className?: string }) {
  if (id) return <img src={urlImagem(base, id)} alt="" loading="lazy" decoding="async" className={cx('size-full object-cover', className)} />
  return (
    <div className={cx('flex size-full items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-gold', className)} aria-hidden>
      <span className="font-display text-5xl font-semibold text-white/90">{(nome || '?').trim().charAt(0).toUpperCase()}</span>
    </div>
  )
}

export function Logo({ base, id, nome, className }: { base: BaseMural; id?: string | null; nome: string; className?: string }) {
  return (
    <span className={cx('inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gold-soft text-sm font-semibold text-brand-700 shadow', className)}>
      {id ? <img src={urlImagem(base, id)} alt={`Logo de ${nome}`} className="size-full object-cover" /> : <span aria-hidden>{(nome || '?').trim().charAt(0).toUpperCase()}</span>}
    </span>
  )
}

export function SeloTipo({ tipo }: { tipo?: string | null }) {
  if (!tipo) return <Selo tom="vinho">Oportunidade</Selo>
  return (
    <Selo tom={tipo === 'produto' ? 'vinho' : 'dourado'}>
      {tipo === 'produto' ? <Package className="mr-1 inline size-3" aria-hidden /> : <Sparkles className="mr-1 inline size-3" aria-hidden />}
      {TIPO_OFERTA[tipo]}
    </Selo>
  )
}

/** Card do feed: imagem em destaque, negócio, autora, tipo e categoria, resumo, curtidas e comentários. */
export function CardPublicacao({ p, base, href, mostrarSituacao, rodape, onAbrir }: { p: Reg; base: BaseMural; href?: string; mostrarSituacao?: boolean; rodape?: ReactNode; onAbrir?: () => void }) {
  const preco = textoPreco(p)
  const negocio = p.negocio_nome || p.autora_nome
  const situacao = SITUACAO_MURAL[p.situacao]
  return (
    <li className="card group flex flex-col overflow-hidden">
      <Abrir href={href} onAbrir={onAbrir} rotulo={`${p.titulo}, de ${negocio}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-muted">
          <Capa base={base} id={p.capa_id} nome={negocio} className="transition-transform duration-300 group-hover:scale-[1.02]" />
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            <SeloTipo tipo={p.tipo} />
            {mostrarSituacao && situacao && <Selo tom={situacao[1]}>{situacao[0]}</Selo>}
          </div>
          {preco && <span className="absolute right-2 bottom-2 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-700 shadow">{preco}</span>}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4 pt-3">
          <div className="-mt-8 flex items-end gap-2">
            <Logo base={base} id={p.logo_id} nome={negocio} />
            <span className="mb-0.5 truncate text-xs font-medium tracking-wide text-gold uppercase">{nomeCategoria(p)}</span>
          </div>
          <h3 className="mt-1 font-display text-lg leading-snug font-semibold text-ink">{p.titulo}</h3>
          <p className="text-sm font-medium text-brand-700">{negocio}</p>
          <p className="line-clamp-3 text-sm text-ink-soft">{p.resumo}</p>
          {p.situacao === 'recusada' && p.motivo_moderacao && <p className="text-xs text-danger">Motivo: {p.motivo_moderacao}</p>}
          <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-ink-muted">
            <span className="truncate">
              por {p.autora_nome} · {formatarData(String(p.criado_em).slice(0, 10))}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="inline-flex items-center gap-1" aria-label={`${p.curtidas} curtidas`}>
                <Heart className={cx('size-4', p.curti && 'fill-brand-600 text-brand-600')} aria-hidden /> {p.curtidas}
              </span>
              <span className="inline-flex items-center gap-1" aria-label={`${p.comentarios} comentários`}>
                <MessageCircle className="size-4" aria-hidden /> {p.comentarios}
              </span>
            </span>
          </div>
        </div>
      </Abrir>
      {rodape && <div className="flex flex-wrap gap-1 border-t border-line px-3 py-2">{rodape}</div>}
    </li>
  )
}

/** O card abre por link (portal, com rota por hash) ou por clique (gestão da equipe, em diálogo). */
function Abrir({ href, onAbrir, rotulo, children }: { href?: string; onAbrir?: () => void; rotulo: string; children: ReactNode }) {
  const classe = 'flex flex-1 flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
  if (onAbrir)
    return (
      <button type="button" className={classe} onClick={onAbrir} aria-label={rotulo}>
        {children}
      </button>
    )
  return (
    <a href={href} className={classe} aria-label={rotulo}>
      {children}
    </a>
  )
}
