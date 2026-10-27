import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Dialog } from './Dialog'
import { AlertaErro } from './Estados'
import { mensagemDeErro } from '../lib/api'

export interface PropsControle {
  id: string
  required?: boolean
  'aria-describedby'?: string
}

/** Campo com rótulo, marcação de obrigatório e dica ligados por ARIA. */
export function Campo({
  rotulo,
  obrigatorio,
  dica,
  className,
  children,
}: {
  rotulo: string
  obrigatorio?: boolean
  dica?: ReactNode
  className?: string
  children: (props: PropsControle) => ReactNode
}) {
  const id = useId()
  const idDica = `${id}-dica`
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-soft">
        {rotulo}
        {obrigatorio && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
        {obrigatorio && <span className="sr-only"> (obrigatório)</span>}
      </label>
      {children({ id, required: obrigatorio, 'aria-describedby': dica ? idDica : undefined })}
      {dica && (
        <p id={idDica} className="mt-1 text-xs text-ink-muted">
          {dica}
        </p>
      )}
    </div>
  )
}

/** Estado simples de formulário: valores + atualizador por campo. */
export function useValores<T extends Record<string, unknown>>(iniciais: T) {
  const [valores, setValores] = useState<T>(iniciais)
  const campo =
    <K extends keyof T>(k: K) =>
    (e: { target: { value: string; type?: string; checked?: boolean } }) =>
      setValores((v) => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  return { valores, setValores, campo, definir: <K extends keyof T>(k: K, v: T[K]) => setValores((x) => ({ ...x, [k]: v })) }
}

/**
 * Diálogo com formulário: bloqueia envio duplo, mostra "Salvando…", mantém os campos
 * e mostra a mensagem do servidor em caso de erro. Só fecha quando a gravação termina.
 */
export function FormDialog({
  aberto,
  titulo,
  descricao,
  onFechar,
  onEnviar,
  rotulo = 'Salvar',
  perigo,
  largura,
  children,
}: {
  aberto: boolean
  titulo: string
  descricao?: string
  onFechar: () => void
  onEnviar: () => Promise<unknown>
  rotulo?: string
  perigo?: boolean
  largura?: string
  children: ReactNode
}) {
  const formId = useId()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const emAndamento = useRef(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (emAndamento.current) return
    emAndamento.current = true
    setSalvando(true)
    setErro(null)
    try {
      await onEnviar()
      onFechar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      emAndamento.current = false
      setSalvando(false)
    }
  }

  return (
    <Dialog
      aberto={aberto}
      titulo={titulo}
      descricao={descricao}
      onFechar={() => {
        setErro(null)
        onFechar()
      }}
      bloqueado={salvando}
      largura={largura}
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={perigo ? 'btn-danger min-w-24' : 'btn-primary min-w-24'} disabled={salvando} aria-busy={salvando}>
            {salvando ? 'Salvando…' : rotulo}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={enviar} noValidate className="space-y-4">
        {erro && <AlertaErro mensagem={erro} />}
        {children}
      </form>
    </Dialog>
  )
}

/** Lista de opções para <select> a partir de registros {id, nome}. */
export function Opcoes({ itens, vazio, rotulo = 'nome' }: { itens: Record<string, unknown>[] | undefined; vazio?: string; rotulo?: string }) {
  return (
    <>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {(itens ?? []).map((i) => (
        <option key={String(i.id)} value={String(i.id)}>
          {String(i[rotulo])}
          {i.ativo === 0 ? ' (inativo)' : ''}
        </option>
      ))}
    </>
  )
}
