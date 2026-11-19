import { useEffect, useRef } from 'react'
import { post } from '../lib/api'

/**
 * Player do Vimeo com a API de mensagens do próprio player (sem script externo). A cada avanço de 5%
 * (e ao passar do limite de "assistido"), o ponto alcançado vai para `endpoint`; o servidor guarda o maior valor.
 */
export function PlayerVimeo({
  id,
  videoUrl,
  titulo,
  percentual,
  limite,
  endpoint,
  onAssistido,
}: {
  id: string
  videoUrl: string
  titulo: string
  percentual: number
  limite: number
  endpoint: string
  onAssistido?: () => void
}) {
  const quadro = useRef<HTMLIFrameElement>(null)
  const enviado = useRef<number>(percentual)
  const aoAssistir = useRef(onAssistido)
  aoAssistir.current = onAssistido
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
      if (pct === null) return
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
