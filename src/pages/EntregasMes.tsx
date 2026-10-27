import { useState } from 'react'
import { CalendarCheck2, Download, MoreHorizontal, SlidersHorizontal } from 'lucide-react'
import { Carregando, EstadoErro, Vazio } from '../components/Estados'
import { Filtros, SeletorMes, paraQuery, type ValoresFiltro } from '../components/Filtros'
import { Atraso, Selo, TOM_OCORRENCIA } from '../components/Selos'
import { DialogoAcao, acoesDisponiveis, type AcaoOcorrencia } from '../forms/AcoesOcorrencia'
import { baixarCsv, useDados, type Reg } from '../lib/api'
import { SITUACAO_MATRICULA, SITUACAO_OCORRENCIA, cx } from '../lib/format'
import { href } from '../lib/rotas'
import { useSessao } from '../state/Sessao'
import { NOME_GRUPO } from '../../shared/calculos'
import { formatarData, formatarHoras, hojeSP, mesDe } from '../../shared/datas'

type Grupo = keyof typeof NOME_GRUPO
const GRUPOS: Grupo[] = ['previstos', 'anteriores', 'sem_previsao', 'agendados', 'realizados']
const AJUDA_GRUPO: Record<Grupo, string> = {
  previstos: 'Previsão dentro do mês, ainda sem horário reservado.',
  anteriores: 'Previsão em meses anteriores e ainda devidas.',
  sem_previsao: 'Entregas contratadas sem data prevista. Não entram como "em dia".',
  agendados: 'Com horário reservado no mês.',
  realizados: 'Realizadas no mês.',
}

export function filtrosIniciais(): ValoresFiltro {
  return { mes: mesDe(hojeSP()), programa_id: '', profissional_id: '', responsavel_id: '', trilha_id: '', pilar_id: '', situacao: '' }
}

export function EntregasMes() {
  const [filtros, setFiltros] = useState<ValoresFiltro>(filtrosIniciais)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [grupo, setGrupo] = useState<Grupo>('previstos')
  const [acao, setAcao] = useState<{ acao: AcaoOcorrencia; o: Reg } | null>(null)
  const { dados, erro, carregando, recarregar } = useDados(`/painel/mes?${paraQuery(filtros)}`)
  const { pode } = useSessao()

  const exportar = () => {
    if (!dados) return
    const linhas: (string | number | null)[][] = [
      ['Grupo', 'Aluna', 'Vigência', 'Entregável', 'Nº', 'Profissional', 'Prevista', 'Agendada', 'Realizada', 'Duração (min)', 'Situação', 'Atraso', 'Motivo do impedimento', 'Quem deve agir', 'Último contato', 'Próxima tentativa', 'Entregas restantes'],
    ]
    for (const g of GRUPOS)
      for (const o of dados.grupos[g] as Reg[])
        linhas.push([
          NOME_GRUPO[g], o.pessoa_nome, `${formatarData(o.data_inicio)} a ${formatarData(o.data_fim)}`, o.item_descricao, o.numero, o.profissional_nome ?? 'Sem profissional',
          formatarData(o.data_prevista), formatarData(o.data_agendada), formatarData(o.data_realizada), o.duracao_efetiva ?? 'sem duração', SITUACAO_OCORRENCIA[o.situacao],
          o.atraso?.tipo === 'vencida' ? `${o.atraso.dias} dias` : o.atraso?.tipo === 'sem_previsao' ? 'Sem previsão' : '', o.impedimento_motivo ?? '',
          o.impedimento_responsavel_nome ?? o.responsavel_resolucao_nome ?? '', formatarData(o.ultimo_contato), formatarData(o.proxima_tentativa), o.entregas_restantes,
        ])
    baixarCsv(`entregas-${filtros.mes}.csv`, linhas)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <SeletorMes mes={filtros.mes} onChange={(mes) => setFiltros((f) => ({ ...f, mes }))} />
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setMostrarFiltros((v) => !v)} aria-expanded={mostrarFiltros}>
            <SlidersHorizontal className="size-4" aria-hidden />
            Filtros
          </button>
          <button type="button" className="btn-secondary" onClick={exportar} disabled={!dados}>
            <Download className="size-4" aria-hidden />
            Exportar CSV
          </button>
        </div>
      </div>
      {mostrarFiltros && (
        <div className="card p-3">
          <Filtros valores={filtros} onChange={setFiltros} />
        </div>
      )}

      {erro ? (
        <EstadoErro mensagem={erro} onTentar={recarregar} />
      ) : !dados ? (
        <Carregando />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cartao titulo="Demanda do mês" valor={formatarHoras(dados.totais.demanda_mes.minutos)} detalhe={`${dados.totais.demanda_mes.quantidade} entrega(s) previstas ou agendadas`} aviso={dados.totais.demanda_mes.sem_duracao} />
            <Cartao titulo="Pendência anterior" valor={formatarHoras(dados.totais.pendencia_anterior.minutos)} detalhe={`${dados.totais.pendencia_anterior.quantidade} entrega(s) de meses anteriores`} aviso={dados.totais.pendencia_anterior.sem_duracao} tom={dados.totais.pendencia_anterior.quantidade ? 'perigo' : undefined} />
            <Cartao titulo="Sem previsão" valor={String(dados.totais.sem_previsao.quantidade)} detalhe="entregas contratadas sem data" />
            <Cartao titulo="Realizadas no mês" valor={String(dados.totais.realizados.quantidade)} detalhe={formatarHoras(dados.totais.realizados.minutos)} />
          </div>

          <Capacidade capacidade={dados.capacidade} />

          <div className="card">
            <div role="tablist" aria-label="Grupos de entregas" className="flex gap-1 overflow-x-auto border-b border-line px-2 pt-2">
              {GRUPOS.map((g) => (
                <button
                  key={g}
                  role="tab"
                  type="button"
                  aria-selected={grupo === g}
                  onClick={() => setGrupo(g)}
                  className={cx('-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap', grupo === g ? 'border-brand-700 font-medium text-brand-700' : 'border-transparent text-ink-muted hover:text-ink')}
                >
                  {NOME_GRUPO[g]}
                  <span className={cx('rounded-full px-1.5 text-xs', g === 'anteriores' && dados.grupos[g].length ? 'bg-danger-soft text-danger' : 'bg-surface-muted')}>{dados.grupos[g].length}</span>
                </button>
              ))}
            </div>
            <div className="p-3" role="tabpanel">
              <p className="mb-3 text-xs text-ink-muted">{AJUDA_GRUPO[grupo]}</p>
              {carregando && <p className="mb-2 text-xs text-ink-muted">Atualizando…</p>}
              {dados.grupos[grupo].length === 0 ? (
                <Vazio>
                  <CalendarCheck2 className="mx-auto mb-2 size-5" aria-hidden />
                  Nenhuma entrega neste grupo com os filtros atuais.
                </Vazio>
              ) : (
                <TabelaEntregas linhas={dados.grupos[grupo]} onAcao={(a, o) => setAcao({ acao: a, o })} pode={pode} />
              )}
            </div>
          </div>
        </>
      )}
      <DialogoAcao acao={acao?.acao ?? null} ocorrencia={acao?.o ?? null} onFechar={() => setAcao(null)} onConcluir={recarregar} />
    </div>
  )
}

function Cartao({ titulo, valor, detalhe, aviso, tom }: { titulo: string; valor: string; detalhe: string; aviso?: number; tom?: 'perigo' }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{titulo}</p>
      <p className={cx('mt-1 font-display text-2xl font-semibold', tom === 'perigo' ? 'text-danger' : 'text-brand-700')}>{valor}</p>
      <p className="text-xs text-ink-muted">{detalhe}</p>
      {!!aviso && <p className="mt-1 text-xs font-medium text-warning">{aviso} sem duração: fora da soma de horas</p>}
    </div>
  )
}

export function Capacidade({ capacidade }: { capacidade: Reg }) {
  const linhas = capacidade.profissionais as Reg[]
  return (
    <details className="card group" open>
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3">
        <span className="font-display text-base font-semibold">Horas por profissional</span>
        <span className="text-xs text-ink-muted group-open:hidden">Mostrar</span>
      </summary>
      <p className="border-t border-line px-4 py-1.5 text-xs text-ink-muted sm:hidden">Deslize a tabela para o lado para ver todas as colunas.</p>
      <div className="overflow-x-auto border-t border-line">
        <table className="tabela min-w-[44rem]">
          <thead>
            <tr>
              <th>Profissional</th>
              <th>Disponibilizado</th>
              <th>Reservado</th>
              <th>Livre</th>
              <th>Demanda sem agendamento</th>
              <th>Saldo teórico</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((p) => (
              <tr key={p.profissional_id}>
                <td>
                  <span className="font-medium">{p.profissional_nome}</span>
                  {p.especialidade && <span className="block text-xs text-ink-muted">{p.especialidade}</span>}
                </td>
                <td>{formatarHoras(p.disponivel_min)}</td>
                <td>
                  {formatarHoras(p.reservado_min)}
                  {p.reservado_fora_disponibilidade_min > 0 && <span className="block text-xs text-warning">+{formatarHoras(p.reservado_fora_disponibilidade_min)} fora da disponibilidade</span>}
                </td>
                <td>{formatarHoras(p.livre_min)}</td>
                <td>
                  {formatarHoras(p.demanda_sem_agendamento_min)} <span className="text-xs text-ink-muted">({p.demanda_sem_agendamento_qtd})</span>
                  {p.sem_duracao_qtd > 0 && <span className="block text-xs text-warning">{p.sem_duracao_qtd} sem duração</span>}
                </td>
                <td className={cx('font-semibold', p.saldo_min < 0 ? 'text-danger' : 'text-success')}>{p.saldo_min < 0 ? `Faltam ${formatarHoras(-p.saldo_min)}` : formatarHoras(p.saldo_min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {capacidade.sem_profissional.quantidade > 0 && (
          <p className="border-t border-line px-4 py-2 text-xs text-warning">
            {capacidade.sem_profissional.quantidade} entrega(s) devidas sem profissional definida ({formatarHoras(capacidade.sem_profissional.minutos)}): não entram em nenhuma linha acima.
          </p>
        )}
        <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">{capacidade.aviso} Disponibilidade sobreposta é contada uma única vez.</p>
      </div>
    </details>
  )
}

export function TabelaEntregas({ linhas, onAcao, pode, ocultarAluna }: { linhas: Reg[]; onAcao: (a: AcaoOcorrencia, o: Reg) => void; pode: (p: never) => boolean; ocultarAluna?: boolean }) {
  return (
    <>
      {/* Computador: tabela */}
      <div className="hidden overflow-x-auto md:block">
        <table className="tabela min-w-[64rem]">
          <thead>
            <tr>
              {!ocultarAluna && <th>Aluna</th>}
              <th>Entregável</th>
              <th>Profissional</th>
              <th>Prevista</th>
              <th>Agendada</th>
              <th>Duração</th>
              <th>Situação</th>
              <th>Impedimento e quem age</th>
              <th>Contato</th>
              <th>Restam</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((o) => (
              <tr key={o.id}>
                {!ocultarAluna && (
                  <td>
                    <a className="font-medium text-brand-700 hover:underline" href={href({ pagina: 'ficha', id: o.pessoa_id })}>
                      {o.pessoa_nome}
                    </a>
                    <span className="block text-xs text-ink-muted">
                      {formatarData(o.data_inicio)} a {formatarData(o.data_fim)}
                      {o.matricula_situacao !== 'ativa' && ` · ${SITUACAO_MATRICULA[o.matricula_situacao]}`}
                    </span>
                  </td>
                )}
                <td>
                  {o.item_descricao} <span className="text-ink-muted">nº {o.numero}</span>
                  {o.item_origem === 'bonus' && <Selo tom="dourado" className="ml-1">Bônus</Selo>}
                </td>
                <td>{o.profissional_nome ?? <Selo tom="alerta">Sem profissional</Selo>}</td>
                <td>
                  {o.data_prevista ? formatarData(o.data_prevista) : <span className="text-ink-muted">—</span>}
                  <div className="mt-0.5">
                    <Atraso atraso={o.atraso} />
                  </div>
                </td>
                <td>{o.data_agendada ? formatarData(o.data_agendada) : o.data_realizada ? <span className="text-success">Realizada {formatarData(o.data_realizada)}</span> : '—'}</td>
                <td>{o.duracao_efetiva ? formatarHoras(o.duracao_efetiva) : <Selo tom="alerta">Sem duração</Selo>}</td>
                <td>
                  <Selo tom={TOM_OCORRENCIA[o.situacao]}>{SITUACAO_OCORRENCIA[o.situacao]}</Selo>
                </td>
                <td className="max-w-56">
                  {o.impedimento_motivo ? (
                    <>
                      <span className="block">{o.impedimento_motivo}</span>
                      {o.impedimento_descricao && <span className="block text-xs text-ink-muted">{o.impedimento_descricao}</span>}
                    </>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                  {(o.impedimento_responsavel_nome || o.responsavel_resolucao_nome) && <span className="block text-xs font-medium text-brand-700">Age: {o.impedimento_responsavel_nome ?? o.responsavel_resolucao_nome}</span>}
                </td>
                <td className="text-xs">
                  <span className="block">Último: {formatarData(o.ultimo_contato)}</span>
                  <span className={cx('block', o.proxima_tentativa && o.proxima_tentativa <= hojeSP() && 'font-medium text-danger')}>Próxima: {formatarData(o.proxima_tentativa)}</span>
                </td>
                <td className="text-center">{o.entregas_restantes ?? '—'}</td>
                <td>
                  <MenuAcoes o={o} onAcao={onAcao} pode={pode} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Celular: cartões */}
      <ul className="space-y-2 md:hidden">
        {linhas.map((o) => (
          <li key={o.id} className="rounded-[var(--radius-control)] border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {!ocultarAluna && (
                  <a className="font-medium text-brand-700" href={href({ pagina: 'ficha', id: o.pessoa_id })}>
                    {o.pessoa_nome}
                  </a>
                )}
                <p className="text-sm">
                  {o.item_descricao} nº {o.numero}
                </p>
                <p className="text-xs text-ink-muted">
                  {o.profissional_nome ?? 'Sem profissional'} · {o.duracao_efetiva ? formatarHoras(o.duracao_efetiva) : 'sem duração'}
                </p>
              </div>
              <MenuAcoes o={o} onAcao={onAcao} pode={pode} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Selo tom={TOM_OCORRENCIA[o.situacao]}>{SITUACAO_OCORRENCIA[o.situacao]}</Selo>
              <Atraso atraso={o.atraso} />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Prevista {formatarData(o.data_prevista)}
              {o.data_agendada && ` · Agendada ${formatarData(o.data_agendada)}`}
            </p>
            {o.impedimento_motivo && (
              <p className="mt-1 text-xs">
                {o.impedimento_motivo}
                {o.impedimento_responsavel_nome && <span className="font-medium text-brand-700"> · Age: {o.impedimento_responsavel_nome}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function MenuAcoes({ o, onAcao, pode }: { o: Reg; onAcao: (a: AcaoOcorrencia, o: Reg) => void; pode: (p: never) => boolean }) {
  const acoes = acoesDisponiveis(o, pode)
  if (acoes.length === 0) return null
  return (
    <details className="relative">
      <summary className="btn-secondary btn-sm list-none" aria-label={`Ações para ${o.pessoa_nome ?? ''} ${o.item_descricao} nº ${o.numero}`}>
        <MoreHorizontal className="size-4" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 rounded-[var(--radius-control)] border border-line bg-surface py-1 shadow-[var(--shadow-overlay)]">
        {acoes.map((a) => (
          <button
            key={a.acao}
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
            onClick={(e) => {
              ;(e.currentTarget.closest('details') as HTMLDetailsElement).open = false
              onAcao(a.acao, o)
            }}
          >
            {a.rotulo}
          </button>
        ))}
        {o.pessoa_id && (
          <a className="block border-t border-line px-3 py-2 text-sm hover:bg-surface-muted" href={href({ pagina: 'ficha', id: o.pessoa_id })}>
            Abrir ficha
          </a>
        )}
      </div>
    </details>
  )
}
