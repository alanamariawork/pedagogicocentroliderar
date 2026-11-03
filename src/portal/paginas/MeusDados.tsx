import { useState } from 'react'
import { AtSign, ExternalLink, FileText, Globe, Pencil } from 'lucide-react'
import { Carregando, EstadoErro } from '../../components/Estados'
import { Campo, FormDialog, useValores } from '../../components/Form'
import { Selo } from '../../components/Selos'
import { useFeedback } from '../../components/Feedback'
import { put, useDados, type Reg } from '../../lib/api'
import { SITUACAO_CONTRATO, SITUACAO_MATRICULA, idAluna } from '../../lib/format'
import { formatarData } from '../../../shared/datas'

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-sm text-ink-muted">{rotulo}</dt>
      <dd className="text-sm text-ink">{children ?? <span className="text-ink-muted">Não informado</span>}</dd>
    </div>
  )
}

const vazio = (v: unknown) => (v ? String(v) : null)

export function MeusDados() {
  const { dados, erro, recarregar } = useDados('/portal/perfil')
  const [editando, setEditando] = useState(false)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const p = dados.pessoa as Reg
  const m = dados.matricula as Reg | null
  const redes = [
    p.instagram && { icone: AtSign, rotulo: 'Instagram', valor: p.instagram },
    p.linkedin && { icone: AtSign, rotulo: 'LinkedIn', valor: p.linkedin },
    p.site && { icone: Globe, rotulo: 'Site', valor: p.site, url: p.site },
  ].filter(Boolean) as { icone: typeof Globe; rotulo: string; valor: string; url?: string }[]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold">Dados cadastrais</h2>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(true)}>
            <Pencil className="size-3.5" aria-hidden /> Editar contato e redes
          </button>
        </div>
        <dl className="mt-2 divide-y divide-line">
          <Linha rotulo="Nome">{p.nome}</Linha>
          <Linha rotulo="ID">{p.codigo ? idAluna(p.codigo) : null}</Linha>
          <Linha rotulo="E-mail de acesso">{vazio(p.email)}</Linha>
          <Linha rotulo="Telefone">{vazio(p.telefone)}</Linha>
          <Linha rotulo="Cidade">{vazio(p.cidade)}</Linha>
        </dl>
        <p className="mt-2 text-xs text-ink-muted">Para mudar o nome ou o e-mail de acesso, fale com a equipe.</p>
      </section>

      <section className="card p-4">
        <h2 className="font-display text-base font-semibold">Programa</h2>
        {!m ? (
          <p className="mt-2 text-sm text-ink-muted">Ainda não há uma matrícula vinculada ao seu acesso.</p>
        ) : (
          <dl className="mt-2 divide-y divide-line">
            <Linha rotulo="Programa">{vazio(m.programa_nome)}</Linha>
            <Linha rotulo="Turma">{vazio(m.turma_nome)}</Linha>
            <Linha rotulo="Data de matrícula">{formatarData(m.data_inicio)}</Linha>
            <Linha rotulo="Boas-vindas">{m.data_boas_vindas ? formatarData(m.data_boas_vindas) : null}</Linha>
            <Linha rotulo="Vigência">
              {formatarData(m.data_inicio)} a {m.data_fim ? formatarData(m.data_fim) : 'a definir'}
            </Linha>
            <Linha rotulo="Situação">{SITUACAO_MATRICULA[m.situacao]}</Linha>
            <Linha rotulo="Mentora">{vazio(m.mentora_nome)}</Linha>
          </dl>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-display text-base font-semibold">Redes sociais</h2>
        {redes.length === 0 ? (
          <div className="mt-2 rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface-muted/50 px-4 py-5 text-center text-sm text-ink-muted">
            <p>Você ainda não informou suas redes sociais.</p>
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setEditando(true)}>
              Adicionar redes
            </button>
          </div>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {redes.map((r) => (
              <li key={r.rotulo} className="flex items-center gap-2">
                <r.icone className="size-4 text-ink-muted" aria-hidden />
                <span className="w-20 text-ink-muted">{r.rotulo}</span>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="truncate text-brand-700 underline">
                    {r.valor}
                  </a>
                ) : (
                  <span className="truncate">{r.valor}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="font-display flex items-center gap-2 text-base font-semibold">
          <FileText className="size-4.5 text-gold" aria-hidden /> Contrato
        </h2>
        {!m ? (
          <p className="mt-2 text-sm text-ink-muted">Sem matrícula vinculada.</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <Selo tom={m.contrato_situacao === 'assinado' ? 'sucesso' : 'alerta'}>{SITUACAO_CONTRATO[m.contrato_situacao]}</Selo>
            {m.contrato_link ? (
              <p>
                <a href={m.contrato_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">
                  Ver ou baixar o contrato <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </p>
            ) : (
              <p className="text-ink-muted">A equipe ainda não disponibilizou o contrato aqui. Se precisar de uma cópia, fale com o Sucesso do Cliente.</p>
            )}
          </div>
        )}
      </section>

      {editando && <DialogContato pessoa={p} onFechar={() => setEditando(false)} onConcluir={recarregar} />}
    </div>
  )
}

function DialogContato({ pessoa, onFechar, onConcluir }: { pessoa: Reg; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({
    telefone: pessoa.telefone ?? '',
    cidade: pessoa.cidade ?? '',
    instagram: pessoa.instagram ?? '',
    linkedin: pessoa.linkedin ?? '',
    site: pessoa.site ?? '',
  })
  return (
    <FormDialog
      aberto
      titulo="Contato e redes sociais"
      onFechar={onFechar}
      onEnviar={async () => {
        await put('/portal/perfil', valores)
        fb.sucesso('Dados atualizados.')
        onConcluir()
      }}
    >
      <Campo rotulo="Telefone">{(p) => <input className="field-control" inputMode="tel" maxLength={40} {...p} value={valores.telefone} onChange={campo('telefone')} />}</Campo>
      <Campo rotulo="Cidade">{(p) => <input className="field-control" maxLength={120} {...p} value={valores.cidade} onChange={campo('cidade')} />}</Campo>
      <Campo rotulo="Instagram" dica="Ex.: @seunegocio">
        {(p) => <input className="field-control" maxLength={200} {...p} value={valores.instagram} onChange={campo('instagram')} />}
      </Campo>
      <Campo rotulo="LinkedIn">{(p) => <input className="field-control" maxLength={200} {...p} value={valores.linkedin} onChange={campo('linkedin')} />}</Campo>
      <Campo rotulo="Site">
        {(p) => <input type="url" inputMode="url" placeholder="https://" className="field-control" {...p} value={valores.site} onChange={campo('site')} />}
      </Campo>
    </FormDialog>
  )
}
