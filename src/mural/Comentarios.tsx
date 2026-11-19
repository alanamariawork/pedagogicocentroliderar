import { useState, type FormEvent } from 'react'
import { CornerDownRight, MessageCircle } from 'lucide-react'
import { del, mensagemDeErro, post, put, type Reg } from '../lib/api'
import { useFeedback } from '../components/Feedback'
import { Selo } from '../components/Selos'
import { formatarData } from '../../shared/datas'

function quando(iso: string) {
  const d = new Date(iso)
  return `${formatarData(iso.slice(0, 10))} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`
}

function Caixa({ inicial = '', rotulo, placeholder, onEnviar, onCancelar }: { inicial?: string; rotulo: string; placeholder: string; onEnviar: (t: string) => Promise<void>; onCancelar?: () => void }) {
  const [texto, setTexto] = useState(inicial)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim() || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      await onEnviar(texto.trim())
      setTexto('')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }
  return (
    <form onSubmit={enviar} className="space-y-2">
      <textarea className="field-control min-h-16" maxLength={1000} placeholder={placeholder} aria-label={placeholder} value={texto} onChange={(e) => setTexto(e.target.value)} />
      {erro && <p className="text-sm text-danger" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <button type="button" className="btn-ghost btn-sm" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary btn-sm" disabled={enviando || !texto.trim()} aria-busy={enviando}>
          {enviando ? 'Enviando…' : rotulo}
        </button>
      </div>
    </form>
  )
}

/**
 * Comentários e respostas. A aluna comenta, responde, edita e exclui os próprios (o servidor confere
 * a autoria). A equipe vê tudo, inclusive o que foi excluído ou removido, e remove ou restaura.
 */
export function Comentarios({ muralId, lista, podeInteragir, modo, onMudou }: { muralId: string; lista: Reg[]; podeInteragir: boolean; modo: 'aluna' | 'equipe'; onMudou: () => void }) {
  const fb = useFeedback()
  const [respondendo, setRespondendo] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const principais = lista.filter((c) => !c.pai_id)
  const respostas = (id: string) => lista.filter((c) => c.pai_id === id)
  const ativos = lista.filter((c) => c.situacao === 'ativo').length

  async function excluir(c: Reg) {
    if (!(await fb.confirmar({ titulo: 'Excluir comentário', mensagem: 'O comentário deixa de aparecer para todas.', rotuloConfirmar: 'Excluir', perigo: true }))) return
    try {
      await del(`/portal/mural/comentarios/${c.id}`)
      onMudou()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  async function restaurar(c: Reg) {
    try {
      await post(`/mural/comentarios/${c.id}/moderar`, { decisao: 'restaurar' })
      fb.sucesso('Comentário restaurado.')
      onMudou()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  // Função de desenho (não componente): mantém o texto digitado ao redesenhar a lista.
  function item(c: Reg, resposta?: boolean) {
    const visivel = c.situacao === 'ativo'
    return (
      <div key={c.id} className={resposta ? 'flex gap-2' : undefined}>
        {resposta && <CornerDownRight className="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden />}
        <div className="min-w-0 flex-1 rounded-lg bg-surface-muted px-3 py-2">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
            <span className="font-medium text-ink">{c.autora_nome}</span>
            <span>{quando(c.criado_em)}</span>
            {c.editado_em && <span>· editado</span>}
            {modo === 'equipe' && c.situacao !== 'ativo' && <Selo tom={c.situacao === 'removido' ? 'perigo' : 'neutro'}>{c.situacao === 'removido' ? 'Removido pela equipe' : 'Excluído pela autora'}</Selo>}
          </p>
          {editando === c.id ? (
            <div className="mt-2">
              <Caixa
                inicial={c.texto}
                rotulo="Salvar"
                placeholder="Editar comentário"
                onCancelar={() => setEditando(null)}
                onEnviar={async (t) => {
                  await put(`/portal/mural/comentarios/${c.id}`, { texto: t })
                  setEditando(null)
                  onMudou()
                }}
              />
            </div>
          ) : visivel || modo === 'equipe' ? (
            <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{c.texto}</p>
          ) : (
            <p className="mt-1 text-sm text-ink-muted italic">Comentário excluído.</p>
          )}
          {modo === 'equipe' && c.motivo_moderacao && <p className="mt-1 text-xs text-ink-muted">Motivo: {c.motivo_moderacao}{c.moderado_por_nome && ` · por ${c.moderado_por_nome}`}</p>}
          {editando !== c.id && (
            <div className="mt-1 flex flex-wrap gap-1">
              {modo === 'aluna' && podeInteragir && visivel && !resposta && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setRespondendo(respondendo === c.id ? null : c.id)}>
                  Responder
                </button>
              )}
              {modo === 'aluna' && c.minha && visivel && podeInteragir && (
                <>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditando(c.id)}>
                    Editar
                  </button>
                  <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => excluir(c)}>
                    Excluir
                  </button>
                </>
              )}
              {modo === 'equipe' && c.situacao === 'ativo' && (
                <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setRemovendo(removendo === c.id ? null : c.id)}>
                  Remover
                </button>
              )}
              {modo === 'equipe' && c.situacao === 'removido' && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => restaurar(c)}>
                  Restaurar
                </button>
              )}
            </div>
          )}
          {removendo === c.id && (
            <div className="mt-2">
              <Caixa
                rotulo="Remover comentário"
                placeholder="Motivo da remoção (fica no registro)"
                onCancelar={() => setRemovendo(null)}
                onEnviar={async (motivo) => {
                  await post(`/mural/comentarios/${c.id}/moderar`, { decisao: 'remover', motivo })
                  setRemovendo(null)
                  fb.sucesso('Comentário removido.')
                  onMudou()
                }}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="card space-y-4 p-5" aria-labelledby={`coment-${muralId}`}>
      <h2 id={`coment-${muralId}`} className="flex items-center gap-2 font-display text-base font-semibold">
        <MessageCircle className="size-5 text-gold" aria-hidden /> Comentários ({ativos})
      </h2>
      {modo === 'aluna' && podeInteragir && (
        <Caixa
          rotulo="Comentar"
          placeholder="Escreva um comentário"
          onEnviar={async (t) => {
            await post(`/portal/mural/${muralId}/comentarios`, { texto: t })
            onMudou()
          }}
        />
      )}
      {principais.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum comentário ainda.</p>
      ) : (
        <ul className="space-y-3">
          {principais.map((c) => (
            <li key={c.id} className="space-y-2">
              {item(c)}
              <div className="space-y-2 pl-4 sm:pl-6">
                {respostas(c.id).map((r) => item(r, true))}
                {respondendo === c.id && (
                  <Caixa
                    rotulo="Responder"
                    placeholder={`Responder a ${c.autora_nome}`}
                    onCancelar={() => setRespondendo(null)}
                    onEnviar={async (t) => {
                      await post(`/portal/mural/${muralId}/comentarios`, { texto: t, pai_id: c.id })
                      setRespondendo(null)
                      onMudou()
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
