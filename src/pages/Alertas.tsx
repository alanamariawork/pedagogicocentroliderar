import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { Selo, type Tom } from '../components/Selos'
import { useDados, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { href } from '../lib/rotas'
import { formatarCarimbo, formatarData } from '../../shared/datas'

const TIPOS: Record<string, { nome: string; tom: Tom; aba?: string }> = {
  entrega_vencida: { nome: 'Entrega vencida', tom: 'perigo', aba: 'encontros' },
  encontro_sem_registro: { nome: 'Encontro sem registro', tom: 'alerta', aba: 'encontros' },
  proxima_tentativa: { nome: 'Tentar contato', tom: 'info', aba: 'contatos' },
  proxima_termino: { nome: 'Próxima do término', tom: 'dourado', aba: 'continuidade' },
  cadastro_incompleto: { nome: 'Cadastro incompleto', tom: 'alerta', aba: 'resumo' },
  decisao_obrigacoes: { nome: 'Obrigações sem decisão', tom: 'perigo', aba: 'entregaveis' },
  pausa_decisao: { nome: 'Pausa sem decisão', tom: 'alerta', aba: 'continuidade' },
  aguardando_validacao: { nome: 'Aguardando validação', tom: 'vinho', aba: 'jornada' },
}

export function Alertas() {
  const { dados, erro, recarregar, carregando } = useDados<{ alertas: Reg[]; calculado_em: string; observacao: string }>('/alertas')
  const [tipo, setTipo] = useState('')
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const contagem = dados.alertas.reduce<Record<string, number>>((c, a) => ({ ...c, [a.tipo]: (c[a.tipo] ?? 0) + 1 }), {})
  const lista = dados.alertas.filter((a) => !tipo || a.tipo === tipo).sort((a, b) => (a.data ?? '9').localeCompare(b.data ?? '9'))
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-muted">
        {dados.observacao} Calculados em {formatarCarimbo(dados.calculado_em)}.{' '}
        <button type="button" className="text-brand-700 underline" onClick={() => void recarregar()} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </p>
      {dados.alertas.length === 0 ? (
        <EstadoVazio icone={Bell} titulo="Nenhum alerta no momento. Tudo em dia dentro do seu acesso." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
            <button type="button" aria-pressed={!tipo} className={cx('rounded-full border px-3 py-1 text-xs', !tipo ? 'border-brand-700 bg-brand-50' : 'border-line')} onClick={() => setTipo('')}>
              Todos ({dados.alertas.length})
            </button>
            {Object.entries(contagem).map(([t, n]) => (
              <button key={t} type="button" aria-pressed={tipo === t} className={cx('rounded-full border px-3 py-1 text-xs', tipo === t ? 'border-brand-700 bg-brand-50' : 'border-line')} onClick={() => setTipo(t)}>
                {TIPOS[t]?.nome ?? t} ({n})
              </button>
            ))}
          </div>
          <ul className="card divide-y divide-line">
            {lista.map((a) => (
              <li key={a.chave} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-60 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Selo tom={TIPOS[a.tipo]?.tom}>{TIPOS[a.tipo]?.nome ?? a.tipo}</Selo>
                    <span className="font-medium text-ink">{a.titulo}</span>
                  </p>
                  <p className="text-ink-soft">{a.detalhe}</p>
                  <p className="text-xs text-ink-muted">
                    Responsável: {a.responsavel}
                    {a.data && ` · ${formatarData(a.data.slice(0, 10))}`}
                  </p>
                </div>
                {a.pessoa_id && (
                  <a className="btn-secondary btn-sm" href={href({ pagina: 'ficha', id: a.pessoa_id, aba: TIPOS[a.tipo]?.aba })}>
                    Abrir ficha
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
