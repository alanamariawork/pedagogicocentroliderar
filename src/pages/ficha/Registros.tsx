import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Secao, Vazio } from '../../components/Estados'
import { Campo, FormDialog, useValores } from '../../components/Form'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { DialogContato } from '../../forms/AcoesOcorrencia'
import { post, type Reg } from '../../lib/api'
import { CANAIS, RESULTADOS_CONTATO } from '../../lib/format'
import { useSessao } from '../../state/Sessao'
import { formatarCarimbo, formatarData, hojeSP } from '../../../shared/datas'

/* ---------------- Contatos (RF06) ---------------- */

export function Contatos({ m, recarregar }: { m: Reg; recarregar: () => void }) {
  const { pode } = useSessao()
  const [novo, setNovo] = useState(false)
  const contatos = m.contatos as Reg[]
  const ocorrencias = new Map((m.ocorrencias as Reg[]).map((o) => [o.id, o]))
  return (
    <Secao
      titulo="Tentativas de contato"
      descricao="Registro manual. O sistema não envia mensagens."
      acao={
        pode('entregas:editar') && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden /> Registrar contato
          </button>
        )
      }
    >
      {contatos.length === 0 ? (
        <Vazio>Nenhum contato registrado nesta matrícula. Contatos ligados a uma entrega também podem ser registrados em "Entregas do mês".</Vazio>
      ) : (
        <ul className="divide-y divide-line">
          {contatos.map((c) => {
            const o = c.ocorrencia_id ? ocorrencias.get(c.ocorrencia_id) : null
            return (
              <li key={c.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{formatarData(c.data)}</span>
                  <Selo>{CANAIS[c.canal] ?? c.canal}</Selo>
                  {c.resultado && <Selo tom={c.resultado === 'sem_resposta' ? 'alerta' : c.resultado === 'agendou' ? 'sucesso' : 'info'}>{RESULTADOS_CONTATO[c.resultado]}</Selo>}
                  <span className="text-xs text-ink-muted">por {c.responsavel_nome ?? '—'}</span>
                </div>
                {o && (
                  <p className="text-xs text-ink-muted">
                    Entrega: {o.item_descricao ?? o.descricao ?? 'entrega'} nº {o.numero}
                  </p>
                )}
                {c.resumo && <p className="text-ink-soft">{c.resumo}</p>}
                {(c.proxima_acao || c.proxima_tentativa) && (
                  <p className="text-xs text-ink-soft">
                    Próxima ação: {c.proxima_acao ?? '—'}
                    {c.proxima_tentativa && ` · tentar em ${formatarData(c.proxima_tentativa)}`}
                  </p>
                )}
                {c.link_externo && (
                  <a href={c.link_externo} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 underline">
                    Link externo
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {novo && <DialogContato matriculaId={m.id} onFechar={() => setNovo(false)} onConcluir={recarregar} />}
    </Secao>
  )
}

/* ---------------- Conquistas (RF09) ---------------- */

export function Conquistas({ m, recarregar }: { m: Reg; recarregar: () => void }) {
  const { pode } = useSessao()
  const [dialogo, setDialogo] = useState<null | 'nova' | Reg>(null)
  const conquistas = m.conquistas as Reg[]
  return (
    <Secao
      titulo="Conquistas"
      descricao="Linha do tempo individual, sem ranking. Só conquistas validadas e liberadas aparecem no portal da aluna."
      acao={
        pode('conquistas:editar') && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setDialogo('nova')}>
            <Plus className="size-4" aria-hidden /> Registrar conquista
          </button>
        )
      }
    >
      {conquistas.length === 0 ? (
        <Vazio>Nenhuma conquista registrada. Registre resultados concretos relatados pela aluna, com a evidência correspondente.</Vazio>
      ) : (
        <ol className="space-y-3 border-l-2 border-gold-line pl-4">
          {conquistas.map((c) => (
            <li key={c.id} className="relative">
              <span className="absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-2 border-gold bg-surface" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-ink">{c.titulo}</p>
                <span className="text-xs text-ink-muted">{formatarData(c.data)}</span>
                {c.validada ? <Selo tom="sucesso">Validada</Selo> : <Selo tom="alerta">Aguardando validação</Selo>}
                {c.visivel_aluna ? <Selo tom="dourado">Visível para a aluna</Selo> : <Selo>Interna</Selo>}
              </div>
              <dl className="mt-1 space-y-0.5 text-sm text-ink-soft">
                {c.situacao_anterior && (
                  <div>
                    <dt className="inline text-ink-muted">Antes: </dt>
                    <dd className="inline">{c.situacao_anterior}</dd>
                  </div>
                )}
                {c.acao_aplicada && (
                  <div>
                    <dt className="inline text-ink-muted">Ação aplicada: </dt>
                    <dd className="inline">{c.acao_aplicada}</dd>
                  </div>
                )}
                {c.resultado_percebido && (
                  <div>
                    <dt className="inline text-ink-muted">Resultado: </dt>
                    <dd className="inline">{c.resultado_percebido}</dd>
                  </div>
                )}
                {c.evidencia && (
                  <div>
                    <dt className="inline text-ink-muted">Evidência: </dt>
                    <dd className="inline">{c.evidencia}</dd>
                  </div>
                )}
              </dl>
              <p className="text-xs text-ink-muted">
                Registrada por {c.autor_nome ?? '—'}
                {c.validada_por_nome && ` · validada por ${c.validada_por_nome} em ${formatarCarimbo(c.validada_em)}`}
              </p>
              {pode('conquistas:validar') && (
                <button type="button" className="btn-secondary btn-sm mt-1" onClick={() => setDialogo(c)}>
                  Validação e visibilidade
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {dialogo === 'nova' && <DialogConquista m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo && dialogo !== 'nova' && <DialogValidarConquista conquista={dialogo} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
    </Secao>
  )
}

function DialogConquista({ m, onFechar, onConcluir }: { m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ titulo: '', data: hojeSP(), situacao_anterior: '', acao_aplicada: '', resultado_percebido: '', evidencia: '' })
  const vazioParaNulo = (v: string) => v.trim() || null
  return (
    <FormDialog
      aberto
      titulo="Registrar conquista"
      descricao="Fica interna até ser validada e liberada para a aluna."
      largura="max-w-xl"
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/matriculas/${m.id}/conquistas`, {
          titulo: valores.titulo,
          data: valores.data,
          situacao_anterior: vazioParaNulo(valores.situacao_anterior),
          acao_aplicada: vazioParaNulo(valores.acao_aplicada),
          resultado_percebido: vazioParaNulo(valores.resultado_percebido),
          evidencia: vazioParaNulo(valores.evidencia),
        })
        fb.sucesso('Conquista registrada.')
        onConcluir()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Campo rotulo="Título" obrigatorio>
          {(p) => <input className="field-control" maxLength={200} {...p} value={valores.titulo} onChange={campo('titulo')} />}
        </Campo>
        <Campo rotulo="Data" obrigatorio>
          {(p) => <input type="date" className="field-control" {...p} value={valores.data} onChange={campo('data')} />}
        </Campo>
      </div>
      <Campo rotulo="Situação anterior">
        {(p) => <textarea rows={2} className="field-control" maxLength={1000} {...p} value={valores.situacao_anterior} onChange={campo('situacao_anterior')} />}
      </Campo>
      <Campo rotulo="Ação aplicada">
        {(p) => <textarea rows={2} className="field-control" maxLength={1000} {...p} value={valores.acao_aplicada} onChange={campo('acao_aplicada')} />}
      </Campo>
      <Campo rotulo="Resultado percebido">
        {(p) => <textarea rows={2} className="field-control" maxLength={1000} {...p} value={valores.resultado_percebido} onChange={campo('resultado_percebido')} />}
      </Campo>
      <Campo rotulo="Evidência" dica="Descrição ou link. Não registre dados financeiros detalhados ou relatos sensíveis.">
        {(p) => <input className="field-control" maxLength={1000} {...p} value={valores.evidencia} onChange={campo('evidencia')} />}
      </Campo>
    </FormDialog>
  )
}

export function DialogValidarConquista({ conquista, onFechar, onConcluir }: { conquista: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ validada: !!conquista.validada, visivel_aluna: !!conquista.visivel_aluna })
  return (
    <FormDialog
      aberto
      titulo="Validar conquista"
      descricao={conquista.titulo}
      onFechar={onFechar}
      onEnviar={async () => {
        await post(`/conquistas/${conquista.id}/validar`, { validada: valores.validada, visivel_aluna: valores.validada && valores.visivel_aluna })
        fb.sucesso('Validação registrada.')
        onConcluir()
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={valores.validada} onChange={campo('validada')} /> Conquista validada pela equipe
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={valores.validada && valores.visivel_aluna} disabled={!valores.validada} onChange={campo('visivel_aluna')} /> Mostrar no portal da aluna
      </label>
      <p className="text-xs text-ink-muted">Conquistas não validadas nunca aparecem para a aluna.</p>
    </FormDialog>
  )
}

/* ---------------- Anotações ---------------- */

export function Anotacoes({ m, recarregar }: { m: Reg; recarregar: () => void }) {
  const { pode } = useSessao()
  const fb = useFeedback()
  const tipos = [pode('notas:internas') && 'operacional', pode('notas:pedagogicas') && 'pedagogica'].filter(Boolean) as string[]
  const [tipo, setTipo] = useState(tipos[0] ?? 'operacional')
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const anotacoes = m.anotacoes as Reg[]

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return fb.erro('Escreva o texto da anotação.')
    setSalvando(true)
    try {
      await post(`/matriculas/${m.id}/anotacoes`, { tipo, texto })
      setTexto('')
      fb.sucesso('Anotação registrada.')
      recarregar()
    } catch (err) {
      fb.erro(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Secao titulo="Anotações internas" descricao="Nunca aparecem no portal da aluna. Registre só o necessário para a operação, sem detalhes íntimos ou diagnósticos.">
      <form onSubmit={salvar} className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-3 text-sm">
          {tipos.map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="radio" name="tipo-anotacao" checked={tipo === t} onChange={() => setTipo(t)} />
              {t === 'operacional' ? 'Operacional' : 'Pedagógica (privada)'}
            </label>
          ))}
        </div>
        <label htmlFor="nova-anotacao" className="sr-only">
          Texto da anotação
        </label>
        <textarea id="nova-anotacao" rows={3} maxLength={2000} className="field-control" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a anotação…" />
        <button type="submit" className="btn-primary btn-sm" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Adicionar anotação'}
        </button>
      </form>
      {anotacoes.length === 0 ? (
        <Vazio>Nenhuma anotação visível para o seu perfil.</Vazio>
      ) : (
        <ul className="divide-y divide-line">
          {anotacoes.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              <p className="text-xs text-ink-muted">
                {formatarCarimbo(a.criado_em)} · {a.autor_nome ?? '—'} · <Selo tom={a.tipo === 'pedagogica' ? 'vinho' : 'neutro'}>{a.tipo === 'pedagogica' ? 'Pedagógica' : 'Operacional'}</Selo>
              </p>
              <p className="whitespace-pre-line text-ink">{a.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}

/* ---------------- Histórico (auditoria) ---------------- */

const ENTIDADE: Record<string, string> = {
  pessoa: 'Pessoa',
  matricula: 'Matrícula',
  item: 'Entregável',
  ocorrencia: 'Entrega',
  contato: 'Contato',
  impedimento: 'Impedimento',
  pausa: 'Pausa',
  feedback: 'Feedback',
  anotacao: 'Anotação',
  conquista: 'Conquista',
  jornada: 'Jornada',
  jornada_etapa: 'Etapa',
  atividade: 'Atividade',
  usuario: 'Usuário',
}

function resumoDados(dados: string | null): string {
  if (!dados) return ''
  try {
    const d = JSON.parse(dados) as Record<string, unknown>
    return Object.entries(d)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
      .slice(0, 6)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v)}`)
      .join(' · ')
  } catch {
    return ''
  }
}

export function Historico({ auditoria }: { auditoria: Reg[] }) {
  return (
    <Secao titulo="Histórico de alterações" descricao="Quem fez o quê e quando. Os registros são preservados mesmo após cancelamento.">
      {auditoria.length === 0 ? (
        <Vazio>Nenhuma alteração registrada.</Vazio>
      ) : (
        <ul className="divide-y divide-line">
          {auditoria.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              <p>
                <span className="font-medium text-ink">{ENTIDADE[a.entidade] ?? a.entidade}</span>
                <span className="text-ink-soft"> · {a.acao.replace(/_/g, ' ')}</span>
              </p>
              <p className="text-xs text-ink-muted">
                {formatarCarimbo(a.criado_em)} · {a.autor_nome ?? 'sistema'}
              </p>
              {resumoDados(a.dados) && <p className="text-xs break-words text-ink-soft">{resumoDados(a.dados)}</p>}
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}
