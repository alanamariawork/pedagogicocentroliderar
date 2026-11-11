import { useRef, useState } from 'react'
import { FileUp, ScanText } from 'lucide-react'
import { Secao, Vazio } from '../../components/Estados'
import { Campo, FormDialog, Opcoes } from '../../components/Form'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { API, enviarArquivo, mensagemDeErro, post, useDados, type Reg } from '../../lib/api'
import { ativos, useCatalogos } from '../../state/Catalogos'
import { useSessao } from '../../state/Sessao'
import { formatarCarimbo, formatarData } from '../../../shared/datas'

/** Lê o texto de um PDF no navegador (o arquivo não sai daqui para isso). PDF digitalizado como imagem não tem texto. */
async function textoDoPdf(dados: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(dados) }).promise
  let texto = ''
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const c = await (await doc.getPage(i)).getTextContent()
    for (const it of c.items) if ('str' in it) texto += it.str + (it.hasEOL ? '\n' : ' ')
    texto += '\n'
  }
  return texto
}

/**
 * Contrato anexado à matrícula: arquivo com acesso restrito, leitura assistida dos campos, conferência
 * com o que está no sistema e aplicação só do que a equipe revisou. Reaplicar não duplica itens.
 */
export function ContratoDocumento({ m, onAplicado }: { m: Reg; onAplicado: () => void }) {
  const { pode } = useSessao()
  const fb = useFeedback()
  const { dados, recarregar } = useDados<Reg>(`/matriculas/${m.id}/contratos`)
  const [enviando, setEnviando] = useState(false)
  const [revisar, setRevisar] = useState<Reg | null>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const contratos = (dados?.contratos ?? []) as Reg[]

  async function ler(id: string, buffer: ArrayBuffer | null, nome: string) {
    let texto = ''
    if (buffer && /\.pdf$/i.test(nome)) {
      try {
        texto = await textoDoPdf(buffer)
      } catch {
        texto = ''
      }
    }
    const r = await post(`/contratos/${id}/leitura`, { texto })
    if (!r.dados.legivel) fb.erro('Não foi possível ler o texto do contrato (arquivo digitalizado ou não é PDF). Preencha os campos na conferência.')
    return r
  }

  async function enviar(f: File) {
    setEnviando(true)
    try {
      const up = await enviarArquivo(`/matriculas/${m.id}/contratos`, f)
      const buffer = await f.arrayBuffer()
      const leitura = await ler(up.id, buffer, f.name)
      if (up.repetido) fb.sucesso('Este mesmo arquivo já estava anexado. Abrimos a conferência dele.')
      await recarregar()
      setRevisar({ id: up.id, nome: f.name, ...leitura })
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function reler(c: Reg) {
    try {
      const resp = await fetch(`${API}/contratos/${c.id}/arquivo`, { credentials: 'same-origin' })
      const leitura = await ler(c.id, resp.ok ? await resp.arrayBuffer() : null, c.nome)
      setRevisar({ id: c.id, nome: c.nome, ...leitura })
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  return (
    <Secao
      titulo="Contrato anexado"
      descricao="Acesso restrito à equipe com a permissão de contratos. A leitura dos campos é uma ajuda: nada muda na matrícula sem a sua conferência."
      acao={
        pode('comercial:editar') && (
          <>
            <input ref={entrada} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="sr-only" id={`contrato-${m.id}`} onChange={(e) => e.target.files?.[0] && void enviar(e.target.files[0])} />
            <label htmlFor={`contrato-${m.id}`} className="btn-secondary btn-sm cursor-pointer" aria-disabled={enviando}>
              <FileUp className="size-4" aria-hidden /> {enviando ? 'Enviando…' : 'Anexar contrato'}
            </label>
          </>
        )
      }
    >
      {contratos.length === 0 ? (
        <Vazio>Nenhum contrato anexado a esta matrícula.</Vazio>
      ) : (
        <ul className="divide-y divide-line">
          {contratos.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <a href={`${API}/contratos/${c.id}/arquivo`} className="font-medium text-brand-700 underline">
                  {c.nome}
                </a>
                <span className="block text-xs text-ink-muted">
                  Anexado por {c.autor_nome ?? '—'} em {formatarCarimbo(c.criado_em)}
                  {c.confirmado_em ? ` · conferido por ${c.confirmado_por_nome} em ${formatarCarimbo(c.confirmado_em)}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {c.confirmado_em ? <Selo tom="sucesso">Conferido</Selo> : <Selo tom="alerta">Conferência pendente</Selo>}
                {pode('comercial:editar') && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => (c.dados_extraidos ? setRevisar({ id: c.id, nome: c.nome, dados: c.dados_extraidos, comparacao: c.comparacao }) : void reler(c))}>
                    <ScanText className="size-4" aria-hidden /> Conferir dados
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {revisar && (
        <DialogConferirContrato
          m={m}
          contrato={revisar}
          onFechar={() => setRevisar(null)}
          onConcluir={() => {
            recarregar()
            onAplicado()
          }}
        />
      )}
    </Secao>
  )
}

function Trecho({ t }: { t?: string | null }) {
  return t ? <span className="mt-0.5 block text-xs text-ink-muted italic">No contrato: “{t}”</span> : <span className="mt-0.5 block text-xs text-warning">Pendente: não encontrado no texto</span>
}

function Divergencia({ c }: { c?: Reg }) {
  if (!c?.diverge) return null
  return (
    <span className="mt-0.5 block text-xs font-medium text-danger">
      Diverge do sistema: contrato {String(c.contrato)} × sistema {String(c.sistema)}
    </span>
  )
}

function DialogConferirContrato({ m, contrato, onFechar, onConcluir }: { m: Reg; contrato: Reg; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const fb = useFeedback()
  const d = contrato.dados as Reg
  const comp = (contrato.comparacao ?? {}) as Reg
  const [v, setV] = useState({
    data_inicio: d.data_inicio?.valor ?? m.data_inicio ?? '',
    data_fim: d.data_fim?.valor ?? m.data_fim ?? '',
    programa_id: d.programa?.valor?.id ?? m.programa_id ?? '',
    motivo: '',
  })
  const [itens, setItens] = useState<Reg[]>(
    ((d.itens ?? []) as Reg[]).map((it) => {
      const c = ((comp.itens ?? []) as Reg[]).find((x) => x.chave === it.chave)
      // Sugere criar só o que ainda não existe no sistema; o que já existe fica desmarcado (sem duplicar).
      return { ...it, quantidade: it.quantidade ?? '', criar: !c?.ja_existe && it.quantidade != null, comparacao: c }
    }),
  )
  const mudar = (i: number, k: string, valor: unknown) => setItens((l) => l.map((x, j) => (j === i ? { ...x, [k]: valor } : x)))
  return (
    <FormDialog
      aberto
      largura="max-w-3xl"
      titulo={`Conferir contrato: ${contrato.nome}`}
      descricao="Confira cada campo com o documento. Campos não encontrados ficam pendentes para você preencher. Ao aplicar, fica registrado quem conferiu."
      rotulo="Aplicar o que conferi"
      onFechar={onFechar}
      onEnviar={async () => {
        const r = await post(`/contratos/${contrato.id}/aplicar`, {
          data_inicio: v.data_inicio || null,
          data_fim: v.data_fim || null,
          programa_id: v.programa_id || null,
          motivo: v.motivo || null,
          itens: itens.filter((x) => x.criar).map((x) => ({ chave: x.chave, tipo_id: x.tipo_id || null, descricao: x.descricao, quantidade: Number(x.quantidade), origem: x.origem })),
        })
        fb.sucesso(`Contrato conferido. ${r.criados.length} item(ns) criado(s)${r.ignorados.length ? `, ${r.ignorados.length} já aplicado(s) antes` : ''}.`)
        onConcluir()
      }}
    >
      {!d.legivel && <p className="rounded bg-warning-soft px-3 py-2 text-sm text-warning">O texto do contrato não pôde ser lido. Todos os campos estão pendentes: preencha olhando o documento.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Início da vigência" dica={<><Trecho t={d.data_inicio?.trecho} /><Divergencia c={comp.data_inicio} /></>}>
          {(p) => <input {...p} type="date" className="field-control" value={v.data_inicio} onChange={(e) => setV({ ...v, data_inicio: e.target.value })} />}
        </Campo>
        <Campo rotulo="Término da vigência" dica={<><Trecho t={d.data_fim?.trecho} /><Divergencia c={comp.data_fim} />{d.duracao_meses?.valor ? <span className="block text-xs text-ink-muted">Duração no contrato: {d.duracao_meses.valor} meses</span> : null}</>}>
          {(p) => <input {...p} type="date" className="field-control" value={v.data_fim} onChange={(e) => setV({ ...v, data_fim: e.target.value })} />}
        </Campo>
        <Campo rotulo="Programa" dica={<><Trecho t={d.programa?.trecho} /><Divergencia c={comp.programa} /></>}>
          {(p) => (
            <select {...p} className="field-control" value={v.programa_id} onChange={(e) => setV({ ...v, programa_id: e.target.value })}>
              <Opcoes itens={ativos(cat?.programas)} vazio="Manter como está" />
            </select>
          )}
        </Campo>
        <Campo rotulo="Motivo (se mudar a vigência)">{(p) => <input {...p} className="field-control" maxLength={500} placeholder="Ex.: conferido com o contrato assinado" value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} />}</Campo>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink-soft">Encontros e bônus encontrados</legend>
        {itens.length === 0 && <p className="text-sm text-ink-muted">Nenhum encontro ou bônus encontrado no texto. Cadastre os itens na aba Entregáveis.</p>}
        {itens.map((it, i) => (
          <div key={it.chave} className="rounded border border-line p-3 text-sm">
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" checked={!!it.criar} onChange={(e) => mudar(i, 'criar', e.target.checked)} /> Criar este item na matrícula
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_7rem_8rem]">
              <input aria-label="Descrição" className="field-control" value={it.descricao} onChange={(e) => mudar(i, 'descricao', e.target.value)} />
              <input aria-label="Quantidade" type="number" min={1} className="field-control" value={it.quantidade} onChange={(e) => mudar(i, 'quantidade', e.target.value)} placeholder="Pendente" />
              <select aria-label="Origem" className="field-control" value={it.origem} onChange={(e) => mudar(i, 'origem', e.target.value)}>
                <option value="pacote">Pacote</option>
                <option value="bonus">Bônus</option>
              </select>
            </div>
            <p className="mt-1 text-xs text-ink-muted italic">No contrato: “{it.trecho}”</p>
            {it.comparacao?.ja_existe && (
              <p className={`text-xs ${it.comparacao.diverge ? 'font-medium text-danger' : 'text-ink-muted'}`}>
                Já existe no sistema: {it.comparacao.sistema} · no contrato: {it.comparacao.contrato ?? 'pendente'}
                {it.comparacao.diverge ? ' (diverge: ajuste a quantidade na aba Entregáveis, se for o caso)' : ''}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      <p className="text-xs text-ink-muted">Matrícula de {formatarData(m.data_inicio)}{m.data_fim ? ` a ${formatarData(m.data_fim)}` : ''}.</p>
    </FormDialog>
  )
}
