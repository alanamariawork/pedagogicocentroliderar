import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio, Secao, Vazio } from '../components/Estados'
import { Selo } from '../components/Selos'
import { DialogValidar } from './ficha/Jornada'
import { DialogValidarConquista } from './ficha/Registros'
import { useDados, type Reg } from '../lib/api'
import { href } from '../lib/rotas'
import { useSessao } from '../state/Sessao'
import { formatarCarimbo, formatarData } from '../../shared/datas'

export function Validacoes() {
  const { pode } = useSessao()
  const { dados, erro, recarregar } = useDados<{ atividades: Reg[]; conquistas: Reg[] }>('/validacoes/pendentes')
  const [atividade, setAtividade] = useState<Reg | null>(null)
  const [conquista, setConquista] = useState<Reg | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  if (dados.atividades.length === 0 && dados.conquistas.length === 0)
    return (
      <EstadoVazio icone={BadgeCheck} titulo="Nada aguardando validação.">
        <p className="mt-1 max-w-md text-xs text-ink-muted">Atividades enviadas pelas alunas ou registradas pela equipe e conquistas ainda não validadas aparecem aqui.</p>
      </EstadoVazio>
    )
  return (
    <div className="space-y-4">
      <Secao titulo={`Atividades enviadas (${dados.atividades.length})`} descricao="O avanço pedagógico depende de validação humana autorizada.">
        {dados.atividades.length === 0 ? (
          <Vazio>Nenhuma atividade aguardando validação.</Vazio>
        ) : (
          <ul className="divide-y divide-line">
            {dados.atividades.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-60 flex-1 text-sm">
                  <p className="font-medium text-ink">{a.titulo}</p>
                  <p className="text-xs text-ink-muted">
                    <a className="text-brand-700 underline" href={href({ pagina: 'ficha', id: a.pessoa_id, aba: 'jornada' })}>
                      {a.pessoa_nome}
                    </a>{' '}
                    · {a.etapa_titulo} · enviada em {formatarCarimbo(a.atualizado_em)}
                    {a.validador_nome && ` · validadora: ${a.validador_nome}`}
                  </p>
                  {a.ultima_evidencia ? (
                    <div className="mt-1 rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 text-ink-soft">
                      {a.ultima_evidencia.texto && <p className="whitespace-pre-line">{a.ultima_evidencia.texto}</p>}
                      {a.ultima_evidencia.link && (
                        <a href={a.ultima_evidencia.link} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
                          Abrir link da evidência
                        </a>
                      )}
                      <p className="text-xs text-ink-muted">
                        {a.ultima_evidencia.data_execucao && `Executada em ${formatarData(a.ultima_evidencia.data_execucao)} · `}
                        {a.ultima_evidencia.registrada_por_equipe ? 'Registrada pela equipe' : 'Enviada pela aluna'} · {a.evidencias} evidência(s)
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-warning">Sem evidência registrada.</p>
                  )}
                </div>
                {pode('jornada:validar') ? (
                  <button type="button" className="btn-primary btn-sm" onClick={() => setAtividade(a)}>
                    Validar ou pedir revisão
                  </button>
                ) : (
                  <Selo tom="dourado">Aguardando</Selo>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>
      <Secao titulo={`Conquistas não validadas (${dados.conquistas.length})`} descricao="Só aparecem para a aluna depois de validadas e liberadas.">
        {dados.conquistas.length === 0 ? (
          <Vazio>Nenhuma conquista aguardando validação.</Vazio>
        ) : (
          <ul className="divide-y divide-line">
            {dados.conquistas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink">{c.titulo}</p>
                  <p className="text-xs text-ink-muted">
                    <a className="text-brand-700 underline" href={href({ pagina: 'ficha', id: c.pessoa_id, aba: 'conquistas' })}>
                      {c.pessoa_nome}
                    </a>{' '}
                    · {formatarData(c.data)}
                  </p>
                </div>
                {pode('conquistas:validar') && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setConquista(c)}>
                    Validar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>
      {atividade && <DialogValidar atividade={atividade} onFechar={() => setAtividade(null)} onConcluir={recarregar} />}
      {conquista && <DialogValidarConquista conquista={conquista} onFechar={() => setConquista(null)} onConcluir={recarregar} />}
    </div>
  )
}
