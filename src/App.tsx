import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BadgeCheck,
  Bell,
  CalendarCheck2,
  CalendarClock,
  ClipboardList,
  Gem,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Route,
  Settings,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { ProvedorFeedback } from './components/Feedback'
import { AlertaErro, Carregando } from './components/Estados'
import { ProvedorSessao, useSessao } from './state/Sessao'
import { href, irPara, useRota, type PaginaId, type Rota } from './lib/rotas'
import { cx } from './lib/format'
import { mensagemDeErro } from './lib/api'
import { NOME_PERFIL, type Permissao } from '../shared/permissoes'
import { VisaoGeral } from './pages/VisaoGeral'
import { EntregasMes } from './pages/EntregasMes'
import { Alunas } from './pages/Alunas'
import { Ficha } from './pages/Ficha'
import { Agenda } from './pages/Agenda'
import { Validacoes } from './pages/Validacoes'
import { Alertas } from './pages/Alertas'
import { ModeloPedagogico } from './pages/ModeloPedagogico'
import { Pacotes } from './pages/Pacotes'
import { Configuracoes } from './pages/Configuracoes'
import { Decisoes } from './pages/Decisoes'
import { Conta } from './pages/Conta'
import { Portal } from './pages/Portal'

export const NOME_SISTEMA = 'Efeito Diamante | Gestão da Jornada'

interface ItemMenu {
  id: PaginaId
  nome: string
  icone: LucideIcon
  permissoes?: Permissao[] // qualquer uma delas
}

const MENU: ItemMenu[] = [
  { id: 'entregas', nome: 'Entregas do mês', icone: CalendarCheck2, permissoes: ['entregas:ver'] },
  { id: 'visao-geral', nome: 'Visão geral', icone: LayoutDashboard, permissoes: ['indicadores:ver'] },
  { id: 'alunas', nome: 'Alunas e matrículas', icone: Users, permissoes: ['alunas:ver'] },
  { id: 'agenda', nome: 'Capacidade e agenda', icone: CalendarClock, permissoes: ['entregas:ver'] },
  { id: 'validacoes', nome: 'Validações', icone: BadgeCheck, permissoes: ['jornada:ver'] },
  { id: 'alertas', nome: 'Alertas', icone: Bell },
  { id: 'jornada', nome: 'Trilhas e etapas', icone: Route, permissoes: ['jornada:ver'] },
  { id: 'pacotes', nome: 'Pacotes', icone: Package, permissoes: ['comercial:ver', 'config:editar'] },
  { id: 'decisoes', nome: 'Decisões pendentes', icone: ClipboardList },
  { id: 'configuracoes', nome: 'Configurações', icone: Settings, permissoes: ['config:editar', 'usuarios:admin', 'pedagogico:configurar'] },
]

const NOME_PAGINA: Record<PaginaId, string> = {
  entregas: 'Entregas do mês',
  'visao-geral': 'Visão geral',
  alunas: 'Alunas e matrículas',
  ficha: 'Ficha da aluna',
  agenda: 'Capacidade e agenda',
  validacoes: 'Validações',
  alertas: 'Alertas',
  jornada: 'Trilhas e etapas',
  pacotes: 'Pacotes e entregáveis',
  decisoes: 'Decisões pendentes',
  configuracoes: 'Configurações',
  conta: 'Minha conta',
  portal: 'Minha jornada',
}

export default function App() {
  return (
    <ProvedorFeedback>
      <ProvedorSessao>
        <Raiz />
      </ProvedorSessao>
    </ProvedorFeedback>
  )
}

function Raiz() {
  const { eu, carregando } = useSessao()
  if (carregando)
    return (
      <div className="mx-auto max-w-md p-6">
        <Carregando texto="Abrindo…" />
      </div>
    )
  if (!eu) return <Login />
  if (eu.perfil === 'aluna') return <Portal />
  return <Equipe />
}

function Marca({ claro }: { claro?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cx('inline-flex size-9 items-center justify-center rounded-full border', claro ? 'border-gold-line/50 text-gold-line' : 'border-gold-line text-gold')}>
        <Gem className="size-4.5" aria-hidden />
      </span>
      <div className="leading-tight">
        <p className={cx('font-display text-[15px] font-semibold', claro ? 'text-white' : 'text-brand-700')}>Efeito Diamante</p>
        <p className={cx('text-[11px] tracking-wide', claro ? 'text-sidebar-muted' : 'text-ink-muted')}>Gestão da Jornada</p>
      </div>
    </div>
  )
}

function Login() {
  const { entrar } = useSessao()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(email.trim(), senha)
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Marca />
        </div>
        <form onSubmit={enviar} className="card space-y-4 p-6" noValidate>
          <h1 className="font-display text-xl font-semibold text-ink">Entrar</h1>
          {erro && <AlertaErro mensagem={erro} />}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-soft">
              E-mail
            </label>
            <input id="email" type="email" autoComplete="username" className="field-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="senha" className="mb-1 block text-sm font-medium text-ink-soft">
              Senha
            </label>
            <input id="senha" type="password" autoComplete="current-password" className="field-control" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={enviando || !email || !senha}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="text-xs text-ink-muted">Esqueceu a senha? Peça à Administração para redefinir o seu acesso.</p>
        </form>
      </div>
    </main>
  )
}

function Equipe() {
  const { eu, pode, sair } = useSessao()
  const rotaAtual = useRota()
  const [menuAberto, setMenuAberto] = useState(false)
  const itens = MENU.filter((m) => !m.permissoes || m.permissoes.some((p) => pode(p)))
  const inicial: Rota = { pagina: itens[0]?.id ?? 'conta' }
  const rota = rotaAtual && rotaAtual.pagina !== 'portal' ? rotaAtual : inicial
  const tituloRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${NOME_PAGINA[rota.pagina]} · ${NOME_SISTEMA}`
    setMenuAberto(false)
  }, [rota.pagina, rota.id])

  const menu = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      <div className="px-5 pt-5 pb-5">
        <Marca claro />
      </div>
      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {itens.map((m) => {
            const atual = rota.pagina === m.id || (m.id === 'alunas' && rota.pagina === 'ficha')
            const Icone = m.icone
            return (
              <li key={m.id}>
                <a
                  href={href({ pagina: m.id })}
                  aria-current={atual ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm transition-colors',
                    atual ? 'bg-sidebar-active font-medium text-white shadow-[inset_3px_0_0_0_var(--color-gold-line)]' : 'text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink',
                  )}
                >
                  <Icone className="size-4 shrink-0" aria-hidden />
                  {m.nome}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t border-white/10 px-3 py-3">
        <a href={href({ pagina: 'conta' })} className="flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink">
          <UserRound className="size-4" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sidebar-ink">{eu!.nome}</span>
            <span className="block text-xs">{NOME_PERFIL[eu!.perfil]}</span>
          </span>
        </a>
        <button type="button" onClick={sair} className="mt-1 flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-sidebar-muted hover:bg-white/5 hover:text-sidebar-ink">
          <LogOut className="size-4" aria-hidden />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <>
      <a href="#conteudo" onClick={(e) => (e.preventDefault(), document.getElementById('conteudo')?.focus())} className="sr-only z-50 rounded bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Pular para o conteúdo
      </a>
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-0 h-screen">{menu}</div>
        </aside>
        {menuAberto && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-gray-900/40" onClick={() => setMenuAberto(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
              {menu}
              <button type="button" className="absolute top-4 right-3 rounded p-1.5 text-sidebar-ink hover:bg-white/10" onClick={() => setMenuAberto(false)} aria-label="Fechar menu">
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <button type="button" className="btn-ghost -ml-2 p-2 lg:hidden" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
                <Menu className="size-5" aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Efeito Diamante</p>
                <h1 ref={tituloRef} tabIndex={-1} className="truncate font-display text-xl font-semibold text-ink outline-none">
                  {NOME_PAGINA[rota.pagina]}
                </h1>
              </div>
            </div>
          </header>
          <main id="conteudo" tabIndex={-1} className="flex-1 px-4 py-5 outline-none sm:px-6 lg:px-8">
            {eu!.trocar_senha && rota.pagina !== 'conta' && (
              <p role="status" className="mb-4 rounded-[var(--radius-control)] border border-gold-line bg-gold-soft px-3 py-2 text-sm text-ink-soft">
                Sua senha foi definida pela Administração.{' '}
                <a className="font-medium text-brand-700 underline" href={href({ pagina: 'conta' })}>
                  Troque sua senha agora
                </a>
                .
              </p>
            )}
            <Pagina rota={rota} />
          </main>
          <footer className="border-t border-line px-4 py-3 text-xs text-ink-muted sm:px-6 lg:px-8">
            {NOME_SISTEMA} · Piloto · Sem integrações externas: nenhuma mensagem é enviada automaticamente.
          </footer>
        </div>
      </div>
    </>
  )
}

function Pagina({ rota }: { rota: Rota }) {
  switch (rota.pagina) {
    case 'visao-geral':
      return <VisaoGeral />
    case 'entregas':
      return <EntregasMes />
    case 'alunas':
      return <Alunas />
    case 'ficha':
      return <Ficha key={rota.id} pessoaId={rota.id!} aba={rota.aba} />
    case 'agenda':
      return <Agenda />
    case 'validacoes':
      return <Validacoes />
    case 'alertas':
      return <Alertas />
    case 'jornada':
      return <ModeloPedagogico />
    case 'pacotes':
      return <Pacotes />
    case 'configuracoes':
      return <Configuracoes />
    case 'decisoes':
      return <Decisoes />
    case 'conta':
    default:
      return <Conta />
  }
}

export { irPara }
