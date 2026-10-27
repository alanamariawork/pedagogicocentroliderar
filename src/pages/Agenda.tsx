import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Carregando, EstadoErro } from '../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { useFeedback } from '../components/Feedback'
import { Capacidade } from './EntregasMes'
import { del, post, useDados, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { href } from '../lib/rotas'
import { ativos, useCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'
import { diaDaSemana, formatarData, formatarHoras, hojeSP, inicioDaSemana, mesDe, minutosEntre, nomeDoMes, somarDias } from '../../shared/datas'

const hora = (h: string) => h.slice(11, 16)

export function Agenda() {
  const { eu, pode } = useSessao()
  const cat = useCatalogos()
  const fb = useFeedback()
  const ehMentora = eu?.perfil === 'mentora'
  const [semana, setSemana] = useState(() => inicioDaSemana(hojeSP()))
  const [prof, setProf] = useState(ehMentora ? (eu?.profissional_id ?? '') : '')
  const [novo, setNovo] = useState(false)
  const fimSemana = somarDias(semana, 6)
  const q = new URLSearchParams({ de: semana, ate: fimSemana })
  if (prof) q.set('profissional_id', prof)
  const agenda = useDados<{ disponibilidades: Reg[]; reservas: Reg[] }>(`/agenda?${q}`)
  const mes = mesDe(semana)
  const qc = new URLSearchParams({ mes })
  if (prof) qc.set('profissional_id', prof)
  const cap = useDados(`/capacidade?${qc}`)
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(semana, i))
  const hoje = hojeSP()

  async function remover(d: Reg) {
    const ok = await fb.confirmar({
      titulo: 'Remover disponibilidade?',
      mensagem: `${d.profissional_nome}, ${formatarData(d.inicio.slice(0, 10))} das ${hora(d.inicio)} às ${hora(d.fim)}. Horários com encontro agendado não podem ser removidos.`,
      rotuloConfirmar: 'Remover',
      perigo: true,
    })
    if (!ok) return
    try {
      await del(`/disponibilidades/${d.id}`)
      fb.sucesso('Disponibilidade removida.')
      void agenda.recarregar()
      void cap.recarregar()
    } catch (e) {
      fb.erro(e instanceof Error ? e.message : 'Não foi possível remover.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className="btn-secondary btn-sm" aria-label="Semana anterior" onClick={() => setSemana(somarDias(semana, -7))}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="min-w-44 text-center text-sm font-medium" aria-live="polite">
            {formatarData(semana)} a {formatarData(fimSemana)}
          </p>
          <button type="button" className="btn-secondary btn-sm" aria-label="Próxima semana" onClick={() => setSemana(somarDias(semana, 7))}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <button type="button" className="btn-secondary btn-sm ml-1" onClick={() => setSemana(inicioDaSemana(hoje))}>
            Hoje
          </button>
        </div>
        {!ehMentora && (
          <label className="text-xs text-ink-muted">
            Profissional
            <select className="field-control mt-0.5" value={prof} onChange={(e) => setProf(e.target.value)}>
              <Opcoes itens={ativos(cat?.profissionais)} vazio="Todas" />
            </select>
          </label>
        )}
        {pode('agenda:editar') && (
          <button type="button" className="btn-primary ml-auto" onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden /> Adicionar disponibilidade
          </button>
        )}
      </div>
      {ehMentora && !eu?.profissional_id && <p className="text-sm text-warning">Seu usuário não está vinculado a uma profissional. Peça à administração para fazer o vínculo.</p>}

      {agenda.erro ? (
        <EstadoErro mensagem={agenda.erro} onTentar={agenda.recarregar} />
      ) : !agenda.dados ? (
        <Carregando />
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[56rem] grid-cols-7 divide-x divide-line">
            {dias.map((d) => {
              const disp = agenda.dados!.disponibilidades.filter((x) => x.inicio.slice(0, 10) === d)
              const res = agenda.dados!.reservas.filter((x) => x.inicio.slice(0, 10) === d)
              const itens = [...disp.map((x) => ({ t: 'd' as const, x })), ...res.map((x) => ({ t: 'r' as const, x }))].sort((a, b) => a.x.inicio.localeCompare(b.x.inicio))
              return (
                <div key={d} className={cx('min-h-48 p-2', d === hoje && 'bg-gold-soft/50')}>
                  <p className="mb-2 text-xs font-semibold text-ink-soft uppercase">
                    {diaDaSemana(d)} {formatarData(d).slice(0, 5)}
                  </p>
                  {itens.length === 0 && <p className="text-xs text-ink-muted">Sem horários</p>}
                  <ul className="space-y-1.5">
                    {itens.map(({ t, x }) =>
                      t === 'd' ? (
                        <li key={x.id} className="rounded border border-success/30 bg-success-soft px-2 py-1 text-xs">
                          <div className="flex items-start justify-between gap-1">
                            <span>
                              <span className="font-medium">
                                {hora(x.inicio)}–{hora(x.fim)}
                              </span>
                              <span className="block text-ink-soft">{x.profissional_nome}</span>
                              <span className="text-ink-muted">Disponível · {formatarHoras(minutosEntre(x.inicio, x.fim))}</span>
                            </span>
                            {pode('agenda:editar') && (
                              <button type="button" className="rounded p-0.5 text-ink-muted hover:text-danger" aria-label={`Remover disponibilidade das ${hora(x.inicio)}`} onClick={() => void remover(x)}>
                                <Trash2 className="size-3.5" aria-hidden />
                              </button>
                            )}
                          </div>
                        </li>
                      ) : (
                        <li key={x.id} className="rounded border border-brand-500/30 bg-brand-50 px-2 py-1 text-xs">
                          <span className="font-medium">
                            {hora(x.inicio)}–{hora(x.fim)}
                          </span>
                          <span className="block text-ink-soft">{x.profissional_nome}</span>
                          {x.pessoa_id ? (
                            <a className="text-brand-700 underline" href={href({ pagina: 'ficha', id: x.pessoa_id, aba: 'encontros' })}>
                              {x.pessoa_nome}
                            </a>
                          ) : (
                            <span className="text-ink-muted">Reservado</span>
                          )}
                          {x.item_descricao && <span className="block text-ink-muted">{x.item_descricao}</span>}
                          {x.ocorrencia_situacao === 'realizada' && <span className="block text-success">Realizado</span>}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-ink-muted">
        Verde: disponibilidade cadastrada. Vinho: horário reservado por um encontro. Um mesmo horário nunca pode ser reservado duas vezes para a mesma profissional. A agenda é interna: nada é sincronizado com o Google Agenda.
      </p>

      <h2 className="font-display pt-2 text-lg font-semibold">Capacidade de {nomeDoMes(mes)}</h2>
      {cap.erro ? <EstadoErro mensagem={cap.erro} onTentar={cap.recarregar} /> : !cap.dados ? <Carregando /> : <Capacidade capacidade={cap.dados} />}

      {novo && (
        <DialogDisponibilidade
          inicial={semana}
          profissionalFixo={ehMentora ? (eu?.profissional_id ?? '') : prof}
          travado={ehMentora}
          onFechar={() => setNovo(false)}
          onConcluir={() => {
            void agenda.recarregar()
            void cap.recarregar()
          }}
        />
      )}
    </div>
  )
}

function DialogDisponibilidade({ inicial, profissionalFixo, travado, onFechar, onConcluir }: { inicial: string; profissionalFixo: string; travado: boolean; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo } = useValores({ profissional_id: profissionalFixo, data: inicial < hojeSP() ? hojeSP() : inicial, inicio: '09:00', fim: '12:00', semanas: '1', observacao: '' })
  const n = Math.max(1, Math.min(26, Number(valores.semanas) || 1))
  return (
    <FormDialog
      aberto
      titulo="Adicionar disponibilidade"
      descricao="Cadastre blocos de horário livres. Repetir cria o mesmo bloco nas semanas seguintes."
      onFechar={onFechar}
      onEnviar={async () => {
        if (!valores.profissional_id) throw new Error('Selecione a profissional.')
        if (!valores.data) throw new Error('Informe o dia.')
        const intervalos = Array.from({ length: n }, (_, i) => {
          const d = somarDias(valores.data, i * 7)
          return { inicio: `${d}T${valores.inicio}`, fim: `${d}T${valores.fim}` }
        })
        const r = await post('/disponibilidades', { profissional_id: valores.profissional_id, intervalos, observacao: valores.observacao || null })
        fb.sucesso(`${r.criados} bloco(s) de disponibilidade cadastrado(s).`)
        onConcluir()
      }}
    >
      <Campo rotulo="Profissional" obrigatorio>
        {(p) => (
          <select className="field-control" {...p} disabled={travado} value={valores.profissional_id} onChange={campo('profissional_id')}>
            <Opcoes itens={ativos(cat?.profissionais)} vazio="Selecione" />
          </select>
        )}
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Dia" obrigatorio>
          {(p) => <input type="date" className="field-control" {...p} value={valores.data} onChange={campo('data')} />}
        </Campo>
        <Campo rotulo="Início" obrigatorio>
          {(p) => <input type="time" step={900} className="field-control" {...p} value={valores.inicio} onChange={campo('inicio')} />}
        </Campo>
        <Campo rotulo="Fim" obrigatorio>
          {(p) => <input type="time" step={900} className="field-control" {...p} value={valores.fim} onChange={campo('fim')} />}
        </Campo>
      </div>
      <Campo rotulo="Repetir por quantas semanas" dica={n > 1 ? `Último bloco em ${formatarData(somarDias(valores.data || hojeSP(), (n - 1) * 7))}.` : 'Apenas neste dia.'}>
        {(p) => <input type="number" min={1} max={26} className="field-control max-w-28" {...p} value={valores.semanas} onChange={campo('semanas')} />}
      </Campo>
      <Campo rotulo="Observação">
        {(p) => <input className="field-control" maxLength={300} {...p} value={valores.observacao} onChange={campo('observacao')} />}
      </Campo>
    </FormDialog>
  )
}
