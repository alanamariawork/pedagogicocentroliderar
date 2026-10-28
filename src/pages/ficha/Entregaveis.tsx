import { useState } from 'react'
import { CalendarRange, Plus } from 'lucide-react'
import { Secao, Vazio } from '../../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../../components/Form'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { DialogoAcao, type AcaoOcorrencia } from '../../forms/AcoesOcorrencia'
import { EditorItens, itemParaApi, itemVazio, type ItemForm } from '../../forms/FormMatricula'
import { TabelaEntregas } from '../EntregasMes'
import { post, put, type Reg } from '../../lib/api'
import { HISTORICO_OCORRENCIA, ORIGEM_ITEM, TIPO_AJUSTE, cx } from '../../lib/format'
import { ativos, useCatalogos } from '../../state/Catalogos'
import { useSessao } from '../../state/Sessao'
import { formatarCarimbo, formatarData, formatarHoras, hojeSP, somarDias } from '../../../shared/datas'
import { indicadorAtraso, sugerirDatas } from '../../../shared/calculos'

export function Entregaveis({ m, recarregar }: { m: Reg; recarregar: () => void }) {
  const { pode } = useSessao()
  const [dialogo, setDialogo] = useState<null | { tipo: 'novo' } | { tipo: 'editar' | 'ajuste' | 'previsoes'; item: Reg }>(null)
  const itens = m.itens as Reg[]
  return (
    <Secao
      titulo="Entregáveis contratados"
      descricao="Pertencem a esta matrícula. Quantidade só muda por ajuste registrado."
      acao={
        pode('comercial:editar') && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setDialogo({ tipo: 'novo' })}>
            <Plus className="size-4" aria-hidden /> Adicionar item
          </button>
        )
      }
    >
      {itens.length === 0 ? (
        <Vazio>Nenhum entregável nesta matrícula. Adicione itens ou aplique um modelo de pacote ao criar a matrícula.</Vazio>
      ) : (
        <ul className="space-y-3">
          {itens.map((i) => {
            const ocs = (m.ocorrencias as Reg[]).filter((o) => o.item_id === i.id && o.situacao !== 'cancelada')
            const semPrev = ocs.filter((o) => !o.data_prevista && o.situacao !== 'realizada').length
            return (
              <li key={i.id} className="rounded-[var(--radius-control)] border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">
                      {i.descricao} <Selo tom={i.origem === 'bonus' ? 'dourado' : i.origem === 'ajuste' ? 'info' : 'neutro'}>{ORIGEM_ITEM[i.origem]}</Selo>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {i.tipo_nome ?? 'Sem tipo'} · {i.profissional_nome ?? <span className="text-warning">profissional a definir</span>} ·{' '}
                      {i.duracao_min ? formatarHoras(i.duracao_min) : <span className="text-warning">duração não informada</span>}
                      {i.especialidade && ` · ${i.especialidade}`}
                    </p>
                    {i.referencia_comercial && <p className="text-xs text-ink-muted">Referência: {i.referencia_comercial}</p>}
                  </div>
                  <div className="flex gap-4 text-center text-sm">
                    <div>
                      <p className="font-display text-xl font-semibold">{i.contratada}</p>
                      <p className="text-xs text-ink-muted">contratada(s)</p>
                    </div>
                    <div>
                      <p className="font-display text-xl font-semibold text-success">{i.realizadas}</p>
                      <p className="text-xs text-ink-muted">realizada(s)</p>
                    </div>
                    <div>
                      <p className={cx('font-display text-xl font-semibold', i.restantes > 0 && 'text-brand-700')}>{i.restantes}</p>
                      <p className="text-xs text-ink-muted">restante(s)</p>
                    </div>
                  </div>
                </div>
                {semPrev > 0 && <p className="mt-2 text-xs text-warning">{semPrev} ocorrência(s) sem previsão.</p>}
                {(i.ajustes as Reg[]).length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-ink-muted">
                    {(i.ajustes as Reg[]).map((a) => (
                      <li key={a.id}>
                        {a.delta > 0 ? `+${a.delta}` : a.delta} · {TIPO_AJUSTE[a.tipo]} · {a.motivo} · {a.autor_nome} em {formatarCarimbo(a.criado_em)}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {pode('entregas:editar') && ocs.some((o) => o.situacao !== 'realizada') && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'previsoes', item: i })}>
                      <CalendarRange className="size-3.5" aria-hidden /> Planejar previsões
                    </button>
                  )}
                  {(pode('comercial:editar') || pode('entregas:editar')) && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'editar', item: i })}>
                      Editar item
                    </button>
                  )}
                  {pode('obrigacoes:ajustar') && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'ajuste', item: i })}>
                      Ajustar quantidade / exceção
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {dialogo?.tipo === 'novo' && <DialogNovoItem m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo?.tipo === 'editar' && <DialogEditarItem item={dialogo.item} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo?.tipo === 'ajuste' && <DialogAjuste item={dialogo.item} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo?.tipo === 'previsoes' && <DialogPrevisoes item={dialogo.item} m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
    </Secao>
  )
}

function DialogNovoItem({ m, onFechar, onConcluir }: { m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const [itens, setItens] = useState<ItemForm[]>([itemVazio('bonus')])
  return (
    <FormDialog
      aberto
      titulo="Adicionar item contratado"
      descricao="Cada item gera as ocorrências correspondentes, sem previsão até serem planejadas."
      largura="sm:max-w-xl"
      onFechar={onFechar}
      onEnviar={async () => {
        for (const i of itens) await post(`/matriculas/${m.id}/itens`, itemParaApi(i))
        fb.sucesso('Item adicionado.')
        onConcluir()
      }}
    >
      <EditorItens itens={itens} onChange={setItens} />
    </FormDialog>
  )
}

function DialogEditarItem({ item, onFechar, onConcluir }: { item: Reg; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { pode } = useSessao()
  const { valores, campo } = useValores({
    tipo_id: item.tipo_id ?? '',
    descricao: item.descricao,
    profissional_id: item.profissional_id ?? '',
    especialidade: item.especialidade ?? '',
    duracao_min: item.duracao_min ? String(item.duracao_min) : '',
    referencia_comercial: item.referencia_comercial ?? '',
    observacoes: item.observacoes ?? '',
  })
  return (
    <FormDialog
      aberto
      titulo="Editar item"
      descricao="Para mudar a quantidade, use 'Ajustar quantidade'."
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/itens/${item.id}`, { ...valores, tipo_id: valores.tipo_id || null, profissional_id: valores.profissional_id || null, duracao_min: valores.duracao_min || null })
        fb.sucesso('Item atualizado.')
        onConcluir()
      }}
    >
      <Campo rotulo="Tipo">
        {(p) => (
          <select {...p} className="field-control" value={valores.tipo_id} onChange={campo('tipo_id')}>
            <Opcoes itens={ativos(cat?.['tipos-entregavel'])} vazio="Sem tipo" />
          </select>
        )}
      </Campo>
      <Campo rotulo="Descrição" obrigatorio>
        {(p) => <input {...p} className="field-control" value={valores.descricao} onChange={campo('descricao')} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Profissional">
          {(p) => (
            <select {...p} className="field-control" value={valores.profissional_id} onChange={campo('profissional_id')}>
              <Opcoes itens={ativos(cat?.profissionais)} vazio="A definir" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Duração prevista (min)">{(p) => <input {...p} type="number" min={5} step={5} className="field-control" value={valores.duracao_min} onChange={campo('duracao_min')} />}</Campo>
      </div>
      <Campo rotulo="Especialidade">{(p) => <input {...p} className="field-control" value={valores.especialidade} onChange={campo('especialidade')} />}</Campo>
      {pode('comercial:editar') && <Campo rotulo="Referência comercial">{(p) => <input {...p} className="field-control" value={valores.referencia_comercial} onChange={campo('referencia_comercial')} />}</Campo>}
      <Campo rotulo="Observações">{(p) => <textarea {...p} rows={2} className="field-control" value={valores.observacoes} onChange={campo('observacoes')} />}</Campo>
    </FormDialog>
  )
}

function DialogAjuste({ item, onFechar, onConcluir }: { item: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ delta: '1', tipo: 'ajuste', motivo: '' })
  return (
    <FormDialog
      aberto
      titulo="Ajustar quantidade devida"
      descricao={`Hoje: ${item.contratada} contratada(s), ${item.realizadas} realizada(s).`}
      onFechar={onFechar}
      rotulo="Registrar ajuste"
      onEnviar={async () => {
        await post(`/itens/${item.id}/ajustes`, { delta: Number(valores.delta), tipo: valores.tipo, motivo: valores.motivo })
        fb.sucesso('Ajuste registrado.')
        onConcluir()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Variação" obrigatorio dica="Use número negativo para reduzir.">
          {(p) => <input {...p} type="number" className="field-control" value={valores.delta} onChange={campo('delta')} />}
        </Campo>
        <Campo rotulo="Tipo" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.tipo} onChange={campo('tipo')}>
              <option value="ajuste">Ajuste autorizado</option>
              <option value="excecao">Exceção (realização acima do contratado)</option>
            </select>
          )}
        </Campo>
      </div>
      <Campo rotulo="Motivo" obrigatorio>
        {(p) => <textarea {...p} rows={3} className="field-control" value={valores.motivo} onChange={campo('motivo')} />}
      </Campo>
    </FormDialog>
  )
}

/** RN10: sugestão de datas é revisável; nada é salvo sem confirmação. */
function DialogPrevisoes({ item, m, onFechar, onConcluir }: { item: Reg; m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const ocs = (m.ocorrencias as Reg[]).filter((o) => o.item_id === item.id && o.situacao !== 'cancelada').sort((a, b) => a.numero - b.numero)
  const editaveis = ocs.filter((o) => o.situacao !== 'realizada')
  const [datas, setDatas] = useState<Record<string, string>>(Object.fromEntries(editaveis.map((o) => [o.id, o.data_prevista ?? ''])))
  const [primeira, setPrimeira] = useState(m.data_inicio && m.data_inicio > hojeSP() ? m.data_inicio : somarDias(hojeSP(), 7))
  const [intervalo, setIntervalo] = useState('30')
  const [motivo, setMotivo] = useState('')
  const jaTinha = editaveis.some((o) => o.data_prevista && datas[o.id] !== o.data_prevista)
  const aplicarSugestao = () => {
    const sug = sugerirDatas(primeira, Number(intervalo) || 30, editaveis.length)
    setDatas(Object.fromEntries(editaveis.map((o, n) => [o.id, sug[n]])))
  }
  const foraVigencia = (d: string) => !!d && ((m.data_fim && d > m.data_fim) || (m.data_inicio && d < m.data_inicio))
  return (
    <FormDialog
      aberto
      titulo={`Planejar previsões · ${item.descricao}`}
      descricao="Defina data por data ou gere uma sugestão e revise antes de salvar. A quantidade de encontros não é deduzida da duração do contrato."
      largura="sm:max-w-xl"
      onFechar={onFechar}
      rotulo="Salvar previsões"
      onEnviar={async () => {
        await put(`/itens/${item.id}/previsoes`, { previsoes: editaveis.map((o) => ({ ocorrencia_id: o.id, data_prevista: datas[o.id] || null })), motivo: motivo || null })
        fb.sucesso('Previsões salvas.')
        onConcluir()
      }}
    >
      <div className="rounded-[var(--radius-control)] border border-dashed border-gold-line bg-gold-soft/50 p-3">
        <p className="mb-2 text-sm font-medium text-ink-soft">Sugerir datas</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-muted">
            Primeiro encontro
            <input type="date" className="field-control mt-0.5" value={primeira} onChange={(e) => setPrimeira(e.target.value)} />
          </label>
          <label className="text-xs text-ink-muted">
            Intervalo (dias)
            <input type="number" min={1} className="field-control mt-0.5 w-24" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
          </label>
          <button type="button" className="btn-secondary" onClick={aplicarSugestao}>
            Gerar sugestão
          </button>
        </div>
      </div>
      <ol className="space-y-2">
        {ocs.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-16 text-ink-muted">Nº {o.numero}</span>
            {o.situacao === 'realizada' ? (
              <span className="text-success">Realizada em {formatarData(o.data_realizada)}</span>
            ) : (
              <>
                <input aria-label={`Previsão do nº ${o.numero}`} type="date" className="field-control w-auto" value={datas[o.id]} onChange={(e) => setDatas((d) => ({ ...d, [o.id]: e.target.value }))} />
                {!datas[o.id] && <Selo tom="alerta">Sem previsão</Selo>}
                {foraVigencia(datas[o.id]) && <Selo tom="alerta">Fora da vigência</Selo>}
                {o.situacao === 'agendada' && <Selo tom="vinho">Agendada {formatarData(o.data_agendada)}</Selo>}
              </>
            )}
          </li>
        ))}
      </ol>
      {jaTinha && (
        <Campo rotulo="Motivo da alteração" obrigatorio dica="Previsões já definidas só mudam com motivo; a original fica no histórico.">
          {(p) => <input {...p} className="field-control" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
        </Campo>
      )}
    </FormDialog>
  )
}

/* ---------------- Encontros (todas as ocorrências da matrícula) ---------------- */

export function Encontros({ m, pessoa, recarregar }: { m: Reg; pessoa: Reg; recarregar: () => void }) {
  const { pode } = useSessao()
  const [acao, setAcao] = useState<{ acao: AcaoOcorrencia; o: Reg } | null>(null)
  const hoje = hojeSP()
  const linhas = (m.ocorrencias as Reg[]).map((o): Reg => ({ ...o, pessoa_nome: pessoa.nome, pessoa_codigo: pessoa.codigo, atraso: indicadorAtraso(o as never, hoje), entregas_restantes: Math.max(o.item_contratada - o.item_realizadas, 0) }))
  const abertas = linhas.filter((o) => o.situacao !== 'realizada' && o.situacao !== 'cancelada')
  const outras = linhas.filter((o) => o.situacao === 'realizada' || o.situacao === 'cancelada')
  const comHistorico = linhas.filter((o) => (o.historico as Reg[]).length > 0)
  return (
    <div className="space-y-4">
      <Secao titulo="Entregas em aberto" descricao="Previstas, aguardando agenda, disponíveis para agendar e agendadas">
        {abertas.length === 0 ? <Vazio>Nenhuma entrega em aberto.</Vazio> : <TabelaEntregas linhas={abertas} onAcao={(a, o) => setAcao({ acao: a, o })} pode={pode} ocultarAluna />}
      </Secao>
      <Secao titulo="Realizadas e canceladas">
        {outras.length === 0 ? (
          <Vazio>Nenhuma entrega realizada ainda.</Vazio>
        ) : (
          <ul className="divide-y divide-line">
            {outras.map((o) => (
              <li key={o.id} className="py-2 text-sm">
                <p>
                  <span className="font-medium">
                    {o.item_descricao} nº {o.numero}
                  </span>{' '}
                  · {o.situacao === 'realizada' ? <span className="text-success">realizada em {formatarData(o.data_realizada)}</span> : <span className="text-ink-muted">cancelada: {o.cancelamento_motivo}</span>}
                  {o.profissional_nome && ` · ${o.profissional_nome}`}
                </p>
                {o.resumo_compartilhavel && <p className="text-xs text-ink-soft">Resumo (visível à aluna): {o.resumo_compartilhavel}</p>}
                {o.notas_internas && <p className="text-xs text-brand-700">Nota interna: {o.notas_internas}</p>}
              </li>
            ))}
          </ul>
        )}
      </Secao>
      <Secao titulo="Histórico de agendamentos" descricao="Previsão original, data anterior, nova data, motivo, autor e momento">
        {comHistorico.length === 0 ? (
          <Vazio>Sem alterações registradas.</Vazio>
        ) : (
          <ul className="space-y-3">
            {comHistorico.map((o) => (
              <li key={o.id}>
                <p className="text-sm font-medium">
                  {o.item_descricao} nº {o.numero}
                </p>
                <ul className="mt-1 space-y-0.5 border-l-2 border-gold-line pl-3 text-xs text-ink-soft">
                  {(o.historico as Reg[]).map((h) => (
                    <li key={h.id}>
                      <span className="font-medium">{HISTORICO_OCORRENCIA[h.tipo] ?? h.tipo}</span>
                      {h.valor_anterior && ` · de ${formatarData(h.valor_anterior)}`}
                      {h.valor_novo && ` · para ${formatarData(h.valor_novo)}`}
                      {h.previsao_original && ` · previsão original ${formatarData(h.previsao_original)}`}
                      {h.motivo && ` · motivo: ${h.motivo}`} · {h.autor_nome ?? 'sistema'} em {formatarCarimbo(h.criado_em)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Secao>
      <DialogoAcao acao={acao?.acao ?? null} ocorrencia={acao?.o ?? null} onFechar={() => setAcao(null)} onConcluir={recarregar} />
    </div>
  )
}
