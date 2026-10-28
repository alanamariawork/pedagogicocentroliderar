import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { AlertaErro, Carregando, EstadoErro, Secao, Vazio } from '../components/Estados'
import { Campo, FormDialog, Opcoes, useValores } from '../components/Form'
import { Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { mensagemDeErro, post, put, useDados, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { invalidarCatalogos, useCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'
import { formatarHoras } from '../../shared/datas'
import { NOME_PERFIL, PERFIS, PERMISSOES, type Perfil, type Permissao } from '../../shared/permissoes'

type CampoCad = { chave: string; rotulo: string; tipo?: 'texto' | 'numero' | 'check'; obrigatorio?: boolean; dica?: string }
const CADASTROS: { nome: string; titulo: string; descricao: string; campos: CampoCad[]; detalhe: (r: Reg) => string }[] = [
  {
    nome: 'programas',
    titulo: 'Programas',
    descricao: 'Programas oferecidos (ex.: Diamante Business).',
    campos: [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
      { chave: 'descricao', rotulo: 'Descrição' },
    ],
    detalhe: (r) => r.descricao ?? '',
  },
  {
    nome: 'profissionais',
    titulo: 'Profissionais',
    descricao: 'Quem conduz encontros. A disponibilidade é cadastrada em Capacidade e agenda.',
    campos: [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
      { chave: 'especialidade', rotulo: 'Especialidade' },
      { chave: 'contato', rotulo: 'Contato interno', dica: 'Opcional. Sem dados pessoais desnecessários.' },
    ],
    detalhe: (r) => r.especialidade ?? '',
  },
  {
    nome: 'tipos-entregavel',
    titulo: 'Tipos de entregável',
    descricao: 'Tipos individuais que não estiverem no contrato aparecem no portal como “Não incluído no contrato”.',
    campos: [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
      { chave: 'descricao', rotulo: 'Descrição' },
      { chave: 'duracao_padrao_min', rotulo: 'Duração padrão (min)', tipo: 'numero', dica: 'Deixe vazio se não houver duração definida: ela não será tratada como zero.' },
      { chave: 'individual', rotulo: 'Entregável individual (aparece no portal)', tipo: 'check' },
    ],
    detalhe: (r) => `${r.duracao_padrao_min ? formatarHoras(r.duracao_padrao_min) : 'duração não informada'}${r.individual ? '' : ' · em grupo'}`,
  },
  {
    nome: 'motivos-impedimento',
    titulo: 'Motivos de impedimento',
    descricao: 'Usados para registrar por que uma entrega não aconteceu.',
    campos: [
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
      { chave: 'exige_descricao', rotulo: 'Exige descrição', tipo: 'check' },
    ],
    detalhe: (r) => (r.exige_descricao ? 'exige descrição' : ''),
  },
]

export function Configuracoes() {
  const { pode } = useSessao()
  const abas = [
    pode('config:editar') && { id: 'cadastros', nome: 'Cadastros' },
    pode('config:editar') && { id: 'parametros', nome: 'Parâmetros' },
    pode('usuarios:admin') && { id: 'usuarios', nome: 'Usuários' },
    pode('usuarios:admin') && { id: 'acesso', nome: 'Regras de acesso' },
  ].filter(Boolean) as { id: string; nome: string }[]
  const [aba, setAba] = useState(abas[0]?.id ?? '')
  if (!abas.length)
    return <Vazio>Seu perfil não tem configurações para editar aqui. Trilhas, pilares e etapas ficam em “Trilhas e etapas”.</Vazio>
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={cx('-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap', aba === a.id ? 'border-brand-700 font-medium text-brand-700' : 'border-transparent text-ink-muted hover:text-ink')}
          >
            {a.nome}
          </button>
        ))}
      </div>
      {aba === 'cadastros' && <Cadastros />}
      {aba === 'parametros' && <Parametros />}
      {aba === 'usuarios' && <Usuarios />}
      {aba === 'acesso' && <RegrasAcesso />}
    </div>
  )
}

function Cadastros() {
  const cat = useCatalogos()
  const [editando, setEditando] = useState<{ cad: (typeof CADASTROS)[number]; reg: Reg | null } | null>(null)
  if (!cat) return <Carregando />
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {CADASTROS.map((c) => {
        const lista = cat[c.nome as keyof typeof cat] as Reg[]
        return (
          <Secao
            key={c.nome}
            titulo={c.titulo}
            descricao={c.descricao}
            acao={
              <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando({ cad: c, reg: null })}>
                <Plus className="size-4" aria-hidden /> Adicionar
              </button>
            }
          >
            {lista.length === 0 ? (
              <Vazio>Nenhum registro.</Vazio>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {lista.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className={cx(!r.ativo && 'text-ink-muted')}>
                      {r.nome} {!r.ativo && <Selo>Inativo</Selo>}
                      {c.detalhe(r) && <span className="block text-xs text-ink-muted">{c.detalhe(r)}</span>}
                    </span>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditando({ cad: c, reg: r })}>
                      Editar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        )
      })}
      {editando && <DialogCadastro cad={editando.cad} reg={editando.reg} onFechar={() => setEditando(null)} />}
    </div>
  )
}

function DialogCadastro({ cad, reg, onFechar }: { cad: (typeof CADASTROS)[number]; reg: Reg | null; onFechar: () => void }) {
  const fb = useFeedback()
  const inicial: Record<string, string | boolean> = { ativo: reg ? !!reg.ativo : true }
  for (const c of cad.campos) inicial[c.chave] = c.tipo === 'check' ? (reg ? !!reg[c.chave] : c.chave === 'individual') : reg?.[c.chave] != null ? String(reg[c.chave]) : ''
  const { valores, campo } = useValores(inicial)
  return (
    <FormDialog
      aberto
      titulo={`${reg ? 'Editar' : 'Adicionar'}: ${cad.titulo.toLowerCase()}`}
      descricao="Registros não são apagados. Desative para tirar das listas sem perder o histórico."
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo: Record<string, unknown> = { ativo: valores.ativo }
        for (const c of cad.campos) {
          const v = valores[c.chave]
          corpo[c.chave] = c.tipo === 'check' ? v : v === '' ? null : c.tipo === 'numero' ? Number(v) : v
        }
        if (reg) await put(`/catalogos/${cad.nome}/${reg.id}`, corpo)
        else await post(`/catalogos/${cad.nome}`, corpo)
        invalidarCatalogos()
        fb.sucesso('Salvo.')
      }}
    >
      {cad.campos.map((c) =>
        c.tipo === 'check' ? (
          <label key={c.chave} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!valores[c.chave]} onChange={campo(c.chave)} /> {c.rotulo}
          </label>
        ) : (
          <Campo key={c.chave} rotulo={c.rotulo} obrigatorio={c.obrigatorio} dica={c.dica}>
            {(p) => <input type={c.tipo === 'numero' ? 'number' : 'text'} min={c.tipo === 'numero' ? 5 : undefined} className="field-control" {...p} value={String(valores[c.chave])} onChange={campo(c.chave)} />}
          </Campo>
        ),
      )}
      {reg && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!valores.ativo} onChange={campo('ativo')} /> Ativo
        </label>
      )}
    </FormDialog>
  )
}

function Parametros() {
  const cat = useCatalogos()
  const fb = useFeedback()
  const [janela, setJanela] = useState('')
  const [ajuda, setAjuda] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (cat) {
      setJanela(cat.configuracoes.janela_termino_dias ?? '45')
      setAjuda(cat.configuracoes.texto_ajuda_aluna ?? '')
    }
  }, [cat])
  if (!cat) return <Carregando />
  return (
    <Secao titulo="Parâmetros gerais">
      <form
        className="max-w-xl space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setSalvando(true)
          setErro(null)
          try {
            await put('/configuracoes', { janela_termino_dias: janela, texto_ajuda_aluna: ajuda })
            invalidarCatalogos()
            fb.sucesso('Parâmetros salvos.')
          } catch (err) {
            setErro(mensagemDeErro(err))
          } finally {
            setSalvando(false)
          }
        }}
      >
        {erro && <AlertaErro mensagem={erro} />}
        <Campo rotulo="Janela de “próxima do término” (dias)" dica="Matrículas que terminam dentro deste prazo aparecem nos alertas e na visão geral.">
          {(p) => <input type="number" min={1} max={365} className="field-control max-w-32" {...p} value={janela} onChange={(e) => setJanela(e.target.value)} />}
        </Campo>
        <Campo rotulo="Texto de ajuda no portal da aluna" dica="Diga como a aluna pede ajuda. Não há envio automático de mensagens.">
          {(p) => <textarea rows={3} maxLength={2000} className="field-control" {...p} value={ajuda} onChange={(e) => setAjuda(e.target.value)} />}
        </Campo>
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar parâmetros'}
        </button>
      </form>
    </Secao>
  )
}

function Usuarios() {
  const { dados, erro, recarregar } = useDados<Reg[]>('/usuarios')
  const [editando, setEditando] = useState<Reg | 'novo' | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  return (
    <Secao
      titulo="Usuários"
      descricao="Cada pessoa da equipe tem o próprio login. Acesso de aluna também pode ser criado pela ficha."
      acao={
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditando('novo')}>
          <Plus className="size-4" aria-hidden /> Novo usuário
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="tabela w-full min-w-[40rem]">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Vínculo</th>
              <th>Situação</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {dados.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email}</td>
                <td>{NOME_PERFIL[u.perfil as Perfil]}</td>
                <td className="text-xs text-ink-muted">{u.pessoa_nome ?? u.profissional_nome ?? '—'}</td>
                <td>
                  {u.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Inativo</Selo>} {u.trocar_senha ? <Selo tom="alerta">Troca de senha pendente</Selo> : null}
                </td>
                <td>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditando(u)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editando && (
        <DialogUsuario
          usuario={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onConcluir={() => {
            invalidarCatalogos()
            void recarregar()
          }}
        />
      )}
    </Secao>
  )
}

function DialogUsuario({ usuario, onFechar, onConcluir }: { usuario: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const cat = useCatalogos()
  const pessoas = useDados<Reg[]>('/pessoas').dados
  const { valores, campo } = useValores({
    nome: usuario?.nome ?? '',
    email: usuario?.email ?? '',
    perfil: (usuario?.perfil as string) ?? 'suporte',
    pessoa_id: usuario?.pessoa_id ?? '',
    profissional_id: usuario?.profissional_id ?? '',
    ativo: usuario ? !!usuario.ativo : true,
    senha: '',
  })
  return (
    <FormDialog
      aberto
      titulo={usuario ? 'Editar usuário' : 'Novo usuário'}
      descricao="A senha inicial deve ser entregue à pessoa por um canal seguro. No primeiro acesso, ela será orientada a trocar."
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = {
          nome: valores.nome,
          email: valores.email,
          perfil: valores.perfil,
          ativo: valores.ativo,
          pessoa_id: valores.perfil === 'aluna' ? valores.pessoa_id || null : null,
          profissional_id: valores.perfil === 'mentora' ? valores.profissional_id || null : null,
        }
        if (usuario) await put(`/usuarios/${usuario.id}`, { ...corpo, nova_senha: valores.senha || undefined })
        else await post('/usuarios', { ...corpo, senha_inicial: valores.senha })
        fb.sucesso('Usuário salvo.')
        onConcluir()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" obrigatorio>
          {(p) => <input className="field-control" {...p} value={valores.nome} onChange={campo('nome')} />}
        </Campo>
        <Campo rotulo="E-mail de acesso" obrigatorio>
          {(p) => <input type="email" className="field-control" {...p} value={valores.email} onChange={campo('email')} />}
        </Campo>
        <Campo rotulo="Perfil" obrigatorio>
          {(p) => (
            <select className="field-control" {...p} value={valores.perfil} onChange={campo('perfil')}>
              {PERFIS.map((x) => (
                <option key={x} value={x}>
                  {NOME_PERFIL[x]}
                </option>
              ))}
            </select>
          )}
        </Campo>
        {valores.perfil === 'aluna' && (
          <Campo rotulo="Aluna vinculada" obrigatorio>
            {(p) => (
              <select className="field-control" {...p} value={valores.pessoa_id} onChange={campo('pessoa_id')}>
                <Opcoes itens={pessoas ?? []} vazio="Selecione" />
              </select>
            )}
          </Campo>
        )}
        {valores.perfil === 'mentora' && (
          <Campo rotulo="Profissional vinculada" obrigatorio dica="A mentora só verá as matrículas em que atende.">
            {(p) => (
              <select className="field-control" {...p} value={valores.profissional_id} onChange={campo('profissional_id')}>
                <Opcoes itens={cat?.profissionais ?? []} vazio="Selecione" />
              </select>
            )}
          </Campo>
        )}
      </div>
      <Campo rotulo={usuario ? 'Redefinir senha' : 'Senha inicial'} obrigatorio={!usuario} dica={usuario ? 'Deixe vazio para manter. Redefinir encerra as sessões abertas.' : 'Pelo menos 10 caracteres, com letras e números.'}>
        {(p) => <input type="password" autoComplete="new-password" className="field-control" {...p} value={valores.senha} onChange={campo('senha')} />}
      </Campo>
      {usuario && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={valores.ativo} onChange={campo('ativo')} /> Acesso ativo
        </label>
      )}
    </FormDialog>
  )
}

function RegrasAcesso() {
  const fb = useFeedback()
  const { recarregar: recarregarSessao } = useSessao()
  const { dados, erro, recarregar } = useDados<{ mapa: Record<Perfil, Permissao[]> }>('/permissoes')
  const [mapa, setMapa] = useState<Record<string, Set<string>> | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (dados) setMapa(Object.fromEntries(Object.entries(dados.mapa).map(([k, v]) => [k, new Set(v)])))
  }, [dados])
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados || !mapa) return <Carregando />
  const perfis = PERFIS.filter((p) => p !== 'aluna')
  const alternar = (perfil: string, perm: string) =>
    setMapa((m) => {
      const s = new Set(m![perfil])
      if (s.has(perm)) s.delete(perm)
      else s.add(perm)
      return { ...m!, [perfil]: s }
    })

  return (
    <Secao titulo="Regras de acesso por perfil" descricao="Aplicadas no servidor a cada requisição. O perfil Aluna acessa somente o próprio portal e não aparece aqui.">
      <div className="overflow-x-auto">
        <table className="tabela w-full min-w-[48rem]">
          <thead>
            <tr>
              <th>Permissão</th>
              {perfis.map((p) => (
                <th key={p} className="text-center">
                  {NOME_PERFIL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(PERMISSOES) as Permissao[]).map((perm) => (
              <tr key={perm}>
                <td className="text-sm">{PERMISSOES[perm]}</td>
                {perfis.map((p) => {
                  const fixo = p === 'admin' && perm === 'usuarios:admin'
                  return (
                    <td key={p} className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`${NOME_PERFIL[p]}: ${PERMISSOES[perm]}`}
                        checked={fixo || mapa[p]?.has(perm)}
                        disabled={fixo}
                        onChange={() => alternar(p, perm)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn-primary mt-4"
        disabled={salvando}
        onClick={async () => {
          if (!(await fb.confirmar({ titulo: 'Salvar regras de acesso?', mensagem: 'As mudanças valem imediatamente para todos os usuários desses perfis.', rotuloConfirmar: 'Salvar' }))) return
          setSalvando(true)
          try {
            await put('/permissoes', { mapa: Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, [...v]])) })
            fb.sucesso('Regras de acesso salvas.')
            await recarregarSessao()
            void recarregar()
          } catch (e) {
            fb.erro(mensagemDeErro(e))
          } finally {
            setSalvando(false)
          }
        }}
      >
        {salvando ? 'Salvando…' : 'Salvar regras'}
      </button>
    </Secao>
  )
}
