import { useRef, useState } from 'react'
import { LibraryBig, Lock, Paperclip, Plus } from 'lucide-react'
import { Carregando, EstadoErro, EstadoVazio, Secao } from '../components/Estados'
import { Campo, FormDialog, useValores } from '../components/Form'
import { Selo } from '../components/Selos'
import { useFeedback } from '../components/Feedback'
import { del as apagar, enviarArquivo, mensagemDeErro, post, put, useDados, type Reg } from '../lib/api'
import { useSessao } from '../state/Sessao'
import { useCatalogos } from '../state/Catalogos'
import { GestaoMural as MuralEquipe } from '../mural/GestaoMural'

const SECOES: { id: 'rotina' | 'biblioteca' | 'livros'; nome: string; dica: string }[] = [
  { id: 'rotina', nome: 'Rotina', dica: 'Ex.: o “Dia Extraordinário da Mulher que Age”, quando a coordenação publicar o material oficial.' },
  { id: 'biblioteca', nome: 'Biblioteca', dica: 'Crie estantes e coloque nelas os arquivos, links e vídeos. Vídeos do YouTube (não listados) ou do Vimeo tocam no próprio portal e o sistema grava quanto cada aluna assistiu.' },
  { id: 'livros', nome: 'Livros', dica: 'Só link de compra. O portal nunca oferece o PDF de um livro.' },
]

const DICA_VIDEO = 'Cole o link do vídeo. No YouTube, publique como “Não listado” (vídeo “Privado” não toca no portal). A aluna assiste no próprio portal e o sistema grava quanto ela já viu.'

/** Página da equipe: o que aparece em Rotina, Biblioteca e Livros do portal, e a moderação do Mural. */
export function ConteudosPortal() {
  const { pode } = useSessao()
  const abas = [pode('conteudos:editar') && { id: 'aulas', nome: 'Aulas do plano' }, (pode('conteudos:editar') || pode('biblioteca:editar')) && { id: 'conteudos', nome: pode('conteudos:editar') ? 'Rotina, Biblioteca e Livros' : 'Biblioteca' }, pode('mural:moderar') && { id: 'mural', nome: 'Mural' }].filter(Boolean) as { id: string; nome: string }[]
  const [aba, setAba] = useState(abas[0]?.id ?? '')
  if (!abas.length) return <EstadoVazio icone={Lock} titulo="Seu perfil não edita conteúdos do portal." />
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {abas.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={aba === a.id ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setAba(a.id)}>
            {a.nome}
          </button>
        ))}
      </div>
      {aba === 'aulas' ? <AulasPlano /> : aba === 'conteudos' ? <Conteudos /> : <MuralEquipe />}
    </div>
  )
}

type Edicao = { secao: string; reg: Reg | null; estanteId?: string | null }

function Conteudos() {
  const fb = useFeedback()
  const { dados, erro, recarregar } = useDados<{ conteudos: Reg[]; estantes: Reg[]; secoes: string[] }>('/conteudos')
  const [editando, setEditando] = useState<Edicao | null>(null)
  const [estanteEditando, setEstanteEditando] = useState<Reg | 'nova' | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [alvoArquivo, setAlvoArquivo] = useState<Reg | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />

  async function publicar(c: Reg, publicado: boolean) {
    try {
      await post(`/conteudos/${c.id}/publicar`, { publicado })
      fb.sucesso(publicado ? 'Publicado no portal.' : 'Retirado do portal.')
      recarregar()
    } catch (e) {
      fb.erro(mensagemDeErro(e))
    }
  }

  async function publicarEstante(e: Reg, publicada: boolean) {
    try {
      await post(`/estantes/${e.id}/publicar`, { publicada })
      fb.sucesso(publicada ? 'Estante publicada no portal.' : 'Estante retirada do portal. Os materiais dela ficam guardados.')
      recarregar()
    } catch (err) {
      fb.erro(mensagemDeErro(err))
    }
  }

  const acoes = {
    editar: (c: Reg) => setEditando({ secao: c.secao, reg: c }),
    anexar: (c: Reg) => {
      setAlvoArquivo(c)
      arquivoRef.current?.click()
    },
    removerArquivo: async (c: Reg) => {
      try {
        await apagar(`/conteudos/${c.id}/arquivo`)
        recarregar()
      } catch (e) {
        fb.erro(mensagemDeErro(e))
      }
    },
    publicar,
  }

  const lista = (itens: Reg[], vazio: string) =>
    !itens.length ? (
      <p className="text-sm text-ink-muted">{vazio}</p>
    ) : (
      <ul className="divide-y divide-line text-sm">
        {itens.map((c) => (
          <LinhaConteudo key={c.id} c={c} acoes={acoes} />
        ))}
      </ul>
    )

  return (
    <>
      <p className="max-w-3xl text-sm text-ink-soft">
        Nada aparece para as alunas até ser publicado. O conteúdo oficial é da coordenação: o sistema não cria textos de aula. Vídeos entram pelo link do YouTube ou do Vimeo. No YouTube, publique o vídeo como “Não listado” (o “Privado” não toca no portal); quem tiver o link pode assistir e repassar. No Vimeo, dá para permitir a incorporação só no portal.
      </p>
      <input
        ref={arquivoRef}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f || !alvoArquivo) return
          try {
            await enviarArquivo(`/conteudos/${alvoArquivo.id}/arquivo`, f)
            fb.sucesso('Arquivo anexado.')
            recarregar()
          } catch (err) {
            fb.erro(mensagemDeErro(err))
          }
        }}
      />
      {SECOES.filter((s) => dados.secoes.includes(s.id)).map((s) => {
        const itens = dados.conteudos.filter((c) => c.secao === s.id)
        if (s.id !== 'biblioteca')
          return (
            <Secao
              key={s.id}
              titulo={s.nome}
              descricao={s.dica}
              acao={
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando({ secao: s.id, reg: null })}>
                  <Plus className="size-4" aria-hidden /> Adicionar
                </button>
              }
            >
              {lista(itens, 'Nada cadastrado. No portal aparece a mensagem de “em breve”.')}
            </Secao>
          )
        const soltos = itens.filter((c) => !c.estante_id)
        return (
          <Secao
            key={s.id}
            titulo={s.nome}
            descricao={s.dica}
            acao={
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={() => setEstanteEditando('nova')}>
                  <LibraryBig className="size-4" aria-hidden /> Nova estante
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando({ secao: s.id, reg: null, estanteId: null })}>
                  <Plus className="size-4" aria-hidden /> Material avulso
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              {!dados.estantes.length && <p className="text-sm text-ink-muted">Nenhuma estante ainda. Crie uma estante (ex.: “Vendas”, “Finanças”) e adicione os materiais dentro dela.</p>}
              {dados.estantes.map((e) => {
                const daEstante = itens.filter((c) => c.estante_id === e.id)
                return (
                  <div key={e.id} className="rounded-[var(--radius-control)] border border-line bg-surface-muted/40 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <LibraryBig className="size-4 text-gold" aria-hidden /> Estante: {e.titulo} {e.publicada ? <Selo tom="sucesso">Publicada</Selo> : <Selo>Rascunho</Selo>}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {daEstante.length} {daEstante.length === 1 ? 'material' : 'materiais'}
                          {e.descricao ? ` · ${e.descricao}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando({ secao: 'biblioteca', reg: null, estanteId: e.id })}>
                          <Plus className="size-4" aria-hidden /> Adicionar material
                        </button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setEstanteEditando(e)}>
                          Editar estante
                        </button>
                        <button type="button" className={e.publicada ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} onClick={() => publicarEstante(e, !e.publicada)}>
                          {e.publicada ? 'Retirar do portal' : 'Publicar estante'}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 border-t border-line pt-1">{lista(daEstante, 'Estante vazia. Use “Adicionar material” para colocar arquivos, links ou vídeos.')}</div>
                  </div>
                )
              })}
              {soltos.length > 0 && (
                <div>
                  <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Fora de estante</p>
                  {lista(soltos, '')}
                </div>
              )}
            </div>
          </Secao>
        )
      })}
      {editando && <DialogConteudo secao={editando.secao} reg={editando.reg} estanteId={editando.estanteId} estantes={dados.estantes} onFechar={() => setEditando(null)} onConcluir={recarregar} />}
      {estanteEditando && <DialogEstante reg={estanteEditando === 'nova' ? null : estanteEditando} onFechar={() => setEstanteEditando(null)} onConcluir={recarregar} />}
    </>
  )
}

type AcoesConteudo = { editar: (c: Reg) => void; anexar: (c: Reg) => void; removerArquivo: (c: Reg) => void; publicar: (c: Reg, publicado: boolean) => void }

function LinhaConteudo({ c, acoes }: { c: Reg; acoes: AcoesConteudo }) {
  const assistiram = c.video_url ? `${c.alunas_iniciaram ?? 0} ${c.alunas_iniciaram === 1 ? 'aluna começou' : 'alunas começaram'}, ${c.alunas_assistiram ?? 0} ${c.alunas_assistiram === 1 ? 'assistiu' : 'assistiram'} até o fim` : null
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="font-medium">
          {c.titulo} {c.publicado ? <Selo tom="sucesso">Publicado</Selo> : <Selo>Rascunho</Selo>}
        </p>
        <p className="text-xs text-ink-muted">
          {[c.categoria, c.video_url && (String(c.video_url).startsWith('https://player.vimeo.com/') ? 'vídeo Vimeo' : 'vídeo YouTube'), c.compra_url && 'link de compra', c.link && 'link', c.tem_arquivo && `arquivo: ${c.arquivo_nome}`].filter(Boolean).join(' · ') || 'sem anexo'}
        </p>
        {assistiram && <p className="text-xs text-ink-soft">{assistiram}</p>}
      </div>
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn-ghost btn-sm" onClick={() => acoes.editar(c)}>
          Editar
        </button>
        {c.secao !== 'livros' && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => acoes.anexar(c)}>
            <Paperclip className="size-4" aria-hidden /> {c.tem_arquivo ? 'Trocar arquivo' : 'Anexar arquivo'}
          </button>
        )}
        {c.tem_arquivo && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => acoes.removerArquivo(c)}>
            Remover arquivo
          </button>
        )}
        <button type="button" className={c.publicado ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} onClick={() => acoes.publicar(c, !c.publicado)}>
          {c.publicado ? 'Retirar do portal' : 'Publicar'}
        </button>
      </div>
    </li>
  )
}

function DialogEstante({ reg, onFechar, onConcluir }: { reg: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({ titulo: reg?.titulo ?? '', descricao: reg?.descricao ?? '', ordem: String(reg?.ordem ?? 0) })
  return (
    <FormDialog
      aberto
      titulo={reg ? 'Editar estante' : 'Nova estante'}
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = { titulo: valores.titulo, descricao: valores.descricao || null, ordem: Number(valores.ordem) || 0 }
        if (reg) await put(`/estantes/${reg.id}`, corpo)
        else await post('/estantes', corpo)
        fb.sucesso(reg ? 'Estante salva.' : 'Estante criada. Adicione os materiais e publique quando estiver pronta.')
        onConcluir()
      }}
    >
      <Campo rotulo="Nome da estante" obrigatorio dica="Ex.: Vendas, Finanças, Instagram.">
        {(p) => <input className="field-control" maxLength={120} {...p} value={valores.titulo} onChange={campo('titulo')} />}
      </Campo>
      <Campo rotulo="Descrição" dica="Opcional. Aparece para a aluna embaixo do nome.">
        {(p) => <textarea rows={2} maxLength={1000} className="field-control" {...p} value={valores.descricao} onChange={campo('descricao')} />}
      </Campo>
      <Campo rotulo="Ordem">
        {(p) => <input type="number" min={0} max={999} className="field-control max-w-32" {...p} value={valores.ordem} onChange={campo('ordem')} />}
      </Campo>
    </FormDialog>
  )
}

function DialogConteudo({ secao, reg, estanteId, estantes, onFechar, onConcluir }: { secao: string; reg: Reg | null; estanteId?: string | null; estantes: Reg[]; onFechar: () => void; onConcluir: () => void }) {
  const fb = useFeedback()
  const { valores, campo } = useValores({
    estante_id: reg?.estante_id ?? estanteId ?? '',
    categoria: reg?.categoria ?? (secao === 'biblioteca' && !(reg?.estante_id ?? estanteId) ? 'Ferramentas' : ''),
    titulo: reg?.titulo ?? '',
    descricao: reg?.descricao ?? '',
    link: reg?.link ?? '',
    video_url: reg?.video_url ?? '',
    compra_url: reg?.compra_url ?? '',
    ordem: String(reg?.ordem ?? 0),
  })
  const livro = secao === 'livros'
  return (
    <FormDialog
      aberto
      titulo={reg ? 'Editar conteúdo' : 'Novo conteúdo'}
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = {
          secao,
          estante_id: secao === 'biblioteca' ? valores.estante_id || null : null,
          categoria: valores.categoria || null,
          titulo: valores.titulo,
          descricao: valores.descricao || null,
          link: valores.link || null,
          video_url: livro ? null : valores.video_url || null,
          compra_url: livro ? valores.compra_url || null : null,
          ordem: Number(valores.ordem) || 0,
        }
        if (reg) await put(`/conteudos/${reg.id}`, corpo)
        else await post('/conteudos', corpo)
        fb.sucesso('Salvo. Publique quando estiver pronto.')
        onConcluir()
      }}
    >
      <Campo rotulo="Título" obrigatorio>
        {(p) => <input className="field-control" maxLength={200} {...p} value={valores.titulo} onChange={campo('titulo')} />}
      </Campo>
      {secao === 'biblioteca' && (
        <Campo rotulo="Estante" dica="Sem estante, o material aparece solto na Biblioteca, pela categoria.">
          {(p) => (
            <select className="field-control" {...p} value={valores.estante_id} onChange={campo('estante_id')}>
              <option value="">Sem estante</option>
              {estantes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.titulo}
                </option>
              ))}
            </select>
          )}
        </Campo>
      )}
      <Campo rotulo="Categoria" dica={secao === 'biblioteca' ? 'Ex.: Ferramentas, Leituras, Modelos.' : 'Opcional.'}>
        {(p) => <input className="field-control" maxLength={80} list="categorias-conteudo" {...p} value={valores.categoria} onChange={campo('categoria')} />}
      </Campo>
      <datalist id="categorias-conteudo">
        <option value="Ferramentas" />
      </datalist>
      <Campo rotulo="Descrição">
        {(p) => <textarea rows={3} maxLength={4000} className="field-control" {...p} value={valores.descricao} onChange={campo('descricao')} />}
      </Campo>
      {livro ? (
        <Campo rotulo="Link de compra" dica="Página da livraria ou da loja. Sem PDF.">
          {(p) => <input type="url" className="field-control" placeholder="https://…" {...p} value={valores.compra_url} onChange={campo('compra_url')} />}
        </Campo>
      ) : (
        <>
          <Campo rotulo="Vídeo (YouTube ou Vimeo)" dica={DICA_VIDEO}>
            {(p) => <input className="field-control" placeholder="https://youtu.be/… ou https://vimeo.com/…" {...p} value={valores.video_url} onChange={campo('video_url')} />}
          </Campo>
          <Campo rotulo="Link externo" dica="Opcional (ex.: pasta de materiais).">
            {(p) => <input type="url" className="field-control" placeholder="https://…" {...p} value={valores.link} onChange={campo('link')} />}
          </Campo>
        </>
      )}
      <Campo rotulo="Ordem">
        {(p) => <input type="number" min={0} max={999} className="field-control max-w-32" {...p} value={valores.ordem} onChange={campo('ordem')} />}
      </Campo>
    </FormDialog>
  )
}

/* ---------------- Aulas gravadas por mês do plano (linha do tempo do portal) ---------------- */

function AulasPlano() {
  const fb = useFeedback()
  const { dados, erro, recarregar } = useDados<{ aulas: Reg[] }>('/aulas')
  const [editando, setEditando] = useState<Reg | 'nova' | null>(null)
  if (erro) return <EstadoErro mensagem={erro} onTentar={recarregar} />
  if (!dados) return <Carregando />
  const porMes = new Map<number, Reg[]>()
  for (const a of dados.aulas) porMes.set(a.mes, [...(porMes.get(a.mes) ?? []), a])
  return (
    <Secao
      titulo="Aulas do plano"
      descricao="Cada aula entra no mês do plano em que a aluna deve assistir (mês 1 começa na data de início da matrícula). A barra de progresso da linha do tempo no Início avança conforme ela assiste. Mês sem aula publicada aparece como “Não contabiliza progresso”."
      acao={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando('nova')}>
          <Plus className="size-4" aria-hidden /> Nova aula
        </button>
      }
    >
      {!dados.aulas.length ? (
        <p className="text-sm text-ink-muted">Nenhuma aula cadastrada. O conteúdo oficial das aulas é da coordenação.</p>
      ) : (
        <div className="space-y-4">
          {[...porMes].map(([mes, aulas]) => (
            <div key={mes}>
              <h3 className="mb-1 text-sm font-semibold">Mês {mes}</h3>
              <ul className="divide-y divide-line text-sm">
                {aulas.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {a.titulo} {a.publicado ? <Selo tom="sucesso">Publicada</Selo> : <Selo>Rascunho</Selo>}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {a.programa_nome ?? 'Todos os programas'} · {a.assistiram} aluna(s) já assistiram
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditando(a)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={a.publicado ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
                        onClick={async () => {
                          try {
                            await post(`/aulas/${a.id}/publicar`, { publicado: !a.publicado })
                            recarregar()
                          } catch (e) {
                            fb.erro(mensagemDeErro(e))
                          }
                        }}
                      >
                        {a.publicado ? 'Retirar do portal' : 'Publicar'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {editando && <DialogAula reg={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} onConcluir={recarregar} />}
    </Secao>
  )
}

function DialogAula({ reg, onFechar, onConcluir }: { reg: Reg | null; onFechar: () => void; onConcluir: () => void }) {
  const cat = useCatalogos()
  const { valores, campo } = useValores({
    programa_id: reg?.programa_id ?? '',
    mes: String(reg?.mes ?? 1),
    titulo: reg?.titulo ?? '',
    descricao: reg?.descricao ?? '',
    video_url: reg?.video_url ?? '',
    ordem: String(reg?.ordem ?? 0),
  })
  return (
    <FormDialog
      aberto
      titulo={reg ? 'Editar aula' : 'Nova aula'}
      onFechar={onFechar}
      onEnviar={async () => {
        const corpo = { ...valores, programa_id: valores.programa_id || null, descricao: valores.descricao || null }
        if (reg) await put(`/aulas/${reg.id}`, corpo)
        else await post('/aulas', corpo)
        onConcluir()
      }}
    >
      <Campo rotulo="Título" obrigatorio>
        {(p) => <input className="field-control" maxLength={200} {...p} value={valores.titulo} onChange={campo('titulo')} />}
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Mês do plano" obrigatorio dica="1 = primeiro mês da matrícula.">
          {(p) => <input type="number" min={1} max={36} className="field-control" {...p} value={valores.mes} onChange={campo('mes')} />}
        </Campo>
        <Campo rotulo="Programa">
          {(p) => (
            <select className="field-control" {...p} value={valores.programa_id} onChange={campo('programa_id')}>
              <option value="">Todos os programas</option>
              {(cat?.programas ?? []).map((pg: Reg) => (
                <option key={pg.id} value={pg.id}>{pg.nome}</option>
              ))}
            </select>
          )}
        </Campo>
      </div>
      <Campo rotulo="Vídeo (YouTube ou Vimeo)" obrigatorio dica={DICA_VIDEO}>
        {(p) => <input className="field-control" placeholder="https://youtu.be/… ou https://vimeo.com/…" {...p} value={valores.video_url} onChange={campo('video_url')} />}
      </Campo>
      <Campo rotulo="Descrição">
        {(p) => <textarea rows={3} maxLength={4000} className="field-control" {...p} value={valores.descricao} onChange={campo('descricao')} />}
      </Campo>
      <Campo rotulo="Ordem no mês">
        {(p) => <input type="number" min={0} max={999} className="field-control max-w-32" {...p} value={valores.ordem} onChange={campo('ordem')} />}
      </Campo>
    </FormDialog>
  )
}
