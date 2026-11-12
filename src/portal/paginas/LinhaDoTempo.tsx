import { useEffect, useRef } from 'react'
import { ArrowLeft, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock, Gem, GraduationCap, PlayCircle, Sparkles } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { post, useDados, type Reg } from '../../lib/api'
import { cx } from '../../lib/format'
import { formatarData } from '../../../shared/datas'
import { hrefAluna } from '../rotas'

const dois = (n: number) => String(n).padStart(2, '0')
const NOME_MES = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
const ANO = (iso: string) => iso.slice(0, 4)
const periodo = (m: Reg) => (m.inicio.slice(0, 7) === m.fim.slice(0, 7) ? `${NOME_MES(m.inicio)} ${ANO(m.inicio)}` : `${NOME_MES(m.inicio)} – ${NOME_MES(m.fim)} ${ANO(m.fim)}`)

const SITUACAO: Record<string, { rotulo: string; icone: typeof Clock }> = {
  concluido: { rotulo: 'Concluído', icone: CheckCircle2 },
  atual: { rotulo: 'Mês atual', icone: Sparkles },
  futuro: { rotulo: 'Próximo', icone: Clock },
}

/** Faixa de progresso das aulas do mês, ou o aviso de que o mês não contabiliza progresso. */
export function BarraProgresso({ progresso, className }: { progresso: number | null; className?: string }) {
  if (progresso === null) return <p className={cx('text-sm italic text-ink-muted', className)}>Não contabiliza progresso</p>
  return (
    <div className={className}>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label="Aulas assistidas no mês">
        <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${progresso}%` }} />
      </div>
      <p className="mt-1 text-sm text-ink-soft">{progresso}% concluído</p>
    </div>
  )
}

/** Linha do tempo do plano no Início: um card por mês, do início ao encerramento. */
export function LinhaDoTempo({ linha }: { linha: Reg }) {
  const trilho = useRef<HTMLDivElement>(null)
  const meses = (linha.meses ?? []) as Reg[]
  useEffect(() => {
    const el = trilho.current?.querySelector<HTMLElement>('[data-atual="true"]')
    if (el && trilho.current) trilho.current.scrollLeft = Math.max(0, el.offsetLeft - trilho.current.offsetLeft - 8)
  }, [meses.length])
  if (!meses.length) return null
  const rolar = (dir: number) => trilho.current?.scrollBy({ left: dir * (trilho.current.clientWidth * 0.8), behavior: 'smooth' })

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="titulo-linha-tempo">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-5 text-gold" aria-hidden />
          <h2 id="titulo-linha-tempo" className="font-display text-lg font-semibold">Linha do tempo do seu plano</h2>
        </div>
        <div className="hidden gap-1 sm:flex">
          <button type="button" className="btn-ghost btn-sm" onClick={() => rolar(-1)} aria-label="Meses anteriores">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => rolar(1)} aria-label="Próximos meses">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        {meses.length} {meses.length === 1 ? 'mês' : 'meses'} de acompanhamento, de {formatarData(meses[0].inicio)} a {formatarData(meses[meses.length - 1].fim)}. A barra avança conforme você assiste às aulas de cada mês.
      </p>
      <div ref={trilho} className="-mx-2 flex snap-x snap-mandatory scroll-px-2 gap-3 overflow-x-auto px-2 pt-1 pb-2" role="list">
        {meses.map((m) => (
          <CartaoMes key={m.numero} m={m} programa={linha.programa} />
        ))}
      </div>
    </section>
  )
}

function CartaoMes({ m, programa }: { m: Reg; programa: string | null }) {
  const s = SITUACAO[m.situacao] ?? SITUACAO.futuro
  const Icone = s.icone
  const atual = m.situacao === 'atual'
  return (
    <a
      href={hrefAluna('mes', String(m.numero))}
      role="listitem"
      data-atual={atual}
      className={cx(
        'group flex w-[17.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-card)] border bg-surface shadow-sm transition hover:shadow-md sm:w-[19rem]',
        atual ? 'border-gold-line ring-2 ring-gold/40' : 'border-line',
      )}
    >
      <div
        className={cx(
          'relative flex aspect-[16/8] flex-col justify-between overflow-hidden p-4 text-white',
          m.situacao === 'futuro' ? 'bg-gradient-to-br from-brand-500 to-[#b25a77]' : m.situacao === 'concluido' ? 'bg-gradient-to-br from-brand-700 to-brand-600' : 'bg-gradient-to-br from-brand-700 to-brand-500',
        )}
      >
        <Gem className="absolute -right-6 -bottom-8 size-36 text-white/10" aria-hidden />
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium tracking-[0.18em] text-[#f1dfb8] uppercase">{programa ?? 'Seu plano'}</span>
          <Gem className="size-5 text-[#e6cf9c]" aria-hidden />
        </div>
        <div>
          <p className="font-display text-4xl leading-none font-semibold">Mês {dois(m.numero)}</p>
          <p className="mt-1 text-sm text-white/85 first-letter:uppercase">{periodo(m)}</p>
        </div>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink shadow-sm">
          <Icone className="size-3.5" aria-hidden /> {s.rotulo}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-semibold leading-snug text-ink">
          {dois(m.numero)}. Mês {m.numero} {programa && <span className="font-normal text-ink-soft">| {programa}</span>}
        </p>
        <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
          <GraduationCap className="size-4" aria-hidden /> {m.aulas ? `${m.assistidas} de ${m.aulas} aula(s) assistida(s)` : 'Sem aulas gravadas neste mês'}
        </p>
        <div className="flex justify-between gap-2 text-xs whitespace-nowrap text-ink-soft sm:text-sm">
          <span>Início: {formatarData(m.inicio)}</span>
          <span>Encerra: {formatarData(m.fim)}</span>
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <BarraProgresso progresso={m.progresso} className="flex-1" />
          <PlayCircle className="size-6 shrink-0 text-brand-600 transition group-hover:scale-110" aria-hidden />
        </div>
      </div>
    </a>
  )
}

/* ---------------- Página de um mês: as aulas, com o progresso gravado pelo player ---------------- */

export function MesDoPlano({ numero }: { numero: string | undefined }) {
  const { dados, erro, recarregar } = useDados<Reg>(numero ? `/portal/linha-do-tempo/${numero}` : null)
  if (!numero) return <EstadoErro mensagem="Escolha um mês na linha do tempo do Início." onTentar={() => (window.location.hash = hrefAluna('inicio'))} />
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const m = dados.mes as Reg
  const aulas = dados.aulas as Reg[]
  return (
    <div className="space-y-4">
      <a href={hrefAluna('inicio')} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Voltar ao Início
      </a>
      <section className="card p-5">
        <p className="text-xs font-medium tracking-[0.18em] text-gold uppercase">{dados.programa ?? 'Seu plano'}</p>
        <h2 className="font-display mt-1 text-2xl font-semibold">Mês {dois(m.numero)}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Início: {formatarData(m.inicio)} · Encerra: {formatarData(m.fim)} · {SITUACAO[m.situacao]?.rotulo}
        </p>
        <BarraProgresso progresso={m.progresso} className="mt-3 max-w-md" />
      </section>
      {!aulas.length ? (
        <section className="card p-5 text-sm text-ink-soft">A equipe ainda não publicou aulas gravadas para este mês. Seus encontros e atividades continuam na Jornada e em Mentorias.</section>
      ) : (
        aulas.map((a) => <Aula key={a.id} aula={a} limite={dados.percentual_assistida} onProgresso={recarregar} />)
      )}
    </div>
  )
}

/**
 * Player do Vimeo com a API de mensagens do próprio player (sem script externo): a cada avanço de 5%,
 * o ponto alcançado é enviado ao servidor, que guarda o maior valor.
 */
function Aula({ aula, limite, onProgresso }: { aula: Reg; limite: number; onProgresso: () => void }) {
  const quadro = useRef<HTMLIFrameElement>(null)
  const enviado = useRef<number>(aula.percentual ?? 0)
  const assistida = (aula.percentual ?? 0) >= limite
  useEffect(() => {
    const origem = 'https://player.vimeo.com'
    const registrar = () => {
      for (const ev of ['timeupdate', 'ended']) quadro.current?.contentWindow?.postMessage(JSON.stringify({ method: 'addEventListener', value: ev }), origem)
    }
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== origem || e.source !== quadro.current?.contentWindow) return
      let msg: Reg
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (msg.event === 'ready') return registrar()
      const pct = msg.event === 'ended' ? 100 : msg.event === 'timeupdate' ? Math.floor(Number(msg.data?.percent ?? 0) * 100) : null
      if (pct === null) return
      const cruzouLimite = enviado.current < limite && pct >= limite
      if (pct < enviado.current + 5 && !cruzouLimite) return
      const anterior = enviado.current
      enviado.current = pct
      post(`/portal/aulas/${aula.id}/progresso`, { percentual: pct })
        .then(() => {
          if (anterior < limite && pct >= limite) onProgresso()
        })
        .catch(() => {
          enviado.current = anterior
        })
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [aula.id, limite, onProgresso])
  const src = `${aula.video_url}${aula.video_url.includes('?') ? '&' : '?'}api=1&player_id=aula-${aula.id}`
  return (
    <section className="card overflow-hidden">
      <div className="aspect-video bg-black">
        <iframe ref={quadro} id={`aula-${aula.id}`} src={src} title={aula.titulo} className="size-full" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{aula.titulo}</h3>
          {assistida ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Assistida
            </span>
          ) : (
            <span className="text-sm text-ink-muted">{aula.percentual ? `${aula.percentual}% assistido` : 'Ainda não assistida'}</span>
          )}
        </div>
        {aula.descricao && <p className="text-sm whitespace-pre-line text-ink-soft">{aula.descricao}</p>}
      </div>
    </section>
  )
}
