import { useState } from 'react'
import { CalendarClock, CalendarDays, MessageSquareQuote } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { Dialog } from '../../components/Dialog'
import { FormDialog, Campo } from '../../components/Form'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { mensagemDeErro, post, put, useDados, type Reg } from '../../lib/api'
import { cx } from '../../lib/format'
import { BotaoMeet } from '../../components/BotaoMeet'
import { agoraSP, formatarData, somarMinutos } from '../../../shared/datas'

export const dataHora = (h: string) => `${formatarData(h.slice(0, 10))} às ${h.slice(11, 16)}`

function diaDaSemana(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

/** Pode remarcar ou desmarcar pelo portal? (a regra é conferida de novo no servidor) */
export function podeAlterar(inicio: string | null | undefined, antecedenciaHoras: number) {
  return !!inicio && inicio >= somarMinutos(agoraSP(), antecedenciaHoras * 60)
}

/**
 * Escolha de horário a partir da disponibilidade da profissional. Serve para marcar (item) e para
 * remarcar (encontro já agendado, que continua sendo o mesmo encontro do saldo).
 */
export function EscolherHorario({ itemId, encontro, titulo, onFechar, onConcluir }: { itemId: string; encontro?: Reg; titulo: string; onFechar: () => void; onConcluir: () => void }) {
  const { dados, erro, recarregar } = useDados<Reg>(`/portal/mentorias/itens/${itemId}/horarios`)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const fb = useFeedback()
  const horarios = (dados?.horarios ?? []) as Reg[]
  const porDia = new Map<string, Reg[]>()
  for (const h of horarios) porDia.set(h.inicio.slice(0, 10), [...(porDia.get(h.inicio.slice(0, 10)) ?? []), h])

  async function confirmar() {
    if (!escolhido || salvando) return
    setSalvando(true)
    setErroEnvio(null)
    try {
      if (encontro) await post(`/portal/mentorias/encontros/${encontro.id}/reagendar`, { inicio: escolhido })
      else await post(`/portal/mentorias/itens/${itemId}/reservar`, { inicio: escolhido })
      fb.sucesso(encontro ? `Encontro remarcado para ${dataHora(escolhido)}.` : `Encontro marcado para ${dataHora(escolhido)}.`)
      onConcluir()
      onFechar()
    } catch (e) {
      setErroEnvio(mensagemDeErro(e))
      recarregar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      aberto
      titulo={titulo}
      descricao={dados?.profissional_nome ? `Horários livres de ${dados.profissional_nome}${dados.duracao_min ? ` · ${dados.duracao_min} min` : ''}` : undefined}
      onFechar={onFechar}
      bloqueado={salvando}
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn-primary min-w-24" disabled={!escolhido || salvando} aria-busy={salvando} onClick={() => void confirmar()}>
            {salvando ? 'Salvando…' : encontro ? 'Remarcar' : 'Confirmar horário'}
          </button>
        </>
      }
    >
      {erroEnvio && <p className="mb-3 rounded bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{erroEnvio}</p>}
      {encontro && <p className="mb-3 text-sm text-ink-soft">Horário atual: {dataHora(encontro.data_agendada ?? encontro.inicio)}. Remarcar não usa outro encontro do seu saldo.</p>}
      {erro ? (
        <EstadoErro mensagem={erro} onTentar={recarregar} />
      ) : !dados ? (
        <Carregando texto="Buscando horários livres…" />
      ) : horarios.length === 0 ? (
        <p className="rounded border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">Não há horários livres nos próximos dias. A equipe abre novos horários com frequência; você também pode falar com o Suporte.</p>
      ) : (
        <fieldset>
          <legend className="sr-only">Escolha um horário</legend>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
            {[...porDia].map(([dia, lista]) => (
              <div key={dia}>
                <p className="mb-1.5 text-sm font-medium text-ink first-letter:uppercase">{diaDaSemana(dia)}</p>
                <div className="flex flex-wrap gap-2">
                  {lista.map((h) => (
                    <label key={h.inicio} className={cx('cursor-pointer rounded-[var(--radius-control)] border px-3 py-1.5 text-sm tabular-nums', escolhido === h.inicio ? 'border-brand-700 bg-brand-700 text-white' : 'border-line hover:border-brand-500/60')}>
                      <input type="radio" name="horario" value={h.inicio} className="sr-only" checked={escolhido === h.inicio} onChange={() => setEscolhido(h.inicio)} />
                      {h.inicio.slice(11, 16)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}
    </Dialog>
  )
}

export function DialogDesmarcar({ encontro, onFechar, onConcluir }: { encontro: Reg; onFechar: () => void; onConcluir: () => void }) {
  const [motivo, setMotivo] = useState('')
  const fb = useFeedback()
  return (
    <FormDialog
      aberto
      titulo="Desmarcar encontro"
      descricao={`${encontro.tipo ?? 'Encontro'} em ${dataHora(encontro.data_agendada ?? encontro.inicio)}. O encontro volta para o seu saldo e o horário fica livre.`}
      rotulo="Desmarcar"
      perigo
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/portal/mentorias/encontros/${encontro.id}/desmarcar`, { motivo })
        fb.sucesso('Encontro desmarcado. Ele voltou para o seu saldo.')
        onConcluir()
      }}
    >
      <Campo rotulo="Motivo (opcional)">{(p) => <textarea {...p} className="field-control min-h-20" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}</Campo>
    </FormDialog>
  )
}

export function DialogDepoimento({ alvo, atual, onFechar, onConcluir }: { alvo: { tipo: 'encontro' | 'atividade'; id: string; nome: string }; atual?: string; onFechar: () => void; onConcluir: () => void }) {
  const [texto, setTexto] = useState(atual ?? '')
  const fb = useFeedback()
  return (
    <FormDialog
      aberto
      titulo={atual ? 'Editar meu depoimento' : 'Deixar um depoimento'}
      descricao={`Sobre: ${alvo.nome}. Conte, com suas palavras, o que este encontro trouxe para você.`}
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/portal/depoimentos/${alvo.tipo}/${alvo.id}`, { texto })
        fb.sucesso('Depoimento salvo. Obrigada!')
        onConcluir()
      }}
    >
      <Campo rotulo="Seu depoimento" obrigatorio dica="Evite dados pessoais ou de clientes.">
        {(p) => <textarea {...p} className="field-control min-h-32" maxLength={3000} value={texto} onChange={(e) => setTexto(e.target.value)} />}
      </Campo>
    </FormDialog>
  )
}

const ORIGEM: Record<string, string> = { pacote: 'Do pacote', bonus: 'Bônus', ajuste: 'Personalização' }

/** Saldo por tipo de encontro (contratados, realizados, agendados e disponíveis) e marcação de horário. */
export function SaldoMentorias({ tipoId }: { tipoId?: string }) {
  const { dados, erro, recarregar } = useDados<Reg>('/portal/mentorias')
  const dep = useDados<Reg>('/portal/depoimentos')
  const [marcar, setMarcar] = useState<Reg | null>(null)
  const [remarcar, setRemarcar] = useState<Reg | null>(null)
  const [desmarcar, setDesmarcar] = useState<Reg | null>(null)
  const [depoimento, setDepoimento] = useState<Reg | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const tipos = ((dados.tipos ?? []) as Reg[]).filter((t) => !tipoId || t.tipo_id === tipoId)
  const antecedencia = Number(dados.antecedencia_horas ?? 24)
  const depoimentos = new Map(((dep.dados?.depoimentos ?? []) as Reg[]).map((d) => [`${d.alvo_tipo}:${d.alvo_id}`, d]))
  const atualizar = () => {
    recarregar()
    dep.recarregar()
  }

  if (tipos.length === 0)
    return (
      <section className="card p-4">
        <p className="text-sm text-ink-muted">Nenhum encontro contratado {tipoId ? 'deste tipo ' : ''}ainda.</p>
      </section>
    )

  return (
    <div className="space-y-4">
      {tipos.map((t) => (
        <section key={t.chave} className="card p-4" aria-labelledby={`tipo-${t.chave}`}>
          <h2 id={`tipo-${t.chave}`} className="font-display flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="size-5 text-gold" aria-hidden /> {t.nome}
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Contratados', t.contratada],
              ['Realizados', t.realizadas],
              ['Agendados', t.agendadas],
              ['Disponíveis para agendar', t.disponiveis],
            ].map(([r, v], i) => (
              <div key={r as string} className={cx('rounded-[var(--radius-control)] border px-3 py-2', i === 3 && Number(v) > 0 ? 'border-brand-500/40 bg-brand-50/50' : 'border-line')}>
                <dt className="text-xs text-ink-muted">{r}</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums text-ink">{v as number}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-muted">Inclui pacote, bônus e personalizações do seu contrato. Pendências de atividades nunca bloqueiam a marcação.</p>

          <ul className="mt-3 space-y-3">
            {(t.itens as Reg[]).map((i) => (
              <li key={i.id} className="rounded-[var(--radius-control)] border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {i.descricao} <Selo tom={i.origem === 'bonus' ? 'dourado' : 'neutro'}>{ORIGEM[i.origem] ?? i.origem}</Selo>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {i.realizadas} de {i.contratada} realizado(s) · {i.disponiveis} disponível(is)
                      {i.profissional_nome && ` · com ${i.profissional_nome}`}
                    </p>
                  </div>
                  {i.pode_agendar ? (
                    <button type="button" className="btn-primary btn-sm" onClick={() => setMarcar(i)}>
                      <CalendarClock className="size-4" aria-hidden /> Marcar horário
                    </button>
                  ) : i.disponiveis > 0 && i.motivo_sem_agenda ? (
                    <p className="max-w-64 text-xs text-ink-muted">{i.motivo_sem_agenda}</p>
                  ) : null}
                </div>
                {(i.encontros as Reg[]).length > 0 && (
                  <ul className="mt-2 divide-y divide-line border-t border-line">
                    {(i.encontros as Reg[]).map((o) => {
                      const d = depoimentos.get(`encontro:${o.id}`)
                      return (
                        <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span>
                            {o.situacao === 'agendada' ? dataHora(o.data_agendada) : `Realizado em ${formatarData(o.data_realizada)}`}
                            {o.profissional_nome && <span className="text-ink-muted"> · {o.profissional_nome}</span>}
                          </span>
                          <span className="flex flex-wrap items-center gap-2">
                            <Selo tom={o.situacao === 'agendada' ? 'vinho' : 'sucesso'}>{o.situacao === 'agendada' ? 'Agendado' : 'Realizado'}</Selo>
                            <BotaoMeet link={o.link_reuniao} />
                            {o.situacao === 'agendada' && podeAlterar(o.data_agendada, antecedencia) && (
                              <>
                                <button type="button" className="btn-secondary btn-sm" onClick={() => setRemarcar({ ...o, item_id: i.id, tipo: t.nome })}>
                                  Remarcar
                                </button>
                                <button type="button" className="btn-ghost btn-sm" onClick={() => setDesmarcar({ ...o, tipo: t.nome })}>
                                  Desmarcar
                                </button>
                              </>
                            )}
                            {o.situacao === 'realizada' && (
                              <button type="button" className="btn-ghost btn-sm" onClick={() => setDepoimento({ id: o.id, nome: `${t.nome} de ${formatarData(o.data_realizada)}`, atual: d?.texto })}>
                                <MessageSquareQuote className="size-4" aria-hidden /> {d ? 'Editar depoimento' : 'Deixar depoimento'}
                              </button>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          {(t.itens as Reg[]).some((i: Reg) => i.encontros.some((o: Reg) => o.situacao === 'agendada' && !podeAlterar(o.data_agendada, antecedencia))) && (
            <p className="mt-2 text-xs text-ink-muted">Faltando menos de {antecedencia} h, fale com a equipe para remarcar ou desmarcar.</p>
          )}
        </section>
      ))}

      {marcar && <EscolherHorario itemId={marcar.id} titulo={`Marcar: ${marcar.descricao}`} onFechar={() => setMarcar(null)} onConcluir={atualizar} />}
      {remarcar && <EscolherHorario itemId={remarcar.item_id} encontro={remarcar} titulo={`Remarcar: ${remarcar.tipo}`} onFechar={() => setRemarcar(null)} onConcluir={atualizar} />}
      {desmarcar && <DialogDesmarcar encontro={desmarcar} onFechar={() => setDesmarcar(null)} onConcluir={atualizar} />}
      {depoimento && <DialogDepoimento alvo={{ tipo: 'encontro', id: depoimento.id, nome: depoimento.nome }} atual={depoimento.atual} onFechar={() => setDepoimento(null)} onConcluir={atualizar} />}
    </div>
  )
}
