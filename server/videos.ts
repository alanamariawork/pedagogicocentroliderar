/**
 * Vídeos das aulas e da Biblioteca. O campo `video_url` (ped_aulas e ped_conteudos) guarda sempre o
 * endereço do player, já no formato de incorporar, de uma destas origens:
 *   - Vimeo:   https://player.vimeo.com/video/123?h=…          (o jeito que já existia)
 *   - YouTube: https://www.youtube-nocookie.com/embed/<id>     (sem custo; use vídeo "Não listado")
 *
 * Vídeo "Privado" do YouTube não toca fora do YouTube. "Não listado" toca no portal, mas quem tiver o
 * link pode assistir e repassar: o YouTube não limita onde o vídeo é incorporado.
 */
import { ErroHttp } from './auth'

/** Endereço de vídeo do Vimeo aceito: vimeo.com/123, vimeo.com/123/hash, player.vimeo.com/video/123?h=hash. */
export function embedVimeo(url: string | null | undefined): string | null {
  const u = urlHttps(url)
  if (!u) return null
  const host = u.hostname.replace(/^www\./, '')
  let id: string | undefined
  let hash: string | null = u.searchParams.get('h')
  if (host === 'player.vimeo.com') {
    const m = /^\/video\/(\d+)\/?$/.exec(u.pathname)
    id = m?.[1]
  } else if (host === 'vimeo.com') {
    const m = /^\/(?:.*\/)?(\d+)(?:\/([0-9a-f]+))?\/?$/.exec(u.pathname)
    id = m?.[1]
    hash = hash ?? m?.[2] ?? null
  }
  if (!id) return null
  return `https://player.vimeo.com/video/${id}${hash ? `?h=${encodeURIComponent(hash)}` : ''}`
}

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
export const PLAYER_YOUTUBE = 'https://www.youtube-nocookie.com/embed/'

/**
 * Endereço de vídeo do YouTube aceito: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID,
 * youtube.com/live/ID, youtube.com/embed/ID e youtube-nocookie.com/embed/ID (com ou sem "www." e "m.").
 * Listas (playlist) e canais não servem: precisa ser um vídeo.
 */
export function embedYoutube(url: string | null | undefined): string | null {
  const u = urlHttps(url)
  if (!u) return null
  const host = u.hostname.replace(/^(www|m)\./, '')
  let id: string | null | undefined
  if (host === 'youtu.be') id = u.pathname.split('/')[1]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v')
    else id = /^\/(?:embed|shorts|live|v)\/([^/]+)\/?$/.exec(u.pathname)?.[1]
  }
  if (!id || !ID_YOUTUBE.test(id)) return null
  return `${PLAYER_YOUTUBE}${id}`
}

function urlHttps(url: string | null | undefined): URL | null {
  if (!url) return null
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  // Links do YouTube copiados sem "s" ainda são aceitos: o player gravado é sempre https.
  return u.protocol === 'https:' || (u.protocol === 'http:' && /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname)) ? u : null
}

/**
 * Confere o vídeo informado pela equipe e devolve o valor a gravar (o endereço do player do Vimeo
 * ou do YouTube), ou null quando não há vídeo. Erro 400 com a explicação quando o link não serve.
 */
export function conferirVideo(valor: string | null | undefined): string | null {
  const v = valor?.trim()
  if (!v) return null
  const player = embedYoutube(v) ?? embedVimeo(v)
  if (!player) throw new ErroHttp(400, 'Use o link de um vídeo do YouTube (https://youtu.be/…) ou do Vimeo (https://vimeo.com/…).')
  return player
}
