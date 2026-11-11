import { agoraIso, novoId, type BD, type BDouTX } from './db'
import { ErroHttp, type Handler, type Req as Request, type Res as Response } from './http'
import type { Arquivos } from './contexto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export const ANEXO_MAX_BYTES = 10 * 1024 * 1024
export const ANEXOS_POR_ENVIO = 5

/** Tipos aceitos, pela extensão. O tipo enviado pelo navegador é ignorado. */
const TIPOS: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
}

/** Lê o corpo cru do upload (até 10 MB) para req.body (ArrayBuffer). */
export const corpoDoArquivo: Handler = async (req, _res, next) => {
  const tamanho = Number(req.get('Content-Length') ?? 0)
  if (tamanho > ANEXO_MAX_BYTES) throw new ErroHttp(413, 'O arquivo passa de 10 MB. Envie um arquivo menor ou compartilhe por link.')
  const corpo = await req.raw.arrayBuffer()
  if (corpo.byteLength > ANEXO_MAX_BYTES) throw new ErroHttp(413, 'O arquivo passa de 10 MB. Envie um arquivo menor ou compartilhe por link.')
  req.body = corpo
  next()
}

function nomeSeguro(bruto: string | undefined) {
  let nome = ''
  try {
    nome = decodeURIComponent(bruto ?? '')
  } catch {
    nome = ''
  }
  // eslint-disable-next-line no-control-regex
  nome = nome.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 150)
  if (!nome) throw new ErroHttp(400, 'Informe o nome do arquivo.')
  return nome
}

/** Lê o arquivo enviado (nome no cabeçalho X-Nome-Arquivo), aceitando só as extensões informadas. */
export function arquivoEnviado(req: Request, extensoes: string[], mensagem: string) {
  const nome = nomeSeguro(req.get('X-Nome-Arquivo'))
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : ''
  const tipo = extensoes.includes(ext) ? TIPOS[ext] : undefined
  if (!tipo) throw new ErroHttp(400, mensagem)
  const dados = req.body
  if (!(dados instanceof ArrayBuffer) || dados.byteLength === 0) throw new ErroHttp(400, 'O arquivo está vazio.')
  return { nome, tipo, ext, dados }
}

export async function hashArquivo(dados: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', dados))
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Guarda um arquivo ainda sem envio vinculado: o conteúdo vai para o R2 e o registro para o D1.
 * Arquivos não vinculados há mais de 1 dia são apagados.
 */
export async function guardarAnexo(db: BD, arquivos: Arquivos, req: Request, atividadeId: string) {
  const nome = nomeSeguro(req.get('X-Nome-Arquivo'))
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : ''
  const tipo = TIPOS[ext]
  if (!tipo) throw new ErroHttp(400, 'Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG, WEBP, HEIC), Word, Excel, PowerPoint, texto, áudio (MP3, M4A) ou vídeo MP4.')
  const corpo = req.body
  if (!(corpo instanceof ArrayBuffer) || corpo.byteLength === 0) throw new ErroHttp(400, 'O arquivo está vazio.')
  const limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const velhos = await db.all<{ chave: string }>('SELECT chave FROM ped_anexos WHERE evidencia_id IS NULL AND criado_em < ?', limite)
  if (velhos.length) {
    await arquivos.apagar(velhos.map((v) => v.chave))
    await db.run('DELETE FROM ped_anexos WHERE evidencia_id IS NULL AND criado_em < ?', limite)
  }
  const soltos = (await db.get('SELECT COUNT(*) AS n FROM ped_anexos WHERE evidencia_id IS NULL AND atividade_id = ? AND autor_id = ?', atividadeId, req.usuario!.id)) as { n: number }
  if (soltos.n >= ANEXOS_POR_ENVIO * 2) throw new ErroHttp(429, 'Muitos arquivos enviados sem concluir. Conclua o envio ou tente de novo mais tarde.')
  const id = novoId()
  const chave = `anexos/${atividadeId}/${id}`
  await arquivos.guardar(chave, corpo, tipo)
  await db.run('INSERT INTO ped_anexos (id, atividade_id, evidencia_id, nome, tipo, tamanho, chave, autor_id, criado_em) VALUES (?,?,NULL,?,?,?,?,?,?)', id, atividadeId, nome, tipo, corpo.byteLength, chave, req.usuario!.id, agoraIso())
  return { id, nome, tamanho: corpo.byteLength }
}

/**
 * Confere os arquivos antes de ligá-los ao envio: só aceita arquivos da mesma atividade, do mesmo
 * autor e ainda soltos. Devolve as gravações para entrarem na mesma transação do envio.
 */
export async function vincularAnexos(db: BDouTX, req: Request, atividadeId: string, evidenciaId: string, ids: string[]) {
  if (ids.length > ANEXOS_POR_ENVIO) throw new ErroHttp(400, `Envie no máximo ${ANEXOS_POR_ENVIO} arquivos por vez.`)
  for (const id of new Set(ids)) {
    const ok = await db.get('SELECT 1 FROM ped_anexos WHERE id = ? AND atividade_id = ? AND autor_id = ? AND evidencia_id IS NULL', id, atividadeId, req.usuario!.id)
    if (!ok) throw new ErroHttp(400, 'Um dos arquivos não foi encontrado. Anexe-o novamente.')
    await db.run('UPDATE ped_anexos SET evidencia_id = ? WHERE id = ? AND atividade_id = ? AND autor_id = ? AND evidencia_id IS NULL', evidenciaId, id, atividadeId, req.usuario!.id)
  }
}

/** Lista dos anexos (sem o conteúdo) de vários envios. */
export async function anexosPorEvidencia(db: BDouTX, evidenciaIds: string[]) {
  const mapa = new Map<string, Linha[]>()
  // O D1 aceita no máximo 100 parâmetros por consulta: busca em partes.
  for (let k = 0; k < evidenciaIds.length; k += 90) {
    const parte = evidenciaIds.slice(k, k + 90)
    const linhas = (await db.all(`SELECT id, evidencia_id, nome, tipo, tamanho, criado_em FROM ped_anexos WHERE evidencia_id IN (${parte.map(() => '?').join(',')}) ORDER BY criado_em`, ...parte)) as Linha[]
    for (const l of linhas) mapa.set(l.evidencia_id, [...(mapa.get(l.evidencia_id) ?? []), l])
  }
  return mapa
}

/** Entrega o arquivo sempre como download, para nunca ser aberto como página do sistema. */
export async function entregarAnexo(arquivos: Arquivos, res: Response, a: Linha) {
  const conteudo = await arquivos.ler(a.chave)
  if (!conteudo) throw new ErroHttp(404, 'Arquivo não encontrado.')
  const ascii = String(a.nome).replace(/[^\x20-\x7e]/g, '_')
  res.set('Content-Type', a.tipo)
  res.set('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nome)}`)
  res.set('Content-Security-Policy', "default-src 'none'; sandbox")
  res.set('Cache-Control', 'private, no-store')
  res.send(conteudo)
}
