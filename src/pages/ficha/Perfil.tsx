import { useState } from 'react'
import { Eye, EyeOff, Pencil } from 'lucide-react'
import { Secao } from '../../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../../components/Form'
import { Selo, type Tom } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { put, type Reg } from '../../lib/api'
import { idAluna } from '../../lib/format'
import { ativos, equipe, opcoesPorId, useCatalogos } from '../../state/Catalogos'
import { useSessao } from '../../state/Sessao'
import { formatarData } from '../../../shared/datas'

/** Selo de uma opção de lista configurável (status, saúde, engajamento…), com a cor escolhida em Configurações. */
export function SeloOpcao({ id, vazio = '—' }: { id: string | null | undefined; vazio?: string }) {
  const cat = useCatalogos()
  const o = id ? opcoesPorId(cat).get(id) : undefined
  if (!o) return <span className="text-ink-muted">{vazio}</span>
  return <Selo tom={(o.cor as Tom) ?? 'neutro'}>{o.nome}</Selo>
}

/** Olho aberto = o campo aparece no portal da aluna; olho riscado = só a equipe vê. */
function Visibilidade({ campo }: { campo: string }) {
  const cat = useCatalogos()
  const v = cat?.campos_visibilidade?.find((c) => c.campo === campo)
  if (!v) return null
  const Icone = v.visivel_aluna ? Eye : EyeOff
  const texto = v.visivel_aluna ? 'Visível à aluna' : 'Só a equipe vê'
  return (
    <span title={texto} className={v.visivel_aluna ? 'text-success' : 'text-ink-muted'}>
      <Icone className="inline size-3.5" aria-hidden />
      <span className="sr-only">({texto})</span>
    </span>
  )
}

function Linha({ rotulo, campo, children }: { rotulo: string; campo?: string; children: React.ReactNode }) {
  const vazio = children === null || children === undefined || children === ''
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="flex items-center gap-1.5 text-ink-muted">
        {rotulo} {campo && <Visibilidade campo={campo} />}
      </dt>
      <dd className="min-w-0 break-words text-ink">{vazio ? <span className="text-ink-muted">Não informado</span> : children}</dd>
    </div>
  )
}

export function PerfilAluna({ pessoa, recarregar }: { pessoa: Reg; recarregar: () => void }) {
  const { pode } = useSessao()
  const cat = useCatalogos()
  const [dialogo, setDialogo] = useState<null | 'cadastro' | 'estado'>(null)
  const segmento = pessoa.segmento_id ? opcoesPorId(cat).get(pessoa.segmento_id)?.nome : null
  const editar = (qual: 'cadastro' | 'estado') =>
    pode('alunas:editar') && (
      <button type="button" className="btn-secondary btn-sm" onClick={() => setDialogo(qual)}>
        <Pencil className="size-3.5" aria-hidden /> Editar
      </button>
    )
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>
          <Eye className="inline size-3.5 text-success" aria-hidden /> aparece no portal da aluna
        </span>
        <span>
          <EyeOff className="inline size-3.5" aria-hidden /> só a equipe vê
        </span>
        {pode('config:editar') && <span>Mude em Configurações → Campos visíveis.</span>}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Cadastro" acao={editar('cadastro')}>
          <dl>
            <Linha rotulo="ID">{pessoa.codigo ? idAluna(pessoa.codigo) : 'Recebe na primeira matrícula'}</Linha>
            <Linha rotulo="Nome" campo="nome">{pessoa.nome}</Linha>
            <Linha rotulo="E-mail" campo="email">{pessoa.email}</Linha>
            <Linha rotulo="Telefone" campo="telefone">{pessoa.telefone}</Linha>
            <Linha rotulo="Cidade" campo="cidade">{pessoa.cidade}</Linha>
            <Linha rotulo="Empresa" campo="empresa">{pessoa.empresa}</Linha>
            <Linha rotulo="Segmento" campo="segmento">{segmento}</Linha>
            <Linha rotulo="Subsegmento" campo="subsegmento">{pessoa.subsegmento}</Linha>
            <Linha rotulo="Redes" campo="redes">{[pessoa.instagram, pessoa.linkedin, pessoa.site].filter(Boolean).join(' · ')}</Linha>
          </dl>
        </Secao>
        <Secao titulo="Estado" descricao="Uso interno da equipe" acao={editar('estado')}>
          <dl>
            <Linha rotulo="Status" campo="status">
              <SeloOpcao id={pessoa.status_id} vazio="Sem status" />
            </Linha>
            <Linha rotulo="Saúde" campo="saude">
              <SeloOpcao id={pessoa.saude_id} vazio="Não avaliada" />
            </Linha>
            <Linha rotulo="Engajamento" campo="engajamento">
              <SeloOpcao id={pessoa.engajamento_id} vazio="Não avaliado" />
            </Linha>
            <Linha rotulo="Em risco" campo="em_risco">
              {pessoa.em_risco ? <Selo tom="perigo">Em risco</Selo> : 'Não'}
            </Linha>
            <Linha rotulo="Responsável" campo="responsavel">{pessoa.responsavel_nome ?? <Selo tom="alerta">Sem responsável</Selo>}</Linha>
            <Linha rotulo="Data de entrada" campo="data_entrada">{pessoa.data_entrada ? formatarData(pessoa.data_entrada) : null}</Linha>
            <Linha rotulo="Observação" campo="observacao">{pessoa.observacao_operacional}</Linha>
          </dl>
        </Secao>
      </div>
      {dialogo === 'cadastro' && <DialogPessoa pessoa={pessoa} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
      {dialogo === 'estado' && <DialogEstado pessoa={pessoa} onFechar={() => setDialogo(null)} onConcluir={recarregar} />}
    </div>
  )
}

export function DialogPessoa({ pessoa, onFechar, onConcluir }: { pessoa: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const cat = useCatalogos()
  const { valores, campo } = useValores({
    nome: pessoa.nome ?? '',
    email: pessoa.email ?? '',
    telefone: pessoa.telefone ?? '',
    cidade: pessoa.cidade ?? '',
    empresa: pessoa.empresa ?? '',
    segmento_id: pessoa.segmento_id ?? '',
    subsegmento: pessoa.subsegmento ?? '',
    instagram: pessoa.instagram ?? '',
    linkedin: pessoa.linkedin ?? '',
    site: pessoa.site ?? '',
    observacao_operacional: pessoa.observacao_operacional ?? '',
  })
  return (
    <FormDialog
      aberto
      titulo="Cadastro da aluna"
      onFechar={onFechar}
      onEnviar={async () => {
        await put(`/pessoas/${pessoa.id}`, { ...valores, segmento_id: valores.segmento_id || null })
        fb.sucesso('Dados atualizados.')
        onConcluir()
      }}
    >
      <Campo rotulo="Nome" obrigatorio>
        {(p) => <input {...p} className="field-control" value={valores.nome} onChange={campo('nome')} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="E-mail">{(p) => <input {...p} type="email" className="field-control" value={valores.email} onChange={campo('email')} />}</Campo>
        <Campo rotulo="Telefone (WhatsApp)">{(p) => <input {...p} inputMode="tel" className="field-control" value={valores.telefone} onChange={campo('telefone')} />}</Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Cidade">{(p) => <input {...p} className="field-control" value={valores.cidade} onChange={campo('cidade')} />}</Campo>
        <Campo rotulo="Empresa">{(p) => <input {...p} maxLength={200} className="field-control" value={valores.empresa} onChange={campo('empresa')} />}</Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Segmento" dica="As opções ficam em Configurações → Listas.">
          {(p) => (
            <select {...p} className="field-control" value={valores.segmento_id} onChange={campo('segmento_id')}>
              <Opcoes itens={ativos(cat?.segmentos).concat((cat?.segmentos ?? []).filter((s) => !s.ativo && s.id === pessoa.segmento_id))} vazio="Não informado" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Subsegmento">{(p) => <input {...p} maxLength={120} className="field-control" value={valores.subsegmento} onChange={campo('subsegmento')} />}</Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Instagram">{(p) => <input {...p} className="field-control" value={valores.instagram} onChange={campo('instagram')} />}</Campo>
        <Campo rotulo="LinkedIn">{(p) => <input {...p} className="field-control" value={valores.linkedin} onChange={campo('linkedin')} />}</Campo>
        <Campo rotulo="Site">{(p) => <input {...p} type="url" placeholder="https://" className="field-control" value={valores.site} onChange={campo('site')} />}</Campo>
      </div>
      <Campo rotulo="Observação interna" dica="Só o mínimo necessário para a operação. Não registre diagnósticos ou relatos sensíveis. Nunca aparece no portal.">
        {(p) => <textarea {...p} rows={2} className="field-control" value={valores.observacao_operacional} onChange={campo('observacao_operacional')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogEstado({ pessoa, onFechar, onConcluir }: { pessoa: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const cat = useCatalogos()
  const { valores, campo } = useValores({
    status_id: pessoa.status_id ?? '',
    saude_id: pessoa.saude_id ?? '',
    engajamento_id: pessoa.engajamento_id ?? '',
    em_risco: !!pessoa.em_risco,
    responsavel_id: pessoa.responsavel_id ?? '',
    data_entrada: pessoa.data_entrada ?? '',
  })
  const lista = (k: 'status-aluna' | 'saude' | 'engajamento') => ativos(cat?.[k])
  return (
    <FormDialog
      aberto
      titulo="Estado da aluna"
      descricao="Uso interno. O status muda sozinho quando a matrícula é pausada, retomada, encerrada ou cancelada."
      onFechar={onFechar}
      onEnviar={async () => {
        const nulo = (v: string) => v || null
        await put(`/pessoas/${pessoa.id}/estado`, {
          status_id: nulo(valores.status_id),
          saude_id: nulo(valores.saude_id),
          engajamento_id: nulo(valores.engajamento_id),
          em_risco: valores.em_risco,
          responsavel_id: nulo(valores.responsavel_id),
          data_entrada: nulo(valores.data_entrada),
        })
        fb.sucesso('Estado atualizado.')
        onConcluir()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Status">
          {(p) => (
            <select {...p} className="field-control" value={valores.status_id} onChange={campo('status_id')}>
              <Opcoes itens={lista('status-aluna')} vazio="Sem status" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Saúde">
          {(p) => (
            <select {...p} className="field-control" value={valores.saude_id} onChange={campo('saude_id')}>
              <Opcoes itens={lista('saude')} vazio="Não avaliada" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Engajamento">
          {(p) => (
            <select {...p} className="field-control" value={valores.engajamento_id} onChange={campo('engajamento_id')}>
              <Opcoes itens={lista('engajamento')} vazio="Não avaliado" />
            </select>
          )}
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={valores.em_risco} onChange={campo('em_risco')} /> Aluna em risco
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Responsável na equipe" dica="Quem não vê todas as alunas (ex.: Suporte/CS) vê só as alunas em que é responsável.">
          {(p) => (
            <select {...p} className="field-control" value={valores.responsavel_id} onChange={campo('responsavel_id')}>
              <Opcoes itens={equipe(cat)} vazio="Sem responsável" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Data de entrada">{(p) => <input {...p} type="date" className="field-control" value={valores.data_entrada} onChange={campo('data_entrada')} />}</Campo>
      </div>
    </FormDialog>
  )
}

