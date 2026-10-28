import { useState } from 'react'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import { Carregando, EstadoErro, Secao, Vazio } from '../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { IdAluna, Selo, TOM_MATRICULA } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { DialogMatricula } from '../forms/FormMatricula'
import { post, put, useDados, type Reg } from '../lib/api'
import { SITUACAO_CONTRATO, SITUACAO_MATRICULA, SITUACAO_ONBOARDING, cx } from '../lib/format'
import { href } from '../lib/rotas'
import { ativos, equipe, useCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'
import { formatarCarimbo, formatarData, hojeSP } from '../../shared/datas'
import { Entregaveis, Encontros } from './ficha/Entregaveis'
import { JornadaAluna } from './ficha/Jornada'
import { Continuidade } from './ficha/Continuidade'
import { Anotacoes, Conquistas, Contatos, Historico } from './ficha/Registros'

const ABAS = [
  { id: 'resumo', nome: 'Resumo' },
  { id: 'entregaveis', nome: 'Entregáveis' },
  { id: 'encontros', nome: 'Encontros' },
  { id: 'jornada', nome: 'Jornada' },
  { id: 'contatos', nome: 'Contatos' },
  { id: 'conquistas', nome: 'Conquistas' },
  { id: 'continuidade', nome: 'Pausa, renovação e satisfação' },
  { id: 'anotacoes', nome: 'Anotações' },
  { id: 'historico', nome: 'Histórico' },
]

export function Ficha({ pessoaId, aba = 'resumo' }: { pessoaId: string; aba?: string }) {
  const { dados, erro, recarregar } = useDados(`/pessoas/${pessoaId}`)
  const { pode } = useSessao()
  const [matriculaId, setMatriculaId] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<null | 'pessoa' | 'matricula' | 'acesso'>(null)

  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const { pessoa, matriculas } = dados as { pessoa: Reg; matriculas: Reg[] }
  const m = matriculas.find((x) => x.id === matriculaId) ?? matriculas[0]
  const abas = ABAS.filter((a) => (a.id === 'historico' ? !!dados.auditoria : a.id === 'jornada' ? pode('jornada:ver') : a.id === 'anotacoes' ? pode('notas:internas') || pode('notas:pedagogicas') : true))
  const abaAtual = abas.some((a) => a.id === aba) ? aba : 'resumo'

  return (
    <div className="space-y-4">
      <a href={href({ pagina: 'alunas' })} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Alunas
      </a>
      <div className="card flex flex-wrap items-start justify-between gap-4 p-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">
            <IdAluna codigo={pessoa.codigo} className="align-middle text-sm" />
            {pessoa.nome} {pessoa.demonstracao ? <Selo tom="info">Demonstração</Selo> : null}
          </h2>
          <p className="text-sm text-ink-muted">{[pessoa.email, pessoa.telefone, pessoa.cidade].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}</p>
          {pessoa.observacao_operacional && <p className="mt-1 text-sm text-ink-soft">{pessoa.observacao_operacional}</p>}
          {dados.acesso_portal ? (
            <p className="mt-1 text-xs text-success">Acesso ao portal: {dados.acesso_portal.email}</p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">Sem acesso ao portal da aluna</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {pode('alunas:editar') && (
            <button type="button" className="btn-secondary" onClick={() => setDialogo('pessoa')}>
              <Pencil className="size-4" aria-hidden /> Dados
            </button>
          )}
          {pode('usuarios:admin') && !dados.acesso_portal && (
            <button type="button" className="btn-secondary" onClick={() => setDialogo('acesso')}>
              Criar acesso ao portal
            </button>
          )}
          {pode('matriculas:criar') && (
            <button type="button" className="btn-primary" onClick={() => setDialogo('matricula')}>
              <Plus className="size-4" aria-hidden /> Nova matrícula
            </button>
          )}
        </div>
      </div>

      {matriculas.length === 0 ? (
        <Vazio>Esta pessoa ainda não tem matrícula. Use "Nova matrícula" para registrar vigência e entregáveis.</Vazio>
      ) : (
        <>
          {matriculas.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Matrículas">
              {[...matriculas].reverse().map((x, n) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setMatriculaId(x.id)}
                  aria-pressed={x.id === m.id}
                  className={cx('rounded-[var(--radius-control)] border px-3 py-1.5 text-left text-sm', x.id === m.id ? 'border-brand-700 bg-brand-50' : 'border-line bg-surface hover:bg-surface-muted')}
                >
                  <span className="font-medium">{n === 0 ? 'Matrícula inicial' : `Renovação ${n}`}</span>
                  <span className="block text-xs text-ink-muted">
                    {formatarData(x.data_inicio)} a {formatarData(x.data_fim)} · {SITUACAO_MATRICULA[x.situacao]}
                  </span>
                </button>
              ))}
            </div>
          )}
          <nav aria-label="Seções da ficha" className="flex gap-1 overflow-x-auto border-b border-line">
            {abas.map((a) => (
              <a
                key={a.id}
                href={href({ pagina: 'ficha', id: pessoaId, aba: a.id })}
                aria-current={abaAtual === a.id ? 'page' : undefined}
                className={cx('-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap', abaAtual === a.id ? 'border-brand-700 font-medium text-brand-700' : 'border-transparent text-ink-muted hover:text-ink')}
              >
                {a.nome}
              </a>
            ))}
          </nav>
          <ConteudoAba aba={abaAtual} m={m} matriculas={matriculas} pessoa={pessoa} auditoria={dados.auditoria} recarregar={recarregar} />
        </>
      )}

      {dialogo === 'pessoa' && <DialogPessoa pessoa={pessoa} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'matricula' && <DialogMatricula pessoa={pessoa} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'acesso' && <DialogAcesso pessoa={pessoa} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
    </div>
  )
}

function ConteudoAba({ aba, m, matriculas, pessoa, auditoria, recarregar }: { aba: string; m: Reg; matriculas: Reg[]; pessoa: Reg; auditoria: Reg[] | null; recarregar: () => void }) {
  switch (aba) {
    case 'entregaveis':
      return <Entregaveis m={m} recarregar={recarregar} />
    case 'encontros':
      return <Encontros m={m} pessoa={pessoa} recarregar={recarregar} />
    case 'jornada':
      return <JornadaAluna m={m} />
    case 'contatos':
      return <Contatos m={m} recarregar={recarregar} />
    case 'conquistas':
      return <Conquistas m={m} recarregar={recarregar} />
    case 'continuidade':
      return <Continuidade m={m} matriculas={matriculas} pessoa={pessoa} recarregar={recarregar} />
    case 'anotacoes':
      return <Anotacoes m={m} recarregar={recarregar} />
    case 'historico':
      return <Historico auditoria={auditoria ?? []} />
    default:
      return <Resumo m={m} matriculas={matriculas} recarregar={recarregar} />
  }
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-ink-muted">{rotulo}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}

function Resumo({ m, matriculas, recarregar }: { m: Reg; matriculas: Reg[]; recarregar: () => void }) {
  const { pode } = useSessao()
  const fb = useFeedback()
  const [dialogo, setDialogo] = useState<null | 'dados' | 'contrato' | 'onboarding' | 'conferencia'>(null)
  const anterior = matriculas.find((x) => x.id === m.matricula_anterior_id)
  const totais = (m.itens as Reg[]).reduce((t, i) => ({ c: t.c + i.contratada, r: t.r + i.realizadas }), { c: 0, r: 0 })
  const checklist: { item: string; feito: boolean }[] = m.onboarding_checklist ? JSON.parse(m.onboarding_checklist) : []

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao
        titulo="Matrícula e vigência"
        acao={
          (pode('comercial:editar') || pode('matriculas:decidir')) && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo('dados')}>
              Editar
            </button>
          )
        }
      >
        <dl>
          <Linha rotulo="Situação">
            <Selo tom={TOM_MATRICULA[m.situacao]}>{SITUACAO_MATRICULA[m.situacao]}</Selo>
            {m.encerramento_data && (
              <span className="ml-2 text-xs text-ink-muted">
                em {formatarData(m.encerramento_data)}
                {m.encerramento_motivo && `: ${m.encerramento_motivo}`}
              </span>
            )}
          </Linha>
          <Linha rotulo="Vigência">
            {formatarData(m.data_inicio)} a {m.data_fim ? formatarData(m.data_fim) : <Selo tom="alerta">Término não definido</Selo>}
          </Linha>
          <Linha rotulo="Programa">{m.programa_nome ?? '—'}</Linha>
          <Linha rotulo="Responsável">{m.responsavel_nome ?? '—'}</Linha>
          <Linha rotulo="Mentora">{m.mentora_nome ?? '—'}</Linha>
          <Linha rotulo="Entregas">
            {totais.r} de {totais.c} realizadas · {totais.c - totais.r} restante(s)
          </Linha>
          {anterior && <Linha rotulo="Renovação de">Matrícula de {formatarData(anterior.data_inicio)} a {formatarData(anterior.data_fim)}</Linha>}
          {(m.renovacoes as Reg[]).length > 0 && <Linha rotulo="Renovada em">{(m.renovacoes as Reg[]).map((r) => formatarData(r.data_inicio)).join(', ')}</Linha>}
        </dl>
      </Secao>

      <Secao
        titulo="Contrato e condições comerciais"
        descricao="Controle separado do onboarding (sem ordem obrigatória)"
        acao={
          pode('comercial:editar') && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo('contrato')}>
              Editar
            </button>
          )
        }
      >
        <dl>
          <Linha rotulo="Contrato">
            <Selo tom={m.contrato_situacao === 'assinado' ? 'sucesso' : 'alerta'}>{SITUACAO_CONTRATO[m.contrato_situacao]}</Selo>
          </Linha>
          {'fonte_comercial' in m ? (
            <>
              <Linha rotulo="Fonte comercial">{m.fonte_comercial ?? <span className="text-ink-muted">não informada</span>}</Linha>
              <Linha rotulo="Condições">{m.condicoes_comerciais ?? '—'}</Linha>
              {m.contrato_link && (
                <Linha rotulo="Documento">
                  <a className="text-brand-700 underline" href={m.contrato_link} target="_blank" rel="noreferrer">
                    Abrir link
                  </a>
                </Linha>
              )}
            </>
          ) : (
            <Linha rotulo="Condições">Sem permissão para ver</Linha>
          )}
          <Linha rotulo="Modelo aplicado">{m.pacote_origem_nome ?? 'Itens manuais'}</Linha>
          <Linha rotulo="Pacote e bônus">
            {m.conferencia_comercial === 'conferida' ? (
              <span className="text-success">
                Conferidos por {m.conferida_por_nome} em {formatarCarimbo(m.conferida_em)}
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <Selo tom="alerta">Conferência pendente</Selo>
                {pode('comercial:editar') && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo('conferencia')}>
                    Conferir
                  </button>
                )}
              </span>
            )}
          </Linha>
        </dl>
      </Secao>

      <Secao
        titulo="Onboarding"
        acao={
          pode('onboarding:editar') && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo('onboarding')}>
              Registrar
            </button>
          )
        }
      >
        <dl>
          <Linha rotulo="Situação">
            <Selo tom={m.onboarding_situacao === 'realizado' ? 'sucesso' : 'alerta'}>{SITUACAO_ONBOARDING[m.onboarding_situacao]}</Selo>
            {m.onboarding_situacao === 'realizado' && m.contrato_situacao !== 'assinado' && <Selo tom="perigo" className="ml-1">Contrato ainda pendente</Selo>}
          </Linha>
          <Linha rotulo="Data">{formatarData(m.onboarding_data)}</Linha>
          <Linha rotulo="Responsável">{m.onboarding_responsavel_nome ?? '—'}</Linha>
          <Linha rotulo="Próximo passo">{m.proximo_passo ?? '—'}</Linha>
          <Linha rotulo="Pendências">{m.onboarding_pendencias ?? '—'}</Linha>
        </dl>
        {checklist.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm">
            {checklist.map((c, n) => (
              <li key={n} className={c.feito ? 'text-success' : 'text-ink-muted'}>
                {c.feito ? '✓' : '○'} {c.item}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {dialogo === 'dados' && <DialogDados m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'contrato' && <DialogContrato m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'onboarding' && <DialogOnboarding m={m} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'conferencia' && (
        <FormDialogConferencia
          m={m}
          onFechar={() => setDialogo(null)}
          onConcluir={() => {
            fb.sucesso('Pacote e bônus conferidos.')
            recarregar()
          }}
        />
      )}
    </div>
  )
}

function FormDialogConferencia({ m, onFechar, onConcluir }: { m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const [fonte, setFonte] = useState((m.fonte_comercial as string) ?? '')
  return (
    <FormDialog
      aberto
      titulo="Conferir pacote e bônus"
      descricao="Confirme que os itens da aba Entregáveis batem com a fonte comercial."
      onFechar={onFechar}
      rotulo="Confirmar conferência"
      onEnviar={async () => {
        await post(`/matriculas/${m.id}/conferencia`, { conferida: true, fonte_comercial: fonte })
        onConcluir()
      }}
    >
      <ul className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 text-sm">
        {(m.itens as Reg[]).map((i) => (
          <li key={i.id}>
            {i.contratada}× {i.descricao} ({i.origem === 'bonus' ? 'bônus' : i.origem})
          </li>
        ))}
        {(m.itens as Reg[]).length === 0 && <li>Nenhum item contratado.</li>}
      </ul>
      <Campo rotulo="Fonte comercial conferida" obrigatorio dica="Ex.: contrato assinado, proposta, checkout.">
        {(p) => <input {...p} className="field-control" value={fonte} onChange={(e) => setFonte(e.target.value)} />}
      </Campo>
    </FormDialog>
  )
}

function DialogPessoa({ pessoa, onFechar, onConcluir }: { pessoa: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ nome: pessoa.nome ?? '', email: pessoa.email ?? '', telefone: pessoa.telefone ?? '', cidade: pessoa.cidade ?? '', observacao_operacional: pessoa.observacao_operacional ?? '' })
  return (
    <FormDialog
      aberto
      titulo="Dados da aluna"
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/pessoas/${pessoa.id}`, valores)
        fb.sucesso('Dados atualizados.')
        onConcluir()
      }}
    >
      <Campo rotulo="Nome" obrigatorio>
        {(p) => <input {...p} className="field-control" value={valores.nome} onChange={campo('nome')} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="E-mail">{(p) => <input {...p} type="email" className="field-control" value={valores.email} onChange={campo('email')} />}</Campo>
        <Campo rotulo="Telefone">{(p) => <input {...p} className="field-control" value={valores.telefone} onChange={campo('telefone')} />}</Campo>
      </div>
      <Campo rotulo="Cidade">{(p) => <input {...p} className="field-control" value={valores.cidade} onChange={campo('cidade')} />}</Campo>
      <Campo rotulo="Observação operacional" dica="Só o mínimo necessário para a operação. Não registre diagnósticos ou relatos sensíveis.">
        {(p) => <textarea {...p} rows={2} className="field-control" value={valores.observacao_operacional} onChange={campo('observacao_operacional')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogAcesso({ pessoa, onFechar, onConcluir }: { pessoa: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ email: pessoa.email ?? '', senha_inicial: '' })
  return (
    <FormDialog
      aberto
      titulo="Criar acesso ao portal"
      descricao="A aluna verá somente os próprios dados. Ela deverá trocar a senha no primeiro acesso."
      onFechar={onFechar}
      rotulo="Criar acesso"
      onEnviar={async () => {
        await post('/usuarios', { nome: pessoa.nome, email: valores.email, perfil: 'aluna', pessoa_id: pessoa.id, senha_inicial: valores.senha_inicial })
        fb.sucesso('Acesso criado. Envie a senha inicial à aluna por um canal seguro.')
        onConcluir()
      }}
    >
      <Campo rotulo="E-mail de acesso" obrigatorio>
        {(p) => <input {...p} type="email" className="field-control" value={valores.email} onChange={campo('email')} />}
      </Campo>
      <Campo rotulo="Senha inicial" obrigatorio dica="Mínimo de 10 caracteres, com letras e números.">
        {(p) => <input {...p} type="text" autoComplete="off" className="field-control" value={valores.senha_inicial} onChange={campo('senha_inicial')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogDados({ m, onFechar, onConcluir }: { m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { valores, campo } = useValores({
    programa_id: m.programa_id ?? '',
    turma: m.turma ?? '',
    data_inicio: m.data_inicio ?? '',
    data_fim: m.data_fim ?? '',
    responsavel_id: m.responsavel_id ?? '',
    mentora_id: m.mentora_id ?? '',
    motivo_alteracao_vigencia: '',
  })
  const mudouVigencia = valores.data_inicio !== m.data_inicio || (valores.data_fim || null) !== m.data_fim
  return (
    <FormDialog
      aberto
      titulo="Matrícula e vigência"
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/matriculas/${m.id}/dados`, { ...valores, programa_id: valores.programa_id || null, responsavel_id: valores.responsavel_id || null, mentora_id: valores.mentora_id || null })
        fb.sucesso('Matrícula atualizada.')
        onConcluir()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Programa">
          {(p) => (
            <select {...p} className="field-control" value={valores.programa_id} onChange={campo('programa_id')}>
              <Opcoes itens={ativos(cat?.programas)} vazio="A definir" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Turma">{(p) => <input {...p} className="field-control" value={valores.turma} onChange={campo('turma')} />}</Campo>
        <Campo rotulo="Início" obrigatorio>
          {(p) => <input {...p} type="date" className="field-control" value={valores.data_inicio} onChange={campo('data_inicio')} />}
        </Campo>
        <Campo rotulo="Término">{(p) => <input {...p} type="date" className="field-control" value={valores.data_fim} onChange={campo('data_fim')} />}</Campo>
        <Campo rotulo="Responsável">
          {(p) => (
            <select {...p} className="field-control" value={valores.responsavel_id} onChange={campo('responsavel_id')}>
              <Opcoes itens={equipe(cat)} vazio="A definir" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Mentora">
          {(p) => (
            <select {...p} className="field-control" value={valores.mentora_id} onChange={campo('mentora_id')}>
              <Opcoes itens={ativos(cat?.profissionais)} vazio="A definir" />
            </select>
          )}
        </Campo>
      </div>
      {mudouVigencia && m.data_fim && (
        <Campo rotulo="Motivo da alteração da vigência" obrigatorio dica="A alteração fica no histórico. Previsões de encontros não mudam automaticamente.">
          {(p) => <input {...p} className="field-control" value={valores.motivo_alteracao_vigencia} onChange={campo('motivo_alteracao_vigencia')} />}
        </Campo>
      )}
    </FormDialog>
  )
}

function DialogContrato({ m, onFechar, onConcluir }: { m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ contrato_situacao: m.contrato_situacao, contrato_link: m.contrato_link ?? '', fonte_comercial: m.fonte_comercial ?? '', condicoes_comerciais: m.condicoes_comerciais ?? '' })
  return (
    <FormDialog
      aberto
      titulo="Contrato e condições comerciais"
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/matriculas/${m.id}/contrato`, valores)
        fb.sucesso('Contrato atualizado.')
        onConcluir()
      }}
    >
      <Campo rotulo="Situação do contrato" obrigatorio>
        {(p) => (
          <select {...p} className="field-control" value={valores.contrato_situacao} onChange={campo('contrato_situacao')}>
            <option value="pendente">Pendente</option>
            <option value="enviado">Enviado</option>
            <option value="assinado">Assinado</option>
          </select>
        )}
      </Campo>
      <Campo rotulo="Link do documento" dica="Guarde o link; o sistema não integra com plataformas externas.">
        {(p) => <input {...p} type="url" placeholder="https://" className="field-control" value={valores.contrato_link} onChange={campo('contrato_link')} />}
      </Campo>
      <Campo rotulo="Fonte comercial">{(p) => <input {...p} className="field-control" value={valores.fonte_comercial} onChange={campo('fonte_comercial')} />}</Campo>
      <Campo rotulo="Condições vendidas">{(p) => <textarea {...p} rows={3} className="field-control" value={valores.condicoes_comerciais} onChange={campo('condicoes_comerciais')} />}</Campo>
    </FormDialog>
  )
}

const CHECKLIST_PADRAO = ['Alinhamento de expectativas', 'Apresentação do Método AGE e das trilhas', 'Acesso à plataforma de aulas', 'Entrada nos grupos de WhatsApp', 'Próximo passo combinado']

function DialogOnboarding({ m, onFechar, onConcluir }: { m: Reg; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const { eu } = useSessao()
  const existente: { item: string; feito: boolean }[] = m.onboarding_checklist ? JSON.parse(m.onboarding_checklist) : []
  const [checklist, setChecklist] = useState(existente.length ? existente : CHECKLIST_PADRAO.map((item) => ({ item, feito: false })))
  const { valores, campo } = useValores({
    onboarding_situacao: m.onboarding_situacao,
    onboarding_data: m.onboarding_data ?? hojeSP(),
    onboarding_responsavel_id: m.onboarding_responsavel_id ?? eu?.id ?? '',
    onboarding_pendencias: m.onboarding_pendencias ?? '',
    proximo_passo: m.proximo_passo ?? '',
  })
  return (
    <FormDialog
      aberto
      titulo="Onboarding"
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/matriculas/${m.id}/onboarding`, { ...valores, onboarding_responsavel_id: valores.onboarding_responsavel_id || null, onboarding_checklist: checklist })
        fb.sucesso('Onboarding registrado.')
        onConcluir()
      }}
    >
      {m.contrato_situacao !== 'assinado' && <p className="rounded bg-warning-soft px-3 py-2 text-sm text-warning">Contrato ainda {m.contrato_situacao}. O onboarding pode ser registrado mesmo assim; a pendência contratual continua sinalizada.</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Situação" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.onboarding_situacao} onChange={campo('onboarding_situacao')}>
              <option value="pendente">Pendente</option>
              <option value="agendado">Agendado</option>
              <option value="realizado">Realizado</option>
            </select>
          )}
        </Campo>
        <Campo rotulo="Data">{(p) => <input {...p} type="date" className="field-control" value={valores.onboarding_data} onChange={campo('onboarding_data')} />}</Campo>
        <Campo rotulo="Responsável">
          {(p) => (
            <select {...p} className="field-control" value={valores.onboarding_responsavel_id} onChange={campo('onboarding_responsavel_id')}>
              <Opcoes itens={equipe(cat)} vazio="—" />
            </select>
          )}
        </Campo>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink-soft">Checklist</legend>
        {checklist.map((c, n) => (
          <label key={n} className="flex items-center gap-2 py-0.5 text-sm">
            <input type="checkbox" checked={c.feito} onChange={(e) => setChecklist((l) => l.map((x, i) => (i === n ? { ...x, feito: e.target.checked } : x)))} />
            {c.item}
          </label>
        ))}
      </fieldset>
      <Campo rotulo="Próximo passo definido" dica="Aparece para a aluna quando não houver atividade ou encontro mais urgente.">
        {(p) => <input {...p} className="field-control" value={valores.proximo_passo} onChange={campo('proximo_passo')} />}
      </Campo>
      <Campo rotulo="Pendências">{(p) => <textarea {...p} rows={2} className="field-control" value={valores.onboarding_pendencias} onChange={campo('onboarding_pendencias')} />}</Campo>
    </FormDialog>
  )
}

