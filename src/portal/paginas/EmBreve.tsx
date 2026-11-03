import type { LucideIcon } from 'lucide-react'
import { ITENS_ALUNA } from '../menu'
import { hrefAluna, type PaginaAluna } from '../rotas'

/** Texto do estado vazio de cada tela que ainda vai receber conteúdo, com um caminho útil para agora. */
const TEXTOS: Partial<Record<PaginaAluna, { texto: string; acao: { rotulo: string; pagina: PaginaAluna } }>> = {
  trilhas: { texto: 'Aqui vão ficar as aulas organizadas em módulos, com o seu progresso. A equipe ainda está cadastrando as aulas.', acao: { rotulo: 'Ver minha jornada', pagina: 'jornada' } },
  biblioteca: { texto: 'Aqui vão ficar os materiais, modelos e downloads, com os recomendados para a sua etapa.', acao: { rotulo: 'Ver links importantes', pagina: 'links' } },
  acoes: { texto: 'Aqui vão ficar as ações combinadas em cada mentoria. Por enquanto, elas aparecem como atividades na sua jornada.', acao: { rotulo: 'Ver atividades da jornada', pagina: 'jornada' } },
  tarefas: { texto: 'Aqui você vai organizar suas tarefas em lista, quadro ou calendário.', acao: { rotulo: 'Ver atividades da jornada', pagina: 'jornada' } },
  rotina: { texto: 'Aqui vai ficar o checklist do dia, com o botão “Fechar o dia” e a sua sequência da semana.', acao: { rotulo: 'Voltar ao início', pagina: 'inicio' } },
  mentoria: { texto: 'O detalhe de cada mentoria (resumo, ações e arquivos) vai ficar aqui.', acao: { rotulo: 'Ver minhas mentorias', pagina: 'mentorias' } },
  nivel: { texto: 'Cada coisa que você registra aqui vai somar pontos: etapas, aulas, diagnóstico, rotina e vitórias. Seu nível e suas conquistas vão aparecer nesta tela.', acao: { rotulo: 'Preencher meu diagnóstico', pagina: 'diagnostico' } },
  'plano-90': { texto: 'As metas e entregas do seu ciclo, definidas com a equipe na mentoria inicial, vão aparecer aqui.', acao: { rotulo: 'Ver minhas metas', pagina: 'diagnostico' } },
  balanco: { texto: 'Aqui vai ficar o retrato do seu ciclo: o que você recebeu e o que você conquistou.', acao: { rotulo: 'Ver minhas vitórias', pagina: 'vitorias' } },
  mural: { texto: 'O mural da comunidade, com avisos, insights e conteúdos, vai ficar aqui.', acao: { rotulo: 'Ver links importantes', pagina: 'links' } },
  ranking: { texto: 'O ranking por pontos vai aparecer aqui, com nome, turma, nível e pontos de cada aluna.', acao: { rotulo: 'Voltar ao início', pagina: 'inicio' } },
  casos: { texto: 'Histórias de ex-alunas, com os resultados que conquistaram, vão ficar aqui.', acao: { rotulo: 'Ver minhas vitórias', pagina: 'vitorias' } },
  agenda: { texto: 'O calendário dos encontros ao vivo vai ficar aqui. Seus encontros individuais já aparecem em Mentorias.', acao: { rotulo: 'Ver minhas mentorias', pagina: 'mentorias' } },
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
