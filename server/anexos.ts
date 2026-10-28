import express, { type Request, type Response } from 'express'
import { agoraIso, novoId, type BD } from './db'
import { ErroHttp } from './auth'

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

/** Lê o corpo cru do upload (até 10 MB). */
export const corpoDoArquivo = express.raw({ type: () => true, limit: ANEXO_MAX_BYTES })

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

/** Guarda um arquivo ainda sem envio vinculado. Arquivos não vinculados há mais de 1 dia são apagados. */
export function guardarAnexo(db: BD, req: Request, atividadeId: string) {
  const nome = nomeSeguro(req.get('X-Nome-Arquivo'))
  const ext = nome.includes('.') ? nome.split('.').pop()!.toLowerCase() : ''
  const tipo = TIPOS[ext]
  if (!tipo) throw new ErroHttp(400, 'Tipo de arquivo não aceito. Envie PDF, imagem (JPG, PNG, WEBP, HEIC), Word, Excel, PowerPoint, texto, áudio (MP3, M4A) ou vídeo MP4.')
  const corpo = req.body
  if (!Buffer.isBuffer(corpo) || corpo.length === 0) throw new ErroHttp(400, 'O arquivo está vazio.')
  const limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  db.prepare('DELETE FROM anexos WHERE evidencia_id IS NULL AND criado_em < ?').run(limite)
  const soltos = db.prepare('SELECT COUNT(*) AS n FROM anexos WHERE evidencia_id IS NULL AND atividade_id = ? AND autor_id = ?').get(atividadeId, req.usuario!.id) as { n: number }
  if (soltos.n >= ANEXOS_POR_ENVIO * 2) throw new ErroHttp(429, 'Muitos arquivos enviados sem concluir. Conclua o envio ou tente de novo mais tarde.')
  const id = novoId()
  db.prepare('INSERT INTO anexos (id, atividade_id, evidencia_id, nome, tipo, tamanho, conteudo, autor_id, criado_em) VALUES (?,?,NULL,?,?,?,?,?,?)').run(
    id, atividadeId, nome, tipo, corpo.length, corpo, req.usuario!.id, agoraIso())
  return { id, nome, tamanho: corpo.length }
}

/** Liga os arquivos guardados ao envio. Só aceita arquivos da mesma atividade, do mesmo autor e ainda soltos. */
export function vincularAnexos(db: BD, req: Request, atividadeId: string, evidenciaId: string, ids: string[]) {
  if (ids.length > ANEXOS_POR_ENVIO) throw new ErroHttp(400, `Envie no máximo ${ANEXOS_POR_ENVIO} arquivos por vez.`)
  const upd = db.prepare('UPDATE anexos SET evidencia_id = ? WHERE id = ? AND atividade_id = ? AND autor_id = ? AND evidencia_id IS NULL')
  for (const id of new Set(ids)) {
    if (upd.run(evidenciaId, id, atividadeId, req.usuario!.id).changes !== 1) throw new ErroHttp(400, 'Um dos arquivos não foi encontrado. Anexe-o novamente.')
  }
}

/** Lista dos anexos (sem o conteúdo) de vários envios. */
export function anexosPorEvidencia(db: BD, evidenciaIds: string[]) {
  const mapa = new Map<string, Linha[]>()
  if (!evidenciaIds.length) return mapa
  const linhas = db
    .prepare(`SELECT id, evidencia_id, nome, tipo, tamanho, criado_em FROM anexos WHERE evidencia_id IN (${evidenciaIds.map(() => '?').join(',')}) ORDER BY criado_em`)
    .all(...evidenciaIds) as Linha[]
  for (const l of linhas) mapa.set(l.evidencia_id, [...(mapa.get(l.evidencia_id) ?? []), l])
  return mapa
}

/** Entrega o arquivo sempre como download, para nunca ser aberto como página do sistema. */
export function entregarAnexo(res: Response, a: Linha) {
  const ascii = String(a.nome).replace(/[^\x20-\x7e]/g, '_')
  res.set('Content-Type', a.tipo)
  res.set('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nome)}`)
  res.set('Content-Security-Policy', "default-src 'none'; sandbox")
  res.set('Cache-Control', 'private, no-store')
  res.send(a.conteudo)
}
