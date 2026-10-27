import { useState } from 'react'
import { CheckCircle2, ExternalLink, Plus } from 'lucide-react'
import { Carregando, EstadoErro, Secao, Vazio } from '../../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../../components/Form'
import { Selo, SeloCadeado, TOM_ATIVIDADE, TOM_ETAPA } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { post, put, useDados, type Reg } from '../../lib/api'
import { SITUACAO_ATIVIDADE, SITUACAO_ETAPA } from '../../lib/format'
import { ativos, equipe, useCatalogos } from '../../state/Catalogos'
import { useSessao } from '../../state/Sessao'
import { formatarCarimbo, formatarData, hojeSP } from '../../../shared/datas'

type Dialogo =
  | { tipo: 'definir' }
  | { tipo: 'editar_jornada' }
  | { tipo: 'liberar' | 'concluir' | 'prazo' | 'nova_atividade'; etapa: Reg }
  | { tipo: 'evidencia' | 'validar' | 'editar_atividade'; atividade: Reg }

export function JornadaAluna({ m }: { m: Reg }) {
  const { dados: j, erro, carregando, recarregar } = useDados(`/matriculas/${m.id}/jornada`)
  const { pode } = useSessao()
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const fechar = () => setDialogo(null)

  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (carregando && !j) return <Carregando />
  if (!j)
    return (
      <>
        <Vazio>
          A jornada pedagógica ainda não foi definida para esta matrícula.
          {pode('jornada:editar') && (
            <button type="button" className="btn-primary mx-auto mt-3 flex" onClick={() => setDialogo({ tipo: 'definir' })}>
              Definir jornada inicial
            </button>
          )}
        </Vazio>
        {dialogo?.tipo === 'definir' && <DialogDefinir m={m} onFechar={fechar} onConcluir={recarregar} />}
      </>
    )

  const etapas = j.etapas as Reg[]
  return (
    <div className="space-y-4">
      <Secao
        titulo={
          <>
            {j.trilha_nome ?? 'Trilha não definida'} <span className="text-ink-muted">· pilar atual: {j.pilar_nome ?? '—'}</span>
          </>
        }
        descricao="Tempo de contrato não define a evolução: avanços dependem de validação pedagógica."
        acao={
          pode('jornada:editar') && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'editar_jornada' })}>
              Trilha, pilar e diagnóstico
            </button>
          )
        }
      >
        {'diagnostico_operacional' in j && <p className="text-sm text-ink-soft">Diagnóstico operacional: {j.diagnostico_operacional ?? '—'}</p>}
      </Secao>

      {etapas.length === 0 && <Vazio>Esta trilha ainda não tem etapas cadastradas. Cadastre-as em "Trilhas e etapas".</Vazio>}
      {etapas.map((e) => (
        <section key={e.id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="eyebrow">
                {e.trilha_nome} · {e.pilar_nome ?? 'sem pilar'}
              </p>
              <h3 className="font-display text-base font-semibold">{e.titulo}</h3>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {e.situacao === 'bloqueada' ? <SeloCadeado /> : <Selo tom={TOM_ETAPA[e.situacao]}>{SITUACAO_ETAPA[e.situacao]}</Selo>}
                <Selo>{e.progresso.texto}</Selo>
                {e.prazo_individual ? (
                  <Selo tom={e.prazo_individual < hojeSP() && e.situacao !== 'concluida' ? 'perigo' : 'neutro'}>Prazo individual: {formatarData(e.prazo_individual)}</Selo>
                ) : (
                  <Selo>Sem prazo definido</Selo>
                )}
                {e.validador_nome && <Selo tom="info">Valida: {e.validador_nome}</Selo>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {pode('jornada:editar') && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDialogo({ tipo: 'prazo', etapa: e })}>
                  Prazo e validador
                </button>
              )}
              {e.situacao === 'bloqueada' && pode('jornada:validar') && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'liberar', etapa: e })}>
                  Liberar etapa
                </button>
              )}
              {e.situacao === 'liberada' && pode('jornada:validar') && (
                <button type="button" className="btn-primary btn-sm" onClick={() => setDialogo({ tipo: 'concluir', etapa: e })}>
                  Validar conclusão
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3 px-4 py-3 text-sm">
            {e.objetivo && <p className="text-ink-soft">Objetivo: {e.objetivo}</p>}
            {e.criterio_conclusao && <p className="text-ink-soft">Critério de conclusão: {e.criterio_conclusao}</p>}
            {e.requisitos.length > 0 && (
              <p className="text-xs text-ink-muted">
                Pré-requisitos: {e.requisitos.map((r: Reg) => `${r.titulo}${r.concluida ? ' ✓' : ''}`).join(', ')}
              </p>
            )}
            {e.falta.length > 0 && e.situacao !== 'concluida' && (
              <ul className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 text-xs text-ink-soft">
                <li className="font-medium">O que falta para avançar:</li>
                {e.falta.map((f: string) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            )}
            {e.links.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {e.links.map((l: Reg) => (
                  <li key={l.url}>
                    <a className="inline-flex items-center gap-1 text-brand-700 underline" href={l.url} target="_blank" rel="noreferrer">
                      {l.titulo} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {e.situacao !== 'bloqueada' && (
              <ul className="space-y-2">
                {(e.atividades as Reg[]).map((a) => (
                  <li key={a.id} className="rounded-[var(--radius-control)] border border-line p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{a.titulo}</p>
                        {a.descricao && <p className="text-xs text-ink-muted">{a.descricao}</p>}
                        {a.prazo && <p className="text-xs text-ink-muted">Prazo: {formatarData(a.prazo)}</p>}
                      </div>
                      <Selo tom={TOM_ATIVIDADE[a.situacao]}>{SITUACAO_ATIVIDADE[a.situacao]}</Selo>
                    </div>
                    {(a.evidencias as Reg[]).length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-gold-line pl-3 text-xs">
                        {(a.evidencias as Reg[]).map((ev) => (
                          <li key={ev.id}>
                            {ev.texto}
                            {ev.link && (
                              <a className="ml-1 text-brand-700 underline" href={ev.link} target="_blank" rel="noreferrer">
                                link
                              </a>
                            )}
                            <span className="text-ink-muted">
                              {' '}
                              · {ev.registrada_por_equipe ? `registrada pela equipe (${ev.autor_nome})` : 'enviada pela aluna'} · executada em {formatarData(ev.data_execucao)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(a.validacoes as Reg[]).length > 0 && (
                      <p className="mt-1 text-xs text-ink-muted">
                        Última decisão: {SITUACAO_ATIVIDADE[(a.validacoes as Reg[]).at(-1)!.decisao]} por {(a.validacoes as Reg[]).at(-1)!.autor_nome}
                        {(a.validacoes as Reg[]).at(-1)!.comentario && `: ${(a.validacoes as Reg[]).at(-1)!.comentario}`}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pode('jornada:editar') && a.situacao !== 'validada' && (
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'evidencia', atividade: a })}>
                          Registrar execução (equipe)
                        </button>
                      )}
                      {pode('jornada:validar') && a.situacao !== 'validada' && (
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'validar', atividade: a })}>
                          <CheckCircle2 className="size-3.5" aria-hidden /> Validar / pedir revisão
                        </button>
                      )}
                      {pode('jornada:validar') && a.situacao === 'validada' && (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setDialogo({ tipo: 'validar', atividade: a })}>
                          Reabrir para revisão
                        </button>
                      )}
                      {pode('jornada:editar') && (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setDialogo({ tipo: 'editar_atividade', atividade: a })}>
                          Editar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {pode('jornada:editar') && (
                  <li>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo({ tipo: 'nova_atividade', etapa: e })}>
                      <Plus className="size-3.5" aria-hidden /> Atividade individual
                    </button>
                  </li>
                )}
              </ul>
            )}
            {(e.validacoes as Reg[]).length > 0 && (
              <ul className="text-xs text-ink-muted">
                {(e.validacoes as Reg[]).map((v) => (
                  <li key={v.id}>
                    {v.alvo_tipo === 'etapa_liberacao' ? 'Liberada' : 'Concluída'} por {v.autor_nome} em {formatarCarimbo(v.criado_em)}
                    {v.excecao ? <span className="font-medium text-warning"> · exceção: {v.justificativa}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
      <Dialogos dialogo={dialogo} m={m} j={j} onFechar={fechar} onConcluir={recarregar} />
    </div>
  )
}

function Dialogos({ dialogo, m, j, onFechar, onConcluir }: { dialogo: Dialogo | null; m: Reg; j: Reg; onFechar: () => void; onConcluir: () => void }) {
  if (!dialogo) return null
  switch (dialogo.tipo) {
    case 'definir':
      return <DialogDefinir m={m} onFechar={onFechar} onConcluir={onConcluir} />
    case 'editar_jornada':
      return <DialogEditarJornada j={j} onFechar={onFechar} onConcluir={onConcluir} />
    case 'liberar':
    case 'concluir':
      return <DialogDecisaoEtapa etapa={dialogo.etapa} tipo={dialogo.tipo} onFechar={onFechar} onConcluir={onConcluir} />
    case 'prazo':
      return <DialogPrazo etapa={dialogo.etapa} onFechar={onFechar} onConcluir={onConcluir} />
    case 'nova_atividade':
      return <DialogAtividade etapa={dialogo.etapa} onFechar={onFechar} onConcluir={onConcluir} />
    case 'editar_atividade':
      return <DialogAtividade atividade={dialogo.atividade} onFechar={onFechar} onConcluir={onConcluir} />
    case 'evidencia':
      return <DialogEvidencia atividade={dialogo.atividade} onFechar={onFechar} onConcluir={onConcluir} />
    case 'validar':
      return <DialogValidar atividade={dialogo.atividade} onFechar={onFechar} onConcluir={onConcluir} />
  }
}

function DialogDefinir({ m, onFechar, onConcluir }: { m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { pode } = useSessao()
  const modelo = useDados('/pedagogico/modelo').dados
  const { valores, campo } = useValores({ trilha_id: '', pilar_id: '', diagnostico_operacional: '' })
  const [liberar, setLiberar] = useState<string[]>([])
  const etapas = ((modelo?.etapas as Reg[]) ?? []).filter((e) => e.trilha_id === valores.trilha_id && e.ativo)
  const prereq = new Set(((modelo?.prerequisitos as Reg[]) ?? []).map((p) => p.etapa_id))
  return (
    <FormDialog
      aberto
      titulo="Definir jornada inicial"
      onFechar={onFechar}
      largura="sm:max-w-xl"
      onEnviar={async () => {
        await post(`/matriculas/${m.id}/jornada`, { ...valores, pilar_id: valores.pilar_id || null, liberar_etapas: liberar })
        fb.sucesso('Jornada definida.')
        onConcluir()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Trilha" obrigatorio>
          {(p) => (
            <select
              {...p}
              className="field-control"
              value={valores.trilha_id}
              onChange={(e) => {
                campo('trilha_id')(e)
                setLiberar([])
              }}
            >
              <Opcoes itens={ativos(cat?.trilhas)} vazio="Selecione" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Pilar atual">
          {(p) => (
            <select {...p} className="field-control" value={valores.pilar_id} onChange={campo('pilar_id')}>
              <Opcoes itens={ativos(cat?.pilares)} vazio="A definir" />
            </select>
          )}
        </Campo>
      </div>
      <Campo rotulo="Diagnóstico operacional" dica="Observação objetiva e mínima. Não registre diagnósticos de saúde ou relatos íntimos.">
        {(p) => <textarea {...p} rows={3} className="field-control" value={valores.diagnostico_operacional} onChange={campo('diagnostico_operacional')} />}
      </Campo>
      {pode('jornada:validar') && etapas.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink-soft">Etapas liberadas desde o início</legend>
          {etapas.map((e) => (
            <label key={e.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={liberar.includes(e.id)} onChange={(ev) => setLiberar((l) => (ev.target.checked ? [...l, e.id] : l.filter((x) => x !== e.id)))} />
              {e.titulo} {prereq.has(e.id) && <span className="text-xs text-warning">(tem pré-requisito: liberar agora é exceção)</span>}
            </label>
          ))}
        </fieldset>
      )}
    </FormDialog>
  )
}

function DialogEditarJornada({ j, onFechar, onConcluir }: { j: Reg; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo } = useValores({ trilha_id: j.trilha_id ?? '', pilar_id: j.pilar_id ?? '', diagnostico_operacional: j.diagnostico_operacional ?? '', motivo: '' })
  const mudou = valores.trilha_id !== j.trilha_id || (valores.pilar_id || null) !== j.pilar_id
  return (
    <FormDialog
      aberto
      titulo="Trilha, pilar e diagnóstico"
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/jornadas/${j.id}`, { ...valores, pilar_id: valores.pilar_id || null })
        fb.sucesso('Jornada atualizada.')
        onConcluir()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Trilha" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.trilha_id} onChange={campo('trilha_id')}>
              <Opcoes itens={ativos(cat?.trilhas)} />
            </select>
          )}
        </Campo>
        <Campo rotulo="Pilar atual">
          {(p) => (
            <select {...p} className="field-control" value={valores.pilar_id} onChange={campo('pilar_id')}>
              <Opcoes itens={ativos(cat?.pilares)} vazio="A definir" />
            </select>
          )}
        </Campo>
      </div>
      {mudou && (
        <Campo rotulo="Motivo da mudança" obrigatorio dica="Mudar trilha ou pilar exige perfil de validação pedagógica.">
          {(p) => <input {...p} className="field-control" value={valores.motivo} onChange={campo('motivo')} />}
        </Campo>
      )}
      <Campo rotulo="Diagnóstico operacional">{(p) => <textarea {...p} rows={3} className="field-control" value={valores.diagnostico_operacional} onChange={campo('diagnostico_operacional')} />}</Campo>
    </FormDialog>
  )
}

function DialogDecisaoEtapa({ etapa, tipo, onFechar, onConcluir }: { etapa: Reg; tipo: 'liberar' | 'concluir'; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const [justificativa, setJustificativa] = useState('')
  const pendencias =
    tipo === 'liberar' ? (etapa.requisitos as Reg[]).filter((r) => !r.concluida).map((r) => `Pré-requisito não concluído: ${r.titulo}`) : (etapa.atividades as Reg[]).filter((a) => a.situacao !== 'validada').map((a) => `Atividade sem validação: ${a.titulo}`)
  return (
    <FormDialog
      aberto
      titulo={tipo === 'liberar' ? `Liberar "${etapa.titulo}"` : `Validar conclusão de "${etapa.titulo}"`}
      descricao="Decisão pedagógica registrada com autor e data."
      onFechar={onFechar}
      rotulo={tipo === 'liberar' ? 'Liberar' : 'Concluir etapa'}
      onEnviar={async () => {
        await post(`/jornada-etapas/${etapa.id}/${tipo}`, { justificativa: justificativa || null })
        fb.sucesso(tipo === 'liberar' ? 'Etapa liberada.' : 'Etapa concluída.')
        onConcluir()
      }}
    >
      {pendencias.length > 0 ? (
        <>
          <ul className="rounded bg-warning-soft px-3 py-2 text-sm text-warning">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <Campo rotulo="Justificativa da exceção" obrigatorio>
            {(p) => <textarea {...p} rows={3} className="field-control" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />}
          </Campo>
        </>
      ) : (
        <p className="text-sm text-ink-soft">{tipo === 'liberar' ? 'Todos os pré-requisitos estão concluídos.' : 'Todas as atividades da etapa estão validadas.'}</p>
      )}
    </FormDialog>
  )
}

function DialogPrazo({ etapa, onFechar, onConcluir }: { etapa: Reg; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo } = useValores({ prazo_individual: etapa.prazo_individual ?? '', validador_id: etapa.validador_id ?? '' })
  return (
    <FormDialog
      aberto
      titulo="Prazo individual e responsável pela validação"
      descricao="Sem prazo individual, a etapa aparece como 'Sem prazo definido' e nunca como atrasada."
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/jornada-etapas/${etapa.id}`, { prazo_individual: valores.prazo_individual || null, validador_id: valores.validador_id || null })
        fb.sucesso('Etapa atualizada.')
        onConcluir()
      }}
    >
      <Campo rotulo="Prazo individual (opcional)">{(p) => <input {...p} type="date" className="field-control" value={valores.prazo_individual} onChange={campo('prazo_individual')} />}</Campo>
      <Campo rotulo="Responsável pela validação">
        {(p) => (
          <select {...p} className="field-control" value={valores.validador_id} onChange={campo('validador_id')}>
            <Opcoes itens={equipe(cat)} vazio="Coordenação pedagógica (padrão)" />
          </select>
        )}
      </Campo>
    </FormDialog>
  )
}

function DialogAtividade({ etapa, atividade, onFechar, onConcluir }: { etapa?: Reg; atividade?: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ titulo: atividade?.titulo ?? '', descricao: atividade?.descricao ?? '', link: atividade?.link ?? '', prazo: atividade?.prazo ?? '' })
  return (
    <FormDialog
      aberto
      titulo={atividade ? 'Editar atividade' : 'Nova atividade individual'}
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = { ...valores, prazo: valores.prazo || null }
        if (atividade) await put(`/atividades/${atividade.id}`, corpo)
        else await post(`/jornada-etapas/${etapa!.id}/atividades`, corpo)
        fb.sucesso('Atividade salva.')
        onConcluir()
      }}
    >
      <Campo rotulo="Título" obrigatorio>
        {(p) => <input {...p} className="field-control" value={valores.titulo} onChange={campo('titulo')} />}
      </Campo>
      <Campo rotulo="Descrição">{(p) => <textarea {...p} rows={3} className="field-control" value={valores.descricao} onChange={campo('descricao')} />}</Campo>
      <Campo rotulo="Link de conteúdo externo">{(p) => <input {...p} type="url" placeholder="https://" className="field-control" value={valores.link} onChange={campo('link')} />}</Campo>
      <Campo rotulo="Prazo (opcional)">{(p) => <input {...p} type="date" className="field-control" value={valores.prazo} onChange={campo('prazo')} />}</Campo>
    </FormDialog>
  )
}

function DialogEvidencia({ atividade, onFechar, onConcluir }: { atividade: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ texto: '', link: '', data_execucao: hojeSP() })
  return (
    <FormDialog
      aberto
      titulo="Registrar execução pela equipe"
      descricao="Para quando a aluna executou mas não atualizou o sistema. Fica registrado quem registrou, a evidência e a data."
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/atividades/${atividade.id}/evidencias`, valores)
        fb.sucesso('Execução registrada. A atividade foi enviada para validação.')
        onConcluir()
      }}
    >
      <p className="text-sm font-medium">{atividade.titulo}</p>
      <Campo rotulo="Evidência" dica="Descreva o que foi feito ou informe um link.">
        {(p) => <textarea {...p} rows={3} className="field-control" value={valores.texto} onChange={campo('texto')} />}
      </Campo>
      <Campo rotulo="Link">{(p) => <input {...p} type="url" placeholder="https://" className="field-control" value={valores.link} onChange={campo('link')} />}</Campo>
      <Campo rotulo="Data em que a aluna realizou" obrigatorio>
        {(p) => <input {...p} type="date" max={hojeSP()} className="field-control" value={valores.data_execucao} onChange={campo('data_execucao')} />}
      </Campo>
    </FormDialog>
  )
}

export function DialogValidar({ atividade, onFechar, onConcluir }: { atividade: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ decisao: atividade.situacao === 'validada' ? 'em_revisao' : 'validada', comentario: '' })
  return (
    <FormDialog
      aberto
      titulo="Validação pedagógica"
      onFechar={onFechar}
      rotulo="Registrar decisão"
      onEnviar={async () => {
        await post(`/atividades/${atividade.id}/validar`, valores)
        fb.sucesso('Decisão registrada.')
        onConcluir()
      }}
    >
      <p className="text-sm font-medium">{atividade.titulo}</p>
      <Campo rotulo="Decisão" obrigatorio>
        {(p) => (
          <select {...p} className="field-control" value={valores.decisao} onChange={campo('decisao')}>
            <option value="validada">Validar</option>
            <option value="em_revisao">Pedir revisão</option>
          </select>
        )}
      </Campo>
      <Campo rotulo="Comentário" obrigatorio={valores.decisao === 'em_revisao'} dica="A aluna vê este comentário quando houver pedido de revisão.">
        {(p) => <textarea {...p} rows={3} className="field-control" value={valores.comentario} onChange={campo('comentario')} />}
      </Campo>
    </FormDialog>
  )
}

