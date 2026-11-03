import { useEffect, useState } from 'react'
import { Lock, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { Campo, FormDialog, useValores } from '../../components/Form'
import { useFeedback } from '../../components/Feedback'
import { del, mensagemDeErro, post, put, useDados, type Reg } from '../../lib/api'
import { cx } from '../../lib/format'
import { formatarCarimbo, formatarData } from '../../../shared/datas'
import { AREAS_DIAGNOSTICO, type AreaDiagnostico, type VersaoDiagnostico } from '../../../shared/diagnostico'
import { hrefAluna } from '../rotas'
import { progressoMeta, valorMeta } from '../metas'

type Visao = VersaoDiagnostico | 'comparar'

/** Diagnóstico em quatro abas, salvas separadamente, com uma versão de início e outra de fim de ciclo. */
export function Diagnostico({ area: areaRota }: { area?: string }) {
  const { dados, erro, recarregar } = useDados('/portal/diagnostico')
  const [visao, setVisao] = useState<Visao>('inicio')
  const area: AreaDiagnostico = (AREAS_DIAGNOSTICO.find((a) => a.id === areaRota)?.id ?? 'situacao') as AreaDiagnostico
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  if (!dados.matricula)
    return <p className="card p-5 text-sm text-ink-muted">O diagnóstico fica disponível quando a sua matrícula estiver ativa. Se isso parecer errado, fale com a equipe.</p>

  const respostas = dados.respostas as Reg[]
  const resposta = (v: VersaoDiagnostico, a: string) => respostas.find((r) => r.versao === v && r.area === a)
  const preenchidas = (v: VersaoDiagnostico) => AREAS_DIAGNOSTICO.filter((a) => resposta(v, a.id)).length

  const opcoes: { id: Visao; nome: string; bloqueada?: boolean }[] = [
    { id: 'inicio', nome: `Início do ciclo (${preenchidas('inicio')}/4)` },
    { id: 'fim', nome: `Fim do ciclo (${preenchidas('fim')}/4)`, bloqueada: !dados.fim_liberado },
    { id: 'comparar', nome: 'Comparar' },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Responda com calma e de forma objetiva. Cada aba é salva separadamente. Só você e a equipe veem o diagnóstico; não precisa incluir informações pessoais sensíveis.
      </p>
      <div className="inline-flex flex-wrap gap-1 rounded-[var(--radius-control)] bg-surface-muted p-1" role="group" aria-label="Versão do diagnóstico">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={visao === o.id}
            onClick={() => setVisao(o.id)}
            className={cx('inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm', visao === o.id ? 'bg-surface font-medium text-brand-700 shadow-sm' : 'text-ink-muted hover:text-ink')}
          >
            {o.bloqueada && <Lock className="size-3.5" aria-label="Ainda fechado" />}
            {o.nome}
          </button>
        ))}
      </div>

      {visao === 'comparar' ? (
        <Comparar resposta={resposta} metas={dados.metas} />
      ) : visao === 'fim' && !dados.fim_liberado ? (
        <div className="card flex flex-col items-center px-6 py-10 text-center">
          <Lock className="mb-2 size-6 text-ink-muted" aria-hidden />
          <p className="max-w-md text-sm text-ink-soft">
            O diagnóstico de fim de ciclo abre {dados.fim_a_partir_de ? `em ${formatarData(dados.fim_a_partir_de)}, perto do fim da sua vigência` : 'quando a equipe definir o fim da sua vigência'}. Ele serve para comparar com o início.
          </p>
          <button type="button" className="btn-secondary btn-sm mt-4" onClick={() => setVisao('inicio')}>
            Ver o diagnóstico de início
          </button>
        </div>
      ) : (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Áreas do diagnóstico">
            {AREAS_DIAGNOSTICO.map((a) => {
              const feita = !!resposta(visao, a.id)
              return (
                <a
                  key={a.id}
                  href={hrefAluna('diagnostico', a.id)}
                  aria-current={a.id === area ? 'page' : undefined}
                  className={cx('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap', a.id === area ? 'border-brand-700 font-medium text-brand-700' : 'border-transparent text-ink-muted hover:text-ink')}
                >
                  <span className={cx('size-2 rounded-full', feita ? 'bg-success' : 'bg-line-strong')} aria-hidden />
                  {a.nome}
                  <span className="sr-only">{feita ? '(preenchida)' : '(não preenchida)'}</span>
                </a>
              )
            })}
          </nav>
          <FormArea key={`${visao}-${area}`} versao={visao} area={area} salva={resposta(visao, area)} onSalvo={recarregar} />
          {area === 'objetivos' && <Metas metas={dados.metas} onMudou={recarregar} />}
        </>
      )}
    </div>
  )
}

function FormArea({ versao, area, salva, onSalvo }: { versao: VersaoDiagnostico; area: AreaDiagnostico; salva?: Reg; onSalvo: () => void }) {
  const def = AREAS_DIAGNOSTICO.find((a) => a.id === area)!
  const fb = useFeedback()
  const inicial = Object.fromEntries(def.perguntas.map((p) => [p.id, (salva?.conteudo?.[p.id] as string) ?? '']))
  const [valores, setValores] = useState<Record<string, string>>(inicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const mudou = def.perguntas.some((p) => valores[p.id] !== inicial[p.id])
  useEffect(() => setErro(null), [valores])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await put(`/portal/diagnostico/${versao}/${area}`, { respostas: valores })
      fb.sucesso(`${def.nome}: salvo.`)
      onSalvo()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="card space-y-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">
          {def.nome} <span className="text-sm font-normal text-ink-muted">· {versao === 'inicio' ? 'início do ciclo' : 'fim do ciclo'}</span>
        </h2>
        <p className="text-xs text-ink-muted">{salva ? `Salvo em ${formatarCarimbo(salva.atualizado_em)}` : 'Ainda não preenchida'}</p>
      </div>
      {def.perguntas.map((p) => (
        <Campo key={p.id} rotulo={p.texto}>
          {(props) => (
            <textarea rows={3} maxLength={4000} className="field-control" {...props} value={valores[p.id]} onChange={(e) => setValores((v) => ({ ...v, [p.id]: e.target.value }))} />
          )}
        </Campo>
      ))}
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={salvando || !mudou}>
          {salvando ? 'Salvando…' : `Salvar ${def.nome.toLowerCase()}`}
        </button>
      </div>
    </form>
  )
}

function Metas({ metas, onMudou }: { metas: Reg[]; onMudou: () => void }) {
  const fb = useFeedback()
  const [editando, setEditando] = useState<Reg | 'nova' | null>(null)
  async function remover(m: Reg) {
    if (!(await fb.confirmar({ titulo: 'Remover meta?', mensagem: `"${m.nome}" sai dos seus indicadores. A equipe continua vendo o histórico.`, rotuloConfirmar: 'Remover', perigo: true }))) return
    try {
      await del(`/portal/metas/${m.id}`)
      onMudou()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
            <Target className="size-5 text-gold" aria-hidden /> Minhas metas
          </h2>
          <p className="text-xs text-ink-muted">Cada meta tem o valor de início, o alvo e o valor atual. Elas aparecem nos seus indicadores, no Início.</p>
        </div>
        {metas.length > 0 && metas.length < 10 && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando('nova')}>
            <Plus className="size-4" aria-hidden /> Nova meta
          </button>
        )}
      </div>
      {metas.length === 0 ? (
        <div className="mt-3 rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface-muted/50 px-4 py-6 text-center text-sm text-ink-muted">
          <p>Você ainda não definiu metas. Exemplo: faturamento mensal, de R$ 30.000 para R$ 45.000.</p>
          <button type="button" className="btn-primary btn-sm mt-3" onClick={() => setEditando('nova')}>
            <Plus className="size-4" aria-hidden /> Definir primeira meta
          </button>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {metas.map((m) => {
            const p = progressoMeta(m)
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.nome}</p>
                  <div className="mt-1 h-2 max-w-md overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.pct ?? 0}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {p.texto}
                    {p.pct !== null && ` · ${p.pct}% do caminho`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(m)}>
                    <Pencil className="size-3.5" aria-hidden /> Atualizar
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => void remover(m)} aria-label={`Remover ${m.nome}`}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {editando && <DialogMeta meta={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} onConcluir={onMudou} />}
    </section>
  )
}

function DialogMeta({ meta, onFechar, onConcluir }: { meta: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const { valores, campo } = useValores({
    nome: meta?.nome ?? '',
    unidade: meta?.unidade ?? '',
    valor_inicial: txt(meta?.valor_inicial),
    valor_alvo: txt(meta?.valor_alvo),
    valor_atual: txt(meta?.valor_atual),
  })
  const num = (s: string) => (s.trim() === '' ? '' : s.replace(/\./g, '').replace(',', '.'))
  return (
    <FormDialog
      aberto
      titulo={meta ? 'Atualizar meta' : 'Nova meta'}
      descricao="Use números. O progresso mostra sempre de onde você partiu e onde quer chegar."
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = { nome: valores.nome, unidade: valores.unidade || null, valor_inicial: num(valores.valor_inicial), valor_alvo: num(valores.valor_alvo), valor_atual: num(valores.valor_atual) }
        if (meta) await put(`/portal/metas/${meta.id}`, corpo)
        else await post('/portal/metas', corpo)
        fb.sucesso('Meta salva.')
        onConcluir()
      }}
    >
      <Campo rotulo="Meta" obrigatorio dica="Ex.: Faturamento mensal, clientes ativos, reuniões de equipe por mês.">
        {(p) => <input className="field-control" maxLength={200} {...p} value={valores.nome} onChange={campo('nome')} />}
      </Campo>
      <Campo rotulo="Unidade" dica="Ex.: R$, clientes, reuniões. Opcional.">
        {(p) => <input className="field-control" maxLength={40} {...p} value={valores.unidade} onChange={campo('unidade')} />}
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Valor no início" obrigatorio>
          {(p) => <input inputMode="decimal" className="field-control" {...p} value={valores.valor_inicial} onChange={campo('valor_inicial')} />}
        </Campo>
        <Campo rotulo="Alvo" obrigatorio>
          {(p) => <input inputMode="decimal" className="field-control" {...p} value={valores.valor_alvo} onChange={campo('valor_alvo')} />}
        </Campo>
        <Campo rotulo="Valor atual">
          {(p) => <input inputMode="decimal" className="field-control" {...p} value={valores.valor_atual} onChange={campo('valor_atual')} />}
        </Campo>
      </div>
    </FormDialog>
  )
}

function Comparar({ resposta, metas }: { resposta: (v: VersaoDiagnostico, a: string) => Reg | undefined; metas: Reg[] }) {
  return (
    <div className="space-y-4">
      {AREAS_DIAGNOSTICO.map((a) => (
        <section key={a.id} className="card p-4">
          <h2 className="font-display text-base font-semibold">{a.nome}</h2>
          <div className="mt-2 space-y-3">
            {a.perguntas.map((p) => (
              <div key={p.id}>
                <p className="text-sm font-medium text-ink-soft">{p.texto}</p>
                <div className="mt-1 grid gap-2 md:grid-cols-2">
                  {(['inicio', 'fim'] as const).map((v) => {
                    const texto = resposta(v, a.id)?.conteudo?.[p.id] as string | undefined
                    return (
                      <div key={v} className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 text-sm">
                        <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">{v === 'inicio' ? 'Início' : 'Fim'}</p>
                        <p className={cx('whitespace-pre-line', !texto && 'text-ink-muted')}>{texto || 'Sem resposta'}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="card p-4">
        <h2 className="font-display text-base font-semibold">Metas: início x agora</h2>
        {metas.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nenhuma meta definida.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="py-1 pr-3 font-medium">Meta</th>
                  <th className="py-1 pr-3 text-right font-medium">Início</th>
                  <th className="py-1 pr-3 text-right font-medium">Atual</th>
                  <th className="py-1 text-right font-medium">Alvo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {metas.map((m) => (
                  <tr key={m.id}>
                    <td className="py-1.5 pr-3">{m.nome}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{valorMeta(m.valor_inicial, m.unidade)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{valorMeta(m.valor_atual, m.unidade)}</td>
                    <td className="py-1.5 text-right tabular-nums">{valorMeta(m.valor_alvo, m.unidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
