import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Gem, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { cx } from '../lib/format'
import { useDados, type Reg } from '../lib/api'
import { useSessao } from '../state/Sessao'
import { SECOES_ALUNA, nomePaginaAluna, type ItemMenuAluna } from './menu'
import { hrefAluna, useRotaAluna, type RotaAluna } from './rotas'
import { BuscaGlobal, atalhoBusca } from './BuscaGlobal'
import { Sino } from './Sino'
import { Inicio } from './paginas/Inicio'
import { MeusDados } from './paginas/MeusDados'
import { Diagnostico } from './paginas/Diagnostico'
import { LinksImportantes } from './paginas/Links'
import { MinhaConta } from './paginas/MinhaConta'
import { EmBreve } from './paginas/EmBreve'
import { SecaoPortal } from '../pages/Portal'
import { SaldoMentorias } from './paginas/Mentorias'
import { Agenda } from './paginas/Agenda'
import { PlanoAcao } from './paginas/PlanoAcao'
import { Trilhas } from './paginas/Trilhas'
import { Vitorias } from './paginas/Vitorias'
import { Conteudos } from './paginas/Conteudos'
import { Mural } from './paginas/Mural'

const CHAVE_RECOLHIDO = 'portal-menu-recolhido'

/** Portal da aluna: menu lateral recolhível por seções, busca (Ctrl/⌘K), avisos e as telas da área da aluna. */
export function PortalAluna() {
  const { eu, sair } = useSessao()
  const rota = useRotaAluna()
  const menu = useDados<{ tipos_mentoria: Reg[]; nao_lidas: number }>('/portal/menu')
  const [recolhido, setRecolhido] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_RECOLHIDO) === '1'
    } catch {
      return false
    }
  })
  const [gaveta, setGaveta] = useState(false)
  const [busca, setBusca] = useState(false)
  const tituloRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${nomePaginaAluna(rota.pagina)} · Diamante Business`
    setGaveta(false)
  }, [rota.pagina, rota.id])

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setBusca(true)
      }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  function alternarRecolhido() {
    setRecolhido((v) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, v ? '0' : '1')
      } catch {
        /* preferência só desta sessão */
      }
      return !v
    })
  }

  const tipos = menu.dados?.tipos_mentoria ?? []
  const painel = (estreito: boolean) => <MenuLateral rota={rota} tipos={tipos} estreito={estreito} nome={eu!.nome} onSair={sair} />

  return (
    <>
      <a href="#conteudo" onClick={(e) => (e.preventDefault(), document.getElementById('conteudo')?.focus())} className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Pular para o conteúdo
      </a>
      <div className="flex min-h-screen bg-canvas">
        <aside className={cx('hidden shrink-0 transition-[width] duration-200 motion-reduce:transition-none lg:block', recolhido ? 'w-16' : 'w-64')}>
          <div className="sticky top-0 h-screen">{painel(recolhido)}</div>
        </aside>
        {gaveta && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-gray-900/40" onClick={() => setGaveta(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
              {painel(false)}
              <button type="button" className="absolute top-4 right-3 rounded p-1.5 text-sidebar-ink hover:bg-white/10" onClick={() => setGaveta(false)} aria-label="Fechar menu">
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
            <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
              <button type="button" className="btn-ghost -ml-2 p-2 lg:hidden" onClick={() => setGaveta(true)} aria-label="Abrir menu">
                <Menu className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                className="btn-ghost -ml-2 hidden p-2 lg:inline-flex"
                onClick={alternarRecolhido}
                aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
                aria-expanded={!recolhido}
              >
                {recolhido ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
              </button>
              <h1 ref={tituloRef} tabIndex={-1} className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink outline-none sm:text-xl">
                {nomePaginaAluna(rota.pagina)}
              </h1>
              <button
                type="button"
                onClick={() => setBusca(true)}
                className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-1.5 text-sm text-ink-muted hover:border-line-strong sm:min-w-56"
                aria-label="Buscar"
                aria-keyshortcuts="Control+K Meta+K"
              >
                <Search className="size-4" aria-hidden />
                <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
                <kbd className="hidden rounded border border-line px-1.5 text-[11px] sm:inline">{atalhoBusca()}</kbd>
              </button>
              <Sino naoLidas={menu.dados?.nao_lidas ?? 0} onLidas={menu.recarregar} />
            </div>
          </header>
          <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 outline-none sm:px-6 lg:px-8">
            <PaginaAluna rota={rota} tipos={tipos} />
          </main>
        </div>
      </div>
      <BuscaGlobal aberta={busca} onFechar={() => setBusca(false)} tipos={tipos} />
    </>
  )
}

function MenuLateral({ rota, tipos, estreito, nome, onSair }: { rota: RotaAluna; tipos: Reg[]; estreito: boolean; nome: string; onSair: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      <div className={cx('flex items-center gap-2.5 pt-5 pb-4', estreito ? 'justify-center px-2' : 'px-5')}>
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-line/50 text-gold-line">
          <Gem className="size-4.5" aria-hidden />
        </span>
        {!estreito && (
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold text-white">Diamante Business</p>
            <p className="text-[11px] tracking-wide text-sidebar-muted">Minha jornada</p>
          </div>
        )}
      </div>
      <nav aria-label="Menu da aluna" className={cx('flex-1 overflow-y-auto pb-4', estreito ? 'px-2' : 'px-3')}>
        {SECOES_ALUNA.map((s) => (
          <div key={s.titulo} className="mt-3 first:mt-0">
            {estreito ? (
              <hr className="mx-2 mb-2 border-white/10" />
            ) : (
              <p className="px-3 pb-1 text-[11px] font-medium tracking-wider text-sidebar-muted/80 uppercase">{s.titulo}</p>
            )}
            <ul className="space-y-0.5">
              {s.itens.map((m) => (
                <ItemMenu key={m.id} item={m} rota={rota} tipos={tipos} estreito={estreito} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cx('border-t border-white/10 py-3', estreito ? 'px-2' : 'px-3')}>
        {!estreito && <p className="truncate px-3 pb-1 text-xs text-sidebar-muted">{nome}</p>}
        <button
          type="button"
          onClick={onSair}
          title={estreito ? 'Sair' : undefined}
          className={cx('flex w-full items-center gap-3 rounded-[var(--radius-control)] py-2 text-left text-sm text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink', estreito ? 'justify-center' : 'px-3')}
        >
          <LogOut className="size-4" aria-hidden />
          {estreito ? <span className="sr-only">Sair</span> : 'Sair'}
        </button>
      </div>
    </div>
  )
}

const classeItem = (atual: boolean, estreito: boolean) =>
  cx(
    'flex items-center gap-3 rounded-[var(--radius-control)] py-2 text-sm transition-colors',
    estreito ? 'justify-center px-2' : 'px-3',
    atual ? 'bg-sidebar-active font-medium text-white shadow-[inset_3px_0_0_0_var(--color-gold-line)]' : 'text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink',
  )

function ItemMenu({ item, rota, tipos, estreito }: { item: ItemMenuAluna; rota: RotaAluna; tipos: Reg[]; estreito: boolean }) {
  const ativo = rota.pagina === item.id || (item.id === 'mentorias' && rota.pagina === 'mentoria')
  const [aberto, setAberto] = useState(ativo)
  useEffect(() => {
    if (ativo) setAberto(true)
  }, [ativo])
  const Icone = item.icone
  const link = (
    <a href={hrefAluna(item.id)} aria-current={ativo && !rota.id ? 'page' : undefined} title={estreito ? item.nome : undefined} className={cx(classeItem(ativo && (!item.submenu || !rota.id || estreito), estreito), 'min-w-0 flex-1')}>
      <Icone className="size-4 shrink-0" aria-hidden />
      {estreito ? <span className="sr-only">{item.nome}</span> : <span className="truncate">{item.nome}</span>}
    </a>
  )
  if (!item.submenu || estreito) return <li>{link}</li>
  const subId = `submenu-${item.id}`
  return (
    <li>
      <div className="flex items-center">
        {link}
        <button
          type="button"
          className="ml-0.5 rounded p-1.5 text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink"
          aria-expanded={aberto}
          aria-controls={subId}
          aria-label={aberto ? `Recolher ${item.nome}` : `Expandir ${item.nome}`}
          onClick={() => setAberto((v) => !v)}
        >
          <ChevronDown className={cx('size-4 transition-transform motion-reduce:transition-none', !aberto && '-rotate-90')} aria-hidden />
        </button>
      </div>
      {aberto && (
        <ul id={subId} className="mt-0.5 ml-5 space-y-0.5 border-l border-white/10 pl-2">
          {tipos.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-sidebar-muted">Nenhum tipo de encontro no seu contrato ainda.</li>
          ) : (
            tipos.map((t) => {
              const atual = rota.pagina === 'mentorias' && rota.id === t.id
              return (
                <li key={t.id}>
                  <a href={hrefAluna('mentorias', t.id)} aria-current={atual ? 'page' : undefined} className={cx(classeItem(atual, false), 'py-1.5 text-[13px]')}>
                    <span className="truncate">{t.nome}</span>
                  </a>
                </li>
              )
            })
          )}
        </ul>
      )}
    </li>
  )
}

function PaginaAluna({ rota, tipos }: { rota: RotaAluna; tipos: Reg[] }) {
  switch (rota.pagina) {
    case 'inicio':
      return <Inicio />
    case 'perfil':
      return <MeusDados />
    case 'diagnostico':
      return <Diagnostico area={rota.id} />
    case 'jornada':
      return <SecaoPortal key={rota.id ?? ''} secao="jornada" etapaId={rota.id} />
    case 'mentorias': {
      const tipo = tipos.find((t) => t.id === rota.id)
      return (
        <div className="space-y-4">
          {tipo && <p className="text-sm text-ink-soft">Encontros de {tipo.nome}.</p>}
          <SaldoMentorias key={`saldo-${rota.id ?? ''}`} tipoId={rota.id} />
          <SecaoPortal key={rota.id ?? ''} secao="mentorias" tipoId={rota.id} />
        </div>
      )
    }
    case 'vitorias':
      return <Vitorias />
    case 'trilhas':
      return <Trilhas />
    case 'acoes':
      return <PlanoAcao />
    case 'agenda':
      return <Agenda />
    case 'rotina':
      return <Conteudos key="rotina" secao="rotina" />
    case 'biblioteca':
      return <Conteudos key="biblioteca" secao="biblioteca" />
    case 'livros':
      return <Conteudos key="livros" secao="livros" />
    case 'mural':
      return <Mural />
    case 'links':
      return <LinksImportantes />
    case 'conta':
      return <MinhaConta />
    default:
      return <EmBreve pagina={rota.pagina} />
  }
}
