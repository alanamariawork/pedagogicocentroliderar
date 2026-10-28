import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, Gem, KeyRound, LifeBuoy, Link as LinkIcon, LogOut, Sparkles } from 'lucide-react'
import { Carregando, EstadoErro } from '../components/Estados'
import { Campo, FormDialog, useValores } from '../components/Form'
import { Selo, SeloCadeado, SeloNaoIncluido, TOM_ATIVIDADE } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { Dialog } from '../components/Dialog'
import { FormSenha } from './Conta'
import { enviarArquivo, post, useDados, type Reg } from '../lib/api'
import { EscolherArquivos, ListaAnexos } from '../components/Anexos'
import { SITUACAO_ATIVIDADE, SITUACAO_MATRICULA, cx } from '../lib/format'
import { useSessao } from '../state/Sessao'
import { formatarData, hojeSP } from '../../shared/datas'

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
    document.title = 'Minha jornada · Diamante Business'
  }, [])

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center lg:max-w-6xl gap-3 px-4 py-3">
          <span className="inline-flex size-9 items-center justify-center rounded-full border border-gold-line text-gold">
            <Gem className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-display text-[15px] font-semibold text-brand-700">Diamante Business</p>
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
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 lg:max-w-6xl">
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

  // No celular, a trilha abre já mostrando a etapa em andamento
  const atual = (el: HTMLLIElement | null) => {
    const c = el?.closest('.overflow-x-auto')
    if (!el || !c || c.scrollLeft !== 0) return
    c.scrollLeft = el.getBoundingClientRect().left - c.getBoundingClientRect().left - 16
  }

  async function iniciar(a: Reg) {
    try {
      await post(`/portal/atividades/${a.id}/iniciar`)
      fb.sucesso('Atividade marcada como em execução.')
      recarregar()
    } catch (e) {
      fb.erro(e instanceof Error ? e.message : 'Não foi possível atualizar.')
    }
  }

  const etapa = (e: Reg) => (
    <>
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
                {(() => {
                  const ultimo = (a.evidencias as Reg[] | undefined)?.at(-1)
                  return ultimo?.anexos?.length ? (
                    <div className="mt-2">
                      <p className="text-xs text-ink-muted">Arquivos do seu último envio:</p>
                      <ListaAnexos anexos={ultimo.anexos} base="/api/portal/anexos" />
                    </div>
                  ) : null
                })()}
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
    </>
  )

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

      <Progresso etapas={etapas} />

      <section className="card p-4">
        <h2 className="font-display text-lg font-semibold">Minha trilha</h2>
        {!jornada ? (
          <p className="mt-2 text-sm text-ink-muted">Sua jornada ainda está sendo preparada pela equipe pedagógica.</p>
        ) : etapas.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nenhuma etapa definida ainda.</p>
        ) : (
          <>
            {/* A trilha na horizontal, da primeira à última etapa; no celular, desliza para o lado */}
            {etapas.length > 1 && <p className="mt-1 text-xs text-ink-muted lg:hidden">Deslize para o lado para ver as outras etapas.</p>}
            <div className="-mx-4 mt-3 snap-x snap-mandatory overflow-x-auto scroll-px-4 px-4 pb-2 lg:mx-0 lg:mt-4 lg:px-0">
              <ol className="flex min-w-max gap-3 lg:gap-4" aria-label="Etapas da trilha, da primeira à última">
                {etapas.map((e, n) => (
                  <li key={e.id} ref={e.situacao === 'liberada' ? atual : undefined} className="flex w-[78vw] max-w-72 shrink-0 snap-start flex-col lg:w-72">
                    <div className="mb-3 flex items-center gap-2" aria-hidden>
                      <span
                        className={cx(
                          'inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                          e.situacao === 'concluida' ? 'border-success bg-success text-white' : e.situacao === 'liberada' ? 'border-brand-700 bg-brand-700 text-white' : 'border-line-strong bg-surface text-ink-muted',
                        )}
                      >
                        {e.situacao === 'concluida' ? <CheckCircle2 className="size-4" /> : n + 1}
                      </span>
                      {n < etapas.length - 1 && <span className={cx('h-0.5 flex-1 rounded-full', e.situacao === 'concluida' ? 'bg-success' : 'bg-line-strong')} />}
                    </div>
                    <div className={cx('flex-1 rounded-[var(--radius-control)] border p-3', e.situacao === 'liberada' ? 'border-brand-500/40 bg-brand-50/40' : 'border-line')}>{etapa(e)}</div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </section>

      <Crescimento conquistas={dados.conquistas as Reg[]} inicio={m.data_inicio} />

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
  const [arquivos, setArquivos] = useState<File[]>([])
  return (
    <FormDialog
      aberto
      titulo="Enviar atividade"
      descricao={atividade.titulo}
      rotulo="Enviar"
      onFechar={onFechar}
      onEnviar={async () => {
        if (!valores.texto.trim() && !valores.link.trim() && !arquivos.length) throw new Error('Escreva o que você fez, cole um link ou anexe um arquivo.')
        const anexos: string[] = []
        for (const f of arquivos) anexos.push((await enviarArquivo<{ id: string }>(`/portal/atividades/${atividade.id}/anexos`, f)).id)
        await post(`/portal/atividades/${atividade.id}/evidencias`, { texto: valores.texto || null, link: valores.link || null, anexos })
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
      <EscolherArquivos arquivos={arquivos} onMudar={setArquivos} onErro={fb.erro} />
    </FormDialog>
  )
}

/** Quanto da trilha já foi concluído: cada etapa vale o mesmo; a etapa em andamento conta pelas atividades validadas. */
export function percentualTrilha(etapas: Reg[]): number {
  if (etapas.length === 0) return 0
  const soma = etapas.reduce((t, e) => {
    if (e.situacao === 'concluida') return t + 1
    if (e.situacao === 'liberada' && e.progresso?.total) return t + e.progresso.validadas / e.progresso.total
    return t
  }, 0)
  return Math.round((soma / etapas.length) * 100)
}

function Progresso({ etapas }: { etapas: Reg[] }) {
  if (etapas.length === 0) return null
  const pct = percentualTrilha(etapas)
  const concluidas = etapas.filter((e) => e.situacao === 'concluida').length
  return (
    <section className="card p-4" aria-labelledby="titulo-progresso">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-progresso" className="font-display text-lg font-semibold">
          Quanto já concluí
        </h2>
        <p className="text-sm text-ink-muted">
          {concluidas} de {etapas.length} etapa(s) concluída(s)
        </p>
      </div>
      <p className="font-display mt-1 text-4xl font-semibold text-brand-700 tabular-nums">
        {pct}%<span className="ml-2 align-middle font-sans text-sm font-normal text-ink-muted">da trilha</span>
      </p>
      <div className="mt-3 flex gap-0.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% da trilha concluída`}>
        {etapas.map((e) => {
          const parte = e.situacao === 'concluida' ? 100 : e.situacao === 'liberada' && e.progresso?.total ? (e.progresso.validadas / e.progresso.total) * 100 : 0
          return (
            <div key={e.id} className="min-w-0 flex-1">
              <div className="h-3 overflow-hidden rounded-[4px] bg-surface-muted">
                <div className={cx('h-full', e.situacao === 'concluida' ? 'bg-success' : 'bg-brand-500')} style={{ width: `${parte}%` }} />
              </div>
              <p className={cx('mt-1 truncate text-xs', e.situacao === 'bloqueada' ? 'text-ink-muted' : 'text-ink-soft')} title={e.titulo}>
                {e.titulo}
              </p>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink-muted">Cada etapa vale o mesmo. A etapa em andamento avança conforme a equipe valida suas atividades.</p>
    </section>
  )
}

/** Crescimento: conquistas validadas acumuladas ao longo do tempo (uma série, sem ranking). */
function Crescimento({ conquistas, inicio }: { conquistas: Reg[]; inicio: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)
  const [foco, setFoco] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(280, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pontos = [...conquistas].sort((a, b) => String(a.data).localeCompare(String(b.data)))
  const hoje = hojeSP()

  return (
    <section className="card p-4" aria-labelledby="titulo-crescimento">
      <h2 id="titulo-crescimento" className="font-display flex items-center gap-2 text-lg font-semibold">
        <Sparkles className="size-5 text-gold" aria-hidden /> Meu crescimento
      </h2>
      <p className="text-xs text-ink-muted">Conquistas validadas pela equipe, somadas ao longo do tempo. Sem comparação com outras alunas.</p>
      {pontos.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Suas conquistas validadas vão aparecer aqui e formar sua curva de crescimento.</p>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div ref={ref} className="relative min-w-0">
            <Grafico pontos={pontos} inicio={inicio < pontos[0].data ? inicio : pontos[0].data} fim={hoje > pontos[pontos.length - 1].data ? hoje : pontos[pontos.length - 1].data} largura={largura} foco={foco} setFoco={setFoco} />
          </div>
          <ol className="space-y-3 border-l-2 border-gold-line pl-4">
            {[...pontos].reverse().map((c) => {
              const n = pontos.indexOf(c)
              return (
                <li key={c.id} className={cx('relative rounded px-1', foco === n && 'bg-gold-soft')} onMouseEnter={() => setFoco(n)} onMouseLeave={() => setFoco(null)}>
                  <span className="absolute top-1.5 -left-[1.45rem] size-3 rounded-full border-2 border-gold bg-surface" aria-hidden />
                  <p className="font-medium">{c.titulo}</p>
                  <p className="text-xs text-ink-muted">{formatarData(c.data)}</p>
                  {c.resultado_percebido && <p className="text-sm text-ink-soft">{c.resultado_percebido}</p>}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}

function Grafico({ pontos, inicio, fim, largura, foco, setFoco }: { pontos: Reg[]; inicio: string; fim: string; largura: number; foco: number | null; setFoco: (n: number | null) => void }) {
  const altura = 200
  const m = { esq: 32, dir: 16, topo: 16, base: 28 }
  const w = largura - m.esq - m.dir
  const h = altura - m.topo - m.base
  const t0 = Date.parse(inicio + 'T12:00:00Z')
  const t1 = Math.max(Date.parse(fim + 'T12:00:00Z'), t0 + 86_400_000)
  const total = pontos.length
  const yMax = Math.max(total, 1)
  const x = (d: string) => m.esq + ((Date.parse(d + 'T12:00:00Z') - t0) / (t1 - t0)) * w
  const y = (v: number) => m.topo + h - (v / yMax) * h
  // Linha em degraus: o total sobe no dia de cada conquista.
  let caminho = `M${x(inicio)},${y(0)}`
  pontos.forEach((p, i) => {
    caminho += ` H${x(p.data)} V${y(i + 1)}`
  })
  caminho += ` H${x(fim)}`
  const area = `${caminho} V${y(0)} H${x(inicio)} Z`
  const passo = Math.max(1, Math.ceil(yMax / 4))
  const ticksY = Array.from({ length: Math.floor(yMax / passo) + 1 }, (_, i) => i * passo)
  // Marcas do eixo X: primeiro dia de cada mês no intervalo (no máximo 6).
  const meses: string[] = []
  for (let d = new Date(t0); d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 1, 1)) meses.push(d.toISOString().slice(0, 7) + '-01')
  const salto = Math.ceil(meses.length / 6)
  const ticksX = meses.filter((mm, i) => i % salto === 0 && Date.parse(mm + 'T12:00:00Z') >= t0)
  const nomeMes = (d: string) => new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z')).replace('.', '')
  const ativo = foco !== null ? pontos[foco] : null

  return (
    <>
      <svg width={largura} height={altura} role="img" aria-label={`Crescimento: ${total} conquista(s) validada(s) desde ${formatarData(inicio)}`} className="block max-w-full">
        {ticksY.map((v) => (
          <g key={v}>
            <line x1={m.esq} x2={m.esq + w} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={m.esq - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
              {v}
            </text>
          </g>
        ))}
        {ticksX.map((d) => (
          <text key={d} x={x(d)} y={altura - 8} textAnchor="middle" className="fill-ink-muted text-[11px]">
            {nomeMes(d)}
          </text>
        ))}
        <path d={area} fill="var(--color-brand-50)" />
        <path d={caminho} fill="none" stroke="var(--color-brand-500)" strokeWidth={2} strokeLinejoin="round" />
        {pontos.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(p.data)} cy={y(i + 1)} r={foco === i ? 7 : 5} fill="var(--color-brand-500)" stroke="var(--color-surface)" strokeWidth={2} />
            <circle
              cx={x(p.data)}
              cy={y(i + 1)}
              r={14}
              fill="transparent"
              tabIndex={0}
              aria-label={`${p.titulo}, ${formatarData(p.data)}`}
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
              onFocus={() => setFoco(i)}
              onBlur={() => setFoco(null)}
              className="cursor-pointer outline-none"
            />
          </g>
        ))}
        <text x={Math.min(x(pontos[total - 1].data) + 10, m.esq + w)} y={y(total) - 8} textAnchor={x(pontos[total - 1].data) + 10 > m.esq + w - 90 ? 'end' : 'start'} className="fill-ink-soft text-xs font-medium">
          {total} conquista{total === 1 ? '' : 's'}
        </text>
      </svg>
      {ativo && foco !== null && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-overlay)]"
          style={{ left: Math.min(Math.max(x(ativo.data) - 112, 0), largura - 224), top: Math.max(y(foco + 1) - 76, 0) }}
        >
          <p className="font-medium text-ink">{ativo.titulo}</p>
          <p className="text-ink-muted">
            {formatarData(ativo.data)} · {foco + 1}ª conquista
          </p>
        </div>
      )}
    </>
  )
}
