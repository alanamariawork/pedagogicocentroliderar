import { useEffect, useState } from 'react'
import { FileText, MessageSquareQuote, Plus, Sparkles } from 'lucide-react'
import { Carregando, EstadoErro, Secao, Vazio } from '../../components/Estados'
import { Campo, FormDialog, useValores } from '../../components/Form'
import { Selo, type Tom } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { get, mensagemDeErro, post, put, useDados, type Reg } from '../../lib/api'
import { useSessao } from '../../state/Sessao'
import { formatarCarimbo, formatarData } from '../../../shared/datas'

const SITUACAO: Record<string, [string, Tom]> = {
  rascunho: ['Rascunho', 'neutro'],
  em_revisao: ['Em revisão', 'alerta'],
  publicada: ['Publicada para a aluna', 'sucesso'],
}
const ANDAMENTO: Record<string, string> = { a_fazer: 'A fazer', em_andamento: 'Em andamento', concluida: 'Concluída' }

/**
 * Plano de Ação da matrícula: rascunho → revisão pela equipe autorizada → publicação para a aluna.
 * A transcrição do encontro fica só aqui (com a permissão "Ver transcrições") e nunca vai ao portal.
 */
export function PlanoAcaoAluna({ m }: { m: Reg }) {
  const { pode } = useSessao()
  const { dados, erro, recarregar } = useDados<Reg>(`/matriculas/${m.id}/acoes`)
  const dep = useDados<Reg>(`/matriculas/${m.id}/depoimentos`)
  const fb = useFeedback()
  const [nova, setNova] = useState(false)
  const [editar, setEditar] = useState<Reg | null>(null)
  const [transcricao, setTranscricao] = useState<Reg | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const acoes = dados.acoes as Reg[]
  const encontros = dados.encontros as Reg[]

  async function passo(a: Reg, p: string) {
    try {
      await post(`/acoes/${a.id}/fluxo`, { passo: p })
      fb.sucesso(p === 'publicar' ? 'Ação publicada: já aparece no Plano de Ação da aluna.' : 'Ação atualizada.')
      recarregar()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  return (
    <div className="space-y-4">
      <Secao
        titulo="Plano de Ação"
        descricao="Só as ações publicadas aparecem para a aluna. Rascunho e revisão ficam com a equipe."
        acao={
          pode('acoes:editar') && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setNova(true)}>
              <Plus className="size-4" aria-hidden /> Nova ação
            </button>
          )
        }
      >
        {acoes.length === 0 ? (
          <Vazio>Nenhuma ação registrada. Crie uma ação ou gere sugestões a partir da transcrição de um encontro.</Vazio>
        ) : (
          <ul className="divide-y divide-line">
            {acoes.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{a.titulo}</p>
                    {a.descricao && <p className="text-ink-soft">{a.descricao}</p>}
                    <p className="text-xs text-ink-muted">
                      {a.encontro_tipo ? `${a.encontro_tipo} nº ${a.encontro_numero}${a.encontro_data ? ` (${formatarData(String(a.encontro_data).slice(0, 10))})` : ''}` : 'Sem encontro vinculado'}
                      {' · '}
                      {a.prazo ? `Prazo: ${formatarData(a.prazo)}` : 'Sem prazo'}
                      {a.origem === 'transcricao' && ' · sugerida pela transcrição'}
                      {a.situacao === 'publicada' && ` · andamento da aluna: ${ANDAMENTO[a.andamento]}`}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Criada por {a.autor_nome ?? '—'}
                      {a.publicada_por_nome && ` · revisada e publicada por ${a.publicada_por_nome} em ${formatarCarimbo(a.publicada_em)}`}
                    </p>
                  </div>
                  <Selo tom={SITUACAO[a.situacao]?.[1]}>{SITUACAO[a.situacao]?.[0] ?? a.situacao}</Selo>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {pode('acoes:editar') && (a.situacao !== 'publicada' || pode('acoes:publicar')) && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditar(a)}>
                      Editar
                    </button>
                  )}
                  {a.situacao === 'rascunho' && pode('acoes:editar') && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => void passo(a, 'enviar_revisao')}>
                      Enviar para revisão
                    </button>
                  )}
                  {a.situacao === 'em_revisao' && pode('acoes:publicar') && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => void passo(a, 'publicar')}>
                      Revisar e publicar
                    </button>
                  )}
                  {a.situacao === 'em_revisao' && pode('acoes:editar') && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void passo(a, 'devolver')}>
                      Voltar para rascunho
                    </button>
                  )}
                  {a.situacao === 'publicada' && pode('acoes:publicar') && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void passo(a, 'despublicar')}>
                      Tirar do portal
                    </button>
                  )}
                  {pode('acoes:editar') && (a.situacao !== 'publicada' || pode('acoes:publicar')) && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => void passo(a, 'arquivar')}>
                      Arquivar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {pode('transcricoes:ver') && (
        <Secao titulo="Transcrições dos encontros" descricao="Área restrita: a aluna não vê a transcrição. Cole a transcrição pronta do encontro.">
          {encontros.length === 0 ? (
            <Vazio>Nenhum encontro agendado ou realizado ainda.</Vazio>
          ) : (
            <ul className="divide-y divide-line">
              {encontros.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {o.tipo} nº {o.numero} · {o.data ? formatarData(String(o.data).slice(0, 10)) : '—'}
                    {o.tem_transcricao ? <Selo tom="info" className="ml-2">Transcrição salva</Selo> : null}
                  </span>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setTranscricao(o)}>
                    <FileText className="size-4" aria-hidden /> {o.tem_transcricao ? 'Ver transcrição' : 'Colar transcrição'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      <Secao titulo="Depoimentos da aluna" descricao="Um espaço por encontro realizado, escrito pela aluna no portal.">
        {((dep.dados?.depoimentos ?? []) as Reg[]).length === 0 ? (
          <Vazio>Nenhum depoimento ainda.</Vazio>
        ) : (
          <ul className="space-y-2">
            {(dep.dados!.depoimentos as Reg[]).map((d) => (
              <li key={d.id} className="rounded border border-line p-3 text-sm">
                <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <MessageSquareQuote className="size-3.5" aria-hidden /> {d.alvo_nome ?? 'Encontro'} · {formatarCarimbo(d.atualizado_em)}
                </p>
                <p className="mt-1 whitespace-pre-line">{d.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {(nova || editar) && <DialogAcao m={m} acao={editar} encontros={encontros} onFechar={() => (setNova(false), setEditar(null))} onConcluir={recarregar} />}
      {transcricao && <DialogTranscricao encontro={transcricao} onFechar={() => setTranscricao(null)} onConcluir={recarregar} />}
    </div>
  )
}

function DialogAcao({ m, acao, encontros, onFechar, onConcluir }: { m: Reg; acao: Reg | null; encontros: Reg[]; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ titulo: acao?.titulo ?? '', descricao: acao?.descricao ?? '', prazo: acao?.prazo ?? '', ocorrencia_id: acao?.ocorrencia_id ?? '' })
  return (
    <FormDialog
      aberto
      titulo={acao ? 'Editar ação' : 'Nova ação (rascunho)'}
      descricao={acao?.situacao === 'publicada' ? 'Esta ação já está publicada: a aluna verá a mudança.' : 'Começa como rascunho. Só chega à aluna depois de revisada e publicada.'}
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = { ...valores, prazo: valores.prazo || null, ocorrencia_id: valores.ocorrencia_id || null }
        if (acao) await put(`/acoes/${acao.id}`, corpo)
        else await post(`/matriculas/${m.id}/acoes`, corpo)
        fb.sucesso('Ação salva.')
        onConcluir()
      }}
    >
      <Campo rotulo="O que foi combinado" obrigatorio>{(p) => <input {...p} className="field-control" maxLength={300} value={valores.titulo} onChange={campo('titulo')} />}</Campo>
      <Campo rotulo="Detalhes">{(p) => <textarea {...p} rows={3} className="field-control" maxLength={3000} value={valores.descricao} onChange={campo('descricao')} />}</Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Prazo">{(p) => <input {...p} type="date" className="field-control" value={valores.prazo} onChange={campo('prazo')} />}</Campo>
        <Campo rotulo="Encontro">
          {(p) => (
            <select {...p} className="field-control" value={valores.ocorrencia_id} onChange={campo('ocorrencia_id')}>
              <option value="">Sem encontro vinculado</option>
              {encontros.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.tipo} nº {o.numero} {o.data ? `(${formatarData(String(o.data).slice(0, 10))})` : ''}
                </option>
              ))}
            </select>
          )}
        </Campo>
      </div>
    </FormDialog>
  )
}

function DialogTranscricao({ encontro, onFechar, onConcluir }: { encontro: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { pode } = useSessao()
  const [texto, setTexto] = useState<string | null>(null)
  const [info, setInfo] = useState<Reg | null>(null)
  const [gerando, setGerando] = useState(false)
  useEffect(() => {
    get(`/ocorrencias/${encontro.id}/transcricao`).then(
      (r) => {
        setInfo(r)
        setTexto(r.transcricao?.texto ?? '')
      },
      (e) => fb.erro(mensagemDeErro(e)),
    )
  }, [encontro.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sugerir() {
    setGerando(true)
    try {
      if (texto?.trim()) await put(`/ocorrencias/${encontro.id}/transcricao`, { texto })
      const r = await post(`/ocorrencias/${encontro.id}/transcricao/sugestoes`, {})
      fb.sucesso(r.criadas ? `${r.criadas} sugestão(ões) criada(s) como rascunho no Plano de Ação.` : 'Nenhuma sugestão nova encontrada.')
      onConcluir()
      onFechar()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    } finally {
      setGerando(false)
    }
  }

  return (
    <FormDialog
      aberto
      largura="max-w-3xl"
      titulo={`Transcrição: ${encontro.tipo} nº ${encontro.numero}`}
      descricao="Restrita à equipe autorizada. A aluna nunca vê este texto."
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/ocorrencias/${encontro.id}/transcricao`, { texto })
        fb.sucesso('Transcrição salva.')
        onConcluir()
      }}
    >
      {texto === null ? (
        <Carregando />
      ) : (
        <>
          <Campo rotulo="Transcrição" obrigatorio dica={info?.automacao}>
            {(p) => <textarea {...p} rows={12} className="field-control font-mono text-xs" value={texto} onChange={(e) => setTexto(e.target.value)} />}
          </Campo>
          {info?.transcricao && (
            <p className="text-xs text-ink-muted">
              Última alteração por {info.transcricao.autor_nome ?? '—'} em {formatarCarimbo(info.transcricao.atualizado_em)}
            </p>
          )}
          {pode('acoes:editar') && (
            <button type="button" className="btn-secondary btn-sm" disabled={gerando || !texto.trim()} onClick={() => void sugerir()}>
              <Sparkles className="size-4" aria-hidden /> {gerando ? 'Gerando…' : 'Salvar e gerar sugestões de ação'}
            </button>
          )}
        </>
      )}
    </FormDialog>
  )
}
