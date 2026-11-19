import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Campo, FormDialog, useValores } from '../../components/Form'
import { Selo, type Tom } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { post, useDados, type Reg } from '../../lib/api'
import { formatarData, hojeSP } from '../../../shared/datas'
import { SecaoPortal } from '../../pages/Portal'

const SITUACAO: Record<string, [string, Tom]> = {
  aguardando_analise: ['Aguardando análise', 'dourado'],
  validada: ['Validada', 'sucesso'],
  validada_interna: ['Analisada pela equipe', 'info'],
  nao_validada: ['Analisada, não validada', 'neutro'],
}

/** Minhas Vitórias: as validadas (gráfico de crescimento) e o botão para enviar uma vitória nova. */
export function Vitorias() {
  const { dados, recarregar } = useDados<Reg>('/portal/vitorias')
  const [nova, setNova] = useState(false)
  const [chave, setChave] = useState(0)
  const enviadas = (dados?.enviadas ?? []) as Reg[]
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Conte uma vitória</h2>
          <p className="text-sm text-ink-soft">A equipe analisa e, quando validar, ela entra no seu histórico de crescimento.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setNova(true)}>
          <Plus className="size-4" aria-hidden /> Adicionar uma vitória
        </button>
      </section>
      {enviadas.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-base font-semibold">Vitórias que enviei</h2>
          <ul className="mt-2 divide-y divide-line">
            {enviadas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {v.titulo} <span className="text-xs text-ink-muted">· {formatarData(v.data)}</span>
                </span>
                <Selo tom={SITUACAO[v.situacao]?.[1] ?? 'neutro'}>{SITUACAO[v.situacao]?.[0] ?? v.situacao}</Selo>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SecaoPortal key={chave} secao="vitorias" />
      {nova && (
        <NovaVitoria
          onFechar={() => setNova(false)}
          onConcluir={() => {
            recarregar()
            setChave((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}

function NovaVitoria({ onFechar, onConcluir }: { onFechar: () => void; onConcluir: () => void }) {
  const { valores, campo } = useValores({ titulo: '', situacao_anterior: '', acao_aplicada: '', resultado_percebido: '', data: hojeSP() })
  const fb = useFeedback()
  return (
    <FormDialog
      aberto
      titulo="Adicionar uma vitória"
      descricao="Vai para a análise da equipe. Evite dados pessoais de clientes."
      rotulo="Enviar para análise"
      onFechar={onFechar}
      onEnviar={async () => {
        await post('/portal/vitorias', valores)
        fb.sucesso('Vitória enviada. Ela aparece como "aguardando análise" até a equipe analisar.')
        onConcluir()
      }}
    >
      <Campo rotulo="Qual foi a vitória?" obrigatorio>{(p) => <input {...p} className="field-control" maxLength={200} value={valores.titulo} onChange={campo('titulo')} />}</Campo>
      <Campo rotulo="Como era antes?">{(p) => <textarea {...p} className="field-control min-h-16" maxLength={2000} value={valores.situacao_anterior} onChange={campo('situacao_anterior')} />}</Campo>
      <Campo rotulo="O que você aplicou?">{(p) => <textarea {...p} className="field-control min-h-16" maxLength={2000} value={valores.acao_aplicada} onChange={campo('acao_aplicada')} />}</Campo>
      <Campo rotulo="Qual resultado você percebeu?">{(p) => <textarea {...p} className="field-control min-h-16" maxLength={2000} value={valores.resultado_percebido} onChange={campo('resultado_percebido')} />}</Campo>
      <Campo rotulo="Quando aconteceu?">{(p) => <input {...p} type="date" className="field-control" max={hojeSP()} value={valores.data} onChange={campo('data')} />}</Campo>
    </FormDialog>
  )
}
