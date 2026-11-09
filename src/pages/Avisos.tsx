import { useState } from 'react'
import { Megaphone, Pause, Pencil, Play, Plus, Repeat } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { IdAluna, Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { post, put, useDados, type Reg } from '../lib/api'
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
          Avisos escritos pela equipe aparecem no sino do portal da aluna, junto com os automáticos (agendamentos, validações, etapas). Nada é enviado por e-mail ou WhatsApp.
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
      descricao="Aparece no sino do portal. Nada é enviado por e-mail ou WhatsApp."
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
