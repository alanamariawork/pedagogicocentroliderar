import { useEffect, useRef, useState } from 'react'
import { post } from '../lib/api'

type PropsPlayer = {
  id: string
  /** Endereço do player gravado pelo servidor: do Vimeo (player.vimeo.com) ou do YouTube (youtube-nocookie.com). */
  videoUrl: string | null
  titulo: string
  percentual: number
  limite: number
  endpoint: string
  onAssistido?: () => void
}

/**
 * Player da aula: escolhe o do Vimeo ou o do YouTube pelo endereço. Nos dois, a cada avanço
 * de 5% (e ao passar do limite de "assistido"), o ponto alcançado vai para `endpoint`; o servidor guarda o maior valor.
 */
export function PlayerVideo(p: PropsPlayer) {
  if (!p.videoUrl)
    return (
      <div className="grid aspect-video place-items-center bg-black/90 p-4 text-center text-sm text-white/80">
        Este vídeo está indisponível no momento. Tente de novo mais tarde ou fale com a equipe.
      </div>
    )
  return p.videoUrl.startsWith('https://player.vimeo.com/') ? <PlayerVimeo {...p} videoUrl={p.videoUrl} /> : <PlayerYoutube {...p} videoUrl={p.videoUrl} />
}

/** Envia o progresso ao servidor de 5 em 5% e avisa quando a aula passa do limite de "assistida". */
function useProgresso(endpoint: string, percentual: number, limite: number, onAssistido?: () => void) {
  const enviado = useRef<number>(percentual)
  const aoAssistir = useRef(onAssistido)
  aoAssistir.current = onAssistido
  return (pct: number) => {
    const cruzouLimite = enviado.current < limite && pct >= limite
    if (pct < enviado.current + 5 && !cruzouLimite) return
    const anterior = enviado.current
    enviado.current = pct
    post(endpoint, { percentual: pct })
      .then(() => {
        if (anterior < limite && pct >= limite) aoAssistir.current?.()
      })
      .catch(() => {
        enviado.current = anterior
      })
  }
}

/** Player do Vimeo com a API de mensagens do próprio player (sem script externo). */
export function PlayerVimeo({ id, videoUrl, titulo, percentual, limite, endpoint, onAssistido }: PropsPlayer & { videoUrl: string }) {
  const quadro = useRef<HTMLIFrameElement>(null)
  const informar = useProgresso(endpoint, percentual, limite, onAssistido)
  const informarRef = useRef(informar)
  informarRef.current = informar
  useEffect(() => {
    const origem = 'https://player.vimeo.com'
    const registrar = () => {
      for (const ev of ['timeupdate', 'ended']) quadro.current?.contentWindow?.postMessage(JSON.stringify({ method: 'addEventListener', value: ev }), origem)
    }
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== origem || e.source !== quadro.current?.contentWindow) return
      let msg: { event?: string; data?: { percent?: number } }
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (msg.event === 'ready') return registrar()
      const pct = msg.event === 'ended' ? 100 : msg.event === 'timeupdate' ? Math.floor(Number(msg.data?.percent ?? 0) * 100) : null
      if (pct !== null) informarRef.current(pct)
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [endpoint, limite])
  const src = `${videoUrl}${videoUrl.includes('?') ? '&' : '?'}api=1&player_id=video-${id}`
  return (
    <div className="aspect-video bg-black">
      <iframe ref={quadro} id={`video-${id}`} src={src} title={titulo} className="size-full" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  )
}

/* ---------------- YouTube ---------------- */

type YtPlayer = { getCurrentTime: () => number; getDuration: () => number; destroy: () => void }
type YtApi = { Player: new (el: HTMLIFrameElement, o: { events: { onStateChange: (e: { data: number }) => void } }) => YtPlayer; PlayerState: { ENDED: number; PLAYING: number } }
const API_YOUTUBE = 'https://www.youtube.com/iframe_api'
let carregandoYt: Promise<YtApi> | null = null

/** API oficial do player do YouTube (carregada uma vez para todos os players da página). */
function apiYoutube(): Promise<YtApi> {
  const w = window as unknown as { YT?: YtApi & { loaded?: number }; onYouTubeIframeAPIReady?: () => void }
  if (w.YT?.Player) return Promise.resolve(w.YT)
  carregandoYt ??= new Promise<YtApi>((ok, falha) => {
    const anterior = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      anterior?.()
      if (w.YT?.Player) ok(w.YT)
      else falha(new Error('API do YouTube sem o Player'))
    }
    const s = document.createElement('script')
    s.src = API_YOUTUBE
    s.async = true
    s.onerror = () => {
      carregandoYt = null
      falha(new Error('Não foi possível carregar o player do YouTube'))
    }
    document.head.appendChild(s)
  })
  return carregandoYt
}

/**
 * Player do YouTube (endereço youtube-nocookie.com/embed/ID, gravado pelo servidor). Enquanto o vídeo
 * toca, lê a posição a cada 2 segundos; o progresso segue a mesma regra do Vimeo.
 */
export function PlayerYoutube({ id, videoUrl, titulo, percentual, limite, endpoint, onAssistido }: PropsPlayer & { videoUrl: string }) {
  const quadro = useRef<HTMLIFrameElement>(null)
  const [semProgresso, setSemProgresso] = useState(false)
  const informar = useProgresso(endpoint, percentual, limite, onAssistido)
  const informarRef = useRef(informar)
  informarRef.current = informar
  useEffect(() => {
    let player: YtPlayer | null = null
    let relogio: ReturnType<typeof setInterval> | null = null
    let ativo = true
    const parar = () => {
      if (relogio) clearInterval(relogio)
      relogio = null
    }
    const ler = () => {
      const total = player?.getDuration() ?? 0
      if (total > 0) informarRef.current(Math.min(100, Math.floor(((player?.getCurrentTime() ?? 0) / total) * 100)))
    }
    apiYoutube()
      .then((YT) => {
        if (!ativo || !quadro.current) return
        player = new YT.Player(quadro.current, {
          events: {
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) {
                parar()
                relogio = setInterval(ler, 2000)
              } else {
                parar()
                if (e.data === YT.PlayerState.ENDED) informarRef.current(100)
                else ler()
              }
            },
          },
        })
      })
      .catch(() => ativo && setSemProgresso(true))
    return () => {
      ativo = false
      parar()
    }
  }, [videoUrl, endpoint, limite])
  const src = `${videoUrl}?enablejsapi=1&rel=0&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`
  return (
    <div className="bg-black">
      <div className="aspect-video">
        <iframe ref={quadro} id={`video-${id}`} src={src} title={titulo} className="size-full border-0" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      {semProgresso && <p className="bg-surface-muted px-3 py-1 text-xs text-ink-muted">Não foi possível registrar o seu progresso neste vídeo agora. Recarregue a página para tentar de novo.</p>}
    </div>
  )
}
