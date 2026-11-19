import { CheckCircle2, GraduationCap, Lock } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../../components/Estados'
import { Selo, SeloPilar } from '../../components/Selos'
import { useDados, type Reg } from '../../lib/api'
import { cx } from '../../lib/format'
import { formatarData } from '../../../shared/datas'
import { hrefAluna } from '../rotas'

/**
 * Trilhas: a trilha da aluna, a etapa atual (nível pedagógico cadastrado: pilar e etapa) e as próximas,
 * com o que falta para cada etapa bloqueada. A ordem e os pré-requisitos são os do cadastro; a
 * liberação continua sendo uma validação da equipe.
 */
export function Trilhas() {
  const { dados, erro, recarregar } = useDados<Reg>('/portal')
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const jornada = dados.jornada as Reg | null
  if (!jornada || !(jornada.etapas as Reg[]).length)
    return (
      <EstadoVazio icone={GraduationCap} titulo="Sua trilha ainda está sendo preparada pela equipe pedagógica.">
        <p className="mt-1 max-w-md text-sm text-ink-muted">Quando a equipe definir sua trilha, você vê aqui a etapa atual e as próximas.</p>
      </EstadoVazio>
    )
  const etapas = jornada.etapas as Reg[]
  const atual = etapas.find((e) => e.situacao === 'liberada') ?? etapas.find((e) => e.situacao !== 'concluida') ?? null
  const concluidas = etapas.filter((e) => e.situacao === 'concluida').length
  const proximas = etapas.filter((e) => e.situacao === 'bloqueada')

  // Agrupa por pilar, na ordem cadastrada.
  const grupos: { pilar: Reg | null; etapas: Reg[] }[] = []
  for (const e of etapas) {
    const chave = e.pilar_id ?? null
    const g = grupos.find((x) => (x.pilar?.id ?? null) === chave)
    if (g) g.etapas.push(e)
    else grupos.push({ pilar: e.pilar_nome ? { id: e.pilar_id, nome: e.pilar_nome, cor: e.pilar_cor, ordem: e.pilar_ordem } : null, etapas: [e] })
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <p className="text-xs font-medium text-ink-muted">Minha trilha</p>
        <h2 className="font-display text-xl font-semibold text-ink">{jornada.trilha_nome ?? 'Trilha'}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {atual ? (
            <>
              <span className="text-ink-soft">Você está em:</span>
              <a href={hrefAluna('jornada', atual.id)} className="font-medium text-brand-700 hover:underline">
                {atual.titulo}
              </a>
              <SeloPilar pilar={{ nome: atual.pilar_nome, cor: atual.pilar_cor, ordem: atual.pilar_ordem }} />
            </>
          ) : (
            <span className="font-medium text-success">Você concluiu todas as etapas desta trilha.</span>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {concluidas} de {etapas.length} etapa(s) concluída(s) · {proximas.length} etapa(s) pela frente
        </p>
      </section>

      {grupos.map((g) => (
        <section key={g.pilar?.id ?? 'sem'} className="card p-4">
          <h3 className="flex items-center gap-2">{g.pilar ? <SeloPilar pilar={g.pilar} className="text-sm" /> : <span className="font-medium">Etapas</span>}</h3>
          <ol className="mt-3 space-y-2">
            {g.etapas.map((e) => (
              <li key={e.id} className={cx('rounded-[var(--radius-control)] border p-3', e.situacao === 'liberada' ? 'border-brand-500/40 bg-brand-50/40' : 'border-line')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    {e.situacao === 'concluida' ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : e.situacao === 'bloqueada' ? <Lock className="size-4 text-ink-muted" aria-hidden /> : null}
                    {e.situacao === 'bloqueada' ? e.titulo : <a href={hrefAluna('jornada', e.id)} className="hover:underline">{e.titulo}</a>}
                  </p>
                  <Selo tom={e.situacao === 'concluida' ? 'sucesso' : e.situacao === 'liberada' ? 'vinho' : 'neutro'}>{e.situacao === 'concluida' ? 'Concluída' : e.situacao === 'liberada' ? 'Etapa atual' : 'Bloqueada'}</Selo>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {e.prazo_individual ? `Prazo da etapa: ${formatarData(e.prazo_individual)}` : 'Sem prazo definido'}
                  {e.situacao !== 'bloqueada' && ` · ${e.progresso.texto}`}
                </p>
                {e.situacao !== 'concluida' && (e.falta as string[]).length > 0 && (
                  <div className="mt-2 rounded bg-surface-muted px-3 py-2 text-xs text-ink-soft">
                    <p className="font-medium">{e.situacao === 'bloqueada' ? 'O que falta para liberar:' : 'O que falta para concluir:'}</p>
                    <ul className="list-disc pl-4">
                      {(e.falta as string[]).map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
