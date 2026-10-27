/**
 * Perfis e permissões. Separam visualizar, editar, validar e administrar.
 * Os valores abaixo são o PADRÃO inicial; a Administração pode alterá-los em
 * Configurações → Regras de acesso (gravado no banco e aplicado no servidor).
 */
export const PERFIS = ['admin', 'coordenacao', 'suporte', 'mentora', 'comercial', 'aluna'] as const
export type Perfil = (typeof PERFIS)[number]

export const NOME_PERFIL: Record<Perfil, string> = {
  admin: 'Administração',
  coordenacao: 'Coordenação pedagógica',
  suporte: 'Suporte/CS',
  mentora: 'Mentora',
  comercial: 'Comercial',
  aluna: 'Aluna',
}

export const PERMISSOES = {
  'alunas:ver': 'Ver alunas e matrículas',
  'alunas:editar': 'Cadastrar e editar dados básicos de alunas',
  'matriculas:criar': 'Criar matrículas e renovações',
  'comercial:ver': 'Ver condições comerciais, contrato, pacote e bônus',
  'comercial:editar': 'Editar condições comerciais, contrato e itens contratados',
  'obrigacoes:ajustar': 'Ajustar quantidades, registrar exceções e cancelar ocorrências',
  'matriculas:decidir': 'Pausar, decidir prazos, encerrar, cancelar e transferir pendências',
  'onboarding:editar': 'Registrar onboarding',
  'entregas:ver': 'Ver entregas, agenda e capacidade',
  'entregas:editar': 'Planejar entregas, agendar, registrar contatos e impedimentos',
  'entregas:realizar': 'Marcar encontros como realizados',
  'agenda:editar': 'Cadastrar disponibilidade de horários',
  'notas:internas': 'Ver e escrever notas internas de encontros e anotações operacionais',
  'notas:pedagogicas': 'Ver e escrever anotações pedagógicas privadas',
  'jornada:ver': 'Ver jornada pedagógica',
  'jornada:editar': 'Definir jornada, registrar atividades e evidências',
  'jornada:validar': 'Validar atividades, liberar e concluir etapas',
  'pedagogico:configurar': 'Configurar trilhas, pilares, etapas e critérios',
  'conquistas:editar': 'Registrar conquistas',
  'conquistas:validar': 'Validar conquistas e liberar para a aluna',
  'indicadores:ver': 'Ver visão geral e indicadores',
  'config:editar': 'Editar programas, pacotes, tipos, profissionais e motivos',
  'decisoes:editar': 'Registrar e decidir questões pendentes',
  'auditoria:ver': 'Ver histórico de alterações',
  'usuarios:admin': 'Administrar usuários e regras de acesso',
} as const
export type Permissao = keyof typeof PERMISSOES

const TODAS = Object.keys(PERMISSOES) as Permissao[]

export const PERMISSOES_PADRAO: Record<Perfil, Permissao[]> = {
  admin: TODAS,
  coordenacao: TODAS.filter((p) => p !== 'usuarios:admin'),
  suporte: [
    'alunas:ver',
    'alunas:editar',
    'matriculas:criar',
    'comercial:ver',
    'onboarding:editar',
    'entregas:ver',
    'entregas:editar',
    'entregas:realizar',
    'agenda:editar',
    'notas:internas',
    'jornada:ver',
    'jornada:editar',
    'conquistas:editar',
    'indicadores:ver',
    'auditoria:ver',
  ],
  // Mentora só enxerga as matrículas em que atende (restrição aplicada no servidor).
  mentora: [
    'alunas:ver',
    'entregas:ver',
    'entregas:editar',
    'entregas:realizar',
    'agenda:editar',
    'notas:internas',
    'notas:pedagogicas',
    'jornada:ver',
    'jornada:editar',
    'conquistas:editar',
  ],
  // Comercial não acessa notas internas nem anotações pedagógicas por padrão.
  comercial: [
    'alunas:ver',
    'alunas:editar',
    'matriculas:criar',
    'comercial:ver',
    'comercial:editar',
    'entregas:ver',
    'indicadores:ver',
  ],
  // A aluna usa apenas o portal (/api/portal), sempre limitado aos próprios dados.
  aluna: [],
}

/** Permissões que nunca podem ser concedidas ao perfil Aluna. */
export const PROIBIDAS_ALUNA: Permissao[] = TODAS
