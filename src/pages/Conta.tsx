import { Secao } from '../components/Estados'
import { useSessao } from '../state/Sessao'
import { NOME_PERFIL, PERMISSOES } from '../../shared/permissoes'

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
      <Secao titulo="Senha e acesso">
        <p className="text-sm text-ink-soft">
          O login é o mesmo do backoffice. Para trocar a senha, saia e use “Esqueci minha senha” na tela de entrada. Nome e e-mail da conta são cuidados em Configurações › Equipe, no backoffice.
        </p>
      </Secao>
    </div>
  )
}
