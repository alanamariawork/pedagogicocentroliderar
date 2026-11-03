import { Carregando, EstadoErro, Secao, Vazio } from '../../components/Estados'
import { useDados, type Reg } from '../../lib/api'
import { formatarCarimbo } from '../../../shared/datas'
import { AREAS_DIAGNOSTICO } from '../../../shared/diagnostico'
import { progressoMeta } from '../../portal/metas'

/** O diagnóstico que a aluna preencheu no portal. A equipe só lê; quem preenche é a aluna. */
export function DiagnosticoAluna({ m }: { m: Reg }) {
  const { dados, erro, recarregar } = useDados(`/matriculas/${m.id}/diagnostico`)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const respostas = dados.respostas as Reg[]
  const metas = dados.metas as Reg[]
  if (respostas.length === 0 && metas.length === 0) return <Vazio>A aluna ainda não preencheu o diagnóstico no portal.</Vazio>
  return (
    <div className="space-y-4">
      <Secao titulo="Metas" descricao="Definidas e atualizadas pela aluna. O progresso mostra o valor inicial, o atual e o alvo.">
        {metas.length === 0 ? (
          <Vazio>Nenhuma meta definida.</Vazio>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {metas.map((mt) => (
              <li key={mt.id} className="py-1.5">
                <span className="font-medium">{mt.nome}</span>
                <span className="block text-xs text-ink-muted">{progressoMeta(mt).texto}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
      {(['inicio', 'fim'] as const).map((v) => {
        const daVersao = respostas.filter((r) => r.versao === v)
        if (daVersao.length === 0) return null
        return (
          <Secao key={v} titulo={v === 'inicio' ? 'Diagnóstico de início' : 'Diagnóstico de fim de ciclo'} descricao={`${daVersao.length} de 4 áreas preenchidas`}>
            <div className="grid gap-4 md:grid-cols-2">
              {AREAS_DIAGNOSTICO.map((a) => {
                const r = daVersao.find((x) => x.area === a.id)
                return (
                  <div key={a.id}>
                    <h3 className="text-sm font-semibold">{a.nome}</h3>
                    {!r ? (
                      <p className="text-sm text-ink-muted">Não preenchida.</p>
                    ) : (
                      <>
                        <dl className="mt-1 space-y-1.5 text-sm">
                          {a.perguntas
                            .filter((p) => r.conteudo[p.id])
                            .map((p) => (
                              <div key={p.id}>
                                <dt className="text-xs text-ink-muted">{p.texto}</dt>
                                <dd className="whitespace-pre-line">{r.conteudo[p.id]}</dd>
                              </div>
                            ))}
                        </dl>
                        <p className="mt-1 text-xs text-ink-muted">Atualizado em {formatarCarimbo(r.atualizado_em)}</p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </Secao>
        )
      })}
    </div>
  )
}
