import { ListChecks } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../../components/Estados'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { mensagemDeErro, put, useDados, type Reg } from '../../lib/api'
import { formatarData, hojeSP } from '../../../shared/datas'

const ANDAMENTO: Record<string, string> = { a_fazer: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída' }

/** Plano de Ação: o que foi combinado em cada encontro, publicado pela equipe depois da revisão. */
export function PlanoAcao() {
  const { dados, erro, recarregar } = useDados<Reg>('/portal/plano-acao')
  const fb = useFeedback()
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const acoes = dados.acoes as Reg[]
  if (acoes.length === 0)
    return (
      <EstadoVazio icone={ListChecks} titulo="Ainda não há ações publicadas.">
        <p className="mt-1 max-w-md text-sm text-ink-muted">Depois de cada mentoria, a equipe revisa o que foi combinado e publica aqui, com o prazo de cada ação.</p>
      </EstadoVazio>
    )
  const h = hojeSP()
  const feitas = acoes.filter((a) => a.andamento === 'concluida').length

  async function mudar(a: Reg, andamento: string) {
    try {
      await put(`/portal/plano-acao/${a.id}`, { andamento })
      recarregar()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <p className="text-sm text-ink-soft">
          {feitas} de {acoes.length} ação(ões) concluída(s)
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round((feitas / acoes.length) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Andamento do plano">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(feitas / acoes.length) * 100}%` }} />
        </div>
      </section>
      <ul className="space-y-3">
        {acoes.map((a) => {
          const atrasada = a.prazo && a.prazo < h && a.andamento !== 'concluida'
          return (
            <li key={a.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{a.titulo}</p>
                  {a.descricao && <p className="mt-0.5 text-sm text-ink-soft">{a.descricao}</p>}
                  <p className="mt-1 text-xs text-ink-muted">
                    {a.encontro_tipo ? `Combinado em: ${a.encontro_tipo}${a.encontro_data ? ` de ${formatarData(a.encontro_data)}` : ''}` : 'Combinado com a equipe'}
                    {' · '}
                    {a.prazo ? `Prazo: ${formatarData(a.prazo)}` : 'Sem prazo definido'}
                  </p>
                </div>
                {atrasada ? <Selo tom="perigo">Prazo passou</Selo> : <Selo tom={a.andamento === 'concluida' ? 'sucesso' : a.andamento === 'em_andamento' ? 'info' : 'neutro'}>{ANDAMENTO[a.andamento]}</Selo>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Andamento de ${a.titulo}`}>
                {Object.entries(ANDAMENTO).map(([k, r]) => (
                  <button key={k} type="button" aria-pressed={a.andamento === k} className={a.andamento === k ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => void mudar(a, k)}>
                    {r}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
