import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { useDados, post, type Reg } from '../lib/api'
import { ORIGEM_ITEM } from '../lib/format'
import { ativos, equipe, useCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'
import { useFeedback } from '../components/Feedback'
import { irPara } from '../lib/rotas'
import { hojeSP, somarDias, somarMeses } from '../../shared/datas'

export interface ItemForm {
  tipo_id: string
  descricao: string
  quantidade: string
  profissional_id: string
  duracao_min: string
  origem: 'pacote' | 'bonus' | 'ajuste'
  referencia_comercial: string
}

export const itemVazio = (origem: ItemForm['origem'] = 'bonus'): ItemForm => ({ tipo_id: '', descricao: '', quantidade: '1', profissional_id: '', duracao_min: '', origem, referencia_comercial: '' })

export function itemParaApi(i: ItemForm) {
  return { ...i, tipo_id: i.tipo_id || null, profissional_id: i.profissional_id || null, duracao_min: i.duracao_min || null, quantidade: Number(i.quantidade) }
}

/** Editor de itens contratados (usado no cadastro da matrícula e nos modelos de pacote). */
export function EditorItens({ itens, onChange, origens = ['pacote', 'bonus', 'ajuste'] }: { itens: ItemForm[]; onChange: (i: ItemForm[]) => void; origens?: ItemForm['origem'][] }) {
  const cat = useCatalogos()
  const set = (n: number, k: keyof ItemForm, v: string) =>
    onChange(
      itens.map((x, i) => {
        if (i !== n) return x
        const novo = { ...x, [k]: v }
        if (k === 'tipo_id') {
          const t = cat?.['tipos-entregavel'].find((t) => t.id === v)
          if (t && !x.descricao) novo.descricao = t.nome
          if (t?.duracao_padrao_min && !x.duracao_min) novo.duracao_min = String(t.duracao_padrao_min)
        }
        return novo
      }),
    )
  return (
    <div className="space-y-3">
      {itens.map((i, n) => (
        <fieldset key={n} className="rounded-[var(--radius-control)] border border-line p-3">
          <legend className="px-1 text-xs font-medium text-ink-muted">Item {n + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-ink-muted">
              Tipo
              <select className="field-control mt-0.5" value={i.tipo_id} onChange={(e) => set(n, 'tipo_id', e.target.value)}>
                <Opcoes itens={ativos(cat?.['tipos-entregavel'])} vazio="Sem tipo" />
              </select>
            </label>
            <label className="text-xs text-ink-muted">
              Descrição *
              <input className="field-control mt-0.5" value={i.descricao} onChange={(e) => set(n, 'descricao', e.target.value)} />
            </label>
            <label className="text-xs text-ink-muted">
              Quantidade contratada *
              <input type="number" min={0} className="field-control mt-0.5" value={i.quantidade} onChange={(e) => set(n, 'quantidade', e.target.value)} />
            </label>
            <label className="text-xs text-ink-muted">
              Duração prevista (min)
              <input type="number" min={5} step={5} className="field-control mt-0.5" placeholder="Não informada" value={i.duracao_min} onChange={(e) => set(n, 'duracao_min', e.target.value)} />
            </label>
            <label className="text-xs text-ink-muted">
              Profissional
              <select className="field-control mt-0.5" value={i.profissional_id} onChange={(e) => set(n, 'profissional_id', e.target.value)}>
                <Opcoes itens={ativos(cat?.profissionais)} vazio="A definir" />
              </select>
            </label>
            <label className="text-xs text-ink-muted">
              Origem
              <select className="field-control mt-0.5" value={i.origem} onChange={(e) => set(n, 'origem', e.target.value)}>
                {origens.map((o) => (
                  <option key={o} value={o}>
                    {ORIGEM_ITEM[o]}
                  </option>
                ))}
              </select>
            </label>
            {origens.includes('ajuste') && (
              <label className="text-xs text-ink-muted sm:col-span-2">
                Referência comercial
                <input className="field-control mt-0.5" placeholder="Ex.: proposta de 10/03, bônus negociado no fechamento" value={i.referencia_comercial} onChange={(e) => set(n, 'referencia_comercial', e.target.value)} />
              </label>
            )}
          </div>
          <button type="button" className="btn-ghost btn-sm mt-2 text-danger" onClick={() => onChange(itens.filter((_, x) => x !== n))}>
            <Trash2 className="size-3.5" aria-hidden />
            Remover item
          </button>
        </fieldset>
      ))}
      <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...itens, itemVazio(origens.includes('bonus') ? 'bonus' : 'pacote')])}>
        <Plus className="size-4" aria-hidden />
        Adicionar item
      </button>
    </div>
  )
}

/** Cadastro de pessoa + matrícula (ET01) ou nova matrícula/renovação para pessoa existente. */
export function DialogMatricula({ pessoa, anterior, onFechar, onConcluir }: { pessoa?: Reg; anterior?: Reg; onFechar: () => void; onConcluir?: () => void }) {
  const cat = useCatalogos()
  const { pode } = useSessao()
  const fb = useFeedback()
  const pacotes = useDados<Reg[]>('/pacotes').dados
  const inicio = anterior?.data_fim ? somarDias(anterior.data_fim, 1) : hojeSP()
  const { valores, campo, definir } = useValores({
    nome: '',
    email: '',
    telefone: '',
    programa_id: (anterior?.programa_id as string) ?? '',
    data_inicio: inicio,
    data_fim: '',
    responsavel_id: (anterior?.responsavel_id as string) ?? '',
    mentora_id: (anterior?.mentora_id as string) ?? '',
    pacote_id: '',
    contrato_situacao: 'pendente',
    fonte_comercial: '',
    condicoes_comerciais: '',
  })
  const [itens, setItens] = useState<ItemForm[]>([])
  const pacote = pacotes?.find((p) => p.id === valores.pacote_id)

  return (
    <FormDialog
      aberto
      titulo={pessoa ? (anterior ? 'Renovação (novo ciclo)' : 'Nova matrícula') : 'Nova aluna e matrícula'}
      descricao={anterior ? 'O ciclo anterior fica preservado. Pendências só passam para o novo ciclo por transferência explícita.' : undefined}
      onFechar={onFechar}
      largura="sm:max-w-2xl"
      rotulo="Cadastrar"
      onEnviar={async () => {
        const matricula = {
          programa_id: valores.programa_id || null,
          data_inicio: valores.data_inicio,
          data_fim: valores.data_fim || null,
          responsavel_id: valores.responsavel_id || null,
          mentora_id: valores.mentora_id || null,
          pacote_id: valores.pacote_id || null,
          contrato_situacao: valores.contrato_situacao,
          fonte_comercial: valores.fonte_comercial,
          condicoes_comerciais: valores.condicoes_comerciais,
          matricula_anterior_id: anterior?.id ?? null,
          itens_extras: itens.map(itemParaApi),
        }
        if (pessoa) {
          await post('/matriculas', { ...matricula, pessoa_id: pessoa.id })
          fb.sucesso(anterior ? 'Renovação cadastrada.' : 'Matrícula cadastrada.')
          onConcluir?.()
        } else {
          const r = await post('/pessoas', { nome: valores.nome, email: valores.email, telefone: valores.telefone, matricula })
          fb.sucesso('Aluna cadastrada.')
          irPara({ pagina: 'ficha', id: r.id })
        }
      }}
    >
      {!pessoa && (
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 font-display text-base font-semibold">Pessoa</legend>
          <Campo rotulo="Nome" obrigatorio className="sm:col-span-3">
            {(p) => <input {...p} className="field-control" value={valores.nome} onChange={campo('nome')} />}
          </Campo>
          <Campo rotulo="E-mail" className="sm:col-span-2">
            {(p) => <input {...p} type="email" className="field-control" value={valores.email} onChange={campo('email')} />}
          </Campo>
          <Campo rotulo="Telefone">
            {(p) => <input {...p} className="field-control" value={valores.telefone} onChange={campo('telefone')} />}
          </Campo>
        </fieldset>
      )}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-display text-base font-semibold">Matrícula</legend>
        <Campo rotulo="Programa">
          {(p) => (
            <select {...p} className="field-control" value={valores.programa_id} onChange={campo('programa_id')}>
              <Opcoes itens={ativos(cat?.programas)} vazio="A definir" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Responsável pela matrícula">
          {(p) => (
            <select {...p} className="field-control" value={valores.responsavel_id} onChange={campo('responsavel_id')}>
              <Opcoes itens={equipe(cat)} vazio="A definir" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Início da vigência" obrigatorio>
          {(p) => <input {...p} type="date" className="field-control" value={valores.data_inicio} onChange={campo('data_inicio')} />}
        </Campo>
        <Campo rotulo="Término da vigência" dica={pacote?.duracao_meses ? `Sugestão pelo pacote: ${pacote.duracao_meses} meses` : 'Deixe vazio se ainda não foi definido (vira pendência de cadastro).'}>
          {(p) => (
            <div className="flex gap-2">
              <input {...p} type="date" className="field-control" value={valores.data_fim} onChange={campo('data_fim')} />
              {pacote?.duracao_meses && valores.data_inicio && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => definir('data_fim', somarDias(somarMeses(valores.data_inicio, pacote.duracao_meses), -1))}>
                  Usar
                </button>
              )}
            </div>
          )}
        </Campo>
        <Campo rotulo="Mentora de referência">
          {(p) => (
            <select {...p} className="field-control" value={valores.mentora_id} onChange={campo('mentora_id')}>
              <Opcoes itens={ativos(cat?.profissionais)} vazio="A definir" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Contrato">
          {(p) => (
            <select {...p} className="field-control" value={valores.contrato_situacao} onChange={campo('contrato_situacao')} disabled={!pode('comercial:editar')}>
              <option value="pendente">Pendente</option>
              <option value="enviado">Enviado</option>
              <option value="assinado">Assinado</option>
            </select>
          )}
        </Campo>
        {pode('comercial:ver') && (
          <>
            <Campo rotulo="Fonte das condições comerciais" className="sm:col-span-2" dica="Onde foi conferido: contrato, proposta, checkout…">
              {(p) => <input {...p} className="field-control" value={valores.fonte_comercial} onChange={campo('fonte_comercial')} />}
            </Campo>
            <Campo rotulo="Condições vendidas" className="sm:col-span-2">
              {(p) => <textarea {...p} rows={2} className="field-control" value={valores.condicoes_comerciais} onChange={campo('condicoes_comerciais')} />}
            </Campo>
          </>
        )}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-display text-base font-semibold">Entregáveis</legend>
        <Campo rotulo="Aplicar modelo de pacote" dica="Os itens do modelo são COPIADOS para esta matrícula. Mudanças futuras no modelo não alteram esta matrícula.">
          {(p) => (
            <select {...p} className="field-control" value={valores.pacote_id} onChange={campo('pacote_id')}>
              <Opcoes itens={(pacotes ?? []).filter((x) => x.ativo)} vazio="Sem modelo (itens manuais)" />
            </select>
          )}
        </Campo>
        {pacote && (
          <ul className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 text-sm">
            {pacote.itens.map((i: Reg) => (
              <li key={i.id}>
                {i.quantidade}× {i.descricao} {i.origem === 'bonus' && '(bônus)'} · {i.duracao_min ? `${i.duracao_min} min` : 'sem duração'} · {i.profissional_nome ?? 'profissional a definir'}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-ink-soft">Bônus e itens personalizados desta matrícula:</p>
        <EditorItens itens={itens} onChange={setItens} />
      </fieldset>
    </FormDialog>
  )
}
