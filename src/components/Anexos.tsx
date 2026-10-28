import { useRef } from 'react'
import { Paperclip, X } from 'lucide-react'
import type { Reg } from '../lib/api'
import { tamanhoArquivo } from '../lib/format'

export const ANEXO_MAX_BYTES = 10 * 1024 * 1024
export const ANEXOS_POR_ENVIO = 5
const ACEITOS = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp3,.m4a,.mp4'

/** Links de download dos anexos de um envio. `base` é '/api/anexos' (equipe) ou '/api/portal/anexos' (aluna). */
export function ListaAnexos({ anexos, base }: { anexos?: Reg[]; base: string }) {
  if (!anexos?.length) return null
  return (
    <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
      {anexos.map((a) => (
        <li key={a.id}>
          <a href={`${base}/${a.id}`} download={a.nome} className="inline-flex max-w-full items-center gap-1 text-sm text-brand-700 underline">
            <Paperclip className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{a.nome}</span>
            <span className="shrink-0 text-xs text-ink-muted no-underline">({tamanhoArquivo(a.tamanho)})</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Escolha de arquivos com validação de tamanho e quantidade antes do envio. */
export function EscolherArquivos({ arquivos, onMudar, onErro }: { arquivos: File[]; onMudar: (a: File[]) => void; onErro: (msg: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  function adicionar(lista: FileList | null) {
    if (!lista) return
    const novos = [...arquivos]
    for (const f of Array.from(lista)) {
      if (f.size > ANEXO_MAX_BYTES) onErro(`${f.name} passa de 10 MB. Envie um arquivo menor ou compartilhe por link.`)
      else if (f.size === 0) onErro(`${f.name} está vazio.`)
      else if (novos.length >= ANEXOS_POR_ENVIO) onErro(`Você pode anexar até ${ANEXOS_POR_ENVIO} arquivos por envio.`)
      else if (!novos.some((x) => x.name === f.name && x.size === f.size)) novos.push(f)
    }
    onMudar(novos)
    if (input.current) input.current.value = ''
  }
  return (
    <div>
      <p className="text-sm font-medium text-ink">Arquivos (opcional)</p>
      <p className="text-xs text-ink-muted">Até {ANEXOS_POR_ENVIO} arquivos de até 10 MB: PDF, foto, Word, Excel, PowerPoint, áudio ou vídeo curto.</p>
      {arquivos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line px-2 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <Paperclip className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">{tamanhoArquivo(f.size)}</span>
              </span>
              <button type="button" className="btn-ghost btn-sm shrink-0" aria-label={`Remover ${f.name}`} onClick={() => onMudar(arquivos.filter((_, j) => j !== i))}>
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {arquivos.length < ANEXOS_POR_ENVIO && (
        <label className="btn-secondary btn-sm mt-2 cursor-pointer">
          <Paperclip className="size-4" aria-hidden /> Anexar arquivo
          <input ref={input} type="file" multiple accept={ACEITOS} className="sr-only" onChange={(e) => adicionar(e.target.files)} />
        </label>
      )}
    </div>
  )
}
