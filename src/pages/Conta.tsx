import { useState, type FormEvent } from 'react'
import { AlertaErro, Secao } from '../components/Estados'
import { useFeedback } from '../components/Feedback'
import { mensagemDeErro, post } from '../lib/api'
import { useSessao } from '../state/Sessao'
import { NOME_PERFIL, PERMISSOES } from '../../shared/permissoes'

/** Troca de senha do próprio usuário (equipe e aluna). */
export function FormSenha() {
  const { recarregar } = useSessao()
  const fb = useFeedback()
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (nova !== confirma) return setErro('A confirmação não é igual à nova senha.')
    setSalvando(true)
    try {
      await post('/auth/senha', { atual, nova })
      setAtual('')
      setNova('')
      setConfirma('')
      fb.sucesso('Senha alterada.')
      await recarregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="max-w-sm space-y-3" noValidate>
      {erro && <AlertaErro mensagem={erro} />}
      <div>
        <label htmlFor="senha-atual" className="mb-1 block text-sm font-medium text-ink-soft">
          Senha atual
        </label>
        <input id="senha-atual" type="password" autoComplete="current-password" className="field-control" value={atual} onChange={(e) => setAtual(e.target.value)} />
      </div>
      <div>
        <label htmlFor="senha-nova" className="mb-1 block text-sm font-medium text-ink-soft">
          Nova senha
        </label>
        <input id="senha-nova" type="password" autoComplete="new-password" aria-describedby="senha-dica" className="field-control" value={nova} onChange={(e) => setNova(e.target.value)} />
        <p id="senha-dica" className="mt-1 text-xs text-ink-muted">
          Pelo menos 10 caracteres, com letras e números.
        </p>
      </div>
      <div>
        <label htmlFor="senha-confirma" className="mb-1 block text-sm font-medium text-ink-soft">
          Confirme a nova senha
        </label>
        <input id="senha-confirma" type="password" autoComplete="new-password" className="field-control" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary" disabled={salvando || !atual || !nova}>
        {salvando ? 'Salvando…' : 'Alterar senha'}
      </button>
    </form>
  )
}

export function Conta() {
  const { eu } = useSessao()
  if (!eu) return null
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Secao titulo="Seus dados">
        <dl className="space-y-1 text-sm">
          <div>
            <dt className="inline text-ink-muted">Nome: </dt>
            <dd className="inline">{eu.nome}</dd>
          </div>
          <div>
            <dt className="inline text-ink-muted">E-mail: </dt>
            <dd className="inline">{eu.email}</dd>
          </div>
          <div>
            <dt className="inline text-ink-muted">Perfil: </dt>
            <dd className="inline">{NOME_PERFIL[eu.perfil]}</dd>
          </div>
        </dl>
        <h3 className="mt-4 mb-1 text-sm font-medium text-ink-soft">O que este perfil pode fazer</h3>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
          {eu.permissoes.map((p) => (
            <li key={p}>{PERMISSOES[p]}</li>
          ))}
        </ul>
      </Secao>
      <Secao titulo="Alterar senha" descricao={eu.trocar_senha ? 'Sua senha foi definida pela Administração. Troque-a agora.' : undefined}>
        <FormSenha />
      </Secao>
    </div>
  )
}
