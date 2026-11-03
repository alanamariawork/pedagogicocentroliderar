import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { get, post, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { formatarCarimbo } from '../../shared/datas'

/** Sino de avisos: abre a lista e marca tudo como lido. Os avisos ficam só dentro do sistema. */
export function Sino({ naoLidas, onLidas }: { naoLidas: number; onLidas: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState<Reg[] | null>(null)
  const [erro, setErro] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    setErro(false)
    get<{ itens: Reg[]; nao_lidas: number }>('/portal/notificacoes')
      .then(async (r) => {
        setItens(r.itens)
        if (r.nao_lidas > 0) {
          await post('/portal/notificacoes/lidas')
          onLidas()
        }
      })
      .catch(() => setErro(true))
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto, onLidas])

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        className="btn-ghost relative p-2"
        aria-label={naoLidas ? `Avisos: ${naoLidas} não lido(s)` : 'Avisos'}
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={() => setAberto((v) => !v)}
      >
        <Bell className="size-5" aria-hidden />
        {naoLidas > 0 && (
          <span className="absolute top-0.5 right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-lg">
          <p className="border-b border-line px-4 py-2.5 text-sm font-medium">Avisos</p>
          {erro ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">Não foi possível carregar os avisos.</p>
          ) : !itens ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">Nenhum aviso por enquanto. Quando a equipe agendar um encontro ou validar uma atividade, você vê aqui.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {itens.map((n) => {
                const conteudo = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.lida_em && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-label="Novo" />}
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">{n.titulo}</span>
                        {n.detalhe && <span className="block text-ink-soft">{n.detalhe}</span>}
                        <span className="block text-xs text-ink-muted">{formatarCarimbo(n.criado_em)}</span>
                      </span>
                    </span>
                  </>
                )
                return (
                  <li key={n.id} className="text-sm">
                    {n.link ? (
                      <a href={n.link} onClick={() => setAberto(false)} className={cx('block px-4 py-2.5 hover:bg-surface-muted')}>
                        {conteudo}
                      </a>
                    ) : (
                      <div className="px-4 py-2.5">{conteudo}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
