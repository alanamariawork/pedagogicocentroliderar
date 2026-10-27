export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const SITUACAO_MATRICULA: Record<string, string> = {
  ativa: 'Ativa',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
  cancelada: 'Cancelada',
}
export const SITUACAO_CONTRATO: Record<string, string> = { pendente: 'Contrato pendente', enviado: 'Contrato enviado', assinado: 'Contrato assinado' }
export const SITUACAO_ONBOARDING: Record<string, string> = { pendente: 'Onboarding pendente', agendado: 'Onboarding agendado', realizado: 'Onboarding realizado' }
export const SITUACAO_OCORRENCIA: Record<string, string> = {
  prevista: 'Prevista',
  aguardando_agenda: 'Aguardando agenda',
  disponivel_agendar: 'Disponível para agendar',
  agendada: 'Agendada',
  realizada: 'Realizada',
  cancelada: 'Cancelada (decisão registrada)',
  conferencia: 'Pendente de conferência',
}
export const SITUACAO_ATIVIDADE: Record<string, string> = {
  pendente: 'Pendente',
  em_execucao: 'Em execução',
  enviada: 'Enviada para validação',
  validada: 'Validada',
  em_revisao: 'Em revisão',
}
export const SITUACAO_ETAPA: Record<string, string> = { bloqueada: 'Bloqueada', liberada: 'Liberada', concluida: 'Concluída' }
export const ORIGEM_ITEM: Record<string, string> = { pacote: 'Pacote', bonus: 'Bônus', ajuste: 'Ajuste' }
export const CANAIS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telefone: 'Telefone',
  email: 'E-mail',
  presencial: 'Presencial',
  videochamada: 'Videochamada',
  outro: 'Outro',
}
export const RESULTADOS_CONTATO: Record<string, string> = {
  sem_resposta: 'Sem resposta',
  respondeu: 'Respondeu',
  agendou: 'Agendou',
  pediu_reagendamento: 'Pediu reagendamento',
  recusou: 'Recusou',
  outro: 'Outro',
}
export const TIPO_AJUSTE: Record<string, string> = {
  ajuste: 'Ajuste autorizado',
  excecao: 'Exceção registrada',
  transferencia_saida: 'Transferida para renovação',
  transferencia_entrada: 'Recebida da matrícula anterior',
  cancelamento: 'Reduzida por cancelamento',
}
export const HISTORICO_OCORRENCIA: Record<string, string> = {
  previsao_definida: 'Previsão definida',
  previsao_alterada: 'Previsão alterada',
  agendada: 'Agendada',
  reagendada: 'Reagendada',
  desmarcada: 'Desmarcada (horário liberado)',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  situacao: 'Situação alterada',
  conferida: 'Conferida',
}

export function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`
}
