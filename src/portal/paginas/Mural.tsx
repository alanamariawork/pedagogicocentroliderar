import { useState } from 'react'
import { Newspaper, Plus } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { Campo, FormDialog, useValores } from '../../components/Form'
import { Selo, type Tom } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { post, useDados, type Reg } from '../../lib/api'
import { formatarData } from '../../../shared/datas'

export const CATEGORIA_MURAL: Record<string, string> = { oportunidade: 'Oportunidade', produto: 'Produto', servico: 'Serviço' }
export const CANAL_MURAL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'E-mail', instagram: 'Instagram', site: 'Site', outro: 'Outro' }
const SITUACAO: Record<string, [string, Tom]> = { pendente: ['Aguardando aprovação', 'dourado'], publicada: ['Publicada', 'sucesso'], recusada: ['Não aprovada', 'neutro'], arquivada: ['Arquivada', 'neutro'] }

function linkContato(canal: string, valor: string): string | null {
  const v = valor.trim()
  if (canal === 'whatsapp') {
    const d = v.replace(/\D/g, '')
    return d.length >= 10 ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null
  }
  if (canal === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? `mailto:${v}` : null
  if (canal === 'instagram') return `https://instagram.com/${v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}`
  if (canal === 'site') return /^https:\/\//.test(v) ? v : null
  return null
}

/** Mural de oportunidades entre as alunas: só o contato escolhido em cada publicação aparece. */
export function Mural() {
  const { dados, erro, recarregar } = useDados<Reg>('/portal/mural')
  const [nova, setNova] = useState(false)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const publicadas = dados.publicadas as Reg[]
  const minhas = dados.minhas as Reg[]
  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Oportunidades da comunidade</h2>
          <p className="text-sm text-ink-soft">Produtos, serviços e oportunidades das alunas. {dados.moderada && 'Cada publicação passa pela equipe antes de aparecer.'}</p>
        </div>
        {dados.pode_publicar && (
          <button type="button" className="btn-primary" onClick={() => setNova(true)}>
            <Plus className="size-4" aria-hidden /> Publicar
          </button>
        )}
      </section>
      {minhas.length > 0 && (
        <section className="card p-4">
          <h2 className="font-display text-base font-semibold">Minhas publicações</h2>
          <ul className="mt-2 divide-y divide-line">
            {minhas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {p.titulo}
                  {p.situacao === 'recusada' && p.motivo_moderacao && <span className="block text-xs text-ink-muted">Motivo: {p.motivo_moderacao}</span>}
                </span>
                <Selo tom={SITUACAO[p.situacao]?.[1] ?? 'neutro'}>{SITUACAO[p.situacao]?.[0] ?? p.situacao}</Selo>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!dados.pode_ver ? (
        <p className="card p-4 text-sm text-ink-muted">O mural é para alunas com matrícula ativa.</p>
      ) : publicadas.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Newspaper className="size-8 text-ink-muted" aria-hidden />
          <p className="mt-2 text-sm text-ink-soft">Nenhuma publicação ainda.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {publicadas.map((p) => {
            const href = linkContato(p.contato_canal, p.contato_valor)
            return (
              <li key={p.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Selo tom="vinho">{CATEGORIA_MURAL[p.categoria]}</Selo>
                  <span className="text-xs text-ink-muted">{formatarData(String(p.criado_em).slice(0, 10))}</span>
                </div>
                <h3 className="mt-2 font-medium text-ink">{p.titulo}</h3>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{p.descricao}</p>
                <p className="mt-3 text-sm">
                  <span className="text-ink-muted">{p.autora_nome} · {CANAL_MURAL[p.contato_canal]}: </span>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                      {p.contato_valor}
                    </a>
                  ) : (
                    p.contato_valor
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      {nova && <NovaPublicacao moderada={dados.moderada} onFechar={() => setNova(false)} onConcluir={recarregar} />}
    </div>
  )
}

function NovaPublicacao({ moderada, onFechar, onConcluir }: { moderada: boolean; onFechar: () => void; onConcluir: () => void }) {
  const { valores, campo } = useValores({ categoria: 'oportunidade', titulo: '', descricao: '', contato_canal: 'whatsapp', contato_valor: '' })
  const fb = useFeedback()
  return (
    <FormDialog
      aberto
      titulo="Publicar no mural"
      descricao="Só o contato que você escolher aqui aparece para as outras alunas."
      rotulo={moderada ? 'Enviar para aprovação' : 'Publicar'}
      onFechar={onFechar}
      onEnviar={async () => {
        const r = await post('/portal/mural', valores)
        fb.sucesso(r.situacao === 'publicada' ? 'Publicado no mural.' : 'Enviado. A equipe vai aprovar antes de aparecer no mural.')
        onConcluir()
      }}
    >
      <Campo rotulo="Categoria" obrigatorio>
        {(p) => (
          <select {...p} className="field-control" value={valores.categoria} onChange={campo('categoria')}>
            {Object.entries(CATEGORIA_MURAL).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </select>
        )}
      </Campo>
      <Campo rotulo="Título" obrigatorio>{(p) => <input {...p} className="field-control" maxLength={120} value={valores.titulo} onChange={campo('titulo')} />}</Campo>
      <Campo rotulo="Descrição" obrigatorio>{(p) => <textarea {...p} className="field-control min-h-24" maxLength={2000} value={valores.descricao} onChange={campo('descricao')} />}</Campo>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Campo rotulo="Contato por" obrigatorio>
          {(p) => (
            <select {...p} className="field-control" value={valores.contato_canal} onChange={campo('contato_canal')}>
              {Object.entries(CANAL_MURAL).map(([k, r]) => (
                <option key={k} value={k}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </Campo>
        <Campo rotulo="Contato" obrigatorio>{(p) => <input {...p} className="field-control" maxLength={200} value={valores.contato_valor} onChange={campo('contato_valor')} />}</Campo>
      </div>
    </FormDialog>
  )
}
