import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Secao, Vazio } from '../../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../../components/Form'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { DialogMatricula } from '../../forms/FormMatricula'
import { post, put, type Reg } from '../../lib/api'
import { equipe, useCatalogos } from '../../state/Catalogos'
import { useSessao } from '../../state/Sessao'
import { diferencaDias, formatarCarimbo, formatarData, hojeSP } from '../../../shared/datas'

const INTERESSE: Record<string, string> = { nao_informado: 'Não informado', sim: 'Sim', talvez: 'Talvez', nao: 'Não' }

export function Continuidade({ m, matriculas, pessoa, recarregar }: { m: Reg; matriculas: Reg[]; pessoa: Reg; recarregar: () => void }) {
  const { pode } = useSessao()
  const fb = useFeedback()
  const [dialogo, setDialogo] = useState<null | 'pausa' | 'finalizar' | 'renovar' | 'feedback' | { tipo: 'retorno' | 'decisao'; pausa: Reg } | { tipo: 'transferir'; item: Reg }>(null)
  const pausas = m.pausas as Reg[]
  const feedbacks = m.feedbacks as Reg[]
  const finalizada = m.situacao === 'encerrada' || m.situacao === 'cancelada'
  const anterior = matriculas.find((x) => x.id === m.matricula_anterior_id)
  const pendentesAnteriores = anterior ? (anterior.itens as Reg[]).filter((i) => i.restantes > 0) : []
  const jaRenovada = (m.renovacoes as Reg[]).length > 0
  const decidir = pode('matriculas:decidir')

  async function salvarInteresse(v: string) {
    try {
      await put(`/matriculas/${m.id}/continuidade`, { interesse_renovacao: v })
      fb.sucesso('Interesse em renovação atualizado.')
      recarregar()
    } catch (e) {
      fb.erro(e instanceof Error ? e.message : 'Não foi possível salvar.')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao
        titulo="Pausas"
        descricao="Pausar não altera prazos sozinho: a decisão sobre vigência e previsões é registrada à parte."
        acao={
          decidir &&
          m.situacao === 'ativa' && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo('pausa')}>
              Registrar pausa
            </button>
          )
        }
      >
        {pausas.length === 0 ? (
          <Vazio>Nenhuma pausa registrada nesta matrícula.</Vazio>
        ) : (
          <ul className="space-y-3">
            {pausas.map((p) => (
              <li key={p.id} className="rounded-[var(--radius-control)] border border-line p-3 text-sm">
                <p className="font-medium text-ink">
                  {formatarData(p.inicio)} a {p.fim ? formatarData(p.fim) : 'retorno não definido'}
                  {p.fim && <span className="text-ink-muted"> · {diferencaDias(p.inicio, p.fim) + 1} dia(s)</span>}
                </p>
                <p className="text-ink-soft">{p.motivo}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {p.decisao_prazos === 'pendente' ? (
                    <Selo tom="alerta">Decisão sobre prazos pendente</Selo>
                  ) : p.decisao_prazos === 'manter' ? (
                    <Selo>Prazos mantidos</Selo>
                  ) : (
                    <Selo tom="info">
                      Vigência estendida em {p.dias_extensao} dia(s){p.mover_previsoes ? ' e previsões movidas' : ''}
                    </Selo>
                  )}
                  {p.decidido_em && (
                    <span className="text-xs text-ink-muted">
                      por {p.decidido_por_nome ?? '—'} em {formatarCarimbo(p.decidido_em)}: {p.decisao_justificativa}
                    </span>
                  )}
                </div>
                {decidir && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!p.fim && m.situacao === 'pausada' && (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'retorno', pausa: p })}>
                        Registrar retorno
                      </button>
                    )}
                    {p.decisao_prazos === 'pendente' && (
                      <button type="button" className="btn-primary btn-sm" onClick={() => setDialogo({ tipo: 'decisao', pausa: p })}>
                        Decidir prazos
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="Renovação e encerramento"
        descricao="Renovar cria um novo ciclo. Pendências só passam por transferência explícita."
      >
        <div className="space-y-4 text-sm">
          <label className="block max-w-xs">
            <span className="mb-1 block font-medium text-ink-soft">Interesse em renovar</span>
            <select
              className="field-control"
              value={m.interesse_renovacao ?? 'nao_informado'}
              disabled={!(pode('entregas:editar') || pode('comercial:editar'))}
              onChange={(e) => void salvarInteresse(e.target.value)}
            >
              {Object.entries(INTERESSE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {finalizada && (
            <p>
              Matrícula {m.situacao === 'cancelada' ? 'cancelada' : 'encerrada'} em {formatarData(m.encerramento_data)}
              {m.encerramento_motivo ? `: ${m.encerramento_motivo}` : ''}. Todos os registros foram preservados.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {pode('matriculas:criar') && !jaRenovada && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setDialogo('renovar')}>
                Registrar renovação
              </button>
            )}
            {decidir && !finalizada && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo('finalizar')}>
                Encerrar ou cancelar
              </button>
            )}
          </div>
          {jaRenovada && <p className="text-xs text-ink-muted">Esta matrícula já tem renovação registrada. Selecione a renovação no topo da ficha.</p>}

          {anterior && (
            <div className="border-t border-line pt-3">
              <h3 className="mb-2 font-medium text-ink">Pendências da matrícula anterior</h3>
              {pendentesAnteriores.length === 0 ? (
                <Vazio>A matrícula anterior não tem entregas restantes.</Vazio>
              ) : (
                <ul className="space-y-2">
                  {pendentesAnteriores.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2">
                      <span>
                        {i.descricao} <span className="text-ink-muted">· {i.restantes} restante(s)</span>
                      </span>
                      {decidir && (
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'transferir', item: i })}>
                          Transferir para esta matrícula
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-ink-muted">Nada é transferido automaticamente. Cada transferência exige motivo e fica no histórico das duas matrículas.</p>
            </div>
          )}
        </div>
      </Secao>

      <div className="lg:col-span-2">
        <Secao
          titulo="Satisfação e feedbacks"
          descricao="Registro manual do que a aluna relatou e da ação de acompanhamento combinada."
          acao={
            (pode('entregas:editar') || pode('alunas:editar')) && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setDialogo('feedback')}>
                <Plus className="size-4" aria-hidden /> Registrar feedback
              </button>
            )
          }
        >
          {feedbacks.length === 0 ? (
            <Vazio>Nenhum feedback registrado. Use "Registrar feedback" após uma conversa de acompanhamento.</Vazio>
          ) : (
            <ul className="divide-y divide-line">
              {feedbacks.map((f) => (
                <li key={f.id} className="py-2 text-sm">
                  <p className="text-xs text-ink-muted">
                    {formatarData(f.data)} · {f.responsavel_nome ?? '—'}
                  </p>
                  <p className="text-ink">{f.feedback}</p>
                  {f.acao_acompanhamento && <p className="text-ink-soft">Acompanhamento: {f.acao_acompanhamento}</p>}
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      {dialogo === 'pausa' && <DialogPausa m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'finalizar' && <DialogFinalizar m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'renovar' && <DialogMatricula pessoa={pessoa} anterior={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'feedback' && <DialogFeedback m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo && typeof dialogo === 'object' && dialogo.tipo === 'retorno' && <DialogRetorno pausa={dialogo.pausa} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo && typeof dialogo === 'object' && dialogo.tipo === 'decisao' && <DialogDecisao m={m} pausa={dialogo.pausa} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo && typeof dialogo === 'object' && dialogo.tipo === 'transferir' && <DialogTransferir m={m} item={dialogo.item} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
    </div>
  )
}

interface PropsDialogo {
  onFechar: () => void
  onConcluir: () => void
}

function DialogPausa({ m, onFechar, onConcluir }: PropsDialogo & { m: Reg }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ inicio: hojeSP(), fim: '', motivo: '' })
  return (
    <FormDialog
      aberto
      titulo="Registrar pausa"
      descricao="Registre só o motivo operacional, sem detalhes íntimos ou de saúde. A vigência e as previsões não mudam agora."
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/matriculas/${m.id}/pausas`, { ...valores, fim: valores.fim || null })
        fb.sucesso('Pausa registrada. A decisão sobre prazos ficou pendente.')
        onConcluir()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Início" obrigatorio>
          {(p) => <input type="date" className="field-control" {...p} value={valores.inicio} onChange={campo('inicio')} />}
        </Campo>
        <Campo rotulo="Retorno previsto" dica="Opcional.">
          {(p) => <input type="date" className="field-control" {...p} value={valores.fim} onChange={campo('fim')} />}
        </Campo>
      </div>
      <Campo rotulo="Motivo operacional" obrigatorio dica='Ex.: "Pausa solicitada pela aluna por motivos pessoais".'>
        {(p) => <input className="field-control" maxLength={500} {...p} value={valores.motivo} onChange={campo('motivo')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogRetorno({ pausa, onFechar, onConcluir }: PropsDialogo & { pausa: Reg }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ fim: hojeSP() })
  return (
    <FormDialog
      aberto
      titulo="Registrar retorno da pausa"
      descricao="A matrícula volta a ficar ativa. Os prazos continuam como estão até a decisão ser registrada."
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/pausas/${pausa.id}/encerrar`, valores)
        fb.sucesso('Retorno registrado.')
        onConcluir()
      }}
    >
      <Campo rotulo="Data de retorno" obrigatorio>
        {(p) => <input type="date" className="field-control" {...p} value={valores.fim} onChange={campo('fim')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogDecisao({ m, pausa, onFechar, onConcluir }: PropsDialogo & { m: Reg; pausa: Reg }) {
  const fb = useFeedback()
  const dias = pausa.fim ? diferencaDias(pausa.inicio, pausa.fim) + 1 : ''
  const { valores, campo, definir } = useValores({ decisao: 'manter', dias_extensao: String(dias), mover_previsoes: false, justificativa: '' })
  return (
    <FormDialog
      aberto
      titulo="Decidir prazos após a pausa"
      descricao={`Vigência atual: ${formatarData(m.data_inicio)} a ${m.data_fim ? formatarData(m.data_fim) : 'não definida'}.`}
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/pausas/${pausa.id}/decisao`, {
          decisao: valores.decisao,
          dias_extensao: valores.decisao === 'estender' ? Number(valores.dias_extensao) || undefined : undefined,
          mover_previsoes: valores.decisao === 'estender' && valores.mover_previsoes,
          justificativa: valores.justificativa,
        })
        fb.sucesso('Decisão registrada.')
        onConcluir()
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink-soft">Decisão</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="decisao" checked={valores.decisao === 'manter'} onChange={() => definir('decisao', 'manter')} /> Manter vigência e previsões
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="decisao" checked={valores.decisao === 'estender'} onChange={() => definir('decisao', 'estender')} /> Estender a vigência
        </label>
      </fieldset>
      {valores.decisao === 'estender' && (
        <>
          <Campo rotulo="Dias de extensão" obrigatorio dica={dias ? `A pausa durou ${dias} dia(s).` : 'A pausa ainda não tem retorno registrado.'}>
            {(p) => <input type="number" min={1} max={730} className="field-control max-w-32" {...p} value={valores.dias_extensao} onChange={campo('dias_extensao')} />}
          </Campo>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={valores.mover_previsoes} onChange={campo('mover_previsoes')} />
            <span>Mover também as previsões em aberto a partir do início da pausa (cada mudança fica no histórico da entrega). Encontros já agendados não são alterados.</span>
          </label>
        </>
      )}
      <Campo rotulo="Justificativa" obrigatorio>
        {(p) => <textarea rows={3} className="field-control" maxLength={1000} {...p} value={valores.justificativa} onChange={campo('justificativa')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogFinalizar({ m, onFechar, onConcluir }: PropsDialogo & { m: Reg }) {
  const fb = useFeedback()
  const { valores, campo, definir } = useValores({ tipo: 'encerrada', data: m.data_fim && m.data_fim < hojeSP() ? m.data_fim : hojeSP(), motivo: '' })
  const restantes = (m.itens as Reg[]).reduce((s, i) => s + i.restantes, 0)
  return (
    <FormDialog
      aberto
      titulo="Encerrar ou cancelar matrícula"
      descricao="Nenhum registro é apagado. Entregas restantes continuam visíveis como estão."
      perigo={valores.tipo === 'cancelada'}
      rotulo={valores.tipo === 'cancelada' ? 'Cancelar matrícula' : 'Encerrar matrícula'}
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/matriculas/${m.id}/finalizar`, { ...valores, motivo: valores.motivo || null })
        fb.sucesso(valores.tipo === 'cancelada' ? 'Matrícula cancelada.' : 'Matrícula encerrada.')
        onConcluir()
      }}
    >
      {restantes > 0 && <p className="rounded-[var(--radius-control)] bg-warning-soft px-3 py-2 text-sm text-warning">Ainda há {restantes} entrega(s) restante(s) nesta matrícula.</p>}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink-soft">Tipo</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="tipo" checked={valores.tipo === 'encerrada'} onChange={() => definir('tipo', 'encerrada')} /> Encerramento (fim do ciclo)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="tipo" checked={valores.tipo === 'cancelada'} onChange={() => definir('tipo', 'cancelada')} /> Cancelamento
        </label>
      </fieldset>
      <Campo rotulo="Data" obrigatorio>
        {(p) => <input type="date" className="field-control" {...p} value={valores.data} onChange={campo('data')} />}
      </Campo>
      <Campo rotulo="Motivo" obrigatorio={valores.tipo === 'cancelada'} dica="Registre só o motivo operacional.">
        {(p) => <textarea rows={2} className="field-control" maxLength={1000} {...p} value={valores.motivo} onChange={campo('motivo')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogTransferir({ m, item, onFechar, onConcluir }: PropsDialogo & { m: Reg; item: Reg }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ quantidade: String(item.restantes), motivo: '' })
  return (
    <FormDialog
      aberto
      titulo="Transferir pendência para a renovação"
      descricao={`${item.descricao}: ${item.restantes} restante(s) na matrícula anterior.`}
      rotulo="Transferir"
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/matriculas/${m.id}/transferencias`, { item_origem_id: item.id, quantidade: Number(valores.quantidade), motivo: valores.motivo })
        fb.sucesso('Pendência transferida. As duas matrículas registram a movimentação.')
        onConcluir()
      }}
    >
      <Campo rotulo="Quantidade" obrigatorio>
        {(p) => <input type="number" min={1} max={item.restantes} className="field-control max-w-32" {...p} value={valores.quantidade} onChange={campo('quantidade')} />}
      </Campo>
      <Campo rotulo="Motivo" obrigatorio dica="Ex.: acordo na renovação, autorizado pela coordenação.">
        {(p) => <textarea rows={2} className="field-control" maxLength={1000} {...p} value={valores.motivo} onChange={campo('motivo')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogFeedback({ m, onFechar, onConcluir }: PropsDialogo & { m: Reg }) {
  const fb = useFeedback()
  const cat = useCatalogos()
  const { eu } = useSessao()
  const { valores, campo } = useValores({ data: hojeSP(), responsavel_id: eu?.id ?? '', feedback: '', acao_acompanhamento: '' })
  return (
    <FormDialog
      aberto
      titulo="Registrar feedback"
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/matriculas/${m.id}/feedbacks`, { ...valores, responsavel_id: valores.responsavel_id || null, acao_acompanhamento: valores.acao_acompanhamento || null })
        fb.sucesso('Feedback registrado.')
        onConcluir()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Data" obrigatorio>
          {(p) => <input type="date" className="field-control" {...p} value={valores.data} onChange={campo('data')} />}
        </Campo>
        <Campo rotulo="Responsável">
          {(p) => (
            <select className="field-control" {...p} value={valores.responsavel_id} onChange={campo('responsavel_id')}>
              <Opcoes itens={equipe(cat)} vazio="Quem está registrando" />
            </select>
          )}
        </Campo>
      </div>
      <Campo rotulo="Feedback" obrigatorio>
        {(p) => <textarea rows={3} className="field-control" maxLength={2000} {...p} value={valores.feedback} onChange={campo('feedback')} />}
      </Campo>
      <Campo rotulo="Ação de acompanhamento">
        {(p) => <input className="field-control" maxLength={1000} {...p} value={valores.acao_acompanhamento} onChange={campo('acao_acompanhamento')} />}
      </Campo>
    </FormDialog>
  )
}
