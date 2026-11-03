/**
 * Listas configuráveis (tabela `opcoes_lista`). A equipe renomeia, reordena, muda a cor e desativa
 * cada opção em Configurações → Listas. O `codigo` marca as opções que o sistema usa em cálculos
 * (ex.: "ativa" para o indicador de alunas ativas) e não pode ser alterado pela tela.
 */
export const LISTAS = {
  status_aluna: { titulo: 'Status da aluna', descricao: 'Estado geral da aluna. Muda sozinho quando a matrícula é pausada, retomada, encerrada ou cancelada, e também pode ser trocado na ficha.' },
  saude: { titulo: 'Saúde', descricao: 'Como a equipe avalia o momento da aluna. É marcada na ficha; não há cálculo automático.' },
  engajamento: { titulo: 'Engajamento', descricao: 'Quanto a aluna participa. É marcado na ficha; não há cálculo automático.' },
  segmento: { titulo: 'Segmentos', descricao: 'Segmento do negócio da aluna. O subsegmento é um texto livre na ficha.' },
  canal_venda: { titulo: 'Canais de venda', descricao: 'Por onde a matrícula foi vendida. Escolhido na matrícula.' },
  tipo_reuniao: { titulo: 'Categorias de reunião', descricao: 'Agrupam os tipos de entregável (ex.: mentoria, consultoria). Usadas no Resumo Executivo da ficha.' },
} as const
export type Lista = keyof typeof LISTAS

export const CORES_OPCAO = ['neutro', 'sucesso', 'alerta', 'perigo', 'info', 'vinho'] as const
export type CorOpcao = (typeof CORES_OPCAO)[number]
export const NOME_COR: Record<CorOpcao, string> = {
  neutro: 'Cinza',
  sucesso: 'Verde',
  alerta: 'Amarelo',
  perigo: 'Vermelho',
  info: 'Azul',
  vinho: 'Vinho',
}

/** Opções iniciais criadas pela migração. Segmentos e canais começam vazios: cada escola cadastra os seus. */
export const OPCOES_INICIAIS: { lista: Lista; codigo: string; nome: string; cor: CorOpcao }[] = [
  { lista: 'status_aluna', codigo: 'a_iniciar', nome: 'A iniciar', cor: 'info' },
  { lista: 'status_aluna', codigo: 'ativa', nome: 'Ativa', cor: 'sucesso' },
  { lista: 'status_aluna', codigo: 'pausada', nome: 'Pausada', cor: 'alerta' },
  { lista: 'status_aluna', codigo: 'concluida', nome: 'Concluída', cor: 'neutro' },
  { lista: 'status_aluna', codigo: 'cancelada', nome: 'Cancelada', cor: 'perigo' },
  { lista: 'saude', codigo: 'saudavel', nome: 'Saudável', cor: 'sucesso' },
  { lista: 'saude', codigo: 'atencao', nome: 'Atenção', cor: 'alerta' },
  { lista: 'saude', codigo: 'critico', nome: 'Crítico', cor: 'perigo' },
  { lista: 'engajamento', codigo: 'alto', nome: 'Alto', cor: 'sucesso' },
  { lista: 'engajamento', codigo: 'medio', nome: 'Médio', cor: 'alerta' },
  { lista: 'engajamento', codigo: 'baixo', nome: 'Baixo', cor: 'perigo' },
  { lista: 'tipo_reuniao', codigo: 'mentoria', nome: 'Mentoria', cor: 'vinho' },
  { lista: 'tipo_reuniao', codigo: 'consultoria', nome: 'Consultoria', cor: 'info' },
  { lista: 'tipo_reuniao', codigo: 'sucesso_aluno', nome: 'Sucesso do aluno', cor: 'sucesso' },
  { lista: 'tipo_reuniao', codigo: 'encontro_ao_vivo', nome: 'Encontro ao vivo', cor: 'neutro' },
]

/** Status que a matrícula atual indica. "A iniciar" = ativa, mas a vigência ainda não começou. */
export function codigoStatusPelaMatricula(situacao: string, dataInicio: string, hoje: string): string {
  if (situacao === 'ativa') return dataInicio > hoje ? 'a_iniciar' : 'ativa'
  if (situacao === 'pausada') return 'pausada'
  if (situacao === 'encerrada') return 'concluida'
  return 'cancelada'
}

/**
 * Campos da aluna e a marca "visível à aluna". O portal só mostra o que estiver marcado.
 * Os internos começam desmarcados e alguns nunca podem ser liberados.
 */
export const CAMPOS_ALUNA: { campo: string; rotulo: string; padrao: boolean; sempreInterno?: boolean }[] = [
  { campo: 'nome', rotulo: 'Nome', padrao: true },
  { campo: 'email', rotulo: 'E-mail', padrao: true },
  { campo: 'telefone', rotulo: 'Telefone', padrao: true },
  { campo: 'cidade', rotulo: 'Cidade', padrao: true },
  { campo: 'empresa', rotulo: 'Empresa', padrao: true },
  { campo: 'segmento', rotulo: 'Segmento', padrao: true },
  { campo: 'subsegmento', rotulo: 'Subsegmento', padrao: true },
  { campo: 'redes', rotulo: 'Instagram, LinkedIn e site', padrao: true },
  { campo: 'data_entrada', rotulo: 'Data de entrada', padrao: true },
  { campo: 'responsavel', rotulo: 'Responsável na equipe', padrao: false },
  { campo: 'status', rotulo: 'Status', padrao: false },
  { campo: 'saude', rotulo: 'Saúde', padrao: false, sempreInterno: true },
  { campo: 'engajamento', rotulo: 'Engajamento', padrao: false, sempreInterno: true },
  { campo: 'em_risco', rotulo: 'Em risco', padrao: false, sempreInterno: true },
  { campo: 'observacao', rotulo: 'Observação interna', padrao: false, sempreInterno: true },
]
