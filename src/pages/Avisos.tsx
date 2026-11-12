import { useState } from 'react'
import { Mail, Megaphone, MessageCircle, Pause, Pencil, Play, Plus, Repeat, RotateCw, Send } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { IdAluna, Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { mensagemDeErro, post, put, useDados, type Reg } from '../lib/api'
import { formatarCarimbo } from '../../shared/datas'
import type { Tom } from '../components/Selos'
import { ativos, useCatalogos } from '../state/Catalogos'
import { agoraSP, formatarData } from '../../shared/datas'
import { ITENS_ALUNA } from '../portal/menu'

export const RECORRENCIA: Record<string, string> = { nenhuma: 'Não repete', diaria: 'Todo dia', semanal: 'Toda semana', mensal: 'Todo mês' }

const PAGINAS = ITENS_ALUNA.map((i) => ({ id: `#/${i.id}`, nome: `${i.secao} › ${i.nome}` }))

export function Avisos() {
  const { dados, erro, recarregar } = useDados<Reg[]>('/avisos')
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState<Reg | null>(null)
  const fb = useFeedback()
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />

  const alternar = async (a: Reg) => {
    await post(`/avisos/${a.id}/ativo`, { ativo: !a.ativo })
    fb.sucesso(a.ativo ? 'Aviso pausado.' : 'Aviso retomado.')
    recarregar()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-ink-soft">
          Avisos escritos pela equipe e os automáticos (agendamentos, validações, etapas) aparecem no sino do portal da aluna e também saem por e-mail e WhatsApp, em até um minuto. A situação de cada envio fica em “Envios por e-mail e WhatsApp”, abaixo.
        </p>
        <button type="button" className="btn-primary" onClick={() => setNovo(true)}>
          <Plus className="size-4" aria-hidden /> Novo aviso
        </button>
      </div>
      {dados.length === 0 ? (
        <EstadoVazio icone={Megaphone} titulo="Nenhum aviso escrito pela equipe ainda." acao="Escrever o primeiro aviso" onAcao={() => setNovo(true)}>
          <p className="mt-1 max-w-md text-xs text-ink-muted">Envie para uma aluna, uma turma ou todas as alunas ativas, agora ou numa data, e repita todo dia, toda semana ou todo mês.</p>
        </EstadoVazio>
      ) : (
        <ul className="space-y-3">
          {dados.map((a) => (
            <li key={a.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-60 flex-1">
                  <p className="font-medium text-ink">{a.titulo}</p>
                  {a.detalhe && <p className="whitespace-pre-line text-ink-soft">{a.detalhe}</p>}
                  <p className="mt-1 text-xs text-ink-muted">
                    Para:{' '}
                    {a.publico === 'aluna' ? (
                      <>
                        <IdAluna codigo={a.pessoa_codigo} />
                        {a.pessoa_nome}
                      </>
                    ) : a.publico === 'turma' ? (
                      `turma ${a.turma_nome}`
                    ) : (
                      'todas as alunas ativas'
                    )}{' '}
                    · {a.destinatarias} com acesso ao portal
                    {a.link && ` · abre ${PAGINAS.find((p) => p.id === a.link)?.nome ?? a.link}`}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {RECORRENCIA[a.recorrencia]}
                    {a.recorrencia !== 'nenhuma' && a.fim && ` até ${formatarData(a.fim)}`} · enviado {a.envios} vez(es)
                    {a.ultimo_envio && `, último em ${formatarData(a.ultimo_envio)}`}
                    {a.ativo && a.proximo_envio ? ` · próximo envio ${formatarData(a.proximo_envio)}` : ''} · por {a.autor_nome ?? '—'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.recorrencia !== 'nenhuma' && (
                    <Selo tom="vinho">
                      <Repeat className="size-3" aria-hidden /> {RECORRENCIA[a.recorrencia]}
                    </Selo>
                  )}
                  <Selo tom={a.ativo ? (a.envios ? 'sucesso' : 'info') : 'neutro'}>{a.ativo ? (a.envios ? 'Ativo' : 'Programado') : a.proximo_envio ? 'Pausado' : 'Concluído'}</Selo>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditando(a)}>
                    <Pencil className="size-3.5" aria-hidden /> Editar
                  </button>
                  {(a.ativo || a.recorrencia !== 'nenhuma' || !a.envios) && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => alternar(a)}>
                      {a.ativo ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                      {a.ativo ? 'Pausar' : 'Retomar'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <EnviosAvisos />
      {novo && <DialogAviso onFechar={() => setNovo(false)} onConcluir={recarregar} />}
      {editando && <DialogEditarAviso aviso={editando} onFechar={() => setEditando(null)} onConcluir={recarregar} />}
    </div>
  )
}

/** Escrever um aviso. Com `pessoa`, o aviso vai só para ela (usado na ficha). */
export function DialogAviso({ pessoa, onFechar, onConcluir }: { pessoa?: Reg; onFechar: () => void; onConcluir?: () => void }) {
  const fb = useFeedback()
  const cat = useCatalogos()
  const alunas = useDados<Reg[]>(pessoa ? null : '/pessoas').dados
  const { valores, campo } = useValores({
    publico: pessoa ? 'aluna' : 'ativas',
    pessoa_id: pessoa?.id ?? '',
    turma_id: '',
    titulo: '',
    detalhe: '',
    link: '',
    quando: 'agora',
    inicio: agoraSP(),
    recorrencia: 'nenhuma',
    fim: '',
  })
  return (
    <FormDialog
      aberto
      titulo={pessoa ? `Aviso para ${pessoa.nome}` : 'Novo aviso às alunas'}
      descricao="Aparece no sino do portal e também sai por e-mail e WhatsApp (quando configurados)."
      rotulo={valores.quando === 'agora' && valores.recorrencia === 'nenhuma' ? 'Enviar agora' : 'Programar'}
      onFechar={onFechar}
      onEnviar={async () => {
        const r = await post<{ envios: number }>('/avisos', {
          publico: valores.publico,
          pessoa_id: valores.publico === 'aluna' ? valores.pessoa_id || null : null,
          turma_id: valores.publico === 'turma' ? valores.turma_id || null : null,
          titulo: valores.titulo,
          detalhe: valores.detalhe || null,
          link: valores.link || null,
          inicio: valores.quando === 'agora' ? undefined : valores.inicio,
          recorrencia: valores.recorrencia,
          fim: valores.recorrencia !== 'nenhuma' && valores.fim ? valores.fim : null,
        })
        fb.sucesso(r.envios ? 'Aviso enviado.' : 'Aviso programado.')
        onConcluir?.()
      }}
    >
      {!pessoa && (
        <Campo rotulo="Para quem" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.publico} onChange={campo('publico')}>
              <option value="ativas">Todas as alunas ativas</option>
              <option value="turma">Uma turma</option>
              <option value="aluna">Uma aluna</option>
            </select>
          )}
        </Campo>
      )}
      {!pessoa && valores.publico === 'turma' && (
        <Campo rotulo="Turma" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.turma_id} onChange={campo('turma_id')}>
              <Opcoes itens={ativos(cat?.turmas)} vazio="Escolha a turma" />
            </select>
          )}
        </Campo>
      )}
      {!pessoa && valores.publico === 'aluna' && (
        <Campo rotulo="Aluna" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.pessoa_id} onChange={campo('pessoa_id')}>
              <option value="">Escolha a aluna</option>
              {(alunas ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo ? `#${String(a.codigo).padStart(3, '0')} ` : ''}
                  {a.nome}
                </option>
              ))}
            </select>
          )}
        </Campo>
      )}
      <Campo rotulo="Título" obrigatorio>
        {(p) => <input {...p} maxLength={120} className="field-control" value={valores.titulo} onChange={campo('titulo')} />}
      </Campo>
      <Campo rotulo="Mensagem" dica="Evite dados sensíveis: o aviso fica no portal da aluna.">
        {(p) => <textarea {...p} rows={3} maxLength={1000} className="field-control" value={valores.detalhe} onChange={campo('detalhe')} />}
      </Campo>
      <Campo rotulo="Ao clicar, abrir" dica="Opcional: uma página do portal.">
        {(p) => (
          <select {...p} className="field-control" value={valores.link} onChange={campo('link')}>
            <option value="">Nenhuma página</option>
            {PAGINAS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Quando">
          {(p) => (
            <select {...p} className="field-control" value={valores.quando} onChange={campo('quando')}>
              <option value="agora">Agora</option>
              <option value="data">Numa data e hora</option>
            </select>
          )}
        </Campo>
        {valores.quando === 'data' && (
          <Campo rotulo="Data e hora do primeiro envio" obrigatorio>
            {(p) => <input {...p} type="datetime-local" className="field-control" value={valores.inicio} onChange={campo('inicio')} />}
          </Campo>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Repetir">
          {(p) => (
            <select {...p} className="field-control" value={valores.recorrencia} onChange={campo('recorrencia')}>
              {Object.entries(RECORRENCIA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </Campo>
        {valores.recorrencia !== 'nenhuma' && (
          <Campo rotulo="Repetir até" dica="Vazio: repete até alguém pausar.">
            {(p) => <input {...p} type="date" className="field-control" value={valores.fim} onChange={campo('fim')} />}
          </Campo>
        )}
      </div>
    </FormDialog>
  )
}

function DialogEditarAviso({ aviso, onFechar, onConcluir }: { aviso: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ titulo: aviso.titulo ?? '', detalhe: aviso.detalhe ?? '', link: aviso.link ?? '', fim: aviso.fim ?? '' })
  return (
    <FormDialog
      aberto
      titulo="Editar aviso"
      descricao="Muda os próximos envios. Os avisos que já chegaram às alunas continuam como foram."
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/avisos/${aviso.id}`, { titulo: valores.titulo, detalhe: valores.detalhe || null, link: valores.link || null, fim: valores.fim || null })
        fb.sucesso('Aviso atualizado.')
        onConcluir()
      }}
    >
      <Campo rotulo="Título" obrigatorio>
        {(p) => <input {...p} maxLength={120} className="field-control" value={valores.titulo} onChange={campo('titulo')} />}
      </Campo>
      <Campo rotulo="Mensagem">{(p) => <textarea {...p} rows={3} maxLength={1000} className="field-control" value={valores.detalhe} onChange={campo('detalhe')} />}</Campo>
      <Campo rotulo="Ao clicar, abrir">
        {(p) => (
          <select {...p} className="field-control" value={valores.link} onChange={campo('link')}>
            <option value="">Nenhuma página</option>
            {PAGINAS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        )}
      </Campo>
      {aviso.recorrencia !== 'nenhuma' && (
        <Campo rotulo="Repetir até">{(p) => <input {...p} type="date" className="field-control" value={valores.fim} onChange={campo('fim')} />}</Campo>
      )}
    </FormDialog>
  )
}

const SITUACAO_ENVIO: Record<string, [string, Tom]> = {
  enviado: ['Enviado', 'sucesso'],
  pendente: ['Na fila', 'info'],
  falhou: ['Falhou', 'perigo'],
  nao_configurado: ['Não configurado', 'alerta'],
  desligado: ['Desligado', 'neutro'],
}

/** Situação de cada aviso por e-mail e WhatsApp, com nova tentativa e o envio manual pelo WhatsApp da equipe. */
export function EnviosAvisos({ pessoaId }: { pessoaId?: string }) {
  const fb = useFeedback()
  const { dados, erro, recarregar } = useDados<{ envios: Reg[] }>(`/avisos/envios${pessoaId ? `?pessoa_id=${pessoaId}` : ''}`)
  const canais = useDados<Reg>('/avisos/canais')
  const [ocupado, setOcupado] = useState(false)
  const tentar = async (ids?: string[]) => {
    setOcupado(true)
    try {
      const r = await post<{ enviados: number }>('/avisos/envios/tentar', ids ? { ids } : {})
      fb.sucesso(r.enviados ? `${r.enviados} envio(s) concluído(s).` : 'Nada foi enviado agora. Veja o motivo em cada linha.')
      recarregar()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }
  const c = canais.dados
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Envios por e-mail e WhatsApp</h2>
          <p className="text-sm text-ink-soft">Cada aviso do sino também vai para o e-mail e o WhatsApp cadastrados em Clientes. Se um envio falhar, o sistema tenta de novo sozinho algumas vezes.</p>
        </div>
        <button type="button" className="btn-secondary btn-sm" disabled={ocupado} onClick={() => tentar()}>
          <Send className="size-4" aria-hidden /> Enviar pendentes agora
        </button>
      </div>
      {c && (
        <ul className="mt-3 space-y-1 text-xs text-ink-muted">
          <li>
            <Mail className="mr-1 inline size-3.5" aria-hidden />
            E-mail: {c.email.ligado ? 'ligado, pelo mesmo serviço do convite do portal (backoffice).' : 'desligado em Configurações › Parâmetros.'}
          </li>
          <li>
            <MessageCircle className="mr-1 inline size-3.5" aria-hidden />
            WhatsApp: {!c.whatsapp.ligado ? 'desligado em Configurações › Parâmetros.' : c.whatsapp.falta.length ? `ainda não configurado (falta ${c.whatsapp.falta.join(', ')}). Até lá, use o botão WhatsApp de cada linha.` : 'ligado, pela API oficial do WhatsApp.'}
          </li>
        </ul>
      )}
      {erro ? (
        <p className="mt-3 text-sm text-danger">{erro}</p>
      ) : !dados ? (
        <Carregando />
      ) : !dados.envios.length ? (
        <p className="mt-3 text-sm text-ink-muted">Nenhum aviso entregue desde que o envio por e-mail e WhatsApp foi ligado.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {dados.envios.map((e) => {
            const pendentes = Object.values(e.canais as Record<string, Reg>).filter((x) => x.situacao !== 'enviado').map((x) => x.id)
            return (
              <li key={e.notificacao_id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-56 flex-1">
                  <p className="font-medium">{e.titulo}</p>
                  <p className="text-xs text-ink-muted">
                    {!pessoaId && (
                      <>
                        <IdAluna codigo={e.pessoa_codigo} />
                        {e.pessoa_nome} ·{' '}
                      </>
                    )}
                    {formatarCarimbo(e.criado_em)}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {(['email', 'whatsapp'] as const).map((canal) => {
                      const x = (e.canais as Record<string, Reg>)[canal]
                      if (!x) return null
                      const [rotulo, tom] = SITUACAO_ENVIO[x.situacao] ?? [x.situacao, 'neutro']
                      return (
                        <p key={canal} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="w-16 text-ink-muted">{canal === 'email' ? 'E-mail' : 'WhatsApp'}</span>
                          <Selo tom={tom}>{rotulo}</Selo>
                          {x.detalhe && x.situacao !== 'enviado' && <span className="text-ink-muted">{x.detalhe}</span>}
                        </p>
                      )
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {e.whatsapp_manual && (
                    <a href={e.whatsapp_manual} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" title="Abre o WhatsApp com a mensagem pronta para esta aluna.">
                      <MessageCircle className="size-4" aria-hidden /> WhatsApp
                    </a>
                  )}
                  {pendentes.length > 0 && (
                    <button type="button" className="btn-ghost btn-sm" disabled={ocupado} onClick={() => tentar(pendentes)}>
                      <RotateCw className="size-4" aria-hidden /> Tentar novamente
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
