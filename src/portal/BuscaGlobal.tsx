import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, CornerDownLeft, Route, Search, SquareCheckBig } from 'lucide-react'
import { get, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { formatarData } from '../../shared/datas'
import { ITENS_ALUNA } from './menu'
import { hrefAluna } from './rotas'

interface Resultado {
  chave: string
  titulo: string
  detalhe: string
  href: string
  grupo: 'Páginas' | 'Jornada' | 'Encontros'
}

export const atalhoBusca = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K')

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Busca global do portal (Ctrl/⌘K): páginas do menu, etapas e atividades da jornada e encontros da aluna. */
export function BuscaGlobal({ aberta, onFechar, tipos }: { aberta: boolean; onFechar: () => void; tipos: Reg[] }) {
  const [termo, setTermo] = useState('')
  const [dados, setDados] = useState<Reg | null>(null)
  const [indice, setIndice] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const origem = useRef<Element | null>(null)

  useEffect(() => {
    if (!aberta) return
    origem.current = document.activeElement
    setTermo('')
    setIndice(0)
    requestAnimationFrame(() => input.current?.focus())
    // Os dados da própria aluna são buscados só quando a busca abre.
    get('/portal')
      .then(setDados)
      .catch(() => setDados(null))
    return () => (origem.current as HTMLElement | null)?.focus?.()
  }, [aberta])

  const todos = useMemo<Resultado[]>(() => {
    const paginas: Resultado[] = [
      ...ITENS_ALUNA.map((i) => ({ chave: `p-${i.id}`, titulo: i.nome, detalhe: i.secao, href: hrefAluna(i.id), grupo: 'Páginas' as const })),
      ...tipos.map((t) => ({ chave: `t-${t.id}`, titulo: t.nome, detalhe: 'Mentorias', href: hrefAluna('mentorias', t.id), grupo: 'Páginas' as const })),
    ]
    const etapas = ((dados?.jornada?.etapas ?? []) as Reg[]).flatMap((e): Resultado[] => [
      { chave: `e-${e.id}`, titulo: e.titulo, detalhe: 'Etapa da jornada', href: hrefAluna('jornada', e.id), grupo: 'Jornada' },
      ...((e.situacao === 'bloqueada' ? [] : e.atividades) as Reg[]).map((a) => ({
        chave: `a-${a.id}`,
        titulo: a.titulo,
        detalhe: `Atividade · ${e.titulo}`,
        href: hrefAluna('jornada', e.id),
        grupo: 'Jornada' as const,
      })),
    ])
    const encontros = ((dados?.encontros ?? []) as Reg[]).map((o) => ({
      chave: `o-${o.id}`,
      titulo: o.item_descricao,
      detalhe: [o.profissional_nome, o.data_realizada || o.data_agendada || o.data_prevista ? formatarData(o.data_realizada ?? o.data_agendada?.slice(0, 10) ?? o.data_prevista) : null].filter(Boolean).join(' · '),
      href: hrefAluna('mentorias', o.tipo_id ?? undefined),
      grupo: 'Encontros' as const,
    }))
    return [...paginas, ...etapas, ...encontros]
  }, [dados, tipos])

  const resultados = useMemo(() => {
    const t = normalizar(termo.trim())
    const lista = t ? todos.filter((r) => normalizar(`${r.titulo} ${r.detalhe}`).includes(t)) : todos.filter((r) => r.grupo === 'Páginas')
    return lista.slice(0, 30)
  }, [termo, todos])

  useEffect(() => setIndice(0), [termo])

  if (!aberta) return null

  function ir(r: Resultado | undefined) {
    if (!r) return
    window.location.hash = r.href
    onFechar()
  }

  function teclas(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onFechar()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndice((i) => Math.min(i + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndice((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ir(resultados[indice])
    }
  }

  const icone = { Páginas: Search, Jornada: Route, Encontros: CalendarDays }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]" onKeyDown={teclas}>
      <div className="absolute inset-0 bg-gray-900/40" onClick={onFechar} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Buscar no portal" className="relative w-full max-w-xl overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-xl">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-ink-muted" aria-hidden />
          <input
            ref={input}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar páginas, etapas, atividades ou encontros"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="resultados-busca"
            aria-activedescendant={resultados[indice] ? `busca-${resultados[indice].chave}` : undefined}
            aria-label="Buscar"
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-ink-muted">Esc</kbd>
        </div>
        <ul id="resultados-busca" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
          {resultados.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-ink-muted">Nada encontrado para “{termo}”.</li>
          ) : (
            resultados.map((r, n) => {
              const Icone = r.grupo === 'Jornada' && r.detalhe.startsWith('Atividade') ? SquareCheckBig : icone[r.grupo]
              return (
                <li
                  key={r.chave}
                  id={`busca-${r.chave}`}
                  role="option"
                  aria-selected={n === indice}
                  onMouseEnter={() => setIndice(n)}
                  onClick={() => ir(r)}
                  className={cx('flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm', n === indice ? 'bg-brand-50 text-brand-700' : 'text-ink')}
                >
                  <Icone className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.titulo}</span>
                    <span className="block truncate text-xs text-ink-muted">{r.detalhe}</span>
                  </span>
                  {n === indice && <CornerDownLeft className="size-3.5 text-ink-muted" aria-hidden />}
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
