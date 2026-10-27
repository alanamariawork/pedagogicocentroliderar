import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Carregando, EstadoErro, Secao, Vazio } from '../components/Estados'
import { Filtros, SeletorMes, paraQuery, type ValoresFiltro } from '../components/Filtros'
import { Atraso } from '../components/Selos'
import { useDados, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { href } from '../lib/rotas'
import { filtrosIniciais } from './EntregasMes'
import { formatarData } from '../../shared/datas'

export function VisaoGeral() {
  const [filtros, setFiltros] = useState<ValoresFiltro>(filtrosIniciais)
  const [mostrar, setMostrar] = useState(false)
  const { dados, erro, recarregar } = useDados(`/visao-geral?${paraQuery(filtros)}`)

  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const i = dados.indicadores
  const maxDist = Math.max(1, ...dados.distribuicao.map((d: Reg) => d.quantidade))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMes mes={filtros.mes} onChange={(mes) => setFiltros((f) => ({ ...f, mes }))} />
        <button type="button" className="btn-secondary ml-auto" onClick={() => setMostrar((v) => !v)} aria-expanded={mostrar}>
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
        </button>
      </div>
      {mostrar && (
        <div className="card p-3">
          <Filtros valores={filtros} onChange={setFiltros} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador titulo="Pessoas com matrícula ativa" valor={i.pessoas_ativas} ajuda="Pessoas distintas (renovação não conta duas vezes)" />
        <Indicador titulo="Matrículas ativas" valor={i.matriculas_ativas} ajuda={`${i.matriculas_pausadas} pausada(s) fora desta conta`} />
        <Indicador titulo="Próximas do término" valor={i.proximas_termino} ajuda={`Nos próximos ${dados.janela_termino_dias} dias`} tom={i.proximas_termino ? 'alerta' : undefined} />
        <Indicador titulo="Entregas vencidas" valor={i.entregas_vencidas} ajuda="Previsão vencida e ainda devidas" tom={i.entregas_vencidas ? 'perigo' : undefined} />
        <Indicador titulo="Entregas previstas no mês" valor={i.entregas_previstas_mes} ajuda="Previstas ou agendadas no mês" />
        <Indicador titulo="Contatos pendentes" valor={i.contatos_pendentes} ajuda="Próxima tentativa vencida" tom={i.contatos_pendentes ? 'alerta' : undefined} />
        <Indicador titulo="Pendências de cadastro" valor={i.pendencias_cadastro} ajuda="Impedem previsões ou cálculos" tom={i.pendencias_cadastro ? 'alerta' : undefined} />
        <a href={href({ pagina: 'entregas' })} className="card flex flex-col justify-center p-4 text-sm font-medium text-brand-700 hover:bg-brand-50">
          Abrir Entregas do mês →
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Secao titulo="Matrículas próximas do término" descricao="Com as entregas que ainda restam">
          {dados.proximas_termino.length === 0 ? (
            <Vazio>Nenhuma matrícula termina na janela configurada.</Vazio>
          ) : (
            <ul className="divide-y divide-line">
              {dados.proximas_termino.map((m: Reg) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <a className="font-medium text-brand-700 hover:underline" href={href({ pagina: 'ficha', id: m.pessoa_id })}>
                    {m.pessoa_nome}
                  </a>
                  <span className="text-right text-ink-muted">
                    termina {formatarData(m.data_fim)}
                    <span className={cx('block text-xs', m.restantes > 0 && 'font-medium text-warning')}>{m.restantes} entrega(s) restante(s)</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Entregas vencidas" descricao="Por que está pendente e quem deve agir estão na tela Entregas do mês">
          {dados.vencidas.length === 0 ? (
            <Vazio>Nenhuma entrega vencida.</Vazio>
          ) : (
            <ul className="divide-y divide-line">
              {dados.vencidas.map((o: Reg) => (
                <li key={o.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <a className="font-medium text-brand-700 hover:underline" href={href({ pagina: 'ficha', id: o.pessoa_id })}>
                      {o.pessoa_nome}
                    </a>
                    <Atraso atraso={o.atraso} />
                  </div>
                  <p className="text-xs text-ink-muted">
                    {o.item_descricao} nº {o.numero} · previsto {formatarData(o.data_prevista)} · {o.profissional_nome ?? 'sem profissional'}
                    {o.impedimento_motivo ? ` · ${o.impedimento_motivo}` : ' · sem impedimento registrado'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Contatos pendentes" descricao="Última próxima tentativa já vencida">
          {dados.contatos_pendentes.length === 0 ? (
            <Vazio>Nenhuma tentativa de contato vencida.</Vazio>
          ) : (
            <ul className="divide-y divide-line">
              {dados.contatos_pendentes.map((c: Reg) => (
                <li key={c.id} className="py-2 text-sm">
                  <a className="font-medium text-brand-700 hover:underline" href={href({ pagina: 'ficha', id: c.pessoa_id })}>
                    {c.pessoa_nome}
                  </a>
                  <p className="text-xs text-ink-muted">
                    Tentar em {formatarData(c.proxima_tentativa)} · {c.proxima_acao ?? 'sem próxima ação'} · {c.responsavel_nome ?? 'sem responsável'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Distribuição por trilha e pilar" descricao="Matrículas ativas">
          {dados.distribuicao.length === 0 ? (
            <Vazio>Nenhuma matrícula ativa.</Vazio>
          ) : (
            <ul className="space-y-2">
              {dados.distribuicao.map((d: Reg) => (
                <li key={`${d.trilha}-${d.pilar}`} className="text-sm">
                  <div className="flex justify-between">
                    <span>
                      {d.trilha} <span className="text-ink-muted">· {d.pilar}</span>
                    </span>
                    <span className="font-medium">{d.quantidade}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-muted" aria-hidden>
                    <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(d.quantidade / maxDist) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <Secao titulo="Pendências de cadastro" descricao="Dados ausentes aparecem aqui em vez de virarem números falsos">
        {dados.pendencias_cadastro.length === 0 ? (
          <Vazio>Nenhuma pendência de cadastro.</Vazio>
        ) : (
          <ul className="grid gap-x-6 gap-y-1 text-sm md:grid-cols-2">
            {dados.pendencias_cadastro.map((p: Reg, n: number) => (
              <li key={n} className="flex gap-2 py-1">
                <a className="shrink-0 font-medium text-brand-700 hover:underline" href={href({ pagina: 'ficha', id: p.pessoa_id })}>
                  {p.pessoa_nome}
                </a>
                <span className="text-ink-muted">{p.descricao}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  )
}

function Indicador({ titulo, valor, ajuda, tom }: { titulo: string; valor: number; ajuda: string; tom?: 'alerta' | 'perigo' }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{titulo}</p>
      <p className={cx('mt-1 font-display text-3xl font-semibold', tom === 'perigo' ? 'text-danger' : tom === 'alerta' ? 'text-warning' : 'text-brand-700')}>{valor}</p>
      <p className="text-xs text-ink-muted">{ajuda}</p>
    </div>
  )
}
