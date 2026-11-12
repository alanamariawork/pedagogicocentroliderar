import { Video } from 'lucide-react'

/** Botão para entrar na videochamada do encontro (link do Google Meet criado com o evento). */
export function BotaoMeet({ link, rotulo = 'Entrar no Meet', className = 'btn-primary btn-sm' }: { link: string | null | undefined; rotulo?: string; className?: string }) {
  if (!link || !/^https:\/\/meet\.google\.com\//.test(link)) return null
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className={className}>
      <Video className="size-4" aria-hidden /> {rotulo}
    </a>
  )
}
