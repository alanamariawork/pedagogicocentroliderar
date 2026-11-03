/** Áreas do diagnóstico da aluna. As perguntas são orientações de preenchimento e podem ser ajustadas pela equipe pedagógica. */
export const AREAS_DIAGNOSTICO = [
  {
    id: 'situacao',
    nome: 'Situação atual',
    perguntas: [
      { id: 'negocio', texto: 'Como está o seu negócio hoje?' },
      { id: 'numeros', texto: 'Principais números de hoje (por exemplo: faturamento, clientes, equipe)' },
      { id: 'funciona', texto: 'O que já funciona bem?' },
    ],
  },
  {
    id: 'objetivos',
    nome: 'Objetivos',
    perguntas: [
      { id: 'onde_chegar', texto: 'Onde você quer chegar ao fim do ciclo?' },
      { id: 'prioridade', texto: 'Qual é a sua prioridade número 1?' },
    ],
  },
  {
    id: 'desafios',
    nome: 'Desafios',
    perguntas: [
      { id: 'trava', texto: 'O que mais trava o seu crescimento hoje?' },
      { id: 'tentou', texto: 'O que você já tentou para resolver?' },
    ],
  },
  {
    id: 'expectativas',
    nome: 'Expectativas',
    perguntas: [
      { id: 'espera', texto: 'O que você espera do programa?' },
      { id: 'valeu', texto: 'Como você vai saber que valeu a pena?' },
    ],
  },
] as const

export type AreaDiagnostico = (typeof AREAS_DIAGNOSTICO)[number]['id']
export type VersaoDiagnostico = 'inicio' | 'fim'

/** Dias antes do fim da vigência em que o diagnóstico de fim de ciclo fica disponível. */
export const DIAS_DIAGNOSTICO_FIM = 30
