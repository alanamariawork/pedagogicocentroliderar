import { useState } from 'react'
import { CalendarClock, ExternalLink, NotebookPen, Users } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { Campo, FormDialog } from '../components/Form'
import { Atraso, IdAluna, Selo, TOM_MATRICULA, TOM_OCORRENCIA } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { DialogoAcao, type AcaoOcorrencia } from '../forms/AcoesOcorrencia'
import { MenuAcoes } from './EntregasMes'
import { post, useDados, type Reg } from '../lib/api'
import { SITUACAO_MATRICULA, SITUACAO_OCORRENCIA } from '../lib/format'
import { href } from '../lib/rotas'
import { useSessao } from '../state/Sessao'
import { formatarCarimbo, formatarData } from '../../shared/datas'

const dataHora = (h: string) => `${formatarData(h.slice(0, 10))} às ${h.slice(11, 16)}`

/** Perfil Mentora: resumo de cada aluna que tem encontros na sua agenda, com as ações do dia a dia. */
export function AlunasDaAgenda() {
  const { eu, pode } = useSessao()
  const { dados, erro, recarregar, carregando } = useDados<{ profissional: Reg | null; alunas: Reg[] }>('/mentora/alunas')
  const [busca, setBusca] = useState('')
  const [soPendencias, setSoPendencias] = useState(false)
  const [acao, setAcao] = useState<{ acao: AcaoOcorrencia; o: Reg } | null>(null)
  const [nota, setNota] = useState<Reg | null>(null)

  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  if (!dados.profissional)
    return (
      <EstadoVazio icone={Users} titulo="Seu usuário não está vinculado a uma profissional.">
        <p className="mt-1 max-w-md text-xs text-ink-muted">Peça à Administração para fazer o vínculo em Configurações → Usuários. Depois disso, suas alunas aparecem aqui.</p>
      </EstadoVazio>
    )

  const termo = busca.trim().toLowerCase().replace(/^#/, '')
  const lista = dados.alunas.filter((a) => {
    if (soPendencias && !a.vencidas && !a.sem_registro) return false
    if (!termo) return true
    return String(a.pessoa_nome).toLowerCase().includes(termo) || (a.pessoa_codigo && Number(termo) === a.pessoa_codigo)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label htmlFor="busca-alunas-agenda" className="sr-only">
            Buscar aluna
          </label>
          <input id="busca-alunas-agenda" type="search" className="field-control" placeholder="Buscar por ID ou nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={soPendencias} onChange={(e) => setSoPendencias(e.target.checked)} /> Só com pendências
        </label>
      </div>
      <p className="text-xs text-ink-muted">
        {dados.alunas.length} aluna(s) com encontros {eu?.perfil === 'mentora' ? 'na sua agenda' : `na agenda de ${dados.profissional.nome}`}, em ordem de ID. {carregando && 'Atualizando…'}
      </p>

      {lista.length === 0 ? (
        <EstadoVazio icone={Users} titulo={dados.alunas.length ? 'Nenhuma aluna com esses filtros.' : 'Nenhuma aluna com encontros na sua agenda ainda.'} />
      ) : (
        <ul className="grid gap-4 xl:grid-cols-2">
          {lista.map((a) => {
            const j = a.jornada
            const pct = j?.total ? Math.round((j.validadas / j.total) * 100) : null
            return (
              <li key={a.matricula.id} className="card flex flex-col p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <a href={href({ pagina: 'ficha', id: a.pessoa_id })} className="font-display text-lg font-semibold text-ink hover:text-brand-700">
                      <IdAluna codigo={a.pessoa_codigo} />
                      {a.pessoa_nome}
                    </a>
                    <p className="text-xs text-ink-muted">
                      {formatarData(a.matricula.data_inicio)} a {a.matricula.data_fim ? formatarData(a.matricula.data_fim) : 'término não definido'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Selo tom={TOM_MATRICULA[a.matricula.situacao]}>{SITUACAO_MATRICULA[a.matricula.situacao]}</Selo>
                    {a.vencidas > 0 && <Selo tom="perigo">{a.vencidas} vencida(s)</Selo>}
                    {a.sem_registro > 0 && <Selo tom="alerta">{a.sem_registro} sem registro</Selo>}
                  </div>
                </div>

                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-ink-muted">Trilha e pilar</dt>
                    <dd>{j?.trilha_nome ? `${j.trilha_nome} · ${j.pilar_nome ?? 'pilar a definir'}` : 'Jornada ainda não definida'}</dd>
                    {pct !== null && (
                      <div className="mt-1">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Atividades validadas">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {j.validadas} de {j.total} atividade(s) validada(s){j.aguardando > 0 && ` · ${j.aguardando} aguardando validação`}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Próximo encontro com você</dt>
                    <dd>{a.proximo ? `${dataHora(a.proximo.data_agendada)} · ${a.proximo.item_descricao}` : 'Nenhum agendado'}</dd>
                    <dt className="mt-2 text-xs text-ink-muted">Último encontro realizado</dt>
                    <dd>
                      {a.ultimo_realizado ? (
                        <>
                          {formatarData(a.ultimo_realizado.data_realizada)} · {a.ultimo_realizado.item_descricao}
                          {a.ultimo_realizado.resumo_compartilhavel && <span className="block text-xs text-ink-soft">{a.ultimo_realizado.resumo_compartilhavel}</span>}
                        </>
                      ) : (
                        'Nenhum ainda'
                      )}
                    </dd>
                  </div>
                </dl>

                {a.abertas.length > 0 && (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-1 text-xs font-medium text-ink-soft">Encontros em aberto com você</p>
                    <ul className="divide-y divide-line">
                      {(a.abertas as Reg[]).map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                          <span className="min-w-0">
                            {o.item_descricao} nº {o.numero}
                            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                              <Selo tom={TOM_OCORRENCIA[o.situacao]}>{SITUACAO_OCORRENCIA[o.situacao]}</Selo>
                              <Atraso atraso={o.atraso} />
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {o.situacao === 'agendada' && o.data_agendada ? dataHora(o.data_agendada) : o.data_prevista ? `Previsão: ${formatarData(o.data_prevista)}` : 'Sem previsão'}
                              {o.impedimento_motivo && ` · ${o.impedimento_motivo}`}
                            </span>
                          </span>
                          <MenuAcoes o={o} onAcao={(ac, oc) => setAcao({ acao: ac, o: oc })} pode={pode as never} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {a.ultima_anotacao && (
                  <p className="mt-3 rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 text-xs text-ink-soft">
                    <span className="text-ink-muted">Última anotação ({formatarCarimbo(a.ultima_anotacao.criado_em)}):</span> {a.ultima_anotacao.texto}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  {(pode('notas:pedagogicas') || pode('notas:internas')) && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setNota(a)}>
                      <NotebookPen className="size-4" aria-hidden /> Registrar anotação
                    </button>
                  )}
                  <a className="btn-secondary btn-sm" href={href({ pagina: 'ficha', id: a.pessoa_id, aba: 'jornada' })}>
                    <CalendarClock className="size-4" aria-hidden /> Jornada e atividades
                  </a>
                  <a className="btn-ghost btn-sm" href={href({ pagina: 'ficha', id: a.pessoa_id })}>
                    <ExternalLink className="size-4" aria-hidden /> Ficha completa
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <DialogoAcao acao={acao?.acao ?? null} ocorrencia={acao?.o ?? null} onFechar={() => setAcao(null)} onConcluir={recarregar} />
      {nota && <DialogAnotacao aluna={nota} onFechar={() => setNota(null)} onConcluir={recarregar} />}
    </div>
  )
}

function DialogAnotacao({ aluna, onFechar, onConcluir }: { aluna: Reg; onFechar: () => void; onConcluir: () => void }) {
  const { pode } = useSessao()
  const fb = useFeedback()
  const tipos = [pode('notas:pedagogicas') && 'pedagogica', pode('notas:internas') && 'operacional'].filter(Boolean) as string[]
  const [tipo, setTipo] = useState(tipos[0])
  const [texto, setTexto] = useState('')
  return (
    <FormDialog
      aberto
      titulo="Registrar anotação"
      descricao={`${aluna.pessoa_nome}. Nunca aparece no portal da aluna. Registre só o necessário, sem detalhes íntimos ou diagnósticos.`}
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/matriculas/${aluna.matricula.id}/anotacoes`, { tipo, texto })
        fb.sucesso('Anotação registrada.')
        onConcluir()
      }}
    >
      {tipos.length > 1 && (
        <div className="flex flex-wrap gap-3 text-sm">
          {tipos.map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="radio" name="tipo-anotacao-agenda" checked={tipo === t} onChange={() => setTipo(t)} />
              {t === 'pedagogica' ? 'Pedagógica (privada)' : 'Operacional'}
            </label>
          ))}
        </div>
      )}
      <Campo rotulo="Anotação" obrigatorio>
        {(p) => <textarea rows={4} maxLength={2000} className="field-control" {...p} value={texto} onChange={(e) => setTexto(e.target.value)} />}
      </Campo>
    </FormDialog>
  )
}
