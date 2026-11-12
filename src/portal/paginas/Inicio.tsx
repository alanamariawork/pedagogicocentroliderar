import { useState } from 'react'
import { ArrowRight, Bell, CalendarDays, ExternalLink, MessagesSquare, Quote, RefreshCw, Target, Trophy } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { Selo, SeloPilar } from '../../components/Selos'
import { useDados, type Reg } from '../../lib/api'
import { cx } from '../../lib/format'
import { formatarData } from '../../../shared/datas'
import { hrefAluna } from '../rotas'
import { progressoMeta } from '../metas'
import { LinhaDoTempo } from './LinhaDoTempo'

const dataHora = (h: string) => `${formatarData(h.slice(0, 10))} às ${h.slice(11, 16)}`

function dataPorExtenso(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** Tela inicial da aluna: sempre mostra o próximo passo. */
export function Inicio() {
  const { dados, erro, recarregar } = useDados('/portal/inicio')
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const primeiroNome = String(dados.nome).split(' ')[0]
  const m = dados.matricula as Reg | null

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-card)] bg-gradient-to-br from-brand-700 to-brand-500 p-5 text-white shadow-sm">
        <p className="text-sm text-white/80 first-letter:uppercase">{dataPorExtenso(dados.hoje)}</p>
        <h2 className="font-display mt-0.5 text-2xl font-semibold">Olá, {primeiroNome}!</h2>
        {m ? (
          <p className="mt-1 text-sm text-white/85">
            {dados.semana ? `Semana ${dados.semana} do programa` : `Seu programa começa em ${formatarData(m.data_inicio)}`}
            {m.programa_nome && ` · ${m.programa_nome}`}
            {m.turma_nome && ` · ${m.turma_nome}`}
          </p>
        ) : (
          <p className="mt-1 text-sm text-white/85">Ainda não há uma matrícula ativa vinculada ao seu acesso. Se isso parecer errado, fale com a equipe.</p>
        )}
        {m && <ProximoPasso dados={dados} />}
      </section>

      {m && dados.linha_tempo && <LinhaDoTempo linha={dados.linha_tempo} />}

      {m && dados.resumo && <ResumoExecutivo resumo={dados.resumo} ultima={(dados.mentorias?.ultimas ?? [])[0] ?? null} />}

      {m && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <ProximosEncontros encontros={dados.proximos_encontros} />
            <MentoriasRealizadas mentorias={dados.mentorias} contratadas={dados.resumo?.mentorias?.contratadas ?? null} />
            <Indicadores metas={dados.metas} />
          </div>
          <div className="space-y-4">
            <Avisos avisos={dados.avisos ?? []} />
            <Atalhos atalhos={dados.atalhos} />
            <FraseDoDia frases={dados.frases} />
          </div>
        </div>
      )}
      {!m && (
        <div className="grid gap-4 md:grid-cols-2">
          <Avisos avisos={dados.avisos ?? []} />
          <Atalhos atalhos={dados.atalhos} />
          <FraseDoDia frases={dados.frases} />
        </div>
      )}
    </div>
  )
}

function ProximoPasso({ dados }: { dados: Reg }) {
  const e = dados.proxima_etapa as Reg | null
  const s = dados.sugestao as Reg | null
  return (
    <div className="mt-4 rounded-[var(--radius-control)] bg-white/10 p-4">
      <p className="text-xs font-medium tracking-wide text-white/75 uppercase">Seu próximo passo</p>
      {e ? (
        <>
          <p className="font-display mt-1 text-lg font-semibold">
            Etapa {e.numero} de {e.total}: {e.titulo}
          </p>
          <p className="text-sm text-white/85">
            {e.situacao === 'bloqueada' ? 'Não iniciada: a equipe libera esta etapa quando os pré-requisitos estiverem prontos.' : 'Em andamento.'}
            {s && e.situacao !== 'bloqueada' && ` ${s.titulo}.`}
          </p>
          <a href={hrefAluna('jornada', e.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
            Ir para a etapa <ArrowRight className="size-4" aria-hidden />
          </a>
        </>
      ) : dados.jornada_concluida ? (
        <p className="mt-1 text-sm">Você concluiu todas as etapas da jornada. Parabéns!</p>
      ) : (
        <>
          <p className="mt-1 text-sm">{s ? s.titulo : 'Sua jornada ainda está sendo preparada pela equipe pedagógica.'}</p>
          {s?.detalhe && <p className="text-sm text-white/80">{s.detalhe}</p>}
        </>
      )}
    </div>
  )
}

function Cartao({ titulo, icone: Icone, acao, children }: { titulo: string; icone: typeof Trophy; acao?: { href: string; rotulo: string }; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display flex items-center gap-2 text-base font-semibold">
          <Icone className="size-4.5 text-gold" aria-hidden /> {titulo}
        </h2>
        {acao && (
          <a href={acao.href} className="text-sm text-brand-700 hover:underline">
            {acao.rotulo}
          </a>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Vazio({ texto, acao }: { texto: string; acao?: { href: string; rotulo: string } }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface-muted/50 px-4 py-5 text-center text-sm text-ink-muted">
      <p>{texto}</p>
      {acao && (
        <a href={acao.href} className="btn-secondary btn-sm mt-3">
          {acao.rotulo}
        </a>
      )}
    </div>
  )
}

function ProximosEncontros({ encontros }: { encontros: Reg[] }) {
  return (
    <Cartao titulo="Próximos encontros" icone={CalendarDays} acao={{ href: hrefAluna('agenda'), rotulo: 'Minha agenda' }}>
      {encontros.length === 0 ? (
        <Vazio texto="Nenhum encontro agendado. Você pode marcar um horário em Mentorias." acao={{ href: hrefAluna('mentorias'), rotulo: 'Marcar um encontro' }} />
      ) : (
        <ul className="divide-y divide-line">
          {encontros.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium">{o.item_descricao}</span>
                {o.profissional_nome && <span className="text-ink-muted"> · {o.profissional_nome}</span>}
                <span className="block text-xs text-ink-muted">{dataHora(o.data_agendada)}</span>
              </span>
              <Selo tom="vinho">Agendado</Selo>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function MentoriasRealizadas({ mentorias, contratadas }: { mentorias: Reg; contratadas: number | null }) {
  return (
    <Cartao titulo="Mentorias realizadas" icone={MessagesSquare} acao={{ href: hrefAluna('mentorias'), rotulo: 'Ver todas' }}>
      {mentorias.total === 0 ? (
        <Vazio texto="Você ainda não teve encontros realizados. Eles aparecem aqui depois que a equipe registra cada um." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <div>
            <p className="font-display text-4xl font-semibold text-brand-700 tabular-nums">{mentorias.total}</p>
            <p className="text-xs text-ink-muted">{contratadas ? `de ${contratadas} encontro(s) contratado(s)` : 'encontro(s) realizado(s)'}</p>
            <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
              {(mentorias.por_tipo as Reg[]).map((t) => (
                <li key={t.tipo} className="flex justify-between gap-2">
                  <span className="truncate">{t.tipo}</span>
                  <span className="tabular-nums">{t.total}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-muted">Últimas</p>
            <ul className="divide-y divide-line text-sm">
              {(mentorias.ultimas as Reg[]).map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span className="min-w-0">
                    {o.tipo}
                    {o.profissional_nome && <span className="text-ink-muted"> · {o.profissional_nome}</span>}
                  </span>
                  <span className="text-xs text-ink-muted tabular-nums">{formatarData(o.data)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Cartao>
  )
}

function Indicadores({ metas }: { metas: Reg[] }) {
  return (
    <Cartao titulo="Meus indicadores" icone={Target} acao={metas.length ? { href: hrefAluna('diagnostico', 'objetivos'), rotulo: 'Atualizar' } : undefined}>
      {metas.length === 0 ? (
        <Vazio texto="Você ainda não definiu metas. Elas mostram onde você começou, onde quer chegar e onde está agora." acao={{ href: hrefAluna('diagnostico', 'objetivos'), rotulo: 'Definir minhas metas' }} />
      ) : (
        <ul className="space-y-3">
          {metas.map((mt) => {
            const p = progressoMeta(mt)
            return (
              <li key={mt.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{mt.nome}</span>
                  {p.pct !== null && <span className="text-xs text-ink-muted tabular-nums">{p.pct}% do caminho</span>}
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={p.pct ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label={mt.nome}>
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.pct ?? 0}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{p.texto}</p>
              </li>
            )
          })}
        </ul>
      )}
    </Cartao>
  )
}

/**
 * Resumo executivo da aluna (o mesmo da ficha, só com o que a aluna pode ver): programa, etapa atual,
 * próximo encontro e vigência. Nos últimos dias da vigência (janela configurada, 45 dias), o término
 * fica em destaque.
 */
function ResumoExecutivo({ resumo, ultima }: { resumo: Reg; ultima: Reg | null }) {
  const mt = (resumo.mentorias ?? {}) as Reg
  const v = resumo.vigencia as Reg
  const etapa = resumo.etapa_atual as Reg | null
  const enc = resumo.proximo_encontro as Reg | null
  const Item = ({ rotulo, children, destaque }: { rotulo: string; children: React.ReactNode; destaque?: boolean }) => (
    <div className={cx('min-w-0 rounded-[var(--radius-control)] border px-3 py-2.5', destaque ? 'border-gold-line bg-gold-soft' : 'border-line bg-surface')}>
      <dt className="text-xs font-medium text-ink-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  )
  return (
    <section className="card p-4" aria-labelledby="resumo-titulo">
      <h2 id="resumo-titulo" className="font-display text-base font-semibold">
        Resumo executivo
      </h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Item rotulo="Programa">{resumo.programa ?? 'A definir pela equipe'}</Item>
        <Item rotulo="Etapa atual">
          {etapa ? (
            <>
              <a href={hrefAluna('trilhas')} className="font-medium text-brand-700 hover:underline">
                {etapa.titulo}
              </a>
              {etapa.pilar_nome && (
                <span className="mt-1 block">
                  <SeloPilar pilar={{ nome: etapa.pilar_nome, cor: etapa.pilar_cor, ordem: etapa.pilar_ordem }} />
                </span>
              )}
              <span className="mt-0.5 block text-xs text-ink-muted">{etapa.prazo_individual ? `Prazo da etapa: ${formatarData(etapa.prazo_individual)}` : 'Sem prazo definido para a etapa'}</span>
            </>
          ) : (
            'Sua jornada ainda está sendo preparada'
          )}
        </Item>
        <Item rotulo="Próximo encontro">
          {enc ? (
            <>
              <span className="font-medium">{enc.tipo}</span>
              <span className="block text-xs text-ink-muted">
                {dataHora(enc.data)}
                {enc.profissional_nome && ` · ${enc.profissional_nome}`}
              </span>
            </>
          ) : (
            <a href={hrefAluna('mentorias')} className="text-brand-700 hover:underline">
              Nenhum agendado. Marcar um encontro
            </a>
          )}
        </Item>
        <Item rotulo="Vigência do contrato" destaque={v.destacar}>
          {v.data_fim ? (
            <>
              <span className="font-medium">Até {formatarData(v.data_fim)}</span>
              <span className={cx('block text-xs', v.destacar ? 'font-medium text-brand-700' : 'text-ink-muted')}>
                {v.texto}
                {v.destacar && ' · converse com a equipe sobre a continuidade'}
              </span>
            </>
          ) : (
            <span className="font-medium">Sem prazo definido</span>
          )}
        </Item>
        <Item rotulo="Mentorias">
          {mt.contratadas ? (
            <>
              <span className="font-display text-lg font-semibold tabular-nums">
                {mt.realizadas}/{mt.contratadas}
              </span>
              <span className="block text-xs text-ink-muted">realizadas / contratadas</span>
            </>
          ) : (
            'Nenhuma contratada'
          )}
        </Item>
        <Item rotulo="Última mentoria">
          {ultima ? (
            <>
              <span className="font-medium">{formatarData(String(ultima.data).slice(0, 10))}</span>
              <span className="block text-xs text-ink-muted">{[ultima.tipo, ultima.profissional_nome].filter(Boolean).join(' · ')}</span>
            </>
          ) : (
            'Nenhuma ainda'
          )}
        </Item>
        <Item rotulo="Presença">
          <span className="font-medium">Sem registro</span>
          <span className="block text-xs text-ink-muted">a equipe ainda vai definir como registrar</span>
        </Item>
        <Item rotulo="Próxima ação">
          {resumo.proximo_passo?.titulo ? (
            <>
              <span className="font-medium">{resumo.proximo_passo.titulo}</span>
              {resumo.proximo_passo.detalhe && <span className="block text-xs text-ink-muted">{resumo.proximo_passo.detalhe}</span>}
            </>
          ) : (
            'A equipe vai combinar com você'
          )}
        </Item>
      </dl>
    </section>
  )
}

/** Avisos da equipe: os mesmos do sino. Um aviso programado só aparece quando chega a data. */
function Avisos({ avisos }: { avisos: Reg[] }) {
  return (
    <Cartao titulo="Avisos" icone={Bell}>
      {avisos.length === 0 ? (
        <Vazio texto="Nenhum aviso da equipe por enquanto." />
      ) : (
        <ul className="divide-y divide-line">
          {avisos.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              <p className={cx(!a.lida_em && 'font-medium')}>
                {a.link ? (
                  <a href={a.link} className="hover:underline">
                    {a.titulo}
                  </a>
                ) : (
                  a.titulo
                )}
              </p>
              {a.detalhe && <p className="text-ink-soft">{a.detalhe}</p>}
              <p className="text-xs text-ink-muted">{formatarData(String(a.criado_em).slice(0, 10))}</p>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function Atalhos({ atalhos }: { atalhos: Reg[] }) {
  return (
    <Cartao titulo="Atalhos" icone={ExternalLink} acao={{ href: hrefAluna('links'), rotulo: 'Todos os links' }}>
      {atalhos.length === 0 ? (
        <Vazio texto="A equipe ainda não cadastrou os atalhos (WhatsApp do suporte, grupo de avisos, agendamento)." />
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {atalhos.map((l) => (
            <li key={l.id} className="min-w-0">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2 text-sm hover:border-brand-500/50 hover:bg-brand-50/50">
                <span className="truncate">{l.titulo}</span>
                <ExternalLink className="size-4 shrink-0 text-ink-muted" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

function FraseDoDia({ frases }: { frases: Reg[] }) {
  // A frase do dia muda a cada dia; "Próxima" passa para a seguinte sem salvar nada.
  const inicial = frases.length ? Math.floor(Date.now() / 86_400_000) % frases.length : 0
  const [n, setN] = useState(inicial)
  if (frases.length === 0) return null
  const f = frases[n % frases.length]
  return (
    <section className="card bg-gold-soft/60 p-4">
      <Quote className="size-5 text-gold" aria-hidden />
      <blockquote className="font-display mt-1 text-lg leading-snug text-ink">{f.texto}</blockquote>
      {f.autoria && <p className="mt-1 text-xs text-ink-muted">{f.autoria}</p>}
      {frases.length > 1 && (
        <button type="button" className={cx('btn-ghost btn-sm mt-2 -ml-2')} onClick={() => setN((x) => x + 1)}>
          <RefreshCw className="size-3.5" aria-hidden /> Próxima
        </button>
      )}
    </section>
  )
}
