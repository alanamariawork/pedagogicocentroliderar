import type { Ambiente, Cliente } from './ambiente'
import { hoje } from '../../server/servicos'
import { inicioDaSemana, mesDe, somarDias, somarMeses } from '../../shared/datas'

/**
 * Dados de DEMONSTRAÇÃO, SÓ PARA TESTES. Tudo aqui é fictício: alunas, quantidades, datas e
 * atividades. Nenhum número representa condição oficial de pacote. Os cadastros são feitos pela
 * própria API, passando pelas mesmas regras que a equipe usa na tela. Os e-mails @demo.local
 * nunca vão para o banco de produção (não há seed nas migrations).
 */
export const USUARIOS_DEMO = [
  { email: 'admin@demo.local', nome: 'Admin (demo)', perfil: 'admin' },
  { email: 'coordenacao@demo.local', nome: 'Coordenação (demo)', perfil: 'coordenacao' },
  { email: 'suporte@demo.local', nome: 'Suporte CS (demo)', perfil: 'suporte' },
  { email: 'mentora@demo.local', nome: 'Mentora Tutoria (demo)', perfil: 'mentora', profissional: 'Mentora de Tutoria (demo)' },
] as const

/** Contas criadas pela demonstração (e-mail → id de usuário). */
export const CONTAS: Record<string, string> = {}

type Ficha = { matriculas: { id: string; itens: { id: string; descricao: string }[]; ocorrencias: { id: string; item_id: string; numero: number }[] }[] }

export async function popularDemonstracao(amb: Ambiente) {
  const db = amb.db
  CONTAS[USUARIOS_DEMO[0].email] = await amb.criarEquipe(USUARIOS_DEMO[0].email, USUARIOS_DEMO[0].nome, { perfil: 'admin' })
  const api: Cliente = await amb.entrar(CONTAS[USUARIOS_DEMO[0].email])
  {
    const h = hoje()
    const mes = mesDe(h)
    // Data daqui a N dias, ou hoje se isso cair no mês seguinte (para a demonstração ter itens no mês corrente).
    const noMes = (dias: number) => (mesDe(somarDias(h, dias)) === mes ? somarDias(h, dias) : h)

    /* ---------- Configurações ---------- */
    await api.put('/configuracoes', {
      janela_termino_dias: 45,
      texto_ajuda_aluna: 'Precisa de ajuda? Fale com o time de Sucesso do Cliente pelo seu grupo individual de acompanhamento no WhatsApp, de segunda a sexta, das 9h às 18h. (Texto de demonstração: ajuste em Configurações.)',
    })
    const programa = (await api.post('/catalogos/programas', { nome: 'Diamante Business', descricao: 'Programa de mentoria do Centro Liderar — Grupo Mendes' })).id

    // Profissionais citadas no material de onboarding. Especialidades conforme o material; ajuste em Configurações.
    const prof: Record<string, string> = {}
    for (const [chave, nome, esp] of [
      ['jaciara', 'Jaciara Mendes', 'Planejamento estratégico individual'],
      ['thallyta', 'Thallyta Medeiros', 'Modelo de negócio'],
      ['tamires', 'Tamires Vieira', 'Posicionamento'],
      ['kelvia', 'Kélvia Lustosa', 'Vendas e Instagram'],
      ['karuana', 'Karuana Carvalho', 'Destrave da mente (em grupo)'],
      ['cs', 'Time de Sucesso do Cliente', 'Rota inicial e acompanhamento'],
      ['tutoria', 'Mentora de Tutoria (demo)', 'Tutorias (demonstração)'],
    ] as const)
      prof[chave] = (await api.post('/catalogos/profissionais', { nome, especialidade: esp })).id

    // Tipos de entregável observados na planilha de acompanhamento. Durações são FICTÍCIAS (demonstração).
    const tipo: Record<string, string> = {}
    for (const [chave, nome, dur, individual] of [
      ['plano', 'Plano individual com Jaciara (1:1)', 60, true],
      ['modelo', 'Análise de modelo de negócio', 60, true],
      ['posicionamento', 'Análise de posicionamento', null, true],
      ['tutoria', 'Tutoria', 45, true],
      ['rota', 'Rota inicial (Sucesso do Cliente)', 60, true],
      ['juridico', 'Diagnóstico jurídico', 45, true],
      ['destrave', 'Destrave em grupo', 60, false],
    ] as const)
      tipo[chave] = (await api.post('/catalogos/tipos-entregavel', { nome, duracao_padrao_min: dur, individual })).id

    const motivos: Record<string, string> = {}
    for (const [chave, nome, exige] of [
      ['mentora', 'Aguardando disponibilidade da mentora', false],
      ['aluna', 'Aguardando resposta da aluna', false],
      ['horarios', 'Incompatibilidade de horários', false],
      ['contato', 'Contato ainda não realizado', false],
      ['reagendamento', 'Reagendamento solicitado', false],
      ['outro', 'Outro', true],
    ] as const)
      motivos[chave] = (await api.post('/catalogos/motivos-impedimento', { nome, exige_descricao: exige })).id

    /* ---------- Usuárias da equipe ---------- */
    // As contas nascem no backoffice; o perfil pedagógico é escolhido na tela de Usuários do pedagógico.
    for (const u of USUARIOS_DEMO.slice(1)) {
      CONTAS[u.email] = await amb.criarEquipe(u.email, u.nome)
      await api.put(`/usuarios/${CONTAS[u.email]}`, { perfil: u.perfil, profissional_id: 'profissional' in u ? prof.tutoria : null })
    }
    const uid = (email: string) => CONTAS[email]
    const suporte = uid('suporte@demo.local')
    const coord = uid('coordenacao@demo.local')

    /* ---------- Trilhas, pilares e etapas ---------- */
    // Nomes relatados na reunião (RN05). A ordem e a numeração oficiais estão em "Decisões pendentes".
    const trilhas: string[] = []
    for (const [n, nome] of ['Diamantes em Ação', 'Diamante no Jogo', 'Diamante que Age'].entries())
      trilhas.push((await api.post('/catalogos/trilhas', { nome, ordem: n + 1 })).id)
    const pilares: string[] = []
    const focos = [
      'Mentalidade, identidade, hábitos, postura, decisões',
      'Tempo, financeiro, pessoas, processos, indicadores',
      'Marketing, vendas, funil, tráfego, branding, WhatsApp',
    ]
    for (const [n, nome] of ['Ação', 'Gestão', 'Escala'].entries())
      pilares.push((await api.post('/catalogos/pilares', { nome, ordem: n + 1, descricao: focos[n] })).id)

    // Uma etapa por pilar em cada trilha. Conteúdo oficial das aulas NÃO é inventado:
    // as atividades abaixo são exemplos marcados como demonstração.
    const etapas: Record<string, string> = {}
    for (const [ti, trilha] of trilhas.entries()) {
      let anterior: string | null = null
      for (const [pi, pilar] of pilares.entries()) {
        const nomeP = ['Ação', 'Gestão', 'Escala'][pi]
        const e: { id: string } = await api.post('/etapas', {
          trilha_id: trilha,
          pilar_id: pilar,
          titulo: `Pilar ${nomeP}`,
          objetivo: `Foco do pilar: ${focos[pi].toLowerCase()}. (Objetivo oficial da etapa a definir pela coordenação.)`,
          criterio_conclusao: 'Critério oficial pendente de validação. Na demonstração: atividades validadas pela equipe pedagógica.',
          ordem: pi + 1,
          prerequisitos: anterior ? [anterior] : [],
          atividades_modelo:
            ti === 0 && pi === 0
              ? [
                  { titulo: '[Demo] Assistir à aula indicada pela mentora e anotar 3 aprendizados' },
                  { titulo: '[Demo] Registrar uma decisão que você vinha adiando e o primeiro passo dado' },
                  { titulo: '[Demo] Organizar a agenda da próxima semana com blocos para a empresa' },
                ]
              : [{ titulo: `[Demo] Atividade de exemplo do pilar ${nomeP}` }],
        })
        etapas[`${ti}-${pi}`] = e.id
        anterior = e.id
      }
    }

    /* ---------- Modelos de pacote (FICTÍCIOS) ---------- */
    const pacote4 = (await api.post('/pacotes', {
      programa_id: programa,
      nome: 'Modelo demonstrativo · 4 meses',
      descricao: 'Quantidades fictícias apenas para demonstração. Não representam condição oficial.',
      duracao_meses: 4,
      itens: [
        { tipo_id: tipo.rota, descricao: 'Rota inicial com o time de Sucesso do Cliente', quantidade: 1, profissional_id: prof.cs, duracao_min: 60, origem: 'pacote' },
        { tipo_id: tipo.plano, descricao: 'Plano individual com Jaciara (1:1)', quantidade: 2, profissional_id: prof.jaciara, duracao_min: 60, origem: 'pacote' },
        { tipo_id: tipo.tutoria, descricao: 'Tutoria', quantidade: 2, profissional_id: prof.tutoria, duracao_min: 45, origem: 'pacote' },
      ],
    })).id
    const pacote6 = (await api.post('/pacotes', {
      programa_id: programa,
      nome: 'Modelo demonstrativo · 6 meses',
      descricao: 'Quantidades fictícias apenas para demonstração.',
      duracao_meses: 6,
      itens: [
        { tipo_id: tipo.rota, descricao: 'Rota inicial com o time de Sucesso do Cliente', quantidade: 1, profissional_id: prof.cs, duracao_min: 60, origem: 'pacote' },
        { tipo_id: tipo.modelo, descricao: 'Análise de modelo de negócio', quantidade: 1, profissional_id: prof.thallyta, duracao_min: 60, origem: 'pacote' },
        { tipo_id: tipo.tutoria, descricao: 'Tutoria', quantidade: 4, profissional_id: prof.tutoria, duracao_min: 45, origem: 'pacote' },
      ],
    })).id
    const pacote12 = (await api.post('/pacotes', {
      programa_id: programa,
      nome: 'Modelo demonstrativo · 12 meses',
      descricao: 'Quantidades fictícias. Note que tem a mesma quantidade de tutorias do modelo de 6 meses (RN02).',
      duracao_meses: 12,
      itens: [
        { tipo_id: tipo.plano, descricao: 'Plano individual com Jaciara (1:1)', quantidade: 5, profissional_id: prof.jaciara, duracao_min: 60, origem: 'pacote' },
        { tipo_id: tipo.tutoria, descricao: 'Tutoria', quantidade: 4, profissional_id: prof.tutoria, duracao_min: 45, origem: 'pacote' },
      ],
    })).id

    /* ---------- Disponibilidade (semanas do mês atual e do próximo) ---------- */
    const segunda = inicioDaSemana(`${mes}-01`)
    const jaciaraInt: { inicio: string; fim: string }[] = []
    const tutoriaInt: { inicio: string; fim: string }[] = []
    const csInt: { inicio: string; fim: string }[] = []
    for (let s = 0; s < 9; s++) {
      const seg = somarDias(segunda, s * 7)
      jaciaraInt.push({ inicio: `${somarDias(seg, 2)}T14:00`, fim: `${somarDias(seg, 2)}T16:00` }) // quartas, 2 h
      tutoriaInt.push({ inicio: `${somarDias(seg, 1)}T09:00`, fim: `${somarDias(seg, 1)}T11:00` }) // terças
      tutoriaInt.push({ inicio: `${somarDias(seg, 3)}T15:00`, fim: `${somarDias(seg, 3)}T16:30` }) // quintas
      csInt.push({ inicio: `${somarDias(seg, 0)}T10:00`, fim: `${somarDias(seg, 0)}T12:00` })
    }
    await api.post('/disponibilidades', { profissional_id: prof.jaciara, intervalos: jaciaraInt, observacao: 'Demonstração' })
    await api.post('/disponibilidades', { profissional_id: prof.tutoria, intervalos: tutoriaInt, observacao: 'Demonstração' })
    await api.post('/disponibilidades', { profissional_id: prof.cs, intervalos: csInt, observacao: 'Demonstração' })
    const proximaSlot = (lista: { inicio: string }[], aPartirDe: string) => lista.find((i) => i.inicio.slice(0, 10) >= aPartirDe)!.inicio
    const slotDoMes = (lista: { inicio: string }[]) => lista.find((i) => i.inicio.slice(0, 7) === mes && i.inicio.slice(0, 10) >= h)?.inicio ?? proximaSlot(lista, h)

    /* ---------- Helpers ---------- */
    const novaAluna = async (nome: string, email: string, matricula: Record<string, unknown>) => {
      const r = await api.post('/pessoas', { nome, email, telefone: '(00) 00000-0000', matricula: { programa_id: programa, ...matricula } })
      await db.run('UPDATE ped_alunas SET demonstracao = 1, fonte = ? WHERE id = ?', 'demonstração', r.id)
      await db.run('UPDATE ped_matriculas SET demonstracao = 1 WHERE pessoa_id = ?', r.id)
      // Acesso ao Portal: em produção vem do convite do backoffice; aqui a conta de cliente é criada direto.
      CONTAS[email] = await amb.criarAcessoPortal(email, r.id)
      return r
    }
    const ficha = (pid: string) => api.get(`/pessoas/${pid}`)
    const ocorr = (f: Ficha, mid: string, desc: string) => {
      const m = f.matriculas.find((x) => x.id === mid)!
      const item = m.itens.find((i) => i.descricao.startsWith(desc))!
      return { item: item.id, ocorrencias: m.ocorrencias.filter((o) => o.item_id === item.id).sort((a, b) => a.numero - b.numero).map((o) => o.id) }
    }
    const prever = (item: string, ids: string[], datas: (string | null)[]) =>
      api.put(`/itens/${item}/previsoes`, { previsoes: ids.map((id, n) => ({ ocorrencia_id: id, data_prevista: datas[n] ?? null })) })
    const realizar = (id: string, data: string, resumo: string) =>
      api.post(`/ocorrencias/${id}/realizar`, { data_realizada: data, resumo_compartilhavel: resumo, notas_internas: 'Nota interna de demonstração (não aparece para a aluna).' })
    const onboarding = (mid: string, data: string | null, situacao = 'realizado') =>
      api.put(`/matriculas/${mid}/onboarding`, {
        onboarding_situacao: situacao,
        onboarding_data: data,
        onboarding_responsavel_id: suporte,
        onboarding_checklist: [
          { item: 'Alinhamento de expectativas', feito: situacao === 'realizado' },
          { item: 'Apresentação do Método AGE e das trilhas', feito: situacao === 'realizado' },
          { item: 'Acesso à plataforma de aulas', feito: situacao === 'realizado' },
          { item: 'Entrada nos grupos de WhatsApp', feito: false },
        ],
        onboarding_pendencias: situacao === 'realizado' ? 'Confirmar entrada no grupo individual.' : null,
        proximo_passo: 'Assistir à primeira aula indicada e preparar dúvidas para o 1:1.',
      })
    const jornada = async (mid: string, trilha: number, pilar: number) => {
      await api.post(`/matriculas/${mid}/jornada`, { trilha_id: trilhas[trilha], pilar_id: pilares[pilar], diagnostico_operacional: 'Diagnóstico operacional de demonstração.', liberar_etapas: [etapas[`${trilha}-0`]] })
      return api.get(`/matriculas/${mid}/jornada`)
    }

    /* ---------- 1. Contrato de 4 meses, com bônus e reagendamento ---------- */
    const a1 = await novaAluna('Beatriz Demo Alves', 'beatriz@demo.local', {
      data_inicio: somarDias(h, -50),
      data_fim: somarMeses(somarDias(h, -50), 4),
      pacote_id: pacote4,
      contrato_situacao: 'assinado',
      fonte_comercial: 'Proposta comercial (demonstração)',
      condicoes_comerciais: 'Condições fictícias de demonstração.',
      responsavel_id: suporte,
      mentora_id: prof.tutoria,
      itens_extras: [{ tipo_id: tipo.juridico, descricao: 'Diagnóstico jurídico (bônus)', quantidade: 1, profissional_id: prof.jaciara, duracao_min: 45, origem: 'bonus', referencia_comercial: 'Bônus concedido na negociação (demonstração)' }],
    })
    await api.post(`/matriculas/${a1.matricula_id}/conferencia`, { conferida: true })
    await onboarding(a1.matricula_id, somarDias(h, -48))
    const f1 = await ficha(a1.id)
    const r1 = ocorr(f1, a1.matricula_id, 'Rota inicial')
    await prever(r1.item, r1.ocorrencias, [somarDias(h, -45)])
    await realizar(r1.ocorrencias[0], somarDias(h, -44), 'Rota inicial feita: definimos prioridades para os primeiros 30 dias.')
    const p1 = ocorr(f1, a1.matricula_id, 'Plano individual')
    await prever(p1.item, p1.ocorrencias, [noMes(3), somarDias(h, 50)])
    const slotA = slotDoMes(jaciaraInt)
    await api.post(`/ocorrencias/${p1.ocorrencias[0]}/agendar`, { inicio: slotA })
    const slotB = jaciaraInt.find((i) => i.inicio > slotA)!.inicio
    await api.post(`/ocorrencias/${p1.ocorrencias[0]}/reagendar`, { inicio: slotB, motivo: 'Aluna pediu para trocar por compromisso com cliente (demonstração).' })
    const t1 = ocorr(f1, a1.matricula_id, 'Tutoria')
    await prever(t1.item, t1.ocorrencias, [somarDias(h, 10), somarDias(h, 40)])
    const j1 = ocorr(f1, a1.matricula_id, 'Diagnóstico jurídico')
    await prever(j1.item, j1.ocorrencias, [somarDias(h, 30)])
    const jor1 = await jornada(a1.matricula_id, 0, 0)
    const at1 = jor1.etapas.find((e: { etapa_id: string }) => e.etapa_id === etapas['0-0'])!.atividades
    await api.post(`/atividades/${at1[0].id}/evidencias`, { texto: 'Aluna relatou os aprendizados no grupo individual (registrado pela equipe).', data_execucao: somarDias(h, -20) })
    await api.post(`/atividades/${at1[0].id}/validar`, { decisao: 'validada', comentario: 'Bom registro.' })
    const aluna1 = await amb.entrar(CONTAS['beatriz@demo.local'], 'portal')
    await aluna1.post(`/portal/atividades/${at1[1].id}/evidencias`, { texto: 'Decidi contratar uma assistente e já publiquei a vaga. (demonstração)' })
    const c1 = await api.post(`/matriculas/${a1.matricula_id}/conquistas`, {
      titulo: 'Conduzi minha primeira reunião de equipe',
      situacao_anterior: 'Resolvia tudo sozinha e não fazia reuniões.',
      acao_aplicada: 'Preparou pauta curta e conduziu reunião de 30 minutos.',
      evidencia: 'Pauta compartilhada no grupo individual.',
      resultado_percebido: 'Equipe saiu com tarefas claras para a semana.',
      data: somarDias(h, -10),
    })
    await api.post(`/conquistas/${c1.id}/validar`, { validada: true, visivel_aluna: true })
    await api.post('/contatos', { matricula_id: a1.matricula_id, ocorrencia_id: p1.ocorrencias[0], data: somarDias(h, -2), canal: 'whatsapp', resumo: 'Confirmado novo horário.', resultado: 'agendou' })

    /* ---------- 2. Contrato de 6 meses, encontros iniciais realizados ---------- */
    const a2 = await novaAluna('Carla Demo Souza', 'carla@demo.local', {
      data_inicio: somarDias(h, -95),
      data_fim: somarMeses(somarDias(h, -95), 6),
      pacote_id: pacote6,
      contrato_situacao: 'assinado',
      fonte_comercial: 'Contrato assinado (demonstração)',
      responsavel_id: suporte,
      mentora_id: prof.tutoria,
      itens_extras: [{ tipo_id: tipo.posicionamento, descricao: 'Análise de posicionamento', quantidade: 1, profissional_id: prof.tamires, duracao_min: null, origem: 'bonus', referencia_comercial: 'Bônus (demonstração) — duração ainda não informada' }],
    })
    await api.post(`/matriculas/${a2.matricula_id}/conferencia`, { conferida: true })
    await onboarding(a2.matricula_id, somarDias(h, -93))
    const f2 = await ficha(a2.id)
    const r2 = ocorr(f2, a2.matricula_id, 'Rota inicial')
    await prever(r2.item, r2.ocorrencias, [somarDias(h, -90)])
    await realizar(r2.ocorrencias[0], somarDias(h, -90), 'Rota inicial concluída.')
    const m2 = ocorr(f2, a2.matricula_id, 'Análise de modelo')
    await prever(m2.item, m2.ocorrencias, [somarDias(h, -70)])
    await realizar(m2.ocorrencias[0], somarDias(h, -66), 'Mapeamos as fontes de receita e o produto principal.')
    const t2 = ocorr(f2, a2.matricula_id, 'Tutoria')
    await prever(t2.item, t2.ocorrencias, [somarDias(h, -50), somarDias(h, -20), noMes(5), somarDias(h, 45)])
    await realizar(t2.ocorrencias[0], somarDias(h, -49), 'Tutoria de pessoas: rotina de reunião semanal.')
    // Entrega vencida com impedimento, responsável e próxima tentativa
    await api.post(`/ocorrencias/${t2.ocorrencias[1]}/impedimentos`, { motivo_id: motivos.aluna, descricao: 'Enviamos 3 opções de horário.', responsavel_id: suporte })
    await api.post('/contatos', { matricula_id: a2.matricula_id, ocorrencia_id: t2.ocorrencias[1], data: somarDias(h, -6), canal: 'whatsapp', resumo: 'Enviadas opções de horário para a tutoria 2.', resultado: 'sem_resposta', proxima_acao: 'Ligar para a aluna', proxima_tentativa: somarDias(h, -1) })
    // Entrega aguardando agenda (disponibilidade da mentora)
    await api.put(`/ocorrencias/${t2.ocorrencias[2]}/situacao`, { situacao: 'aguardando_agenda', responsavel_resolucao_id: coord })
    await api.post(`/ocorrencias/${t2.ocorrencias[2]}/impedimentos`, { motivo_id: motivos.mentora, responsavel_id: coord })
    // Item sem duração, com previsão no mês (dados ausentes)
    const pos2 = ocorr(f2, a2.matricula_id, 'Análise de posicionamento')
    await prever(pos2.item, pos2.ocorrencias, [noMes(8)])
    await jornada(a2.matricula_id, 0, 1)

    /* ---------- 3. Contrato de 12 meses, com entregas futuras ---------- */
    const a3 = await novaAluna('Daniela Demo Costa', 'daniela@demo.local', {
      data_inicio: somarDias(h, -12),
      data_fim: somarMeses(somarDias(h, -12), 12),
      pacote_id: pacote12,
      contrato_situacao: 'assinado',
      fonte_comercial: 'Contrato assinado (demonstração)',
      responsavel_id: suporte,
      mentora_id: prof.jaciara,
    })
    await onboarding(a3.matricula_id, somarDias(h, 4), 'agendado')
    const f3 = await ficha(a3.id)
    const p3 = ocorr(f3, a3.matricula_id, 'Plano individual')
    // Distribuição manual (RN10): não é "um a cada 2,4 meses" automático.
    await prever(p3.item, p3.ocorrencias, [somarDias(h, 20), somarDias(h, 75), somarDias(h, 150), somarDias(h, 240), somarDias(h, 330)])
    // Tutorias ficam sem previsão para demonstrar "Sem previsão".

    /* ---------- 4. Renovação vinculada a uma matrícula anterior ---------- */
    const a4 = await novaAluna('Elisa Demo Martins', 'elisa@demo.local', {
      data_inicio: somarMeses(somarDias(h, -60), -12),
      data_fim: somarDias(h, -60),
      pacote_id: pacote12,
      contrato_situacao: 'assinado',
      fonte_comercial: 'Contrato do 1º ciclo (demonstração)',
      responsavel_id: suporte,
    })
    let f4 = await ficha(a4.id)
    const p4 = ocorr(f4, a4.matricula_id, 'Plano individual')
    const datasAnt = [-400, -330, -250, -170, -90].map((d) => somarDias(h, d))
    await prever(p4.item, p4.ocorrencias, datasAnt)
    for (const [n, id] of p4.ocorrencias.slice(0, 4).entries()) await realizar(id, datasAnt[n], `Encontro ${n + 1} do primeiro ciclo.`)
    const t4 = ocorr(f4, a4.matricula_id, 'Tutoria')
    await prever(t4.item, t4.ocorrencias, [-380, -300, -220, -120].map((d) => somarDias(h, d)))
    for (const id of t4.ocorrencias) await realizar(id, somarDias(h, -120), 'Tutoria realizada.')
    await api.post(`/matriculas/${a4.matricula_id}/finalizar`, { tipo: 'encerrada', data: somarDias(h, -60), motivo: 'Fim da vigência; aluna renovou.' })
    await api.put(`/matriculas/${a4.matricula_id}/continuidade`, { interesse_renovacao: 'sim' })
    const ren = await api.post('/matriculas', {
      pessoa_id: a4.id,
      programa_id: programa,
      matricula_anterior_id: a4.matricula_id,
      data_inicio: somarDias(h, -55),
      data_fim: somarMeses(somarDias(h, -55), 6),
      pacote_id: pacote6,
      contrato_situacao: 'assinado',
      fonte_comercial: 'Contrato de renovação (demonstração)',
      responsavel_id: suporte,
      mentora_id: prof.tutoria,
    })
    await db.run('UPDATE ped_matriculas SET demonstracao = 1 WHERE id = ?', ren.id)
    await api.post(`/matriculas/${ren.id}/conferencia`, { conferida: true })
    // Transferência explícita da pendência (1 plano individual) para o novo ciclo
    const transf = await api.post(`/matriculas/${ren.id}/transferencias`, { item_origem_id: p4.item, quantidade: 1, motivo: 'Encontro 5 do 1º ciclo não realizado; transferido na renovação conforme decisão da coordenação (demonstração).' })
    f4 = await ficha(a4.id)
    const transfOc = f4.matriculas.find((m: { id: string }) => m.id === ren.id)!.ocorrencias.find((o: { item_id: string }) => o.item_id === transf.id)!.id
    await api.put(`/itens/${transf.id}/previsoes`, { previsoes: [{ ocorrencia_id: transfOc, data_prevista: noMes(6) }] })
    const slotJ = jaciaraInt.find((i) => i.inicio.slice(0, 10) >= h && i.inicio !== slotA && i.inicio !== slotB)!.inicio
    await api.post(`/ocorrencias/${transfOc}/agendar`, { inicio: slotJ })
    const f4b = ocorr(f4, ren.id, 'Rota inicial')
    await prever(f4b.item, f4b.ocorrencias, [somarDias(h, -50)])
    await realizar(f4b.ocorrencias[0], somarDias(h, -50), 'Rota do novo ciclo.')
    await api.post(`/matriculas/${ren.id}/feedbacks`, { data: somarDias(h, -50), feedback: 'Aluna satisfeita com o 1º ciclo e motivada para a fase de gestão.', acao_acompanhamento: 'Acompanhar implantação de indicadores.' })
    const jor4 = await jornada(ren.id, 1, 1)
    void jor4

    /* ---------- 5. Matrícula pausada com decisão de prazos pendente ---------- */
    const a5 = await novaAluna('Fernanda Demo Rocha', 'fernanda@demo.local', {
      data_inicio: somarDias(h, -100),
      data_fim: somarMeses(somarDias(h, -100), 6),
      pacote_id: pacote6,
      contrato_situacao: 'assinado',
      fonte_comercial: 'Contrato assinado (demonstração)',
      responsavel_id: suporte,
    })
    const f5 = await ficha(a5.id)
    const t5 = ocorr(f5, a5.matricula_id, 'Tutoria')
    await prever(t5.item, t5.ocorrencias, [somarDias(h, -60), somarDias(h, -15), somarDias(h, 20), somarDias(h, 50)])
    await realizar(t5.ocorrencias[0], somarDias(h, -58), 'Tutoria 1.')
    await api.post(`/matriculas/${a5.matricula_id}/pausas`, { inicio: somarDias(h, -20), motivo: 'Afastamento temporário informado pela aluna (motivo operacional mínimo).' })

    /* ---------- 6. Onboarding realizado e contrato pendente ---------- */
    const a6 = await novaAluna('Gabriela Demo Nunes', 'gabriela@demo.local', {
      data_inicio: somarDias(h, -5),
      data_fim: somarMeses(somarDias(h, -5), 4),
      pacote_id: pacote4,
      contrato_situacao: 'pendente',
      fonte_comercial: 'Venda registrada no checkout (demonstração)',
      responsavel_id: suporte,
    })
    await onboarding(a6.matricula_id, somarDias(h, -3))
    const f6 = await ficha(a6.id)
    const r6 = ocorr(f6, a6.matricula_id, 'Rota inicial')
    await prever(r6.item, r6.ocorrencias, [somarDias(h, 2)])
    await api.put(`/ocorrencias/${r6.ocorrencias[0]}/situacao`, { situacao: 'disponivel_agendar', responsavel_resolucao_id: suporte })
    await api.post(`/ocorrencias/${r6.ocorrencias[0]}/agendar`, { inicio: proximaSlot(csInt, h) })

    /* ---------- Portal da aluna: turmas, frases, links, diagnóstico e metas (tudo de demonstração) ---------- */
    const turmaA = (await api.post('/catalogos/turmas', { nome: 'Turma Demo A', descricao: 'Turma de demonstração.', data_inicio: somarDias(h, -100) })).id
    const turmaB = (await api.post('/catalogos/turmas', { nome: 'Turma Demo B', descricao: 'Turma de demonstração.', data_inicio: somarDias(h, -12) })).id
    await db.run('UPDATE ped_matriculas SET turma_id = CASE WHEN data_inicio < ? THEN ? ELSE ? END', somarDias(h, -30), turmaA, turmaB)
    await db.run("UPDATE ped_matriculas SET data_boas_vindas = onboarding_data WHERE onboarding_situacao = 'realizado'")
    await db.run("UPDATE ped_alunas SET instagram = (SELECT '@' || lower(substr(p.nome, 1, instr(p.nome, ' ') - 1)) || '.demo' FROM pessoa p WHERE p.id = ped_alunas.id) WHERE demonstracao = 1")
    for (const texto of [
      'Feito é melhor que perfeito. (frase de demonstração)',
      'Um passo por dia ainda é um passo. (frase de demonstração)',
      'Clareza vem da ação, não do pensamento. (frase de demonstração)',
    ])
      await api.post('/catalogos/frases', { texto })
    for (const [titulo, categoria, destaque, ordem] of [
      ['[Demo] WhatsApp do Sucesso do Cliente', 'Suporte', true, 1],
      ['[Demo] Grupo de avisos', 'Comunidade', true, 2],
      ['[Demo] Agendar mentoria', 'Suporte', true, 3],
      ['[Demo] Área de membros', 'Aulas', false, 1],
    ] as const)
      await api.post('/catalogos/links', { titulo, url: `https://example.com/${ordem}-${categoria.toLowerCase()}`, categoria, destaque_inicio: destaque, ordem, descricao: 'Link de demonstração: troque em Configurações.' })
    await aluna1.put('/portal/diagnostico/inicio/situacao', {
      respostas: { negocio: 'Loja de roupas com 2 funcionárias (demonstração).', numeros: 'Faturamento médio de R$ 30 mil por mês (demonstração).', funciona: 'Clientes fiéis e boa vitrine.' },
    })
    await aluna1.put('/portal/diagnostico/inicio/objetivos', { respostas: { onde_chegar: 'Ter a loja funcionando sem depender de mim todos os dias.', prioridade: 'Montar uma rotina de gestão semanal.' } })
    await aluna1.post('/portal/metas', { nome: '[Demo] Faturamento mensal', unidade: 'R$', valor_inicial: 30000, valor_alvo: 45000, valor_atual: 34000 })
    await aluna1.post('/portal/metas', { nome: '[Demo] Reuniões de equipe por mês', unidade: 'reuniões', valor_inicial: 0, valor_alvo: 4, valor_atual: 1 })

    /* ---------- Administrativo: estado das alunas, segmentos, canais e categorias (tudo de demonstração) ---------- */
    const opcao = async (lista: string, codigo: string) => ((await db.get('SELECT id FROM ped_opcoes_lista WHERE lista = ? AND codigo = ?', lista, codigo)) as { id: string }).id
    const segmentos: string[] = []
    for (const nome of ['Moda e varejo (demo)', 'Saúde e estética (demo)', 'Serviços (demo)'])
      segmentos.push((await api.post('/catalogos/segmentos', { nome })).id)
    const canais: string[] = []
    for (const nome of ['Indicação (demo)', 'Instagram (demo)', 'Evento presencial (demo)'])
      canais.push((await api.post('/catalogos/canais-venda', { nome })).id)
    const demoPessoas = (await db.all('SELECT id, nome FROM ped_pessoas WHERE demonstracao = 1 ORDER BY codigo')) as { id: string; nome: string }[]
    const estados: [string, string, boolean, string | null][] = [
      ['saudavel', 'alto', false, suporte],
      ['atencao', 'medio', true, suporte],
      ['saudavel', 'medio', false, suporte],
      ['critico', 'baixo', true, suporte],
      ['atencao', 'baixo', false, suporte],
      ['saudavel', 'alto', false, null], // exemplo de aluna ainda sem responsável
    ]
    for (const [n, p] of demoPessoas.entries()) {
      const [saude, eng, risco, resp] = estados[n % estados.length]
      await db.run('UPDATE ped_alunas SET empresa = ?, segmento_id = ?, subsegmento = ?, saude_id = ?, engajamento_id = ?, em_risco = ?, responsavel_id = ? WHERE id = ?', `[Demo] Negócio de ${p.nome.split(' ')[0]}`, segmentos[n % 3], n % 2 ? 'Loja física' : 'Atendimento online', await opcao('saude', saude), await opcao('engajamento', eng), risco ? 1 : 0, resp, p.id)
      await db.run('UPDATE ped_matriculas SET canal_venda_id = ? WHERE pessoa_id = ?', canais[n % 3], p.id)
    }

    /* ---------- Avisos escritos pela equipe (demonstração) ---------- */
    const beatrizId = demoPessoas[0].id
    await api.post('/avisos', { publico: 'aluna', pessoa_id: beatrizId, titulo: '[Demo] Sua próxima mentoria está chegando', detalhe: 'Separe suas dúvidas sobre a rotina de gestão.', link: '#/mentorias' })
    await api.post('/avisos', { publico: 'ativas', titulo: '[Demo] Atualize seus indicadores', detalhe: 'Toda segunda-feira, reserve 5 minutos para atualizar suas metas.', link: '#/diagnostico', inicio: `${somarDias(h, 7 - ((new Date(h + 'T12:00:00Z').getUTCDay() + 6) % 7))}T09:00`, recorrencia: 'semanal' })

    /* ---------- Decisões pendentes ---------- */
    for (const [questao, impacto, responsavel] of [
      ['Qual é a numeração/ordem oficial das trilhas (Diamantes em Ação, Diamante no Jogo, Diamante que Age)?', 'Ordem exibida na jornada e no portal da aluna.', 'Coordenação pedagógica'],
      ['Os pilares (Ação → Gestão → Escala) devem ser pré-requisitos em sequência dentro de cada trilha?', 'Define os cadeados das etapas. Na demonstração, a sequência foi usada como hipótese.', 'Coordenação pedagógica'],
      ['Quais são as aulas, atividades e critérios oficiais de conclusão de cada etapa?', 'Hoje as etapas têm atividades de exemplo marcadas como [Demo].', 'Coordenação pedagógica'],
      ['Quais são as quantidades e durações oficiais de cada entregável por pacote?', 'Modelos de pacote e cálculo de horas por profissional.', 'Comercial + Coordenação'],
      ['O contrato precisa estar assinado antes do onboarding?', 'Hoje os dois são controlados separadamente, sem ordem obrigatória (RN14).', 'Administração'],
      ['Qual é a regra de prazo individual por etapa (atraso pedagógico)?', 'Sem prazo definido o sistema mostra "Sem prazo definido" (RN15).', 'Coordenação pedagógica'],
      ['Como tratar a pausa na vigência: estender sempre, nunca ou caso a caso?', 'Hoje a decisão é registrada caso a caso (RN12).', 'Coordenação pedagógica'],
      ['Os encontros em grupo (Destraves) devem ser controlados por aluna?', 'Hoje estão cadastrados como tipo não individual, fora do cálculo de horas.', 'Coordenação pedagógica'],
      ['Haverá autoagendamento pela aluna em fase posterior?', 'No piloto, a equipe agenda (RF05).', 'Administração'],
      ['Por quanto tempo guardar dados de alunas encerradas e quem pode exportá-los?', 'Privacidade (LGPD) e política de retenção.', 'Administração'],
    ])
      await api.post('/decisoes', { questao, impacto, responsavel })
  }
}
