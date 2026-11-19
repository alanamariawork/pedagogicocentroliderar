/**
 * Mural de oportunidades em formato de feed: regras comuns ao portal da aluna e à gestão da equipe.
 *
 * - Publicação: produto ou serviço, categoria configurável, nome do negócio, preço opcional ou
 *   "Consultar valor", um canal de contato escolhido para aquela publicação, link externo opcional
 *   e detalhes do modelo (produto: características e como comprar; serviço: atendimento,
 *   benefícios, formato e local).
 * - Imagens (capa, galeria e logo) vão para o R2. São enviadas antes de salvar (ficam "soltas",
 *   ligadas só a quem enviou) e só podem ser usadas pela mesma pessoa.
 * - Curtidas: uma por pessoa por publicação (chave primária). Contagens sempre calculadas no banco.
 * - Comentários: um nível de resposta; a autora edita ou exclui os próprios; a equipe remove ou
 *   restaura, com registro na auditoria.
 */
import { z } from 'zod'
import { agoraIso, novoId, transacao, type BD, type BDouTX, type TX } from './db'
import { ErroHttp, type Req as Request, type Res as Response } from './http'
import type { Arquivos } from './contexto'
import { texto, textoObrig } from './servicos'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export const CANAIS_CONTATO = ['whatsapp', 'email', 'instagram', 'site', 'outro'] as const
export const TIPOS_OFERTA = ['produto', 'servico'] as const
export const FORMATOS_SERVICO = ['online', 'presencial', 'hibrido'] as const
export const IMAGEM_MAX_BYTES = 5 * 1024 * 1024
export const GALERIA_MAX = 8
export const FEED_POR_PAGINA = 24

/** Quem é dona de uma imagem ou autora de uma publicação: uma aluna (pessoa) ou alguém da equipe. */
export type Dona = { pessoa_id: string; equipe_id?: undefined } | { equipe_id: string; pessoa_id?: undefined }

/* ---------------- Validação ---------------- */

const linhaCurta = z.string().trim().min(1).max(200)

const linkHttps = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z
    .string()
    .trim()
    .max(1000)
    .refine((v) => {
      try {
        return new URL(v).protocol === 'https:'
      } catch {
        return false
      }
    }, 'O link precisa começar com https://')
    .nullable()
    .optional(),
)

export const schemaPublicacao = z
  .object({
    tipo: z.enum(TIPOS_OFERTA, { error: 'Escolha se é produto ou serviço.' }),
    categoria_id: z.string({ error: 'Escolha a categoria.' }).min(1, 'Escolha a categoria.').max(64),
    negocio_nome: textoObrig('o nome do negócio', 120),
    titulo: textoObrig('o título', 120),
    descricao: textoObrig('a descrição', 4000),
    preco_modo: z.enum(['sem', 'valor', 'consultar']).default('sem'),
    preco: z.preprocess((v) => (v === '' || v === null ? undefined : typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : v), z.number({ error: 'Preço inválido.' }).min(0, 'Preço inválido.').max(1_000_000, 'Preço inválido.').optional()),
    contato_canal: z.enum(CANAIS_CONTATO, { error: 'Escolha como as pessoas falam com você.' }),
    contato_valor: textoObrig('o contato', 200),
    link_externo: linkHttps,
    caracteristicas: z.array(linhaCurta).max(12, 'No máximo 12 características.').default([]),
    como_comprar: texto(1000),
    atendimento: texto(2000),
    beneficios: z.array(linhaCurta).max(12, 'No máximo 12 benefícios.').default([]),
    formato: z.preprocess((v) => (v === '' ? null : v), z.enum(FORMATOS_SERVICO).nullable().optional()),
    local: texto(200),
    capa_id: z.string().max(64).nullable().optional(),
    galeria_ids: z.array(z.string().max(64)).max(GALERIA_MAX, `No máximo ${GALERIA_MAX} imagens na galeria.`).default([]),
    logo_id: z.string().max(64).nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.preco_modo === 'valor' && d.preco === undefined) ctx.addIssue({ code: 'custom', path: ['preco'], message: 'Informe o preço ou escolha "Consultar valor".' })
    const erro = erroContato(d.contato_canal, d.contato_valor)
    if (erro) ctx.addIssue({ code: 'custom', path: ['contato_valor'], message: erro })
  })

export type DadosPublicacao = z.infer<typeof schemaPublicacao>

/** Confere o contato para o botão do mural nunca virar um link quebrado ou perigoso. */
export function erroContato(canal: string, valor: string): string | null {
  const v = valor.trim()
  if (canal === 'whatsapp' && v.replace(/\D/g, '').length < 10) return 'Informe o WhatsApp com DDD.'
  if (canal === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return 'E-mail inválido.'
  if (canal === 'instagram' && !/^@?[A-Za-z0-9._]{1,30}$/.test(v.replace(/^https:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, ''))) return 'Informe o perfil do Instagram (ex.: @meunegocio).'
  if (canal === 'site') {
    try {
      if (new URL(v).protocol !== 'https:') return 'O site precisa começar com https://'
    } catch {
      return 'O site precisa começar com https://'
    }
  }
  return null
}

/** Só os detalhes do modelo escolhido são guardados. */
function detalhesDoTipo(d: DadosPublicacao) {
  return d.tipo === 'produto'
    ? { caracteristicas: d.caracteristicas, como_comprar: d.como_comprar ?? null }
    : { atendimento: d.atendimento ?? null, beneficios: d.beneficios, formato: d.formato ?? null, local: d.local ?? null }
}

/* ---------------- Categorias ---------------- */

export async function categorias(db: BD, apenasAtivas: boolean) {
  return db.all(`SELECT id, nome, ordem, ativa FROM ped_mural_categorias ${apenasAtivas ? 'WHERE ativa = 1' : ''} ORDER BY ordem, nome`)
}

async function conferirCategoria(db: BDouTX, id: string, atual?: string | null) {
  const c = (await db.get('SELECT id, ativa FROM ped_mural_categorias WHERE id = ?', id)) as Linha | undefined
  // Uma categoria desativada depois continua valendo para quem já a usava.
  if (!c || (!c.ativa && c.id !== atual)) throw new ErroHttp(400, 'Categoria não encontrada. Escolha outra.')
}

/* ---------------- Imagens ---------------- */

const IMAGENS: Record<string, { tipo: string; assinatura: (b: Uint8Array) => boolean }> = {
  jpg: { tipo: 'image/jpeg', assinatura: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { tipo: 'image/jpeg', assinatura: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { tipo: 'image/png', assinatura: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  webp: { tipo: 'image/webp', assinatura: (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' },
}

function condicaoDona(dona: Dona) {
  return dona.pessoa_id ? { sql: 'dona_pessoa_id = ?', valor: dona.pessoa_id } : { sql: 'dona_equipe_id = ?', valor: dona.equipe_id! }
}

/**
 * Guarda uma imagem ainda solta (sem publicação). O tipo é conferido pela extensão e pelo conteúdo
 * do arquivo. Imagens soltas há mais de 1 dia são apagadas.
 */
export async function guardarImagem(db: BD, arquivos: Arquivos, req: Request, dona: Dona) {
  let nome = ''
  try {
    nome = decodeURIComponent(req.get('X-Nome-Arquivo') ?? '')
  } catch {
    nome = ''
  }
  // eslint-disable-next-line no-control-regex
  nome = nome.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 150) || 'imagem'
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : ''
  const corpo = req.body
  if (!(corpo instanceof ArrayBuffer) || corpo.byteLength === 0) throw new ErroHttp(400, 'O arquivo está vazio.')
  if (corpo.byteLength > IMAGEM_MAX_BYTES) throw new ErroHttp(413, 'A imagem passa de 5 MB. Envie uma imagem menor.')
  const tipo = IMAGENS[ext]
  if (!tipo || !tipo.assinatura(new Uint8Array(corpo.slice(0, 12)))) throw new ErroHttp(400, 'Envie uma imagem JPG, PNG ou WEBP.')

  const limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const velhas = await db.all<{ chave: string }>('SELECT chave FROM ped_mural_imagens WHERE mural_id IS NULL AND criado_em < ?', limite)
  if (velhas.length) {
    await arquivos.apagar(velhas.map((v) => v.chave))
    await db.run('DELETE FROM ped_mural_imagens WHERE mural_id IS NULL AND criado_em < ?', limite)
  }
  const cond = condicaoDona(dona)
  const soltas = (await db.get(`SELECT COUNT(*) AS n FROM ped_mural_imagens WHERE mural_id IS NULL AND ${cond.sql}`, cond.valor)) as { n: number }
  if (soltas.n >= 30) throw new ErroHttp(429, 'Muitas imagens enviadas sem salvar a publicação. Salve ou tente mais tarde.')

  const id = novoId()
  const chave = `mural/${id}`
  await arquivos.guardar(chave, corpo, tipo.tipo)
  await db.run('INSERT INTO ped_mural_imagens (id, mural_id, papel, ordem, chave, nome, tipo, tamanho, dona_pessoa_id, dona_equipe_id, criado_em) VALUES (?,NULL,NULL,0,?,?,?,?,?,?,?)', id, chave, nome, tipo.tipo, corpo.byteLength, dona.pessoa_id ?? null, dona.equipe_id ?? null, agoraIso())
  return { id, nome, tamanho: corpo.byteLength }
}

/** Entrega a imagem para exibir na página (nunca como documento executável). */
export async function entregarImagem(arquivos: Arquivos, res: Response, img: Linha) {
  const conteudo = await arquivos.ler(img.chave)
  if (!conteudo) throw new ErroHttp(404, 'Imagem não encontrada.')
  res.set('Content-Type', img.tipo)
  res.set('Content-Disposition', 'inline')
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Content-Security-Policy', "default-src 'none'; sandbox")
  res.set('Cache-Control', 'private, max-age=600')
  res.send(conteudo)
}

/**
 * Liga as imagens escolhidas à publicação. Só aceita imagens da mesma dona, soltas ou já desta
 * publicação. As que saíram ficam marcadas como 'removida' (o arquivo é preservado).
 */
async function aplicarImagens(tx: TX, muralId: string, dona: Dona, d: DadosPublicacao) {
  const escolhidas: { id: string; papel: 'capa' | 'galeria' | 'logo'; ordem: number }[] = []
  if (d.capa_id) escolhidas.push({ id: d.capa_id, papel: 'capa', ordem: 0 })
  d.galeria_ids.forEach((id, i) => escolhidas.push({ id, papel: 'galeria', ordem: i + 1 }))
  if (d.logo_id) escolhidas.push({ id: d.logo_id, papel: 'logo', ordem: 0 })
  const vistos = new Set<string>()
  const cond = condicaoDona(dona)
  for (const e of escolhidas) {
    if (vistos.has(e.id)) throw new ErroHttp(400, 'A mesma imagem foi escolhida duas vezes.')
    vistos.add(e.id)
    const ok = await tx.get(`SELECT 1 FROM ped_mural_imagens WHERE id = ? AND (mural_id IS NULL AND ${cond.sql} OR mural_id = ?)`, e.id, cond.valor, muralId)
    if (!ok) throw new ErroHttp(400, 'Uma das imagens não foi encontrada. Envie-a novamente.')
  }
  tx.run("UPDATE ped_mural_imagens SET papel = 'removida' WHERE mural_id = ? AND papel <> 'removida'", muralId)
  for (const e of escolhidas) tx.run('UPDATE ped_mural_imagens SET mural_id = ?, papel = ?, ordem = ? WHERE id = ?', muralId, e.papel, e.ordem, e.id)
}

/* ---------------- Gravação ---------------- */

function colunas(d: DadosPublicacao) {
  return {
    tipo: d.tipo,
    // A coluna antiga continua preenchida (e com o mesmo significado) para quem ainda a lê.
    categoria: d.tipo,
    categoria_id: d.categoria_id,
    negocio_nome: d.negocio_nome,
    titulo: d.titulo,
    descricao: d.descricao,
    preco_centavos: d.preco_modo === 'valor' && d.preco !== undefined ? Math.round(d.preco * 100) : null,
    preco_consultar: d.preco_modo === 'consultar' ? 1 : 0,
    contato_canal: d.contato_canal,
    contato_valor: d.contato_valor,
    link_externo: d.link_externo ?? null,
    detalhes: JSON.stringify(detalhesDoTipo(d)),
  }
}

export async function criarPublicacao(db: BD, dona: Dona, autoraNome: string, d: DadosPublicacao, situacao: string, moderador?: string) {
  await conferirCategoria(db, d.categoria_id)
  const id = novoId()
  const c = colunas(d)
  const agora = agoraIso()
  await transacao(db, async (tx) => {
    tx.run(
      `INSERT INTO ped_mural (id, autora_pessoa_id, autora_equipe_id, autora_nome, categoria, tipo, categoria_id, negocio_nome, titulo, descricao, preco_centavos, preco_consultar, contato_canal, contato_valor, link_externo, detalhes, situacao, moderada_por, moderada_em, criado_em, atualizado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, dona.pessoa_id ?? null, dona.equipe_id ?? null, autoraNome, c.categoria, c.tipo, c.categoria_id, c.negocio_nome, c.titulo, c.descricao, c.preco_centavos, c.preco_consultar, c.contato_canal, c.contato_valor, c.link_externo, c.detalhes, situacao, moderador ?? null, moderador ? agora : null, agora, agora,
    )
    await aplicarImagens(tx, id, dona, d)
  })
  return id
}

export async function editarPublicacao(db: BD, atual: Linha, dona: Dona, d: DadosPublicacao, situacao: string) {
  await conferirCategoria(db, d.categoria_id, atual.categoria_id)
  const c = colunas(d)
  const agora = agoraIso()
  await transacao(db, async (tx) => {
    tx.run(
      `UPDATE ped_mural SET categoria = ?, tipo = ?, categoria_id = ?, negocio_nome = ?, titulo = ?, descricao = ?, preco_centavos = ?, preco_consultar = ?, contato_canal = ?, contato_valor = ?, link_externo = ?, detalhes = ?, situacao = ?,
         motivo_moderacao = CASE WHEN ? = 'pendente' THEN NULL ELSE motivo_moderacao END, editada_em = ?, atualizado_em = ? WHERE id = ?`,
      c.categoria, c.tipo, c.categoria_id, c.negocio_nome, c.titulo, c.descricao, c.preco_centavos, c.preco_consultar, c.contato_canal, c.contato_valor, c.link_externo, c.detalhes, situacao, situacao, agora, agora, atual.id,
    )
    await aplicarImagens(tx, atual.id, dona, d)
  })
}

/* ---------------- Leitura ---------------- */

const CAMPOS_CARD = `mu.id, mu.tipo, mu.categoria, mu.categoria_id, ca.nome AS categoria_nome, mu.negocio_nome, mu.titulo, substr(mu.descricao, 1, 240) AS resumo,
  mu.autora_nome, mu.autora_equipe_id IS NOT NULL AS da_equipe, mu.preco_centavos, mu.preco_consultar, mu.situacao, mu.criado_em, mu.editada_em,
  (SELECT i.id FROM ped_mural_imagens i WHERE i.mural_id = mu.id AND i.papel IN ('capa','galeria') ORDER BY CASE i.papel WHEN 'capa' THEN 0 ELSE 1 END, i.ordem LIMIT 1) AS capa_id,
  (SELECT i.id FROM ped_mural_imagens i WHERE i.mural_id = mu.id AND i.papel = 'logo' LIMIT 1) AS logo_id,
  (SELECT COUNT(*) FROM ped_mural_curtidas cu WHERE cu.mural_id = mu.id) AS curtidas,
  (SELECT COUNT(*) FROM ped_mural_comentarios co WHERE co.mural_id = mu.id AND co.situacao = 'ativo') AS comentarios`

export interface FiltrosFeed {
  q?: string
  categoria?: string
  tipo?: string
  offset?: number
}

export function lerFiltros(query: Record<string, string | undefined>): FiltrosFeed {
  const offset = Math.max(0, Math.min(10_000, Number(query.offset ?? 0) || 0))
  return { q: (query.q ?? '').trim().slice(0, 100) || undefined, categoria: query.categoria || undefined, tipo: TIPOS_OFERTA.includes(query.tipo as 'produto') ? query.tipo : undefined, offset }
}

function filtrosSql(f: FiltrosFeed) {
  const where: string[] = []
  const params: unknown[] = []
  if (f.q) {
    const termo = `%${f.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    where.push("(lower(mu.titulo) LIKE ? ESCAPE '\\' OR lower(COALESCE(mu.negocio_nome, '')) LIKE ? ESCAPE '\\')")
    params.push(termo, termo)
  }
  if (f.categoria) {
    where.push('mu.categoria_id = ?')
    params.push(f.categoria)
  }
  if (f.tipo) {
    where.push('mu.tipo = ?')
    params.push(f.tipo)
  }
  return { where, params }
}

/** Feed das publicações publicadas, com as curtidas da pessoa (quando informada). */
export async function feed(db: BD, f: FiltrosFeed, pessoaId?: string) {
  const { where, params } = filtrosSql(f)
  const linhas = (await db.all(
    `SELECT ${CAMPOS_CARD}, ${pessoaId ? 'EXISTS (SELECT 1 FROM ped_mural_curtidas c2 WHERE c2.mural_id = mu.id AND c2.pessoa_id = ?)' : '0'} AS curti
     FROM ped_mural mu LEFT JOIN ped_mural_categorias ca ON ca.id = mu.categoria_id
     WHERE mu.situacao = 'publicada' ${where.map((w) => `AND ${w}`).join(' ')}
     ORDER BY mu.criado_em DESC LIMIT ? OFFSET ?`,
    ...(pessoaId ? [pessoaId] : []), ...params, FEED_POR_PAGINA + 1, f.offset ?? 0,
  )) as Linha[]
  return { itens: linhas.slice(0, FEED_POR_PAGINA).map(card), tem_mais: linhas.length > FEED_POR_PAGINA }
}

export async function publicacoesDa(db: BD, dona: Dona) {
  const cond = dona.pessoa_id ? 'mu.autora_pessoa_id = ?' : 'mu.autora_equipe_id = ?'
  return ((await db.all(`SELECT ${CAMPOS_CARD}, mu.motivo_moderacao FROM ped_mural mu LEFT JOIN ped_mural_categorias ca ON ca.id = mu.categoria_id WHERE ${cond} ORDER BY mu.criado_em DESC LIMIT 100`, dona.pessoa_id ?? dona.equipe_id)) as Linha[]).map(card)
}

/** Lista da equipe: todas as situações, com filtros. */
export async function listaEquipe(db: BD, f: FiltrosFeed & { situacao?: string }) {
  const { where, params } = filtrosSql(f)
  if (f.situacao && ['pendente', 'publicada', 'recusada', 'arquivada'].includes(f.situacao)) {
    where.push('mu.situacao = ?')
    params.push(f.situacao)
  }
  return ((await db.all(
    `SELECT ${CAMPOS_CARD}, mu.motivo_moderacao, mu.moderada_em, u.nome AS moderada_por_nome, mu.contato_canal, mu.contato_valor,
       (SELECT COUNT(*) FROM ped_mural_comentarios co WHERE co.mural_id = mu.id AND co.situacao = 'removido') AS comentarios_removidos
     FROM ped_mural mu LEFT JOIN ped_mural_categorias ca ON ca.id = mu.categoria_id LEFT JOIN ped_usuarios u ON u.id = mu.moderada_por
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE mu.situacao WHEN 'pendente' THEN 0 WHEN 'publicada' THEN 1 ELSE 2 END, mu.criado_em DESC LIMIT 300`,
    ...params,
  )) as Linha[]).map(card)
}

function card(l: Linha) {
  return { ...l, da_equipe: !!l.da_equipe, curti: !!l.curti, preco_consultar: !!l.preco_consultar }
}

/** Publicação completa (sem dados da autora além do nome e do contato escolhido para ela). */
export async function publicacaoCompleta(db: BD, id: string): Promise<Linha | undefined> {
  const p = (await db.get(
    `SELECT mu.id, mu.autora_pessoa_id, mu.autora_equipe_id, mu.autora_nome, mu.categoria, mu.tipo, mu.categoria_id, ca.nome AS categoria_nome, mu.negocio_nome, mu.titulo, mu.descricao,
       mu.preco_centavos, mu.preco_consultar, mu.contato_canal, mu.contato_valor, mu.link_externo, mu.detalhes, mu.situacao, mu.motivo_moderacao, mu.criado_em, mu.editada_em,
       (SELECT COUNT(*) FROM ped_mural_curtidas cu WHERE cu.mural_id = mu.id) AS curtidas
     FROM ped_mural mu LEFT JOIN ped_mural_categorias ca ON ca.id = mu.categoria_id WHERE mu.id = ?`,
    id,
  )) as Linha | undefined
  if (!p) return undefined
  const imagens = (await db.all("SELECT id, papel, ordem FROM ped_mural_imagens WHERE mural_id = ? AND papel IN ('capa','galeria','logo') ORDER BY CASE papel WHEN 'capa' THEN 0 WHEN 'galeria' THEN 1 ELSE 2 END, ordem", id)) as Linha[]
  let detalhes: Linha = {}
  try {
    detalhes = p.detalhes ? JSON.parse(p.detalhes) : {}
  } catch {
    detalhes = {}
  }
  return {
    ...p,
    detalhes,
    preco_consultar: !!p.preco_consultar,
    da_equipe: !!p.autora_equipe_id,
    capa_id: imagens.find((i) => i.papel === 'capa')?.id ?? null,
    galeria_ids: imagens.filter((i) => i.papel === 'galeria').map((i) => i.id),
    logo_id: imagens.find((i) => i.papel === 'logo')?.id ?? null,
  }
}

/**
 * Comentários da publicação, em ordem. Para a aluna, o texto de um comentário excluído ou removido
 * não sai do servidor (só o aviso, para a conversa das respostas continuar fazendo sentido).
 */
export async function comentarios(db: BD, muralId: string, opcoes: { pessoaId?: string; equipe?: boolean }) {
  const linhas = (await db.all(
    `SELECT co.id, co.pai_id, co.autora_pessoa_id, co.autora_nome, co.texto, co.situacao, co.editado_em, co.criado_em, co.motivo_moderacao, co.moderado_em, u.nome AS moderado_por_nome
     FROM ped_mural_comentarios co LEFT JOIN ped_usuarios u ON u.id = co.moderado_por WHERE co.mural_id = ? ORDER BY co.criado_em, co.id`,
    muralId,
  )) as Linha[]
  const comRespostaAtiva = new Set(linhas.filter((l) => l.pai_id && l.situacao === 'ativo').map((l) => l.pai_id))
  return linhas
    .filter((l) => opcoes.equipe || l.situacao === 'ativo' || (!l.pai_id && comRespostaAtiva.has(l.id)))
    .map((l) => ({
      id: l.id,
      pai_id: l.pai_id,
      autora_nome: l.autora_nome,
      texto: opcoes.equipe || l.situacao === 'ativo' ? l.texto : null,
      situacao: l.situacao,
      editado_em: l.editado_em,
      criado_em: l.criado_em,
      minha: !!opcoes.pessoaId && l.autora_pessoa_id === opcoes.pessoaId,
      ...(opcoes.equipe ? { motivo_moderacao: l.motivo_moderacao, moderado_em: l.moderado_em, moderado_por_nome: l.moderado_por_nome } : {}),
    }))
}

export const schemaComentario = z.object({
  texto: textoObrig('o comentário', 1000),
  pai_id: z.string().max(64).nullable().optional(),
})

/** Grava um comentário ou resposta (a resposta a uma resposta vai para o comentário principal). */
export async function comentar(db: BD, muralId: string, pessoaId: string, nome: string, d: z.infer<typeof schemaComentario>) {
  const recentes = (await db.get('SELECT COUNT(*) AS n FROM ped_mural_comentarios WHERE autora_pessoa_id = ? AND criado_em > ?', pessoaId, new Date(Date.now() - 10 * 60 * 1000).toISOString())) as { n: number }
  if (recentes.n >= 20) throw new ErroHttp(429, 'Muitos comentários em pouco tempo. Espere alguns minutos.')
  let pai: string | null = null
  if (d.pai_id) {
    const p = (await db.get("SELECT id, pai_id FROM ped_mural_comentarios WHERE id = ? AND mural_id = ? AND situacao = 'ativo'", d.pai_id, muralId)) as Linha | undefined
    if (!p) throw new ErroHttp(404, 'O comentário que você quer responder não está mais disponível.')
    pai = p.pai_id ?? p.id
  }
  const id = novoId()
  const agora = agoraIso()
  await db.run("INSERT INTO ped_mural_comentarios (id, mural_id, pai_id, autora_pessoa_id, autora_nome, texto, situacao, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,'ativo',?,?)", id, muralId, pai, pessoaId, nome, d.texto, agora, agora)
  return id
}

export async function contagens(db: BD, muralId: string, pessoaId?: string) {
  const r = (await db.get(
    `SELECT (SELECT COUNT(*) FROM ped_mural_curtidas WHERE mural_id = ?) AS curtidas,
            (SELECT COUNT(*) FROM ped_mural_comentarios WHERE mural_id = ? AND situacao = 'ativo') AS comentarios,
            EXISTS (SELECT 1 FROM ped_mural_curtidas WHERE mural_id = ? AND pessoa_id = ?) AS curti`,
    muralId, muralId, muralId, pessoaId ?? '',
  )) as Linha
  return { curtidas: r.curtidas as number, comentarios: r.comentarios as number, curti: !!r.curti }
}
