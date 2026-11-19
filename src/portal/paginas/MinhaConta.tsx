import { useSessao } from '../../state/Sessao'

export function MinhaConta() {
  const { eu } = useSessao()
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="font-display text-base font-semibold">Acesso</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Você entra com o e-mail <strong>{eu?.email}</strong>, o mesmo do Portal do Centro Liderar. Para trocar o e-mail de acesso, fale com a equipe.
        </p>
      </section>
      <section className="card p-4">
        <h2 className="font-display text-base font-semibold">Senha</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Para trocar a senha, saia e use “Esqueci minha senha” na tela de entrada do Portal. Você recebe um link no seu e-mail.
        </p>
      </section>
    </div>
  )
}
