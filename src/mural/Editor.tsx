import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Eye, ImagePlus, Package, Pencil, Sparkles, X } from 'lucide-react'
import { Dialog } from '../components/Dialog'
import { Campo } from '../components/Form'
import { AlertaErro } from '../components/Estados'
import { enviarArquivo, mensagemDeErro, post, put, type Reg } from '../lib/api'
import { cx } from '../lib/format'
import { CANAL_MURAL, FORMATO_SERVICO, urlImagem, type BaseMural } from './comum'
import { PaginaPublicacao } from './PaginaPublicacao'
import { ACEITAR_IMAGENS, prepararImagem } from './imagem'

const GALERIA_MAX = 8

const DICA_CONTATO: Record<string, string> = {
  whatsapp: 'Número com DDD, ex.: (11) 90000-0000',
  email: 'ex.: contato@meunegocio.com.br',
  instagram: 'ex.: @meunegocio',
  site: 'Endereço começando com https://',
  outro: 'Como as pessoas falam com você',
}

function valoresIniciais(p?: Reg | null) {
  const d: Reg = p?.detalhes ?? {}
  return {
    tipo: (p?.tipo as string) ?? 'produto',
    categoria_id: (p?.categoria_id as string) ?? '',
    negocio_nome: (p?.negocio_nome as string) ?? '',
    titulo: (p?.titulo as string) ?? '',
    descricao: (p?.descricao as string) ?? '',
    preco_modo: p?.preco_consultar ? 'consultar' : p?.preco_centavos !== null && p?.preco_centavos !== undefined ? 'valor' : 'sem',
    preco: p?.preco_centavos !== null && p?.preco_centavos !== undefined ? (Number(p.preco_centavos) / 100).toFixed(2).replace('.', ',') : '',
    contato_canal: (p?.contato_canal as string) ?? 'whatsapp',
    contato_valor: (p?.contato_valor as string) ?? '',
    link_externo: (p?.link_externo as string) ?? '',
    caracteristicas: ((d.caracteristicas as string[]) ?? []).join('\n'),
    como_comprar: (d.como_comprar as string) ?? '',
    atendimento: (d.atendimento as string) ?? '',
    beneficios: ((d.beneficios as string[]) ?? []).join('\n'),
    formato: (d.formato as string) ?? '',
    local: (d.local as string) ?? '',
    autora_nome: (p?.autora_nome as string) ?? 'Equipe Centro Liderar',
  }
}

const linhas = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean)

/**
 * Criar ou editar uma publicação, com prévia antes de enviar. As imagens são enviadas na hora em
 * que são escolhidas; a publicação só é gravada ao confirmar. Quem pode editar é conferido no servidor.
 */
export function EditorPublicacao({
  base,
  categorias,
  publicacao,
  autoraNome,
  moderada,
  equipe,
  onFechar,
  onSalvo,
}: {
  base: BaseMural
  categorias: Reg[]
  publicacao?: Reg | null
  autoraNome: string
  moderada: boolean
  equipe?: boolean
  onFechar: () => void
  onSalvo: (r: Reg) => void
}) {
  const [v, setV] = useState(() => valoresIniciais(publicacao))
  const [capa, setCapa] = useState<string | null>(publicacao?.capa_id ?? null)
  const [galeria, setGaleria] = useState<string[]>(publicacao?.galeria_ids ?? [])
  const [logo, setLogo] = useState<string | null>(publicacao?.logo_id ?? null)
  const [previa, setPrevia] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const topo = useRef<HTMLDivElement>(null)
  const formId = useId()
  const editando = !!publicacao?.id
  const campo = (k: keyof typeof v) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }))
  const produto = v.tipo === 'produto'
  // A categoria atual continua na lista mesmo que a equipe a tenha desativado depois.
  const opcoes = categorias.filter((c) => c.ativa !== 0 && c.ativa !== false)
  if (publicacao?.categoria_id && !opcoes.some((c) => c.id === publicacao.categoria_id)) opcoes.push({ id: publicacao.categoria_id, nome: publicacao.categoria_nome ?? 'Categoria atual' })

  async function enviarImagens(e: ChangeEvent<HTMLInputElement>, destino: 'capa' | 'galeria' | 'logo') {
    const arquivos = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!arquivos.length) return
    setErro(null)
    const vagas = destino === 'galeria' ? GALERIA_MAX - galeria.length : 1
    if (destino === 'galeria' && arquivos.length > vagas) setErro(`A galeria aceita até ${GALERIA_MAX} imagens. As excedentes foram ignoradas.`)
    for (const original of arquivos.slice(0, Math.max(0, vagas))) {
      setEnviando(destino)
      try {
        const f = await prepararImagem(original)
        const r = await enviarArquivo(`${base}/imagens`, f)
        if (destino === 'capa') setCapa(r.id)
        else if (destino === 'logo') setLogo(r.id)
        else setGaleria((g) => [...g, r.id].slice(0, GALERIA_MAX))
      } catch (err) {
        setErro(mensagemDeErro(err))
      } finally {
        setEnviando(null)
      }
    }
  }

  function dados() {
    return {
      tipo: v.tipo,
      categoria_id: v.categoria_id,
      negocio_nome: v.negocio_nome,
      titulo: v.titulo,
      descricao: v.descricao,
      preco_modo: v.preco_modo,
      preco: v.preco_modo === 'valor' ? v.preco : undefined,
      contato_canal: v.contato_canal,
      contato_valor: v.contato_valor,
      link_externo: v.link_externo,
      caracteristicas: produto ? linhas(v.caracteristicas) : [],
      como_comprar: produto ? v.como_comprar : '',
      atendimento: produto ? '' : v.atendimento,
      beneficios: produto ? [] : linhas(v.beneficios),
      formato: produto ? '' : v.formato,
      local: produto ? '' : v.local,
      capa_id: capa,
      galeria_ids: galeria,
      logo_id: logo,
      ...(equipe ? { autora_nome: v.autora_nome } : {}),
    }
  }

  function comoPrevia(): Reg {
    const d = dados()
    const preco = Number(String(v.preco).replace(/\./g, '').replace(',', '.'))
    return {
      ...d,
      categoria_nome: opcoes.find((c) => c.id === v.categoria_id)?.nome ?? '',
      preco_centavos: v.preco_modo === 'valor' && Number.isFinite(preco) ? Math.round(preco * 100) : null,
      preco_consultar: v.preco_modo === 'consultar',
      detalhes: produto ? { caracteristicas: d.caracteristicas, como_comprar: d.como_comprar } : { atendimento: d.atendimento, beneficios: d.beneficios, formato: d.formato || null, local: d.local },
      autora_nome: equipe ? v.autora_nome : autoraNome,
      criado_em: publicacao?.criado_em ?? new Date().toISOString(),
    }
  }

  async function salvar() {
    if (salvando || enviando) return
    setSalvando(true)
    setErro(null)
    try {
      const r = editando ? await put(`${base}/${publicacao!.id}`, dados()) : await post(base, dados())
      onSalvo({ id: publicacao?.id, ...r })
    } catch (err) {
      setErro(mensagemDeErro(err))
      setPrevia(false)
      topo.current?.scrollIntoView({ block: 'start' })
    } finally {
      setSalvando(false)
    }
  }

  const rotuloSalvar = equipe ? (editando ? 'Salvar' : 'Publicar') : moderada ? 'Enviar para aprovação' : editando ? 'Salvar alterações' : 'Publicar'

  const miniatura = (id: string, rotulo: string, remover: () => void, redonda?: boolean) => (
    <div key={id} className={cx('relative shrink-0 overflow-hidden border border-line bg-surface-muted', redonda ? 'size-20 rounded-full' : 'size-24 rounded-lg')}>
      <img src={urlImagem(base, id)} alt={rotulo} className="size-full object-cover" />
      <button type="button" onClick={remover} className="absolute top-1 right-1 rounded-full bg-white/95 p-1 text-ink shadow" aria-label={`Remover ${rotulo.toLowerCase()}`}>
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  )

  const botaoImagem = (destino: 'capa' | 'galeria' | 'logo', rotulo: string, multiplo?: boolean) => (
    <label className={cx('flex size-24 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line-strong text-center text-xs text-ink-muted hover:border-brand-500 hover:text-brand-700 focus-within:outline-2 focus-within:outline-focus', enviando === destino && 'opacity-60')}>
      <ImagePlus className="size-5" aria-hidden />
      {enviando === destino ? 'Enviando…' : rotulo}
      <input type="file" accept={ACEITAR_IMAGENS} multiple={multiplo} className="sr-only" disabled={!!enviando} onChange={(e) => enviarImagens(e, destino)} />
    </label>
  )

  return (
    <Dialog
      aberto
      titulo={editando ? 'Editar publicação' : 'Nova publicação no mural'}
      descricao={previa ? 'Prévia: é assim que a publicação vai aparecer.' : 'Só o contato que você escolher aqui aparece para as outras alunas.'}
      onFechar={onFechar}
      bloqueado={salvando}
      largura="sm:max-w-3xl"
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPrevia((x) => !x)} disabled={salvando}>
            {previa ? <Pencil className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />} {previa ? 'Voltar a editar' : 'Ver prévia'}
          </button>
          <button type="button" className="btn-primary min-w-24" onClick={salvar} disabled={salvando || !!enviando} aria-busy={salvando}>
            {salvando ? 'Salvando…' : rotuloSalvar}
          </button>
        </>
      }
    >
      <div ref={topo} />
      {erro && (
        <div className="mb-4">
          <AlertaErro mensagem={erro} />
        </div>
      )}
      {previa ? (
        <PaginaPublicacao p={comoPrevia()} base={base} />
      ) : (
        <form
          id={formId}
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setPrevia(true)
          }}
        >
          {!equipe && moderada && <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm text-ink-soft">{editando ? 'Ao salvar, a publicação passa de novo pela equipe antes de aparecer com as mudanças.' : 'A equipe aprova a publicação antes de ela aparecer no mural.'}</p>}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-soft">O que você quer divulgar?</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['produto', 'servico'] as const).map((t) => (
                <label key={t} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3', v.tipo === t ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-line-strong')}>
                  <input type="radio" name="tipo" value={t} checked={v.tipo === t} onChange={campo('tipo')} className="sr-only" />
                  {t === 'produto' ? <Package className="size-5 text-brand-700" aria-hidden /> : <Sparkles className="size-5 text-gold" aria-hidden />}
                  <span>
                    <span className="block font-medium text-ink">{t === 'produto' ? 'Produto' : 'Serviço'}</span>
                    <span className="block text-xs text-ink-muted">{t === 'produto' ? 'Fotos, características e preço' : 'Atendimento, benefícios e formato'}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome do negócio" obrigatorio>
              {(p) => <input {...p} className="field-control" maxLength={120} value={v.negocio_nome} onChange={campo('negocio_nome')} />}
            </Campo>
            <Campo rotulo="Categoria" obrigatorio>
              {(p) => (
                <select {...p} className="field-control" value={v.categoria_id} onChange={campo('categoria_id')}>
                  <option value="">Escolha…</option>
                  {opcoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </div>
          <Campo rotulo="Título da publicação" obrigatorio>
            {(p) => <input {...p} className="field-control" maxLength={120} value={v.titulo} onChange={campo('titulo')} />}
          </Campo>
          <Campo rotulo="Descrição" obrigatorio dica="Conte o que é, para quem é e o que torna o seu negócio especial.">
            {(p) => <textarea {...p} className="field-control min-h-28" maxLength={4000} value={v.descricao} onChange={campo('descricao')} />}
          </Campo>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-soft">Imagens</legend>
            <p className="text-xs text-ink-muted">JPG, PNG ou WEBP. Fotos grandes do celular são reduzidas automaticamente.</p>
            <div className="flex flex-wrap items-start gap-4">
              <div>
                <p className="mb-1 text-xs font-medium text-ink-muted">Capa</p>
                {capa ? miniatura(capa, 'Capa', () => setCapa(null)) : botaoImagem('capa', 'Escolher capa')}
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-ink-muted">Logo (opcional)</p>
                {logo ? miniatura(logo, 'Logo', () => setLogo(null), true) : botaoImagem('logo', 'Escolher logo')}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-ink-muted">{produto ? 'Mais fotos do produto' : 'Mais imagens'} ({galeria.length}/{GALERIA_MAX})</p>
              <div className="flex flex-wrap gap-2">
                {galeria.map((id, i) => miniatura(id, `Imagem ${i + 1}`, () => setGaleria((g) => g.filter((x) => x !== id))))}
                {galeria.length < GALERIA_MAX && botaoImagem('galeria', 'Adicionar', true)}
              </div>
            </div>
          </fieldset>

          {produto ? (
            <div className="space-y-3 rounded-lg border border-line p-3">
              <p className="text-sm font-medium text-brand-700">Sobre o produto</p>
              <Campo rotulo="Características" dica="Uma por linha (ex.: tamanho, material, sabores).">
                {(p) => <textarea {...p} className="field-control min-h-20" value={v.caracteristicas} onChange={campo('caracteristicas')} />}
              </Campo>
              <Campo rotulo="Como comprar" dica="Ex.: pedido pelo WhatsApp, retirada ou entrega, formas de pagamento.">
                {(p) => <textarea {...p} className="field-control min-h-16" maxLength={1000} value={v.como_comprar} onChange={campo('como_comprar')} />}
              </Campo>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-line p-3">
              <p className="text-sm font-medium text-brand-700">Sobre o serviço</p>
              <Campo rotulo="Como é o atendimento" dica="Ex.: duração, etapas, o que está incluído.">
                {(p) => <textarea {...p} className="field-control min-h-20" maxLength={2000} value={v.atendimento} onChange={campo('atendimento')} />}
              </Campo>
              <Campo rotulo="Benefícios" dica="Um por linha.">
                {(p) => <textarea {...p} className="field-control min-h-16" value={v.beneficios} onChange={campo('beneficios')} />}
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Formato">
                  {(p) => (
                    <select {...p} className="field-control" value={v.formato} onChange={campo('formato')}>
                      <option value="">Não informar</option>
                      {Object.entries(FORMATO_SERVICO).map(([k, r]) => (
                        <option key={k} value={k}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </Campo>
                <Campo rotulo="Local" dica="Cidade, bairro ou endereço, se for presencial.">
                  {(p) => <input {...p} className="field-control" maxLength={200} value={v.local} onChange={campo('local')} />}
                </Campo>
              </div>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-soft">{produto ? 'Preço' : 'Investimento'}</legend>
            <div className="flex flex-wrap gap-3 text-sm">
              {[
                ['sem', 'Não mostrar'],
                ['valor', 'Informar valor'],
                ['consultar', 'Consultar valor'],
              ].map(([k, r]) => (
                <label key={k} className="inline-flex items-center gap-1.5">
                  <input type="radio" name="preco_modo" value={k} checked={v.preco_modo === k} onChange={campo('preco_modo')} /> {r}
                </label>
              ))}
            </div>
            {v.preco_modo === 'valor' && (
              <Campo rotulo="Valor (R$)" obrigatorio className="max-w-48">
                {(p) => <input {...p} className="field-control" inputMode="decimal" placeholder="0,00" value={v.preco} onChange={campo('preco')} />}
              </Campo>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
            <Campo rotulo="Contato por" obrigatorio>
              {(p) => (
                <select {...p} className="field-control" value={v.contato_canal} onChange={campo('contato_canal')}>
                  {Object.entries(CANAL_MURAL).map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo rotulo="Contato desta publicação" obrigatorio dica={DICA_CONTATO[v.contato_canal]}>
              {(p) => <input {...p} className="field-control" maxLength={200} value={v.contato_valor} onChange={campo('contato_valor')} />}
            </Campo>
          </div>
          <Campo rotulo={produto ? 'Link de compra (opcional)' : 'Link externo (opcional)'} dica="Sua loja, agenda on-line ou site. Começa com https://">
            {(p) => <input {...p} type="url" className="field-control" maxLength={1000} placeholder="https://…" value={v.link_externo} onChange={campo('link_externo')} />}
          </Campo>
          {equipe && (
            <Campo rotulo="Autoria">
              {(p) => <input {...p} className="field-control" maxLength={120} value={v.autora_nome} onChange={campo('autora_nome')} />}
            </Campo>
          )}
        </form>
      )}
    </Dialog>
  )
}
