import { BarChart3 } from 'lucide-react'
import { Carregando, EstadoErro, Secao, Vazio } from '../../components/Estados'
import type { Reg } from '../../lib/api'
import { cx } from '../../lib/format'
import { href } from '../../lib/rotas'

type Painel = { dados: Reg | null; erro: string | null; recarregar: () => void }

/** Cards de alunas no topo da Visão Geral (as duas visões). */
export function PainelAlunas({ painel }: { painel: Painel }) {
  const { dados, erro, recarregar } = painel
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const c = dados.cards
  const cards: { titulo: string; valor: number; ajuda: string; link?: string; tom?: 'alerta' }[] = [
    { titulo: 'Total de alunas', valor: c.total, ajuda: 'Com pelo menos uma matrícula', link: href({ pagina: 'alunas' }) },
    { titulo: 'Ativas', valor: c.ativas, ajuda: 'Status "Ativa"' },
    { titulo: 'A iniciar', valor: c.a_iniciar, ajuda: 'Vigência ainda não começou' },
    { titulo: 'Onboarding marcado', valor: c.onboarding_agendado, ajuda: 'Ativas ou a iniciar, com onboarding agendado' },
    { titulo: 'Onboarding pendente', valor: c.onboarding_pendente, ajuda: 'Ativas ou a iniciar, sem onboarding marcado', tom: c.onboarding_pendente ? 'alerta' : undefined },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((k) => {
        const corpo = (
          <>
            <p className="eyebrow">{k.titulo}</p>
            <p className={cx('mt-1 font-display text-3xl font-semibold', k.tom === 'alerta' ? 'text-warning' : 'text-brand-700')}>{k.valor}</p>
            <p className="text-xs text-ink-muted">{k.ajuda}</p>
          </>
        )
        return k.link ? (
          <a key={k.titulo} href={k.link} className="card block p-4 hover:bg-brand-50/50">
            {corpo}
          </a>
        ) : (
          <div key={k.titulo} className="card p-4">
            {corpo}
          </div>
        )
      })}
    </div>
  )
}

/** Visão estratégica: como as alunas se distribuem. Uma série por gráfico, valores escritos ao lado de cada barra. */
export function Estrategica({ painel }: { painel: Painel }) {
  const { dados } = painel
  if (!dados) return null
  if (!dados.cards.total)
    return (
      <Vazio>
        <BarChart3 className="mx-auto mb-1 size-5 text-ink-muted" aria-hidden />
        Ainda não há alunas com matrícula. Os gráficos aparecem depois do primeiro cadastro em Alunas e matrículas.
      </Vazio>
    )
  const graficos: [string, string, Reg[]][] = [
    ['Alunas por estado', 'Status atual de cada aluna', dados.por_status],
    ['Por segmento', 'Segmento do negócio (Configurações → Listas)', dados.por_segmento],
    ['Por responsável', 'Responsável da equipe pela aluna', dados.por_responsavel],
    ['Por canal de venda', 'Canal da matrícula mais recente', dados.por_canal],
    ['Por turma', 'Turma da matrícula mais recente', dados.por_turma],
  ]
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {graficos.map(([titulo, descricao, linhas]) => (
        <Secao key={titulo} titulo={titulo} descricao={descricao}>
          <Barras linhas={linhas} total={dados.cards.total} />
        </Secao>
      ))}
    </div>
  )
}

function Barras({ linhas, total }: { linhas: Reg[]; total: number }) {
  const max = Math.max(1, ...linhas.map((l) => l.quantidade))
  return (
    <ul className="space-y-2.5">
      {linhas.map((l) => {
        const pct = Math.round((l.quantidade / total) * 100)
        const vazio = /^Sem /.test(l.nome)
        return (
          <li key={l.nome} className="text-sm" title={`${l.nome}: ${l.quantidade} de ${total} (${pct}%)`}>
            <div className="flex justify-between gap-3">
              <span className={cx('truncate', vazio && 'text-ink-muted italic')}>{l.nome}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium">{l.quantidade}</span> <span className="text-xs text-ink-muted">({pct}%)</span>
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-surface-muted" aria-hidden>
              <div className={cx('h-2 rounded-full', vazio ? 'bg-ink-muted/40' : 'bg-brand-500')} style={{ width: `${(l.quantidade / max) * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
