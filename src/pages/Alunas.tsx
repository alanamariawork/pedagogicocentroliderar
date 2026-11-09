import { useMemo, useState } from 'react'
import { Download, Eye, LayoutList, LayoutGrid, MessageCircle, Pencil, Plus, Search, Users, X } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio } from '../components/Estados'
import { IdAluna, Selo } from '../components/Selos'
import { DialogMatricula } from '../forms/FormMatricula'
import { useDados, type Reg } from '../lib/api'
import { SITUACAO_CONTRATO, cx, idAluna } from '../lib/format'
import { href } from '../lib/rotas'
import { ativos, equipe, opcoesPorId, useCatalogos } from '../state/Catalogos'
import { useSessao } from '../state/Sessao'
import { formatarData, hojeSP, somarDias } from '../../shared/datas'
import { DialogPessoa, SeloOpcao } from './ficha/Perfil'

type Rapido = '' | 'ativas' | 'sem_responsavel' | 'em_risco' | 'renovam' | 'canceladas'
type Ordem = 'id' | 'nome' | 'entrada' | 'vencimento'
const FILTROS_VAZIOS = { status: '', responsavel: '', engajamento: '', produto: '', turma: '' }

/** Link do WhatsApp com o número da aluna. Só abre a conversa; nada é enviado pelo sistema. */
export function linkWhatsApp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length < 10 || /^0+$/.test(d)) return null
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`
}

export function Alunas() {
  const { pode } = useSessao()
  const cat = useCatalogos()
  const { dados, erro, carregando, recarregar } = useDados<Reg[]>('/pessoas')
  const [busca, setBusca] = useState('')
  const [rapido, setRapido] = useState<Rapido>('')
  const [f, setF] = useState(FILTROS_VAZIOS)
  const [ordem, setOrdem] = useState<Ordem>('id')
  const [modo, setModo] = useState<'lista' | 'cards'>(() => {
    try {
      return localStorage.getItem('alunas-modo') === 'cards' ? 'cards' : 'lista'
    } catch {
      return 'lista'
    }
  })
  const trocarModo = (v: 'lista' | 'cards') => {
    setModo(v)
    try {
      localStorage.setItem('alunas-modo', v)
    } catch {
      /* sem armazenamento local: só não lembra a escolha */
    }
  }
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  const ops = opcoesPorId(cat)
  const codigo = (id: string | null | undefined) => (id ? ops.get(id)?.codigo : undefined)
  const hoje = hojeSP()
  const limite90 = somarDias(hoje, 90)
  const renova = (p: Reg) => {
    const m = p.matricula_atual
    return m && ['ativa', 'pausada'].includes(m.situacao) && m.data_fim && m.data_fim >= hoje && m.data_fim <= limite90
  }
  const testes: Record<Exclude<Rapido, ''>, (p: Reg) => boolean> = {
    ativas: (p) => codigo(p.status_id) === 'ativa',
    sem_responsavel: (p) => !p.responsavel_id,
    em_risco: (p) => !!p.em_risco,
    renovam: (p) => !!renova(p),
    canceladas: (p) => codigo(p.status_id) === 'cancelada',
  }

  const filtrados = useMemo(() => {
    if (!dados) return []
    const termo = busca.trim().toLowerCase()
    const num = /^#?\d+$/.test(termo) ? Number(termo.replace('#', '')) : null
    const lista = dados.filter((p) => {
      const m = p.matricula_atual
      if (termo && !(num !== null && p.codigo === num) && ![p.nome, p.empresa, p.email, p.telefone].join(' ').toLowerCase().includes(termo)) return false
      if (rapido && !testes[rapido](p)) return false
      if (f.status && (f.status === '__sem' ? p.status_id : p.status_id !== f.status)) return false
      if (f.responsavel && (f.responsavel === '__sem' ? p.responsavel_id : p.responsavel_id !== f.responsavel)) return false
      if (f.engajamento && (f.engajamento === '__sem' ? p.engajamento_id : p.engajamento_id !== f.engajamento)) return false
      if (f.produto && m?.programa_id !== f.produto) return false
      if (f.turma && (f.turma === '__sem' ? m?.turma_id : m?.turma_id !== f.turma)) return false
      return true
    })
    const chave: Record<Ordem, (p: Reg) => string | number> = {
      id: (p) => p.codigo ?? 1e9,
      nome: (p) => p.nome.toLowerCase(),
      entrada: (p) => p.data_entrada ?? '',
      vencimento: (p) => p.matricula_atual?.data_fim ?? '9999',
    }
    const k = chave[ordem]
    return [...lista].sort((a, b) => {
      const x = k(a)
      const y = k(b)
      const r = x < y ? -1 : x > y ? 1 : 0
      return ordem === 'entrada' ? -r : r
    })
  }, [dados, busca, rapido, f, ordem, cat])

  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados || !cat) return <Carregando />

  const kpis: { id: Exclude<Rapido, ''>; titulo: string; tom?: 'alerta' | 'perigo' }[] = [
    { id: 'ativas', titulo: 'Ativas' },
    { id: 'sem_responsavel', titulo: 'Sem responsável', tom: 'alerta' },
    { id: 'em_risco', titulo: 'Em risco', tom: 'perigo' },
    { id: 'renovam', titulo: 'Renovam em 90 dias', tom: 'alerta' },
    { id: 'canceladas', titulo: 'Canceladas' },
  ]
  const algumFiltro = !!(busca || rapido || Object.values(f).some(Boolean))
  const podeCadastrar = pode('alunas:editar') && pode('matriculas:criar')
  const nome = (id: string | null | undefined) => (id ? ops.get(id)?.nome : undefined)

  function exportar() {
    const cab = ['ID', 'Nome', 'Empresa', 'E-mail', 'Telefone', 'Status', 'Saúde', 'Engajamento', 'Em risco', 'Responsável', 'Segmento', 'Produto', 'Turma', 'Entrada', 'Vencimento']
    const linhas = filtrados.map((p) => {
      const m = p.matricula_atual
      return [
        p.codigo ? idAluna(p.codigo) : '', p.nome, p.empresa, p.email, p.telefone, nome(p.status_id), nome(p.saude_id), nome(p.engajamento_id), p.em_risco ? 'Sim' : 'Não',
        p.responsavel_nome, nome(p.segmento_id), m?.programa_nome, m?.turma_nome, p.data_entrada ? formatarData(p.data_entrada) : '', m?.data_fim ? formatarData(m.data_fim) : '',
      ]
    })
    const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `alunas-${hoje}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const selecao = (rotulo: string, chave: keyof typeof FILTROS_VAZIOS, itens: Reg[], semRotulo?: string) => (
    <label className="text-xs text-ink-muted">
      {rotulo}
      <select className="field-control mt-0.5" value={f[chave]} onChange={(e) => setF((v) => ({ ...v, [chave]: e.target.value }))}>
        <option value="">Todos</option>
        {semRotulo && <option value="__sem">{semRotulo}</option>}
        {itens.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nome}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Indicadores (clique para filtrar)">
        {kpis.map((k) => {
          const n = dados.filter(testes[k.id]).length
          const ativo = rapido === k.id
          return (
            <button
              key={k.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => setRapido(ativo ? '' : k.id)}
              className={cx('card p-3 text-left transition-colors hover:bg-brand-50/60', ativo && 'ring-2 ring-brand-500')}
            >
              <span className="eyebrow block">{k.titulo}</span>
              <span className={cx('font-display text-2xl font-semibold tabular-nums', n && k.tom === 'perigo' ? 'text-danger' : n && k.tom === 'alerta' ? 'text-warning' : 'text-brand-700')}>{n}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <label htmlFor="busca" className="sr-only">
            Buscar
          </label>
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" aria-hidden />
          <input id="busca" type="search" placeholder="Buscar por ID, nome, empresa, e-mail ou telefone" className="field-control pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="inline-flex rounded-[var(--radius-control)] border border-line bg-surface p-0.5" role="group" aria-label="Modo de exibição">
          {(
            [
              ['lista', 'Lista', LayoutList],
              ['cards', 'Cards', LayoutGrid],
            ] as const
          ).map(([v, rotulo, Icone]) => (
            <button key={v} type="button" aria-pressed={modo === v} onClick={() => trocarModo(v)} className={cx('inline-flex items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1.5 text-sm', modo === v ? 'bg-brand-700 text-white' : 'text-ink-soft hover:bg-surface-muted')}>
              <Icone className="size-4" aria-hidden /> {rotulo}
            </button>
          ))}
        </div>
        <button type="button" className="btn-secondary" onClick={exportar} disabled={!filtrados.length}>
          <Download className="size-4" aria-hidden /> Exportar
        </button>
        {podeCadastrar && (
          <button type="button" className="btn-primary" onClick={() => setNovo(true)}>
            <Plus className="size-4" aria-hidden /> Nova aluna
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {selecao('Status', 'status', ativos(cat['status-aluna']), 'Sem status')}
        {selecao('Responsável', 'responsavel', equipe(cat), 'Sem responsável')}
        {selecao('Engajamento', 'engajamento', ativos(cat.engajamento), 'Não avaliado')}
        {selecao('Produto', 'produto', ativos(cat.programas))}
        {selecao('Turma', 'turma', ativos(cat.turmas), 'Sem turma')}
        <label className="text-xs text-ink-muted">
          Ordenar por
          <select className="field-control mt-0.5" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            <option value="id">ID (ordem de matrícula)</option>
            <option value="nome">Nome</option>
            <option value="entrada">Entrada mais recente</option>
            <option value="vencimento">Vencimento mais próximo</option>
          </select>
        </label>
      </div>

      {algumFiltro && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          {filtrados.length} de {dados.length} aluna(s).
          <button type="button" className="btn-ghost btn-sm" onClick={() => (setBusca(''), setRapido(''), setF(FILTROS_VAZIOS))}>
            <X className="size-3.5" aria-hidden /> Limpar filtros
          </button>
        </p>
      )}
      {carregando && <p className="text-xs text-ink-muted">Atualizando…</p>}

      {dados.length === 0 ? (
        <EstadoVazio icone={Users} titulo="Nenhuma aluna cadastrada ainda." acao={podeCadastrar ? 'Cadastrar a primeira aluna' : undefined} onAcao={() => setNovo(true)}>
          <p className="mt-1 max-w-md text-xs text-ink-muted">
            {pode('alunas:todas') ? 'Cada aluna recebe um ID na primeira matrícula, em ordem de matrícula.' : 'Aqui aparecem as alunas da sua carteira (em que você é a responsável).'}
          </p>
        </EstadoVazio>
      ) : filtrados.length === 0 ? (
        <EstadoVazio icone={Search} titulo="Nenhuma aluna com esses filtros.">
          <button type="button" className="btn-secondary mt-4" onClick={() => (setBusca(''), setRapido(''), setF(FILTROS_VAZIOS))}>
            Limpar filtros
          </button>
        </EstadoVazio>
      ) : modo === 'cards' ? (
        <Cards alunas={filtrados} onEditar={pode('alunas:editar') ? setEditando : undefined} />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {filtrados.map((p) => (
              <LinhaAluna key={p.id} p={p} onEditar={pode('alunas:editar') ? setEditando : undefined} />
            ))}
          </ul>
        </div>
      )}
      {novo && <DialogMatricula onFechar={() => setNovo(false)} />}
      {editando && <EditarAluna id={editando} onFechar={() => setEditando(null)} onConcluir={recarregar} />}
    </div>
  )
}

function Acoes({ p, onEditar, compacto }: { p: Reg; onEditar?: (id: string) => void; compacto?: boolean }) {
  const wa = linkWhatsApp(p.telefone)
  const cls = 'btn-ghost btn-sm'
  return (
    <div className="flex shrink-0 items-center gap-1">
      <a href={href({ pagina: 'ficha', id: p.id })} className={cls} title="Ver perfil completo">
        <Eye className="size-4" aria-hidden />
        <span className={compacto ? 'sr-only' : 'max-sm:sr-only'}>Ver perfil</span>
      </a>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={cls} title="Abrir conversa no WhatsApp (nada é enviado automaticamente)">
          <MessageCircle className="size-4" aria-hidden />
          <span className={compacto ? 'sr-only' : 'max-sm:sr-only'}>WhatsApp</span>
        </a>
      ) : (
        <span className={cx(cls, 'cursor-not-allowed opacity-40')} title="Sem telefone válido cadastrado">
          <MessageCircle className="size-4" aria-hidden />
          <span className="sr-only">WhatsApp indisponível: sem telefone válido</span>
        </span>
      )}
      {onEditar && (
        <button type="button" className={cls} onClick={() => onEditar(p.id)} title="Editar cadastro">
          <Pencil className="size-4" aria-hidden />
          <span className={compacto ? 'sr-only' : 'max-sm:sr-only'}>Editar</span>
        </button>
      )}
    </div>
  )
}

function LinhaAluna({ p, onEditar }: { p: Reg; onEditar?: (id: string) => void }) {
  const m = p.matricula_atual
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-56 flex-1">
        <a href={href({ pagina: 'ficha', id: p.id })} className="font-medium text-ink hover:text-brand-700 hover:underline">
          <IdAluna codigo={p.codigo} />
          {p.nome}
        </a>{' '}
        {p.demonstracao ? <Selo tom="info">Demonstração</Selo> : null}
        <p className="text-xs text-ink-muted">
          {[p.empresa, m?.programa_nome, m?.turma_nome, m && `${formatarData(m.data_inicio)} a ${formatarData(m.data_fim)}`].filter(Boolean).join(' · ') || 'Sem matrícula'}
        </p>
        <p className="text-xs text-ink-muted">Responsável: {p.responsavel_nome ?? <span className="text-warning">sem responsável</span>}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeloOpcao id={p.status_id} vazio="Sem status" />
        <SeloOpcao id={p.saude_id} vazio="" />
        {p.em_risco ? <Selo tom="perigo">Em risco</Selo> : null}
        {m && m.contrato_situacao !== 'assinado' && <Selo tom="alerta">{SITUACAO_CONTRATO[m.contrato_situacao]}</Selo>}
        {m?.entregas_vencidas > 0 && <Selo tom="perigo">{m.entregas_vencidas} vencida(s)</Selo>}
      </div>
      <Acoes p={p} onEditar={onEditar} />
    </li>
  )
}

function Cards({ alunas, onEditar }: { alunas: Reg[]; onEditar?: (id: string) => void }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {alunas.map((p) => {
        const m = p.matricula_atual
        return (
          <li key={p.id} className="card flex flex-col p-4">
            <a href={href({ pagina: 'ficha', id: p.id })} className="font-medium text-ink hover:text-brand-700 hover:underline">
              <IdAluna codigo={p.codigo} />
              {p.nome}
            </a>
            {p.empresa && <p className="truncate text-sm text-ink-soft">{p.empresa}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SeloOpcao id={p.status_id} vazio="Sem status" />
              <SeloOpcao id={p.saude_id} vazio="" />
              {p.em_risco ? <Selo tom="perigo">Em risco</Selo> : null}
              {p.demonstracao ? <Selo tom="info">Demonstração</Selo> : null}
            </div>
            <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-xs">
              <dt className="text-ink-muted">Programa</dt>
              <dd className="truncate">{m?.programa_nome ?? '—'}</dd>
              <dt className="text-ink-muted">Turma</dt>
              <dd className="truncate">{m?.turma_nome ?? '—'}</dd>
              <dt className="text-ink-muted">Vigência</dt>
              <dd>{m ? `${formatarData(m.data_inicio)} a ${formatarData(m.data_fim)}` : 'Sem matrícula'}</dd>
              <dt className="text-ink-muted">Responsável</dt>
              <dd className="truncate">{p.responsavel_nome ?? <span className="text-warning">sem responsável</span>}</dd>
            </dl>
            {(m?.entregas_vencidas > 0 || (m && m.contrato_situacao !== 'assinado')) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.contrato_situacao !== 'assinado' && <Selo tom="alerta">{SITUACAO_CONTRATO[m.contrato_situacao]}</Selo>}
                {m.entregas_vencidas > 0 && <Selo tom="perigo">{m.entregas_vencidas} vencida(s)</Selo>}
              </div>
            )}
            <div className="mt-auto flex justify-end border-t border-line pt-2">
              <Acoes p={p} onEditar={onEditar} compacto />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Carrega a ficha completa antes de editar, para não apagar campos que a lista não traz. */
function EditarAluna({ id, onFechar, onConcluir }: { id: string; onFechar: () => void; onConcluir: () => void }) {
  const { dados } = useDados(`/pessoas/${id}`)
  if (!dados) return null
  return <DialogPessoa pessoa={dados.pessoa} onFechar={onFechar} onConcluir={onConcluir} />
}
