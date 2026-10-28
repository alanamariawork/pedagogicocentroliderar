import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Opcoes } from './Form'
import { ativos, equipe, useCatalogos } from '../state/Catalogos'
import { nomeDoMes } from '../../shared/datas'

export interface ValoresFiltro {
  mes: string
  programa_id: string
  profissional_id: string
  responsavel_id: string
  trilha_id: string
  pilar_id: string
  situacao: string
}

export function paraQuery(f: Partial<ValoresFiltro>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
  return p.toString()
}

function mudarMes(mes: string, delta: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

export function SeletorMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="btn-secondary p-2" onClick={() => onChange(mudarMes(mes, -1))} aria-label="Mês anterior">
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <label className="sr-only" htmlFor="seletor-mes">
        Mês
      </label>
      <input id="seletor-mes" type="month" className="field-control w-auto" value={mes} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button type="button" className="btn-secondary p-2" onClick={() => onChange(mudarMes(mes, 1))} aria-label="Próximo mês">
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <span className="ml-2 hidden font-display text-base text-ink sm:inline">{nomeDoMes(mes)}</span>
    </div>
  )
}

export function Filtros({ valores, onChange, ocultar = [] }: { valores: ValoresFiltro; onChange: (v: ValoresFiltro) => void; ocultar?: (keyof ValoresFiltro)[] }) {
  const cat = useCatalogos()
  const set = (k: keyof ValoresFiltro) => (e: { target: { value: string } }) => onChange({ ...valores, [k]: e.target.value })
  const sel = (k: keyof ValoresFiltro, rotulo: string, opcoes: React.ReactNode) =>
    ocultar.includes(k) ? null : (
      <label className="block text-xs text-ink-muted">
        {rotulo}
        <select className="field-control mt-0.5 py-1.5" value={valores[k]} onChange={set(k)}>
          {opcoes}
        </select>
      </label>
    )
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {sel('programa_id', 'Programa', <Opcoes itens={ativos(cat?.programas)} vazio="Todos" />)}
      {sel(
        'profissional_id',
        'Profissional',
        <>
          <Opcoes itens={ativos(cat?.profissionais)} vazio="Todas" />
          <option value="sem">Sem profissional</option>
        </>,
      )}
      {sel('responsavel_id', 'Responsável', <Opcoes itens={equipe(cat)} vazio="Todos" />)}
      {sel('trilha_id', 'Trilha', <Opcoes itens={ativos(cat?.trilhas)} vazio="Todas" />)}
      {sel('pilar_id', 'Pilar', <Opcoes itens={ativos(cat?.pilares)} vazio="Todos" />)}
      {sel(
        'situacao',
        'Situação da matrícula',
        <>
          <option value="">Ativas e pausadas</option>
          <option value="ativa">Ativas</option>
          <option value="pausada">Pausadas</option>
          <option value="encerrada">Encerradas</option>
          <option value="cancelada">Canceladas</option>
        </>,
      )}
    </div>
  )
}
