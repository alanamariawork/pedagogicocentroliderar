import { useEffect, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { Selo, TOM_MATRICULA } from '../components/Selos'
import { DialogMatricula } from '../forms/FormMatricula'
import { useDados, type Reg } from '../lib/api'
import { SITUACAO_CONTRATO, SITUACAO_MATRICULA } from '../lib/format'
import { href } from '../lib/rotas'
import { useSessao } from '../state/Sessao'
import { formatarData } from '../../shared/datas'

export function Alunas() {
  const { pode } = useSessao()
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [situacao, setSituacao] = useState('')
  const [novo, setNovo] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 250)
    return () => clearTimeout(t)
  }, [busca])
  const q = new URLSearchParams()
  if (termo) q.set('busca', termo)
  if (situacao) q.set('situacao', situacao)
  const { dados, erro, carregando, recarregar } = useDados<Reg[]>(`/pessoas?${q}`)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-60 flex-1">
          <label htmlFor="busca" className="sr-only">
            Buscar
          </label>
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" aria-hidden />
          <input id="busca" type="search" placeholder="Buscar por nome, e-mail ou telefone" className="field-control pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="text-xs text-ink-muted">
          Situação
          <select className="field-control mt-0.5" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(SITUACAO_MATRICULA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {pode('alunas:editar') && pode('matriculas:criar') && (
          <button type="button" className="btn-primary" onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden />
            Nova aluna
          </button>
        )}
      </div>

      {erro ? (
        <EstadoErro mensagem={erro} onTentar={recarregar} />
      ) : !dados ? (
        <Carregando />
      ) : dados.length === 0 ? (
        <EstadoVazio icone={Users} titulo={termo || situacao ? 'Nenhuma aluna encontrada com esses filtros.' : 'Nenhuma aluna cadastrada ainda.'} acao={pode('alunas:editar') && pode('matriculas:criar') && !termo ? 'Cadastrar a primeira aluna' : undefined} onAcao={() => setNovo(true)}>
          <p className="mt-1 max-w-md text-xs text-ink-muted">Cada pessoa pode ter várias matrículas (inicial e renovações), cada uma com vigência e entregáveis próprios.</p>
        </EstadoVazio>
      ) : (
        <div className="card overflow-hidden">
          {carregando && <p className="px-4 pt-2 text-xs text-ink-muted">Atualizando…</p>}
          <ul className="divide-y divide-line">
            {dados.map((p) => {
              const m = p.matricula_atual
              return (
                <li key={p.id}>
                  <a href={href({ pagina: 'ficha', id: p.id })} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-muted/60">
                    <div className="min-w-48 flex-1">
                      <p className="font-medium text-ink">
                        {p.nome} {p.demonstracao ? <Selo tom="info">Demonstração</Selo> : null}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {p.matriculas} matrícula(s){m?.programa_nome && ` · ${m.programa_nome}`}
                        {m && ` · ${formatarData(m.data_inicio)} a ${formatarData(m.data_fim)}`}
                      </p>
                    </div>
                    {m ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Selo tom={TOM_MATRICULA[m.situacao]}>{SITUACAO_MATRICULA[m.situacao]}</Selo>
                        {m.contrato_situacao !== 'assinado' && <Selo tom="alerta">{SITUACAO_CONTRATO[m.contrato_situacao]}</Selo>}
                        {m.trilha_nome && (
                          <Selo tom="vinho">
                            {m.trilha_nome} · {m.pilar_nome ?? '—'}
                          </Selo>
                        )}
                        <span className="text-xs text-ink-muted">{m.entregas_restantes} restante(s)</span>
                        {m.entregas_vencidas > 0 && <Selo tom="perigo">{m.entregas_vencidas} vencida(s)</Selo>}
                      </div>
                    ) : (
                      <Selo>Sem matrícula</Selo>
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {novo && <DialogMatricula onFechar={() => setNovo(false)} />}
    </div>
  )
}
