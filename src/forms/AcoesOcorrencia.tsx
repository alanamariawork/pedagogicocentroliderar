import { useEffect, useMemo, useState } from 'react'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { Vazio } from '../components/Estados'
import { get, post, put, type Reg } from '../lib/api'
import { CANAIS, RESULTADOS_CONTATO, cx } from '../lib/format'
import { ativos, equipe, useCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'
import { useFeedback } from '../components/Feedback'
import { diaDaSemana, formatarData, formatarHoras, hojeSP, somarDias, somarMinutos } from '../../shared/datas'
import { mesclarIntervalos, type Intervalo } from '../../shared/calculos'

export type AcaoOcorrencia = 'agendar' | 'reagendar' | 'desmarcar' | 'contato' | 'impedimento' | 'realizar' | 'situacao' | 'cancelar' | 'conferir'

/** Abre o diálogo da ação escolhida para uma ocorrência (entrega). */
export function DialogoAcao({ acao, ocorrencia, onFechar, onConcluir }: { acao: AcaoOcorrencia | null; ocorrencia: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  if (!acao || !ocorrencia) return null
  const props = { ocorrencia, onFechar, onConcluir }
  switch (acao) {
    case 'agendar':
    case 'reagendar':
      return <DialogAgendar {...props} reagendar={acao === 'reagendar'} />
    case 'desmarcar':
      return <DialogMotivo {...props} titulo="Desmarcar encontro" rotulo="Desmarcar e liberar horário" caminho={`/ocorrencias/${ocorrencia.id}/desmarcar`} aviso="O horário volta a ficar livre e a entrega continua devida (aguardando agenda)." />
    case 'contato':
      return <DialogContato matriculaId={ocorrencia.matricula_id} ocorrenciaId={ocorrencia.id} onFechar={onFechar} onConcluir={onConcluir} />
    case 'impedimento':
      return <DialogImpedimento {...props} />
    case 'realizar':
      return <DialogRealizar {...props} />
    case 'situacao':
      return <DialogSituacao {...props} />
    case 'cancelar':
      return <DialogCancelar {...props} />
    case 'conferir':
      return <DialogConferir {...props} />
  }
}

interface P {
  ocorrencia: Reg
  onFechar: () => void
  onConcluir: () => void
}

function Resumo({ o }: { o: Reg }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 text-sm">
      <p className="font-medium text-ink">
        {o.pessoa_codigo ? `#${String(o.pessoa_codigo).padStart(3, '0')} ` : ''}{o.pessoa_nome} · {o.item_descricao} nº {o.numero}
      </p>
      <p className="text-xs text-ink-muted">
        Previsão: {o.data_prevista ? formatarData(o.data_prevista) : 'sem previsão'} · {o.profissional_nome ?? 'Sem profissional'} · {o.duracao_efetiva ? formatarHoras(o.duracao_efetiva) : 'sem duração'}
      </p>
    </div>
  )
}

/* ---------------- Agendar / reagendar ---------------- */

function horariosLivres(disp: Intervalo[], reservas: Intervalo[], duracao: number, aPartirDe: string): string[] {
  const saida: string[] = []
  const ocupados = mesclarIntervalos(reservas)
  for (const d of mesclarIntervalos(disp)) {
    let ini = d.inicio
    while (somarMinutos(ini, duracao) <= d.fim) {
      const fim = somarMinutos(ini, duracao)
      const conflito = ocupados.find((r) => r.inicio < fim && r.fim > ini)
      if (conflito) {
        ini = conflito.fim > ini ? conflito.fim : somarMinutos(ini, 15)
        continue
      }
      if (ini >= aPartirDe) saida.push(ini)
      ini = fim
    }
  }
  return saida
}

function DialogAgendar({ ocorrencia: o, onFechar, onConcluir, reagendar }: P & { reagendar: boolean }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo, definir } = useValores({
    profissional_id: (o.profissional_efetivo_id as string) ?? '',
    duracao_min: o.duracao_efetiva ? String(o.duracao_efetiva) : '',
    inicio: '',
    fora_disponibilidade: false,
    motivo: '',
  })
  const [agenda, setAgenda] = useState<{ disponibilidades: Reg[]; reservas: Reg[] } | null>(null)
  const hoje = hojeSP()
  useEffect(() => {
    if (!valores.profissional_id) return setAgenda(null)
    get(`/agenda?de=${hoje}&ate=${somarDias(hoje, 56)}&profissional_id=${valores.profissional_id}`)
      .then((a) => setAgenda(a as { disponibilidades: Reg[]; reservas: Reg[] }))
      .catch(() => setAgenda({ disponibilidades: [], reservas: [] }))
  }, [valores.profissional_id, hoje])
  const duracao = Number(valores.duracao_min) || 0
  const livres = useMemo(
    () => (agenda && duracao ? horariosLivres(agenda.disponibilidades as Intervalo[], agenda.reservas.filter((r) => r.ocorrencia_id !== o.id) as Intervalo[], duracao, `${hoje}T00:00`) : []),
    [agenda, duracao, o.id, hoje],
  )

  return (
    <FormDialog
      aberto
      titulo={reagendar ? 'Reagendar encontro' : 'Agendar encontro'}
      descricao={reagendar ? 'A data anterior, o motivo e o autor ficam no histórico.' : 'Atividades pedagógicas pendentes não impedem o agendamento.'}
      onFechar={onFechar}
      largura="sm:max-w-xl"
      rotulo={reagendar ? 'Reagendar' : 'Agendar'}
      onEnviar={async () => {
        await post(`/ocorrencias/${o.id}/${reagendar ? 'reagendar' : 'agendar'}`, {
          inicio: valores.inicio,
          profissional_id: valores.profissional_id || null,
          duracao_min: valores.duracao_min || null,
          fora_disponibilidade: valores.fora_disponibilidade,
          motivo: valores.motivo || null,
        })
        fb.sucesso(reagendar ? 'Encontro reagendado.' : 'Encontro agendado.')
        onConcluir()
      }}
    >
      <Resumo o={o} />
      {reagendar && o.data_agendada && <p className="text-sm text-ink-soft">Agendado atualmente para {formatarData(o.data_agendada)}.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Profissional" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.profissional_id} onChange={campo('profissional_id')}>
              <Opcoes itens={ativos(cat?.profissionais)} vazio="Selecione" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Duração (minutos)" obrigatorio dica={!o.duracao_efetiva ? 'Esta entrega não tinha duração definida.' : undefined}>
          {(p) => <input {...p} type="number" min={5} step={5} className="field-control" value={valores.duracao_min} onChange={campo('duracao_min')} />}
        </Campo>
      </div>
      <div>
        <p className="mb-1 text-sm font-medium text-ink-soft">Horários livres nas próximas 8 semanas</p>
        {!valores.profissional_id || !duracao ? (
          <Vazio>Escolha a profissional e a duração para ver os horários.</Vazio>
        ) : !agenda ? (
          <p className="text-sm text-ink-muted">Carregando agenda…</p>
        ) : livres.length === 0 ? (
          <Vazio>Nenhum horário livre cadastrado para esta profissional. Cadastre a disponibilidade em "Capacidade e agenda" ou informe um horário abaixo.</Vazio>
        ) : (
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {livres.slice(0, 60).map((h) => (
              <button
                type="button"
                key={h}
                onClick={() => {
                  definir('inicio', h)
                  definir('fora_disponibilidade', false)
                }}
                className={cx('rounded-[var(--radius-control)] border px-2 py-1 text-xs', valores.inicio === h ? 'border-brand-700 bg-brand-700 text-white' : 'border-line-strong bg-surface hover:bg-surface-muted')}
              >
                {diaDaSemana(h)} {formatarData(h)}
              </button>
            ))}
          </div>
        )}
      </div>
      <Campo rotulo="Data e horário" obrigatorio dica="Escolha um horário livre acima ou digite aqui.">
        {(p) => <input {...p} type="datetime-local" className="field-control" value={valores.inicio} onChange={campo('inicio')} />}
      </Campo>
      <label className="flex items-start gap-2 text-sm text-ink-soft">
        <input type="checkbox" className="mt-0.5" checked={valores.fora_disponibilidade} onChange={campo('fora_disponibilidade')} />
        Agendar fora da disponibilidade cadastrada (exige motivo)
      </label>
      <Campo rotulo={reagendar ? 'Motivo do reagendamento' : 'Motivo / observação'} obrigatorio={reagendar || valores.fora_disponibilidade}>
        {(p) => <input {...p} className="field-control" value={valores.motivo} onChange={campo('motivo')} />}
      </Campo>
    </FormDialog>
  )
}

/* ---------------- Motivo simples (desmarcar) ---------------- */

function DialogMotivo({ ocorrencia: o, onFechar, onConcluir, titulo, rotulo, caminho, aviso }: P & { titulo: string; rotulo: string; caminho: string; aviso: string }) {
  const [motivo, setMotivo] = useState('')
  const fb = useFeedback()
  return (
    <FormDialog
      aberto
      titulo={titulo}
      onFechar={onFechar}
      rotulo={rotulo}
      onEnviar={async () => {
        await post(caminho, { motivo })
        fb.sucesso('Registrado.')
        onConcluir()
      }}
    >
      <Resumo o={o} />
      <p className="text-sm text-ink-soft">{aviso}</p>
      <Campo rotulo="Motivo" obrigatorio>
        {(p) => <textarea {...p} rows={3} className="field-control" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
      </Campo>
    </FormDialog>
  )
}

/* ---------------- Contato (RF06) ---------------- */

export function DialogContato({ matriculaId, ocorrenciaId, onFechar, onConcluir }: { matriculaId: string; ocorrenciaId?: string | null; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const { eu } = useSessao()
  const fb = useFeedback()
  const { valores, campo } = useValores({ data: hojeSP(), canal: 'whatsapp', responsavel_id: eu?.id ?? '', resumo: '', resultado: '', proxima_acao: '', proxima_tentativa: '', link_externo: '' })
  return (
    <FormDialog
      aberto
      titulo="Registrar contato"
      descricao="Registro manual: nenhuma mensagem é enviada pelo sistema."
      onFechar={onFechar}
      onEnviar={async () => {
        await post('/contatos', { ...valores, matricula_id: matriculaId, ocorrencia_id: ocorrenciaId ?? null, resultado: valores.resultado || null })
        fb.sucesso('Contato registrado.')
        onConcluir()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data do contato" obrigatorio>
          {(p) => <input {...p} type="date" max={hojeSP()} className="field-control" value={valores.data} onChange={campo('data')} />}
        </Campo>
        <Campo rotulo="Canal" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.canal} onChange={campo('canal')}>
              {Object.entries(CANAIS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo rotulo="Responsável">
          {(p) => (
            <select {...p} className="field-control" value={valores.responsavel_id} onChange={campo('responsavel_id')}>
              <Opcoes itens={equipe(cat)} />
            </select>
          )}
        </Campo>
        <Campo rotulo="Resultado">
          {(p) => (
            <select {...p} className="field-control" value={valores.resultado} onChange={campo('resultado')}>
              <option value="">Não informado</option>
              {Object.entries(RESULTADOS_CONTATO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <Campo rotulo="Resumo" dica="Registre só o necessário para a operação. Evite detalhes pessoais sensíveis.">
        {(p) => <textarea {...p} rows={2} className="field-control" value={valores.resumo} onChange={campo('resumo')} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Próxima ação">
          {(p) => <input {...p} className="field-control" value={valores.proxima_acao} onChange={campo('proxima_acao')} />}
        </Campo>
        <Campo rotulo="Próxima tentativa">
          {(p) => <input {...p} type="date" className="field-control" value={valores.proxima_tentativa} onChange={campo('proxima_tentativa')} />}
        </Campo>
      </div>
      <Campo rotulo="Link externo (opcional)" dica="Ex.: link da conversa ou do evento na agenda.">
        {(p) => <input {...p} type="url" placeholder="https://" className="field-control" value={valores.link_externo} onChange={campo('link_externo')} />}
      </Campo>
    </FormDialog>
  )
}

/* ---------------- Impedimento ---------------- */

function DialogImpedimento({ ocorrencia: o, onFechar, onConcluir }: P) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo } = useValores({ motivo_id: '', descricao: '', responsavel_id: '' })
  const motivo = cat?.['motivos-impedimento'].find((m) => m.id === valores.motivo_id)
  return (
    <FormDialog
      aberto
      titulo="Registrar impedimento"
      descricao="Diz por que a entrega está parada e quem deve agir."
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/ocorrencias/${o.id}/impedimentos`, valores)
        fb.sucesso('Impedimento registrado.')
        onConcluir()
      }}
    >
      <Resumo o={o} />
      <Campo rotulo="Motivo" obrigatorio>
        {(p) => (
          <select {...p} className="field-control" value={valores.motivo_id} onChange={campo('motivo_id')}>
            <Opcoes itens={ativos(cat?.['motivos-impedimento'])} vazio="Selecione" />
          </select>
        )}
      </Campo>
      <Campo rotulo="Descrição" obrigatorio={!!motivo?.exige_descricao}>
        {(p) => <textarea {...p} rows={2} className="field-control" value={valores.descricao} onChange={campo('descricao')} />}
      </Campo>
      <Campo rotulo="Quem deve agir" obrigatorio>
        {(p) => (
          <select {...p} className="field-control" value={valores.responsavel_id} onChange={campo('responsavel_id')}>
            <Opcoes itens={equipe(cat)} vazio="Selecione" />
          </select>
        )}
      </Campo>
    </FormDialog>
  )
}

/* ---------------- Realizar (ET07) ---------------- */

function DialogRealizar({ ocorrencia: o, onFechar, onConcluir }: P) {
  const { pode } = useSessao()
  const fb = useFeedback()
  const { valores, campo } = useValores({ data_realizada: (o.data_agendada as string)?.slice(0, 10) && o.data_agendada.slice(0, 10) <= hojeSP() ? o.data_agendada.slice(0, 10) : hojeSP(), resumo_compartilhavel: '', notas_internas: '' })
  const [etapas, setEtapas] = useState<Reg[]>([])
  const [acoes, setAcoes] = useState<{ titulo: string; jornada_etapa_id: string }[]>([])
  useEffect(() => {
    if (!pode('jornada:ver')) return
    get(`/matriculas/${o.matricula_id}/jornada`)
      .then((j) => setEtapas(((j?.etapas as Reg[]) ?? []).filter((e) => e.situacao === 'liberada')))
      .catch(() => null)
  }, [o.matricula_id, pode])
  return (
    <FormDialog
      aberto
      titulo="Marcar como realizado"
      onFechar={onFechar}
      rotulo="Registrar realização"
      largura="sm:max-w-xl"
      onEnviar={async () => {
        await post(`/ocorrencias/${o.id}/realizar`, { ...valores, acoes: acoes.filter((a) => a.titulo.trim() && a.jornada_etapa_id) })
        fb.sucesso('Entrega registrada como realizada.')
        onConcluir()
      }}
    >
      <Resumo o={o} />
      <Campo rotulo="Data real do encontro" obrigatorio dica="Não pode estar no futuro.">
        {(p) => <input {...p} type="date" max={hojeSP()} className="field-control" value={valores.data_realizada} onChange={campo('data_realizada')} />}
      </Campo>
      <Campo rotulo="Resumo compartilhável" dica="Aparece para a aluna no portal.">
        {(p) => <textarea {...p} rows={3} className="field-control" value={valores.resumo_compartilhavel} onChange={campo('resumo_compartilhavel')} />}
      </Campo>
      {pode('notas:internas') && (
        <Campo rotulo="Notas internas" dica="Nunca aparecem para a aluna. Registre só observações operacionais necessárias.">
          {(p) => <textarea {...p} rows={3} className="field-control" value={valores.notas_internas} onChange={campo('notas_internas')} />}
        </Campo>
      )}
      {etapas.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium text-ink-soft">Ações combinadas (entram no plano da aluna)</p>
          {acoes.map((a, n) => (
            <div key={n} className="mb-2 grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
              <input aria-label="Ação" className="field-control" value={a.titulo} onChange={(e) => setAcoes((l) => l.map((x, i) => (i === n ? { ...x, titulo: e.target.value } : x)))} />
              <select aria-label="Etapa" className="field-control" value={a.jornada_etapa_id} onChange={(e) => setAcoes((l) => l.map((x, i) => (i === n ? { ...x, jornada_etapa_id: e.target.value } : x)))}>
                {etapas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.trilha_nome} · {e.titulo}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAcoes((l) => l.filter((_, i) => i !== n))}>
                Remover
              </button>
            </div>
          ))}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAcoes((l) => [...l, { titulo: '', jornada_etapa_id: etapas[0].id }])}>
            Adicionar ação
          </button>
        </div>
      )}
    </FormDialog>
  )
}

/* ---------------- Situação operacional ---------------- */

function DialogSituacao({ ocorrencia: o, onFechar, onConcluir }: P) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo } = useValores({
    situacao: ['prevista', 'aguardando_agenda', 'disponivel_agendar'].includes(o.situacao) ? o.situacao : 'prevista',
    responsavel_resolucao_id: (o.responsavel_resolucao_id as string) ?? '',
    profissional_id: '',
    duracao_min: '',
  })
  return (
    <FormDialog
      aberto
      titulo="Situação operacional"
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/ocorrencias/${o.id}/situacao`, { ...valores, profissional_id: valores.profissional_id || null, duracao_min: valores.duracao_min || null })
        fb.sucesso('Situação atualizada.')
        onConcluir()
      }}
    >
      <Resumo o={o} />
      <Campo rotulo="Situação" obrigatorio>
        {(p) => (
          <select {...p} className="field-control" value={valores.situacao} onChange={campo('situacao')}>
            <option value="prevista">Prevista</option>
            <option value="aguardando_agenda">Aguardando agenda (sem horário da profissional)</option>
            <option value="disponivel_agendar">Disponível para agendar (horários enviados à aluna)</option>
          </select>
        )}
      </Campo>
      <Campo rotulo="Responsável pela resolução">
        {(p) => (
          <select {...p} className="field-control" value={valores.responsavel_resolucao_id} onChange={campo('responsavel_resolucao_id')}>
            <Opcoes itens={equipe(cat)} vazio="Não definido" />
          </select>
        )}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Trocar profissional (só esta entrega)">
          {(p) => (
            <select {...p} className="field-control" value={valores.profissional_id} onChange={campo('profissional_id')}>
              <Opcoes itens={ativos(cat?.profissionais)} vazio="Manter" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Duração desta entrega (min)">
          {(p) => <input {...p} type="number" min={5} step={5} className="field-control" placeholder={o.duracao_efetiva ? String(o.duracao_efetiva) : 'sem duração'} value={valores.duracao_min} onChange={campo('duracao_min')} />}
        </Campo>
      </div>
    </FormDialog>
  )
}

/* ---------------- Cancelar mediante decisão ---------------- */

function DialogCancelar({ ocorrencia: o, onFechar, onConcluir }: P) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ manter: 'sim', motivo: '' })
  return (
    <FormDialog
      aberto
      perigo
      titulo="Cancelar entrega mediante decisão"
      descricao="Cancelar um horário não reduz a obrigação. Escolha explicitamente o que acontece com ela."
      onFechar={onFechar}
      rotulo="Registrar decisão"
      onEnviar={async () => {
        await post(`/ocorrencias/${o.id}/cancelar`, { manter_obrigacao: valores.manter === 'sim', motivo: valores.motivo })
        fb.sucesso('Decisão registrada.')
        onConcluir()
      }}
    >
      <Resumo o={o} />
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-medium text-ink-soft">O que acontece com a obrigação?</legend>
        <label className="flex gap-2">
          <input type="radio" name="manter" value="sim" checked={valores.manter === 'sim'} onChange={campo('manter')} />
          Continua devida: uma nova entrega sem previsão substitui esta.
        </label>
        <label className="flex gap-2">
          <input type="radio" name="manter" value="nao" checked={valores.manter === 'nao'} onChange={campo('manter')} />
          Reduzir a quantidade devida em 1 (ajuste registrado).
        </label>
      </fieldset>
      <Campo rotulo="Motivo da decisão" obrigatorio>
        {(p) => <textarea {...p} rows={3} className="field-control" value={valores.motivo} onChange={campo('motivo')} />}
      </Campo>
    </FormDialog>
  )
}

/* ---------------- Conferência de registro legado ---------------- */

function DialogConferir({ ocorrencia: o, onFechar, onConcluir }: P) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ resultado: 'realizada', data_realizada: '', motivo: '' })
  return (
    <FormDialog
      aberto
      titulo="Conferir registro importado"
      descricao={`Valor original: ${o.valor_original ?? '—'}`}
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/ocorrencias/${o.id}/conferir`, { ...valores, data_realizada: valores.data_realizada || null })
        fb.sucesso('Conferência registrada.')
        onConcluir()
      }}
    >
      <Campo rotulo="Resultado" obrigatorio>
        {(p) => (
          <select {...p} className="field-control" value={valores.resultado} onChange={campo('resultado')}>
            <option value="realizada">Foi realizada</option>
            <option value="pendente">Ainda está pendente</option>
          </select>
        )}
      </Campo>
      {valores.resultado === 'realizada' && (
        <Campo rotulo="Data real" obrigatorio>
          {(p) => <input {...p} type="date" max={hojeSP()} className="field-control" value={valores.data_realizada} onChange={campo('data_realizada')} />}
        </Campo>
      )}
      <Campo rotulo="Observação" obrigatorio>
        {(p) => <input {...p} className="field-control" value={valores.motivo} onChange={campo('motivo')} />}
      </Campo>
    </FormDialog>
  )
}

/** Ações disponíveis para uma ocorrência, conforme a situação e as permissões. */
export function acoesDisponiveis(o: Reg, pode: (p: never) => boolean): { acao: AcaoOcorrencia; rotulo: string }[] {
  const p = pode as (x: string) => boolean
  const aberta = o.situacao !== 'realizada' && o.situacao !== 'cancelada'
  const lista: { acao: AcaoOcorrencia; rotulo: string }[] = []
  if (o.situacao === 'conferencia' && p('obrigacoes:ajustar')) lista.push({ acao: 'conferir', rotulo: 'Conferir registro' })
  if (aberta && o.situacao !== 'agendada' && o.situacao !== 'conferencia' && p('entregas:editar')) lista.push({ acao: 'agendar', rotulo: 'Agendar' })
  if (o.situacao === 'agendada' && p('entregas:editar')) lista.push({ acao: 'reagendar', rotulo: 'Reagendar' }, { acao: 'desmarcar', rotulo: 'Desmarcar' })
  if (aberta && o.situacao !== 'conferencia' && p('entregas:realizar')) lista.push({ acao: 'realizar', rotulo: 'Marcar como realizado' })
  if (p('entregas:editar')) lista.push({ acao: 'contato', rotulo: 'Registrar contato' })
  if (aberta && p('entregas:editar')) lista.push({ acao: 'impedimento', rotulo: 'Registrar impedimento' })
  if (aberta && o.situacao !== 'agendada' && o.situacao !== 'conferencia' && p('entregas:editar')) lista.push({ acao: 'situacao', rotulo: 'Situação e responsável' })
  if (aberta && p('obrigacoes:ajustar')) lista.push({ acao: 'cancelar', rotulo: 'Cancelar (decisão)' })
  return lista
}
