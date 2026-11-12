import { z } from 'zod'
import { enfileirarEnvios, instrucoesEnvio, type CanalAviso } from './avisosExternos'
import { agoraIso, novoId, type BD, type BDouTX } from './db'
import { ErroHttp, tem } from './auth'
import type { Req } from './http'
import { agoraSP, dataValida, horarioValido, hojeSP, somarDias, somarMeses } from '../shared/datas'
import { codigoStatusPelaMatricula } from '../shared/listas'

/* ---------------- Validação ---------------- */

export function validar<T extends z.ZodType>(schema: T, dados: unknown): z.infer<T> {
  const r = schema.safeParse(dados)
  if (!r.success) {
    const primeiro = r.error.issues[0]
    const campo = primeiro?.path.join('.')
    throw new ErroHttp(400, primeiro?.message ? `${primeiro.message}${campo ? ` (${campo})` : ''}` : 'Dados inválidos.', r.error.issues)
  }
  return r.data
}

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

/** Aceita true/false e também 1/0 (como vem do banco). */
export const booleano = () => z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => !!v)

export const texto = (max = 2000) => z.preprocess(vazioParaNulo, z.string().trim().max(max).nullable().optional())
export const textoObrig = (rotulo: string, max = 500) =>
  z.string({ error: `Informe ${rotulo}.` }).trim().min(1, `Informe ${rotulo}.`).max(max)
export const data = (rotulo = 'a data') =>
  z.preprocess(
    vazioParaNulo,
    z
      .string()
      .refine(dataValida, `Data inválida: ${rotulo}. Use DD/MM/AAAA.`)
      .nullable()
      .optional(),
  )
export const dataObrig = (rotulo = 'a data') =>
  z.string({ error: `Informe ${rotulo}.` }).refine(dataValida, `Informe ${rotulo} válida.`)
export const horarioObrig = (rotulo = 'o horário') =>
  z.string({ error: `Informe ${rotulo}.` }).refine(horarioValido, `Informe ${rotulo} válido.`)
export const id = () => z.preprocess(vazioParaNulo, z.string().uuid().nullable().optional())
export const idObrig = (rotulo: string) => z.string({ error: `Selecione ${rotulo}.` }).uuid(`Selecione ${rotulo}.`)
export const minutos = () =>
  z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number().int('Duração em minutos inteiros.').positive('A duração precisa ser maior que zero.').max(24 * 60).nullable(),
  )
export const link = () =>
  z.preprocess(
    vazioParaNulo,
    z
      .string()
      .trim()
      .max(1000)
      .refine((v) => {
        try {
          const u = new URL(v)
          return u.protocol === 'https:' || u.protocol === 'http:'
        } catch {
          return false
        }
      }, 'Link inválido. Use um endereço começando com https://')
      .nullable()
      .optional(),
  )

/* ---------------- Auditoria ---------------- */

export async function auditar(
  db: BDouTX,
  req: Req,
  ev: { entidade: string; entidade_id: string; acao: string; matricula_id?: string | null; pessoa_id?: string | null; dados?: unknown },
) {
  // A pessoa sai da matrícula no próprio SQL: funciona também dentro de uma transação (matrícula recém-criada).
  await db.run(`INSERT INTO ped_auditoria (id, entidade, entidade_id, acao, pessoa_id, matricula_id, dados, autor_id, criado_em)
     VALUES (?,?,?,?, COALESCE(?, (SELECT pessoa_id FROM ped_matriculas WHERE id = ?)), ?,?,?,?)`, novoId(), ev.entidade, ev.entidade_id, ev.acao, ev.pessoa_id ?? null, ev.matricula_id ?? null, ev.matricula_id ?? null, ev.dados === undefined ? null : JSON.stringify(ev.dados), req.usuario?.id ?? null, agoraIso())
}

/* ---------------- Escopo de acesso ---------------- */

/**
 * Condição SQL para as matrículas que o usuário pode ver.
 * Mentora: somente as matrículas em que é mentora responsável ou profissional de algum item/ocorrência.
 */
export function escopoMatriculas(req: Req, alias = 'm'): { sql: string; params: Record<string, unknown> } {
  const u = req.usuario!
  if (u.perfil === 'mentora') {
    return {
      sql: `${alias}.id IN (
        SELECT id FROM ped_matriculas WHERE mentora_id = @escopo_prof
        UNION SELECT matricula_id FROM ped_itens_contratados WHERE profissional_id = @escopo_prof
        UNION SELECT matricula_id FROM ped_ocorrencias WHERE profissional_id = @escopo_prof)`,
      params: { escopo_prof: u.profissional_id ?? '__nenhum__' },
    }
  }
  // Sem "ver todas", o perfil (ex.: Suporte/CS) vê só a própria carteira: alunas em que é a responsável.
  if (!tem(req, 'alunas:todas')) {
    return {
      sql: `${alias}.pessoa_id IN (SELECT id FROM ped_pessoas WHERE responsavel_id = @escopo_usuario)`,
      params: { escopo_usuario: u.id },
    }
  }
  return { sql: '1=1', params: {} }
}

export async function exigirAcessoMatricula(db: BDouTX, req: Req, matriculaId: string) {
  const esc = escopoMatriculas(req)
  const m = (await db.get(`SELECT m.* FROM ped_matriculas m WHERE m.id = @id AND ${esc.sql}`, { id: matriculaId, ...esc.params })) as
    | Record<string, unknown>
    | undefined
  if (!m) throw new ErroHttp(404, 'Matrícula não encontrada ou sem acesso.')
  return m as Matricula
}

export interface Matricula {
  id: string
  pessoa_id: string
  situacao: 'ativa' | 'pausada' | 'encerrada' | 'cancelada'
  data_inicio: string | null
  data_fim: string | null
  matricula_anterior_id: string | null
  [k: string]: unknown
}

/* ---------------- Itens e ocorrências ---------------- */

export async function resumoItem(db: BDouTX, itemId: string) {
  return (await db.get(`SELECT i.quantidade + COALESCE((SELECT SUM(delta) FROM ped_ajustes_obrigacao a WHERE a.item_id = i.id), 0) AS contratada,
              (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.item_id = i.id AND o.situacao = 'realizada') AS realizadas,
              (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.item_id = i.id AND o.situacao <> 'cancelada') AS ativas
       FROM ped_itens_contratados i WHERE i.id = ?`, itemId)) as { contratada: number; realizadas: number; ativas: number }
}

/**
 * Mantém a regra: nº de ocorrências não canceladas = quantidade contratada (+ ajustes).
 * Faltando, cria ocorrências sem previsão. Sobrando, cancela as abertas sem agendamento
 * (as últimas primeiro) com o motivo informado. Nunca toca em ocorrências realizadas ou agendadas.
 */
export async function sincronizarOcorrencias(
  db: BDouTX,
  req: Req,
  itemId: string,
  motivo: string,
  /**
   * Dentro de uma transação as leituras não enxergam o que ainda vai ser gravado. Informe aqui o que está
   * pendente: `novo` para um item que está sendo criado agora, `delta` para um ajuste de quantidade ainda não gravado.
   */
  pendente?: { novo?: { matricula_id: string; quantidade: number }; delta?: number },
) {
  let matriculaId: string, contratada: number, ativas: number, maxNum: number
  if (pendente?.novo) {
    matriculaId = pendente.novo.matricula_id
    contratada = pendente.novo.quantidade
    ativas = 0
    maxNum = 0
  } else {
    const item = (await db.get('SELECT matricula_id FROM ped_itens_contratados WHERE id = ?', itemId)) as { matricula_id: string } | undefined
    if (!item) throw new ErroHttp(404, 'Item não encontrado.')
    const r = await resumoItem(db, itemId)
    matriculaId = item.matricula_id
    contratada = r.contratada
    ativas = r.ativas
    maxNum = ((await db.get('SELECT COALESCE(MAX(numero),0) n FROM ped_ocorrencias WHERE item_id = ?', itemId)) as { n: number }).n
  }
  contratada += pendente?.delta ?? 0
  const agora = agoraIso()
  if (ativas < contratada) {
    for (let k = 1; k <= contratada - ativas; k++)
      await db.run(
        `INSERT INTO ped_ocorrencias (id, item_id, matricula_id, numero, situacao, criado_em, atualizado_em, autor_id)
         VALUES (?,?,?,?, 'prevista', ?, ?, ?)`,
        novoId(), itemId, matriculaId, maxNum + k, agora, agora, req.usuario?.id ?? null,
      )
  } else if (ativas > contratada) {
    const excesso = ativas - contratada
    const candidatas = (await db.all(`SELECT id FROM ped_ocorrencias WHERE item_id = ? AND situacao NOT IN ('realizada','cancelada','agendada')
         ORDER BY (data_prevista IS NULL) DESC, numero DESC LIMIT ?`, itemId, excesso)) as { id: string }[]
    if (candidatas.length < excesso) {
      throw new ErroHttp(
        409,
        'Não é possível reduzir: as ocorrências restantes já estão agendadas ou realizadas. Desmarque um agendamento antes.',
      )
    }
    for (const c of candidatas) {
      await db.run(`UPDATE ped_ocorrencias SET situacao = 'cancelada', cancelamento_motivo = ?, atualizado_em = ? WHERE id = ?`, motivo, agora, c.id)
      await historico(db, req, c.id, 'cancelada', null, null, motivo)
    }
  }
}

export async function historico(
  db: BDouTX,
  req: Req,
  ocorrenciaId: string,
  tipo: string,
  anterior: string | null,
  novo: string | null,
  motivo: string | null,
) {
  // A previsão original vem no próprio SQL: dentro de uma transação ela enxerga as gravações anteriores do lote.
  await db.run(`INSERT INTO ped_ocorrencia_historico (id, ocorrencia_id, tipo, valor_anterior, valor_novo, previsao_original, motivo, autor_id, criado_em)
     VALUES (?,?,?,?,?, (SELECT COALESCE(data_prevista_original, data_prevista) FROM ped_ocorrencias WHERE id = ?), ?,?,?)`, novoId(), ocorrenciaId, tipo, anterior, novo, ocorrenciaId, motivo, req.usuario?.id ?? null, agoraIso())
}

/** Consulta de ocorrências com tudo o que o painel precisa, sem multiplicar linhas por contatos. */
export const SQL_OCORRENCIAS = `
SELECT o.*,
  i.descricao AS item_descricao, i.tipo_id, t.nome AS tipo_nome, i.origem AS item_origem, i.especialidade,
  COALESCE(o.duracao_min, i.duracao_min, t.duracao_padrao_min) AS duracao_efetiva,
  COALESCE(o.profissional_id, i.profissional_id) AS profissional_efetivo_id,
  pr.nome AS profissional_nome,
  m.pessoa_id, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.demonstracao, m.data_inicio, m.data_fim, m.situacao AS matricula_situacao,
  m.programa_id, prog.nome AS programa_nome, m.responsavel_id, m.matricula_anterior_id,
  r.id AS reserva_id, r.inicio AS reserva_inicio, r.fim AS reserva_fim,
  imp.id AS impedimento_id, mi.nome AS impedimento_motivo, imp.descricao AS impedimento_descricao,
  imp.responsavel_id AS impedimento_responsavel_id, ui.nome AS impedimento_responsavel_nome,
  ur.nome AS responsavel_resolucao_nome,
  (SELECT MAX(c.data) FROM ped_contatos c WHERE c.matricula_id = o.matricula_id AND (c.ocorrencia_id = o.id OR c.ocorrencia_id IS NULL)) AS ultimo_contato,
  (SELECT c.proxima_tentativa FROM ped_contatos c WHERE c.matricula_id = o.matricula_id AND (c.ocorrencia_id = o.id OR c.ocorrencia_id IS NULL)
     ORDER BY c.data DESC, c.criado_em DESC LIMIT 1) AS proxima_tentativa,
  (SELECT i.quantidade + COALESCE(SUM(a.delta),0) FROM ped_ajustes_obrigacao a WHERE a.item_id = i.id) AS item_contratada,
  (SELECT COUNT(*) FROM ped_ocorrencias o2 WHERE o2.item_id = i.id AND o2.situacao = 'realizada') AS item_realizadas,
  (SELECT COUNT(*) FROM ped_integracoes ig WHERE ig.ocorrencia_id = o.id AND ig.situacao IN ('pendente','falhou','nao_configurado')) AS confirmacoes_pendentes,
  (SELECT GROUP_CONCAT(ig.detalhe, ' ') FROM ped_integracoes ig WHERE ig.ocorrencia_id = o.id AND ig.situacao IN ('falhou','nao_configurado')) AS confirmacoes_detalhe
FROM ped_ocorrencias o
JOIN ped_itens_contratados i ON i.id = o.item_id
JOIN ped_matriculas m ON m.id = o.matricula_id
JOIN ped_pessoas p ON p.id = m.pessoa_id
LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id
LEFT JOIN ped_profissionais pr ON pr.id = COALESCE(o.profissional_id, i.profissional_id)
LEFT JOIN ped_programas prog ON prog.id = m.programa_id
LEFT JOIN ped_reservas r ON r.ocorrencia_id = o.id AND r.ativa = 1
LEFT JOIN ped_impedimentos imp ON imp.id = (SELECT id FROM ped_impedimentos x WHERE x.ocorrencia_id = o.id AND x.ativo = 1 ORDER BY x.criado_em DESC LIMIT 1)
LEFT JOIN ped_motivos_impedimento mi ON mi.id = imp.motivo_id
LEFT JOIN ped_usuarios ui ON ui.id = imp.responsavel_id
LEFT JOIN ped_usuarios ur ON ur.id = o.responsavel_resolucao_id
`

/** Data de hoje em São Paulo. Os testes podem fixar a data (HOJE_FIXO). */
export function hoje(): string {
  const fixo = (globalThis as { HOJE_FIXO?: string }).HOJE_FIXO
  return fixo && dataValida(fixo) ? fixo : hojeSP()
}

export async function config(db: BDouTX, chave: string, padrao: string): Promise<string> {
  const r = (await db.get('SELECT valor FROM ped_configuracoes WHERE chave = ?', chave)) as { valor: string } | undefined
  return r?.valor ?? padrao
}

/** Remove campos que o usuário não pode ver. */
export function filtrarNotas<T extends Record<string, unknown>>(req: Req, linha: T): T {
  if (!tem(req, 'notas:internas')) {
    const c = { ...linha }
    delete c.notas_internas
    return c
  }
  return linha
}

/**
 * Aviso no sino do portal da aluna dona da matrícula. Fica só dentro do sistema (nada é enviado
 * por e-mail ou WhatsApp) e deve ter texto curto, sem detalhes pessoais.
 */
/**
 * Aviso no sino da aluna, que também entra na fila de e-mail e WhatsApp. `canais` restringe os canais
 * externos (ex.: encontros, cujo WhatsApp já sai pela confirmação do agendamento).
 */
export async function notificarAluna(db: BDouTX, matriculaId: string, aviso: { titulo: string; detalhe?: string; link?: string }, canais?: CanalAviso[]) {
  const usuarios = await db.all<{ id: string }>('SELECT a.usuario_id AS id FROM ped_acessos_aluna a JOIN ped_matriculas m ON m.pessoa_id = a.pessoa_id WHERE m.id = ?', matriculaId)
  for (const u of usuarios) {
    const id = novoId()
    await db.run('INSERT INTO ped_notificacoes (id, usuario_id, titulo, detalhe, link, criado_em) VALUES (?, ?, ?, ?, ?, ?)', id, u.id, aviso.titulo, aviso.detalhe ?? null, aviso.link ?? null, agoraIso())
    // O mesmo aviso também sai por e-mail e WhatsApp (server/avisosExternos.ts).
    await enfileirarEnvios(db, id, u.id, canais)
  }
}

/* ---------------- Listas configuráveis e estado da aluna ---------------- */

/** Confere se a opção existe e é da lista certa (ex.: um id de "saúde" não pode ir para "segmento"). */
export async function exigirOpcao(db: BDouTX, id: string | null | undefined, lista: string, rotulo: string) {
  if (!id) return
  if (!(await db.get('SELECT 1 FROM ped_opcoes_lista WHERE id = ? AND lista = ?', id, lista))) throw new ErroHttp(400, `Escolha ${rotulo} entre as opções cadastradas.`)
}

/**
 * Atualiza o status da aluna quando a matrícula mais recente muda de situação (pausa, retorno,
 * encerramento, cancelamento, nova matrícula). Só usa opções com código; se a opção foi desativada, não muda.
 */
export async function sincronizarStatusAluna(db: BDouTX, req: Req, pessoaId: string) {
  const m = (await db.get('SELECT situacao, data_inicio FROM ped_matriculas WHERE pessoa_id = ? ORDER BY data_inicio DESC, criado_em DESC LIMIT 1', pessoaId)) as
    | { situacao: string; data_inicio: string }
    | undefined
  if (!m) return
  const codigo = codigoStatusPelaMatricula(m.situacao, m.data_inicio, hoje())
  const op = (await db.get("SELECT id FROM ped_opcoes_lista WHERE lista = 'status_aluna' AND codigo = ? AND ativo = 1", codigo)) as { id: string } | undefined
  if (!op) return
  const p = (await db.get('SELECT status_id, data_entrada FROM ped_alunas WHERE id = ?', pessoaId)) as { status_id: string | null; data_entrada: string | null }
  if (p.status_id !== op.id) {
    await db.run('UPDATE ped_alunas SET status_id = ?, atualizado_em = ? WHERE id = ?', op.id, agoraIso(), pessoaId)
    await auditar(db, req, { entidade: 'pessoa', entidade_id: pessoaId, acao: 'status_atualizado', pessoa_id: pessoaId, dados: { codigo } })
  }
  if (!p.data_entrada) (await db.run('UPDATE ped_alunas SET data_entrada = (SELECT MIN(data_inicio) FROM ped_matriculas WHERE pessoa_id = ?) WHERE id = ?', pessoaId, pessoaId))
}

/* ---------------- Avisos programados pela equipe ---------------- */

/** Próximo envio depois de `de`, pulando os que já passaram (não manda atrasados em lote). */
export function proximoEnvio(de: string, recorrencia: string, agora: string): string | null {
  if (recorrencia === 'nenhuma') return null
  const hora = de.slice(10)
  let x = de
  do {
    if (recorrencia === 'diaria') x = somarDias(x, 1)
    else if (recorrencia === 'semanal') x = somarDias(x, 7)
    else x = somarMeses(x, 1) + hora
  } while (x <= agora)
  return x
}

/**
 * Entrega os avisos cujo horário chegou: um aviso no sino para cada aluna com acesso ao portal.
 * Roda a cada minuto no servidor e também quando a aluna abre o portal.
 */
export async function processarAvisos(db: BD, agora = agoraSP()) {
  const devidos = (await db.all('SELECT * FROM ped_avisos_programados WHERE ativo = 1 AND proximo_envio IS NOT NULL AND proximo_envio <= ?', agora)) as Record<string, string | number | null>[]
  for (const a of devidos) {
    // Um lote por aviso. A condição no UPDATE (proximo_envio ainda igual ao lido) impede que dois
    // processamentos simultâneos (o agendamento e a aluna abrindo o portal) entreguem o mesmo aviso duas vezes.
    const destinatarios = await destinatariosAviso(db, a)
    let prox = proximoEnvio(a.proximo_envio as string, a.recorrencia as string, agora)
    if (prox && a.fim && prox.slice(0, 10) > (a.fim as string)) prox = null
    const r = await db.run('UPDATE ped_avisos_programados SET envios = envios + 1, ultimo_envio = ?, proximo_envio = ?, ativo = ? WHERE id = ? AND proximo_envio = ?', agora, prox, prox ? 1 : 0, a.id, a.proximo_envio)
    if (r.changes !== 1) continue
    const criado = agoraIso()
    await db.lote(
      destinatarios.flatMap((u) => {
        const id = novoId()
        return [{ sql: 'INSERT INTO ped_notificacoes (id, usuario_id, titulo, detalhe, link, aviso_id, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)', params: [id, u, a.titulo, a.detalhe, a.link, a.id, criado] }, ...instrucoesEnvio(id, u)]
      }),
    )
  }
}

/** Usuárias do portal que recebem o aviso, conforme o público escolhido. */
export async function destinatariosAviso(db: BDouTX, a: Record<string, unknown>): Promise<string[]> {
  const base = 'SELECT DISTINCT u.usuario_id AS id FROM ped_acessos_aluna u JOIN ped_alunas p ON p.id = u.pessoa_id WHERE 1 = 1'
  const ativa = "EXISTS (SELECT 1 FROM ped_matriculas m WHERE m.pessoa_id = p.id AND m.situacao IN ('ativa','pausada')"
  const linhas =
    a.publico === 'aluna'
      ? (await db.all(`${base} AND p.id = ?`, a.pessoa_id))
      : a.publico === 'turma'
        ? (await db.all(`${base} AND ${ativa} AND m.turma_id = ?)`, a.turma_id))
        : (await db.all(`${base} AND ${ativa})`))
  return (linhas as { id: string }[]).map((l) => l.id)
}
