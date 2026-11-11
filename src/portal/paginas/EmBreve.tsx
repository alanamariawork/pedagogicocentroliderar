import type { LucideIcon } from 'lucide-react'
import { ITENS_ALUNA } from '../menu'
import { hrefAluna, type PaginaAluna } from '../rotas'

/** Texto do estado vazio de cada tela que ainda vai receber conteúdo, com um caminho útil para agora. */
const TEXTOS: Partial<Record<PaginaAluna, { texto: string; acao: { rotulo: string; pagina: PaginaAluna } }>> = {
  mentoria: { texto: 'O detalhe de cada mentoria (resumo, ações e arquivos) vai ficar aqui.', acao: { rotulo: 'Ver minhas mentorias', pagina: 'mentorias' } },
  nivel: { texto: 'Seu nível segue as etapas pedagógicas da sua trilha, validadas pela equipe. Veja em Trilhas onde você está e o que vem depois.', acao: { rotulo: 'Ver minhas trilhas', pagina: 'trilhas' } },
  balanco: { texto: 'Aqui vai ficar o retrato do seu ciclo: o que você recebeu e o que você conquistou.', acao: { rotulo: 'Ver minhas vitórias', pagina: 'vitorias' } },
  ranking: { texto: 'O ranking por pontos vai aparecer aqui, com nome, turma, nível e pontos de cada aluna.', acao: { rotulo: 'Voltar ao início', pagina: 'inicio' } },
  casos: { texto: 'Histórias de ex-alunas, com os resultados que conquistaram, vão ficar aqui.', acao: { rotulo: 'Ver minhas vitórias', pagina: 'vitorias' } },
}

export function EmBreve({ pagina }: { pagina: PaginaAluna }) {
  const item = ITENS_ALUNA.find((i) => i.id === pagina)
  const Icone = (item?.icone ?? ITENS_ALUNA[0].icone) as LucideIcon
  const t = TEXTOS[pagina] ?? { texto: 'Esta área ainda está sendo preparada.', acao: { rotulo: 'Voltar ao início', pagina: 'inicio' as PaginaAluna } }
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-gold-soft text-gold">
        <Icone className="size-6" aria-hidden />
      </span>
      <p className="font-display text-lg font-semibold text-ink">Em breve</p>
      <p className="mt-1 max-w-md text-sm text-ink-soft">{t.texto}</p>
      <a href={hrefAluna(t.acao.pagina)} className="btn-primary mt-5">
        {t.acao.rotulo}
      </a>
    </div>
  )
}
