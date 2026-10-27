import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, Gem, KeyRound, LifeBuoy, Link as LinkIcon, LogOut, Sparkles } from 'lucide-react'
import { Carregando, EstadoErro } from '../components/Estados'
import { Campo, FormDialog, useValores } from '../components/Form'
import { Selo, SeloCadeado, SeloNaoIncluido, TOM_ATIVIDADE } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { Dialog } from '../components/Dialog'
import { FormSenha } from './Conta'
import { post, useDados, type Reg } from '../lib/api'
import { SITUACAO_ATIVIDADE, SITUACAO_MATRICULA, cx } from '../lib/format'
import { useSessao } from '../state/Sessao'
import { formatarData } from '../../shared/datas'

const SITUACAO_ENCONTRO_ALUNA: Record<string, string> = {
  prevista: 'Previsto',
  aguardando_agenda: 'Aguardando agenda',
  disponivel_agendar: 'Disponível para agendar',
  agendada: 'Agendado',
  realizada: 'Realizado',
  conferencia: 'Em conferência pela equipe',
}

const dataHora = (h: string) => `${formatarData(h.slice(0, 10))} às ${h.slice(11, 16)}`

export function Portal() {
  const { eu, sair } = useSessao()
  const { dados, erro, recarregar } = useDados('/portal')
  const [senha, setSenha] = useState(false)
  useEffect(() => {
    document.title = 'Minha jornada · Efeito Diamante'
  }, [])

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="inline-flex size-9 items-center justify-center rounded-full border border-gold-line text-gold">
            <Gem className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-display text-[15px] font-semibold text-brand-700">Efeito Diamante</p>
            <p className="text-[11px] text-ink-muted">Minha jornada</p>
          </div>
          <button type="button" className="btn-ghost p-2" aria-label="Alterar senha" onClick={() => setSenha(true)}>
            <KeyRound className="size-5" aria-hidden />
          </button>
          <button type="button" className="btn-ghost p-2" aria-label="Sair" onClick={sair}>
            <LogOut className="size-5" aria-hidden />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {eu?.trocar_senha && (
          <p role="status" className="rounded-[var(--radius-control)] border border-gold-line bg-gold-soft px-3 py-2 text-sm">
            Sua senha foi criada pela equipe.{' '}
            <button type="button" className="font-medium text-brand-700 underline" onClick={() => setSenha(true)}>
              Troque agora
            </button>
            .
          </p>
        )}
        {erro ? <EstadoErro mensagem={erro} onTentar={recarregar} /> : !dados ? <Carregando /> : <Conteudo dados={dados} recarregar={recarregar} />}
      </main>
      <Dialog aberto={senha} titulo="Alterar senha" onFechar={() => setSenha(false)}>
        <FormSenha />
      </Dialog>
    </div>
  )
}

function Conteudo({ dados, recarregar }: { dados: Reg; recarregar: () => void }) {
  const primeiroNome = String(dados.nome).split(' ')[0]
  const [enviar, setEnviar] = useState<Reg | null>(null)
  const fb = useFeedback()
  if (!dados.matricula)
    return (
      <section className="card p-5">
        <h1 className="font-display text-2xl font-semibold">Olá, {primeiroNome}!</h1>
        <p className="mt-2 text-sm text-ink-soft">Ainda não há uma matrícula ativa vinculada ao seu acesso. Se isso parecer errado, fale com a equipe.</p>
        <Ajuda texto={dados.ajuda} />
      </section>
    )
  const m = dados.matricula
  const jornada = dados.jornada as Reg | null
  const etapas = (jornada?.etapas ?? []) as Reg[]
  const encontros = dados.encontros as Reg[]
  const proximos = encontros.filter((o) => o.situacao !== 'realizada')
  const realizados = encontros.filter((o) => o.situacao === 'realizada').reverse()

  async function iniciar(a: Reg) {
    try {
      await post(`/portal/atividades/${a.id}/iniciar`)
      fb.sucesso('Atividade marcada como em execução.')
      recarregar()
    } catch (e) {
      fb.erro(e instanceof Error ? e.message : 'Não foi possível atualizar.')
    }
  }

  return (
    <>
      <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-brand-700 to-brand-500 p-5 text-white shadow-sm">
        <p className="text-sm text-white/80">Olá, {primeiroNome}!</p>
        <h1 className="font-display mt-0.5 text-2xl font-semibold">Seu próximo passo</h1>
        {dados.proximo_passo ? (
          <div className="mt-3 rounded-[var(--radius-control)] bg-white/10 p-3">
            <p className="font-medium">{dados.proximo_passo.titulo}</p>
            <p className="text-sm text-white/80">{dados.proximo_passo.detalhe}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/80">Nenhuma ação pendente agora. A equipe vai orientar o próximo passo.</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-white/70">Trilha</dt>
            <dd className="font-medium">{jornada?.trilha_nome ?? 'A definir com a equipe'}</dd>
          </div>
          <div>
            <dt className="text-white/70">Pilar atual</dt>
            <dd className="font-medium">{jornada?.pilar_nome ?? 'A definir com a equipe'}</dd>
          </div>
          <div>
            <dt className="text-white/70">Vigência</dt>
            <dd>
              {formatarData(m.data_inicio)} a {m.data_fim ? formatarData(m.data_fim) : 'a definir'}
            </dd>
          </div>
          <div>
            <dt className="text-white/70">Situação</dt>
            <dd>{SITUACAO_MATRICULA[m.situacao]}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="font-display text-lg font-semibold">Minha jornada</h2>
        {!jornada ? (
          <p className="mt-2 text-sm text-ink-muted">Sua jornada ainda está sendo preparada pela equipe pedagógica.</p>
        ) : etapas.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nenhuma etapa definida ainda.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {etapas.map((e) => (
              <li key={e.id} className={cx('rounded-[var(--radius-control)] border p-3', e.situacao === 'liberada' ? 'border-brand-500/40 bg-brand-50/40' : 'border-line')}>
                <div className="flex flex-wrap items-center gap-2">
                  {e.situacao === 'concluida' ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : null}
                  <h3 className="font-medium text-ink">{e.titulo}</h3>
                  {e.situacao === 'bloqueada' ? <SeloCadeado /> : e.situacao === 'concluida' ? <Selo tom="sucesso">Concluída</Selo> : <Selo tom="vinho">Liberada</Selo>}
                </div>
                <p className="text-xs text-ink-muted">
                  {[e.trilha_nome, e.pilar_nome].filter(Boolean).join(' · ')} · {e.prazo_individual ? `Prazo: ${formatarData(e.prazo_individual)}` : 'Sem prazo definido'}
                </p>
                {e.objetivo && <p className="mt-1 text-sm text-ink-soft">{e.objetivo}</p>}
                {e.situacao !== 'bloqueada' && <p className="mt-1 text-xs text-ink-muted">{e.progresso.texto}</p>}
                {e.falta.length > 0 && e.situacao === 'bloqueada' && (
                  <div className="mt-2 rounded bg-surface-muted px-3 py-2 text-xs text-ink-soft">
                    <p className="font-medium">O que falta para liberar:</p>
                    <ul className="list-disc pl-4">
                      {(e.falta as string[]).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {e.situacao !== 'bloqueada' && (e.links as Reg[]).length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {(e.links as Reg[]).map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 underline">
                          <LinkIcon className="size-3.5" aria-hidden /> {l.titulo}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {e.situacao !== 'bloqueada' && (e.atividades as Reg[]).length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {(e.atividades as Reg[]).map((a) => {
                      const revisao = [...(a.validacoes as Reg[])].reverse().find((v) => v.decisao === 'em_revisao')
                      return (
                        <li key={a.id} className="rounded border border-line bg-surface p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">{a.titulo}</p>
                            <Selo tom={TOM_ATIVIDADE[a.situacao]}>{SITUACAO_ATIVIDADE[a.situacao]}</Selo>
                          </div>
                          {a.descricao && <p className="mt-1 text-sm text-ink-soft">{a.descricao}</p>}
                          <p className="text-xs text-ink-muted">{a.prazo ? `Prazo: ${formatarData(a.prazo)}` : 'Sem prazo definido'}</p>
                          {a.link && (
                            <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 underline">
                              <LinkIcon className="size-3.5" aria-hidden /> Abrir material
                            </a>
                          )}
                          {a.situacao === 'em_revisao' && revisao?.comentario && (
                            <p className="mt-2 rounded bg-warning-soft px-3 py-2 text-sm text-warning">Pedido de revisão: {revisao.comentario}</p>
                          )}
                          {e.situacao === 'liberada' && a.situacao !== 'validada' && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {a.situacao === 'pendente' && (
                                <button type="button" className="btn-secondary btn-sm" onClick={() => void iniciar(a)}>
                                  Comecei
                                </button>
                              )}
                              {a.situacao !== 'enviada' && (
                                <button type="button" className="btn-primary btn-sm" onClick={() => setEnviar(a)}>
                                  {a.situacao === 'em_revisao' ? 'Enviar novamente' : 'Enviar o que fiz'}
                                </button>
                              )}
                              {a.situacao === 'enviada' && <p className="text-xs text-ink-muted">Enviada. Aguardando validação da equipe.</p>}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="size-5 text-gold" aria-hidden /> Meus encontros
        </h2>
        <p className="text-xs text-ink-muted">Pendências de atividades nunca bloqueiam encontros contratados.</p>
        {encontros.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nenhum encontro registrado ainda.</p>
        ) : (
          <>
            {proximos.length > 0 && (
              <ul className="mt-3 divide-y divide-line">
                {proximos.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium">{o.item_descricao}</span>
                      {o.profissional_nome && <span className="text-ink-muted"> · {o.profissional_nome}</span>}
                      <span className="block text-xs text-ink-muted">
                        {o.situacao === 'agendada' && o.data_agendada ? dataHora(o.data_agendada) : o.data_prevista ? `Previsão: ${formatarData(o.data_prevista)}` : 'Sem prazo definido'}
                      </span>
                    </span>
                    <Selo tom={o.situacao === 'agendada' ? 'vinho' : 'neutro'}>{SITUACAO_ENCONTRO_ALUNA[o.situacao] ?? o.situacao}</Selo>
                  </li>
                ))}
              </ul>
            )}
            {realizados.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Encontros realizados ({realizados.length})</summary>
                <ul className="mt-2 divide-y divide-line">
                  {realizados.map((o) => (
                    <li key={o.id} className="py-2 text-sm">
                      <p>
                        <span className="font-medium">{o.item_descricao}</span> <span className="text-xs text-ink-muted">· {formatarData(o.data_realizada)}</span>
                      </p>
                      {o.resumo_compartilhavel && <p className="text-ink-soft">{o.resumo_compartilhavel}</p>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {(dados.nao_incluidos as Reg[]).length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="text-sm font-medium text-ink-soft">Outros formatos do programa</h3>
            <ul className="mt-2 space-y-1.5">
              {(dados.nao_incluidos as Reg[]).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{t.nome}</span>
                  <SeloNaoIncluido />
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-muted">Esses formatos não fazem parte do seu contrato atual. Se tiver interesse, converse com a equipe.</p>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-gold" aria-hidden /> Minhas conquistas
        </h2>
        {(dados.conquistas as Reg[]).length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Suas conquistas validadas pela equipe vão aparecer aqui.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-gold-line pl-4">
            {(dados.conquistas as Reg[]).map((c) => (
              <li key={c.id} className="relative">
                <span className="absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-2 border-gold bg-surface" aria-hidden />
                <p className="font-medium">{c.titulo}</p>
                <p className="text-xs text-ink-muted">{formatarData(c.data)}</p>
                {c.resultado_percebido && <p className="text-sm text-ink-soft">{c.resultado_percebido}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card p-4">
        <Ajuda texto={dados.ajuda} />
      </section>

      {enviar && <DialogEvidencia atividade={enviar} onFechar={() => setEnviar(null)} onConcluir={recarregar} />}
    </>
  )
}

function Ajuda({ texto }: { texto: string }) {
  return (
    <div className="mt-2 flex gap-3">
      <LifeBuoy className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
      <div>
        <h2 className="font-display text-base font-semibold">Precisa de ajuda?</h2>
        <p className="text-sm whitespace-pre-line text-ink-soft">{texto}</p>
      </div>
    </div>
  )
}

function DialogEvidencia({ atividade, onFechar, onConcluir }: { atividade: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ texto: '', link: '' })
  return (
    <FormDialog
      aberto
      titulo="Enviar atividade"
      descricao={atividade.titulo}
      rotulo="Enviar"
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/portal/atividades/${atividade.id}/evidencias`, { texto: valores.texto || null, link: valores.link || null })
        fb.sucesso('Enviado! A equipe vai analisar.')
        onConcluir()
      }}
    >
      <Campo rotulo="O que você fez" dica="Conte de forma objetiva. Não precisa incluir informações pessoais ou sensíveis.">
        {(p) => <textarea rows={4} maxLength={4000} className="field-control" {...p} value={valores.texto} onChange={campo('texto')} />}
      </Campo>
      <Campo rotulo="Link (opcional)" dica="Ex.: documento, planilha ou vídeo compartilhado.">
        {(p) => <input type="url" inputMode="url" className="field-control" placeholder="https://" {...p} value={valores.link} onChange={campo('link')} />}
      </Campo>
    </FormDialog>
  )
}
