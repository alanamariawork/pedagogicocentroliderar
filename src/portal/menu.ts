import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardCheck,
  Crown,
  GraduationCap,
  House,
  Library,
  Link,
  ListChecks,
  Medal,
  MessagesSquare,
  Newspaper,
  Repeat,
  Route,
  Settings,
  Star,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { PaginaAluna } from './rotas'

export interface ItemMenuAluna {
  id: PaginaAluna
  nome: string
  icone: LucideIcon
  /** Itens com submenu (ex.: Mentorias por tipo de encontro). */
  submenu?: boolean
}

export interface SecaoMenuAluna {
  titulo: string
  itens: ItemMenuAluna[]
}

export const SECOES_ALUNA: SecaoMenuAluna[] = [
  { titulo: 'Minha Jornada', itens: [{ id: 'inicio', nome: 'Início', icone: House }] },
  {
    titulo: 'Meu Perfil',
    itens: [
      { id: 'perfil', nome: 'Meus Dados', icone: UserRound },
      { id: 'diagnostico', nome: 'Diagnóstico', icone: ClipboardCheck },
    ],
  },
  {
    titulo: 'Aprendizado',
    itens: [
      { id: 'jornada', nome: 'Jornada', icone: Route },
      { id: 'trilhas', nome: 'Trilhas', icone: GraduationCap },
      { id: 'biblioteca', nome: 'Biblioteca', icone: Library },
      { id: 'livros', nome: 'Livros', icone: BookOpen },
    ],
  },
  {
    titulo: 'Execução',
    itens: [
      { id: 'acoes', nome: 'Plano de Ação', icone: ListChecks },
      { id: 'rotina', nome: 'Minha Rotina', icone: Repeat },
    ],
  },
  {
    titulo: 'Acompanhamento',
    itens: [
      { id: 'mentorias', nome: 'Mentorias', icone: MessagesSquare, submenu: true },
      { id: 'nivel', nome: 'Meu Nível', icone: Trophy },
      { id: 'vitorias', nome: 'Minhas Vitórias', icone: Medal },
      { id: 'balanco', nome: 'Balanço', icone: ChartNoAxesColumn },
    ],
  },
  {
    titulo: 'Comunidade',
    itens: [
      { id: 'mural', nome: 'Mural', icone: Newspaper },
      { id: 'ranking', nome: 'Ranking', icone: Crown },
      { id: 'casos', nome: 'Casos de Sucesso', icone: Star },
    ],
  },
  { titulo: 'Agenda', itens: [{ id: 'agenda', nome: 'Minha Agenda', icone: CalendarDays }] },
  { titulo: 'Ferramentas', itens: [{ id: 'links', nome: 'Links Importantes', icone: Link }] },
  { titulo: 'Configurações', itens: [{ id: 'conta', nome: 'Minha Conta', icone: Settings }] },
]

export const ITENS_ALUNA = SECOES_ALUNA.flatMap((s) => s.itens.map((i) => ({ ...i, secao: s.titulo })))

export function nomePaginaAluna(p: PaginaAluna): string {
  if (p === 'mentoria') return 'Mentoria'
  if (p === 'mes') return 'Mês do plano'
  return ITENS_ALUNA.find((i) => i.id === p)?.nome ?? 'Início'
}
