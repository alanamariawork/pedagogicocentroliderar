import { Router, type Req as Request } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, transacao, type BD, type BDouTX, type TX } from '../db'
import { ErroHttp, exigir, exigirEquipe, tem } from '../auth'
import {
  SQL_OCORRENCIAS,
  auditar,
  data,
  dataObrig,
  escopoMatriculas,
  exigirAcessoMatricula,
  hoje,
  historico,
  id,
  idObrig,
  link,
  minutos,
  resumoItem,
  sincronizarOcorrencias,
  texto,
  textoObrig,
  validar,
  booleano,
  exigirOpcao,
  sincronizarStatusAluna,
} from '../servicos'
import { somarDias } from '../../shared/datas'

const esquemaPessoa = z.object({
  nome: textoObrig('o nome', 200),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().toLowerCase().email('E-mail inválido.').nullable().optional()),
  telefone: texto(40),
  cidade: texto(120),
  observacao_operacional: texto(500),
  instagram: texto(200),
  linkedin: texto(200),
  site: link(),
  empresa: texto(200),
  segmento_id: id(),
  subsegmento: texto(120),
})

/** Estado da aluna (uso interno): nunca aparece no portal. */
const esquemaEstado = z.object({
  status_id: id(),
  saude_id: id(),
  engajamento_id: id(),
  em_risco: booleano().default(false),
  responsavel_id: id(),
  data_entrada: data('a data de entrada'),
})

const esquemaItem = z.object({
  tipo_id: id(),
  descricao: textoObrig('a descrição do item'),
  quantidade: z.coerce.number({ error: 'Informe a quantidade.' }).int().min(0).max(500),
  profissional_id: id(),
  especialidade: texto(200),
  duracao_min: minutos(),
  origem: z.enum(['pacote', 'bonus', 'ajuste']),
  referencia_comercial: texto(500),
  observacoes: texto(),
})

const esquemaMatricula = z.object({
  programa_id: id(),
  turma_id: id(),
  data_boas_vindas: data('a data de boas-vindas'),
  data_inicio: dataObrig('a data de início da vigência'),
  data_fim: data('a data de término da vigência'),
  responsavel_id: id(),
  mentora_id: id(),
  canal_venda_id: id(),
  contrato_situacao: z.enum(['pendente', 'enviado', 'assinado']).default('pendente'),
  contrato_link: link(),
  fonte_comercial: texto(500),
  condicoes_comerciais: texto(4000),
  matricula_anterior_id: id(),
  pacote_id: id(),
  itens_extras: z.array(esquemaItem).max(100).default([]),
})

export function rotasAlunas(db: BD, ctx: ContextoApp) {
  const r = Router()
  r.use(exigirEquipe)

  /* ---------------- Lista (RF02) ---------------- */

  r.get('/pessoas', async (req, res) => {
    exigir(req, 'alunas:ver')
    const q = validar(z.object({ busca: z.string().max(100).optional(), situacao: z.string().optional() }), req.query)
    res.json(await listarAlunas(req, q))
  })

  /* ---------------- Painel de alunas (Visão Geral) ---------------- */

  r.get('/painel/alunas', async (req, res) => {
    exigir(req, 'indicadores:ver')
    const lista = (await listarAlunas(req, {})).filter((p) => p.matricula_atual)
    const opcoes = (await db.all('SELECT id, lista, codigo, nome, cor FROM ped_opcoes_lista')) as { id: string; lista: string; codigo: string | null; nome: string; cor: string }[]
    const op = new Map(opcoes.map((o) => [o.id, o]))
    const codigo = (id: unknown) => (id ? op.get(id as string)?.codigo : null)
    type M = { onboarding_situacao: string; turma_nome: string | null; canal_venda_id: string | null }
    const emAndamento = lista.filter((p) => ['ativa', 'a_iniciar'].includes(codigo(p.status_id) ?? ''))
    const agrupar = (chave: (p: Record<string, unknown>) => { id: string | null; nome: string; cor?: string }, vazio: string) => {
      const g = new Map<string, { nome: string; cor?: string; quantidade: number }>()
      for (const p of lista) {
        const k = chave(p)
        const id = k.id ?? '__vazio__'
        const atual = g.get(id) ?? { nome: k.id ? k.nome : vazio, cor: k.cor, quantidade: 0 }
        atual.quantidade++
        g.set(id, atual)
      }
      return [...g.values()].sort((a, b) => b.quantidade - a.quantidade)
    }
    const daLista = (campo: string) => (p: Record<string, unknown>) => {
      const o = p[campo] ? op.get(p[campo] as string) : undefined
      return { id: o?.id ?? null, nome: o?.nome ?? '', cor: o?.cor }
    }
    res.json({
      cards: {
        total: lista.length,
        ativas: lista.filter((p) => codigo(p.status_id) === 'ativa').length,
        a_iniciar: lista.filter((p) => codigo(p.status_id) === 'a_iniciar').length,
        onboarding_agendado: emAndamento.filter((p) => (p.matricula_atual as M).onboarding_situacao === 'agendado').length,
        onboarding_pendente: emAndamento.filter((p) => (p.matricula_atual as M).onboarding_situacao === 'pendente').length,
      },
      por_status: agrupar(daLista('status_id'), 'Sem status'),
      por_segmento: agrupar(daLista('segmento_id'), 'Sem segmento'),
      por_responsavel: agrupar((p) => ({ id: (p.responsavel_id as string) ?? null, nome: (p.responsavel_nome as string) ?? '' }), 'Sem responsável'),
      por_canal: agrupar((p) => daLista('canal_venda_id')(p.matricula_atual as Record<string, unknown>), 'Sem canal informado'),
      por_turma: agrupar((p) => ({ id: (p.matricula_atual as M).turma_nome, nome: (p.matricula_atual as M).turma_nome ?? '' }), 'Sem turma'),
    })
  })

  async function listarAlunas(req: Request, q: { busca?: string; situacao?: string }): Promise<(Record<string, unknown> & { matricula_atual: Record<string, unknown> | null })[]> {
    const esc = escopoMatriculas(req)
    const pessoas = (await db.all(`SELECT p.id, p.codigo, p.nome, p.email, p.telefone, p.cidade, p.demonstracao, p.empresa, p.segmento_id, p.subsegmento, p.responsavel_id,
           p.data_entrada, p.status_id, p.saude_id, p.engajamento_id, p.em_risco, ur.nome AS responsavel_nome, p.criado_em,
           (SELECT COUNT(*) FROM ped_matriculas m WHERE m.pessoa_id = p.id AND ${esc.sql}) AS matriculas
         FROM ped_pessoas p LEFT JOIN ped_usuarios ur ON ur.id = p.responsavel_id
         WHERE (@busca IS NULL OR p.nome LIKE @busca OR p.email LIKE @busca OR p.telefone LIKE @busca OR p.empresa LIKE @busca OR p.codigo = @codigo)
           AND EXISTS (SELECT 1 FROM ped_matriculas m WHERE m.pessoa_id = p.id AND ${esc.sql}) OR (@ver_sem_matricula = 1 AND NOT EXISTS (SELECT 1 FROM ped_matriculas m WHERE m.pessoa_id = p.id) AND (@busca IS NULL OR p.nome LIKE @busca) AND (@carteira IS NULL OR p.responsavel_id = @carteira))
         ORDER BY p.codigo IS NULL, p.codigo, p.nome COLLATE NOCASE`, { busca: q.busca ? `%${q.busca}%` : null, codigo: q.busca && /^#?\d+$/.test(q.busca.trim()) ? Number(q.busca.trim().replace('#', '')) : null, ver_sem_matricula: req.usuario!.perfil === 'mentora' ? 0 : 1, carteira: tem(req, 'alunas:todas') ? null : req.usuario!.id, ...esc.params })) as Record<string, unknown>[]

    const atuais = (await db.all(`SELECT m.id, m.pessoa_id, m.situacao, m.contrato_situacao, m.onboarding_situacao, m.data_inicio, m.data_fim, m.matricula_anterior_id,
                m.programa_id, m.turma_id, tu.nome AS turma_nome, m.canal_venda_id, m.interesse_renovacao,
                pg.nome AS programa_nome, t.nome AS trilha_nome, pl.nome AS pilar_nome,
                (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.matricula_id = m.id AND o.situacao NOT IN ('realizada','cancelada')) AS entregas_restantes,
                (SELECT COUNT(*) FROM ped_ocorrencias o WHERE o.matricula_id = m.id AND o.situacao NOT IN ('realizada','cancelada') AND o.data_prevista < @hoje) AS entregas_vencidas
         FROM ped_matriculas m LEFT JOIN ped_programas pg ON pg.id = m.programa_id LEFT JOIN ped_turmas tu ON tu.id = m.turma_id
         LEFT JOIN ped_jornadas j ON j.matricula_id = m.id LEFT JOIN ped_trilhas t ON t.id = j.trilha_id LEFT JOIN ped_pilares pl ON pl.id = j.pilar_id
         WHERE ${esc.sql}
         ORDER BY CASE m.situacao WHEN 'ativa' THEN 0 WHEN 'pausada' THEN 1 ELSE 2 END, m.data_inicio DESC`, { hoje: hoje(), ...esc.params })) as Record<string, unknown>[]
    const porPessoa = new Map<string, Record<string, unknown>>()
    for (const m of atuais) if (!porPessoa.has(m.pessoa_id as string)) porPessoa.set(m.pessoa_id as string, m)
    let lista = pessoas.map((p) => ({ ...p, matricula_atual: porPessoa.get(p.id as string) ?? null }))
    if (q.situacao) lista = lista.filter((p) => (p.matricula_atual as { situacao?: string } | null)?.situacao === q.situacao)
    return lista
  }

  /* ---------------- Cadastro: pessoa + matrícula (ET01) ---------------- */

  type DadosMatricula = z.infer<typeof esquemaMatricula>
  type DadosItem = z.infer<typeof esquemaItem>

  /** Validações e leituras da nova matrícula, antes de qualquer gravação. */
  async function prepararMatricula(pessoaId: string | null, d: DadosMatricula): Promise<{ pacote?: { id: string; nome: string }; itens: DadosItem[] }> {
    if (d.data_fim && d.data_fim < d.data_inicio) throw new ErroHttp(400, 'O término da vigência não pode ser antes do início.')
    await exigirOpcao(db, d.canal_venda_id, 'canal_venda', 'o canal de venda')
    if (d.matricula_anterior_id) {
      const ant = (await db.get('SELECT pessoa_id FROM ped_matriculas WHERE id = ?', d.matricula_anterior_id)) as { pessoa_id: string } | undefined
      if (!ant || ant.pessoa_id !== pessoaId) throw new ErroHttp(400, 'A matrícula anterior precisa ser da mesma pessoa.')
    }
    const pacote = d.pacote_id
      ? ((await db.get('SELECT id, nome FROM ped_pacotes WHERE id = ?', d.pacote_id)) as { id: string; nome: string } | undefined)
      : undefined
    if (d.pacote_id && !pacote) throw new ErroHttp(400, 'Pacote não encontrado.')
    // RN03: aplicar o modelo = COPIAR os itens. Mudanças futuras no modelo não afetam esta matrícula.
    const itens: DadosItem[] = []
    if (pacote) {
      const modelo = (await db.all('SELECT * FROM ped_pacote_itens WHERE pacote_id = ? ORDER BY ordem', pacote.id)) as Record<string, unknown>[]
      for (const i of modelo)
        itens.push({
          tipo_id: i.tipo_id as string | null,
          descricao: i.descricao as string,
          quantidade: i.quantidade as number,
          profissional_id: i.profissional_id as string | null,
          especialidade: i.especialidade as string | null,
          duracao_min: i.duracao_min as number | null,
          origem: i.origem as 'pacote' | 'bonus',
          referencia_comercial: `Modelo "${pacote.nome}"`,
          observacoes: i.observacoes as string | null,
        })
    }
    itens.push(...d.itens_extras)
    return { pacote, itens }
  }

  /** Grava a matrícula preparada (dentro de uma transação). Depois do commit, chame sincronizarStatusAluna. */
  async function gravarMatricula(tx: TX, req: Request, pessoaId: string, d: DadosMatricula, plano: Awaited<ReturnType<typeof prepararMatricula>>): Promise<string> {
    const { pacote, itens } = plano
    const mid = novoId()
    const agora = agoraIso()
    // ID da aluna: número sequencial dado na primeira matrícula (ordem de matrícula). Renovações mantêm o mesmo ID.
    tx.run('UPDATE ped_alunas SET codigo = (SELECT COALESCE(MAX(codigo), 0) + 1 FROM ped_alunas) WHERE id = ? AND codigo IS NULL', pessoaId)
    tx.run(`INSERT INTO ped_matriculas (id, pessoa_id, programa_id, matricula_anterior_id, turma_id, data_boas_vindas, data_inicio, data_fim, situacao, contrato_situacao, contrato_link,
         fonte_comercial, condicoes_comerciais, responsavel_id, mentora_id, pacote_origem_id, pacote_origem_nome, canal_venda_id, criado_em, atualizado_em, autor_id)
       VALUES (?,?,?,?,?,?,?,?,'ativa',?,?,?,?,?,?,?,?,?,?,?,?)`, mid, pessoaId, d.programa_id ?? null, d.matricula_anterior_id ?? null, d.turma_id ?? null, d.data_boas_vindas ?? null, d.data_inicio, d.data_fim ?? null,
      d.contrato_situacao, d.contrato_link ?? null, d.fonte_comercial ?? null, d.condicoes_comerciais ?? null,
      d.responsavel_id ?? null, d.mentora_id ?? null, pacote?.id ?? null, pacote?.nome ?? null, d.canal_venda_id ?? null, agora, agora, req.usuario!.id)
    for (const i of itens) await criarItem(tx, req, mid, i)
    // A responsável da matrícula vira a responsável da aluna quando ela ainda não tem uma.
    tx.run('UPDATE ped_alunas SET responsavel_id = COALESCE(responsavel_id, ?) WHERE id = ?', d.responsavel_id ?? null, pessoaId)
    await auditar(tx, req, { entidade: 'matricula', entidade_id: mid, acao: d.matricula_anterior_id ? 'renovacao_criada' : 'criada', matricula_id: mid, pessoa_id: pessoaId, dados: { ...d, itens: itens.length } })
    return mid
  }

  /** Cria o item e as ocorrências dele. Seguro dentro de transação (não lê o que acabou de gravar). */
  async function criarItem(tx: BDouTX, req: Request, matriculaId: string, i: DadosItem, extra?: { pacote_item_origem_id?: string }) {
    const iid = novoId()
    const agora = agoraIso()
    await tx.run(`INSERT INTO ped_itens_contratados (id, matricula_id, tipo_id, descricao, quantidade, profissional_id, especialidade, duracao_min, origem, referencia_comercial, observacoes, pacote_item_origem_id, criado_em, atualizado_em, autor_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, iid, matriculaId, i.tipo_id ?? null, i.descricao, i.quantidade, i.profissional_id ?? null, i.especialidade ?? null, i.duracao_min ?? null, i.origem, i.referencia_comercial ?? null, i.observacoes ?? null, extra?.pacote_item_origem_id ?? null, agora, agora, req.usuario!.id)
    await sincronizarOcorrencias(tx, req, iid, 'Ajuste de quantidade', { novo: { matricula_id: matriculaId, quantidade: i.quantidade } })
    return iid
  }

  const soDigitos = (v: string | null | undefined) => (v ? v.replace(/\D/g, '') || null : null)

  /* ---------------- Busca em Clientes (a identidade da aluna mora lá) ---------------- */

  r.get('/clientes/busca', async (req, res) => {
    exigir(req, 'alunas:editar')
    const q = validar(z.object({ termo: z.string().trim().min(2, 'Digite pelo menos 2 letras.').max(100) }), req.query)
    const digitos = q.termo.replace(/\D/g, '')
    const linhas = (await db.all(
      `SELECT p.id, p.nome, p.email, p.telefone, (a.id IS NOT NULL) AS ja_aluna
         FROM pessoa p LEFT JOIN ped_alunas a ON a.id = p.id
        WHERE p.nome LIKE @like OR p.email LIKE @like OR (@dig IS NOT NULL AND (p.telefone LIKE @diglike OR p.cpf = @dig))
        ORDER BY p.nome COLLATE NOCASE LIMIT 20`,
      { like: `%${q.termo}%`, dig: digitos.length >= 4 ? digitos : null, diglike: `%${digitos}%` },
    )) as Record<string, unknown>[]
    res.json(linhas.map((l) => ({ ...l, ja_aluna: !!l.ja_aluna })))
  })

  r.post('/pessoas', async (req, res) => {
    exigir(req, 'alunas:editar')
    // pessoa_id: cadastro já existente em Clientes. Sem ele, a pessoa é criada em Clientes pela regra do backoffice.
    const d = validar(esquemaPessoa.extend({ pessoa_id: id(), matricula: esquemaMatricula.optional() }), req.body)
    if (d.matricula) exigir(req, 'matriculas:criar')
    await exigirOpcao(db, d.segmento_id, 'segmento', 'o segmento')
    if (d.pessoa_id) {
      if (!(await db.get('SELECT 1 FROM pessoa WHERE id = ?', d.pessoa_id))) throw new ErroHttp(404, 'Cadastro não encontrado em Clientes.')
      if (await db.get('SELECT 1 FROM ped_alunas WHERE id = ?', d.pessoa_id))
        throw new ErroHttp(409, 'Esta pessoa já é aluna. Abra a ficha dela e crie uma nova matrícula.')
    } else if (d.email && (await db.get('SELECT 1 FROM pessoa WHERE email = ?', d.email))) {
      throw new ErroHttp(409, 'Já existe um cadastro em Clientes com este e-mail. Busque e selecione esse cadastro em vez de criar outro.')
    }
    const plano = d.matricula ? await prepararMatricula(d.pessoa_id ?? null, d.matricula) : null
    const pid = d.pessoa_id ?? (await ctx.clientes.criarPessoa(req.usuario!.id, { nome: d.nome, email: d.email ?? null, telefone: soDigitos(d.telefone) })).id
    let mid: string | null = null
    await transacao(db, async (tx) => {
      const agora = agoraIso()
      // Quem não vê todas as alunas fica responsável pela aluna que cadastra (senão ela sairia da sua carteira).
      const responsavel = tem(req, 'alunas:todas') ? null : req.usuario!.id
      tx.run('INSERT INTO ped_alunas (id, cidade, observacao_operacional, instagram, linkedin, site, empresa, segmento_id, subsegmento, responsavel_id, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', pid, d.cidade ?? null, d.observacao_operacional ?? null, d.instagram ?? null, d.linkedin ?? null, d.site ?? null,
        d.empresa ?? null, d.segmento_id ?? null, d.subsegmento ?? null, responsavel, agora, agora, req.usuario!.id)
      await auditar(tx, req, { entidade: 'pessoa', entidade_id: pid, acao: d.pessoa_id ? 'vinculada_de_clientes' : 'criada', pessoa_id: pid, dados: { nome: d.nome } })
      if (d.matricula && plano) mid = await gravarMatricula(tx, req, pid, d.matricula, plano)
    })
    if (mid) await sincronizarStatusAluna(db, req, pid)
    res.status(201).json({ id: pid, matricula_id: mid })
  })

  r.put('/pessoas/:id', async (req, res) => {
    exigir(req, 'alunas:editar')
    const d = validar(esquemaPessoa, req.body)
    await exigirAcessoPessoa(req, req.params.id as string)
    await exigirOpcao(db, d.segmento_id, 'segmento', 'o segmento')
    const pid = req.params.id as string
    const atual = (await db.get('SELECT nome, email, telefone FROM ped_pessoas WHERE id = ?', pid)) as { nome: string; email: string | null; telefone: string | null } | undefined
    if (!atual) throw new ErroHttp(404, 'Pessoa não encontrada.')
    // Nome, e-mail e telefone moram em Clientes: só o que mudou vai para a regra do backoffice.
    const identidade: Partial<{ nome: string; email: string | null; telefone: string | null }> = {}
    if (d.nome !== atual.nome) identidade.nome = d.nome
    if ((d.email ?? null) !== atual.email) identidade.email = d.email ?? null
    if (soDigitos(d.telefone) !== atual.telefone) identidade.telefone = soDigitos(d.telefone)
    if (identidade.email && (await db.get('SELECT 1 FROM pessoa WHERE email = ? AND id <> ?', identidade.email, pid))) throw new ErroHttp(409, 'Já existe outro cadastro em Clientes com este e-mail.')
    if (Object.keys(identidade).length) await ctx.clientes.atualizarPessoa(req.usuario!.id, pid, identidade)
    await db.run('UPDATE ped_alunas SET cidade=?, observacao_operacional=?, instagram=?, linkedin=?, site=?, empresa=?, segmento_id=?, subsegmento=?, atualizado_em=?, autor_id=? WHERE id=?', d.cidade ?? null, d.observacao_operacional ?? null, d.instagram ?? null, d.linkedin ?? null, d.site ?? null,
        d.empresa ?? null, d.segmento_id ?? null, d.subsegmento ?? null, agoraIso(), req.usuario!.id, pid)
    await auditar(db, req, { entidade: 'pessoa', entidade_id: req.params.id as string, acao: 'atualizada', pessoa_id: req.params.id as string, dados: d })
    res.json({ ok: true })
  })

  // Estado da aluna (status, saúde, engajamento, em risco, responsável, entrada): uso interno.
  r.put('/pessoas/:id/estado', async (req, res) => {
    exigir(req, 'alunas:editar')
    const pid = req.params.id as string
    await exigirAcessoPessoa(req, pid)
    const d = validar(esquemaEstado, req.body)
    await exigirOpcao(db, d.status_id, 'status_aluna', 'o status')
    await exigirOpcao(db, d.saude_id, 'saude', 'a saúde')
    await exigirOpcao(db, d.engajamento_id, 'engajamento', 'o engajamento')
    if (d.responsavel_id && !(await db.get("SELECT 1 FROM ped_usuarios WHERE id = ? AND perfil <> 'aluna'", d.responsavel_id))) throw new ErroHttp(400, 'Escolha uma pessoa da equipe como responsável.')
    const antes = (await db.get('SELECT status_id, saude_id, engajamento_id, em_risco, responsavel_id, data_entrada FROM ped_pessoas WHERE id = ?', pid))
    if (!antes) throw new ErroHttp(404, 'Pessoa não encontrada.')
    await db.run('UPDATE ped_alunas SET status_id=?, saude_id=?, engajamento_id=?, em_risco=?, responsavel_id=?, data_entrada=?, atualizado_em=?, autor_id=? WHERE id=?', d.status_id ?? null, d.saude_id ?? null, d.engajamento_id ?? null, d.em_risco ? 1 : 0, d.responsavel_id ?? null, d.data_entrada ?? null, agoraIso(), req.usuario!.id, pid)
    await auditar(db, req, { entidade: 'pessoa', entidade_id: pid, acao: 'estado_atualizado', pessoa_id: pid, dados: { antes, depois: d } })
    res.json({ ok: true })
  })

  /** Quem vê só a carteira não altera aluna de fora dela. */
  async function exigirAcessoPessoa(req: Request, pessoaId: string) {
    if (tem(req, 'alunas:todas') && req.usuario!.perfil !== 'mentora') return
    const esc = escopoMatriculas(req)
    const ok =
      await db.get(`SELECT 1 FROM ped_matriculas m WHERE m.pessoa_id = @pid AND ${esc.sql}`, { pid: pessoaId, ...esc.params }) ||
      (req.usuario!.perfil !== 'mentora' && (await db.get('SELECT 1 FROM ped_pessoas WHERE id = ? AND responsavel_id = ?', pessoaId, req.usuario!.id)))
    if (!ok) throw new ErroHttp(404, 'Pessoa não encontrada ou sem acesso.')
  }

  r.post('/matriculas', async (req, res) => {
    exigir(req, 'matriculas:criar')
    const d = validar(esquemaMatricula.extend({ pessoa_id: idObrig('a pessoa') }), req.body)
    if (!(await db.get('SELECT 1 FROM ped_pessoas WHERE id = ?', d.pessoa_id))) throw new ErroHttp(404, 'Pessoa não encontrada.')
    const plano = await prepararMatricula(d.pessoa_id, d)
    const mid = await transacao(db, (tx) => gravarMatricula(tx, req, d.pessoa_id, d, plano))
    await sincronizarStatusAluna(db, req, d.pessoa_id)
    res.status(201).json({ id: mid })
  })

  /* ---------------- Ficha (RF02) ---------------- */

  r.get('/pessoas/:id', async (req, res) => {
    exigir(req, 'alunas:ver')
    const pessoa = (await db.get('SELECT * FROM ped_pessoas WHERE id = ?', req.params.id)) as Record<string, unknown> | undefined
    if (!pessoa) throw new ErroHttp(404, 'Pessoa não encontrada.')
    const esc = escopoMatriculas(req)
    const matriculas = (await db.all(`SELECT m.*, pg.nome AS programa_nome, tu.nome AS turma_nome, ur.nome AS responsavel_nome, pr.nome AS mentora_nome, uo.nome AS onboarding_responsavel_nome, uc.nome AS conferida_por_nome
         FROM ped_matriculas m LEFT JOIN ped_programas pg ON pg.id = m.programa_id LEFT JOIN ped_turmas tu ON tu.id = m.turma_id LEFT JOIN ped_usuarios ur ON ur.id = m.responsavel_id
         LEFT JOIN ped_profissionais pr ON pr.id = m.mentora_id LEFT JOIN ped_usuarios uo ON uo.id = m.onboarding_responsavel_id
         LEFT JOIN ped_usuarios uc ON uc.id = m.conferida_por
         WHERE m.pessoa_id = @pid AND ${esc.sql} ORDER BY m.data_inicio DESC, m.criado_em DESC`, { pid: req.params.id, ...esc.params })) as Record<string, unknown>[]
    const foraDaCarteira = !tem(req, 'alunas:todas') && pessoa.responsavel_id !== req.usuario!.id
    if (matriculas.length === 0 && (req.usuario!.perfil === 'mentora' || foraDaCarteira)) throw new ErroHttp(404, 'Pessoa não encontrada ou sem acesso.')
    if (pessoa.responsavel_id) pessoa.responsavel_nome = ((await db.get('SELECT nome FROM ped_usuarios WHERE id = ?', pessoa.responsavel_id)) as { nome: string } | undefined)?.nome ?? null

    const verComercial = tem(req, 'comercial:ver')
    const verNotas = tem(req, 'notas:internas')
    const verPedag = tem(req, 'notas:pedagogicas')
    delete pessoa.cpf // a ficha não precisa do CPF
    const saida: Record<string, unknown>[] = []
    for (const m of matriculas) {
      const mid = m.id as string
      if (!verComercial) {
        delete m.condicoes_comerciais
        delete m.fonte_comercial
        delete m.contrato_link
      }
      const itensBrutos = ((await db.all(`SELECT i.*, t.nome AS tipo_nome, pr.nome AS profissional_nome FROM ped_itens_contratados i
           LEFT JOIN ped_tipos_entregavel t ON t.id = i.tipo_id LEFT JOIN ped_profissionais pr ON pr.id = i.profissional_id
           WHERE i.matricula_id = ? ORDER BY i.criado_em`, mid)) as Record<string, unknown>[])
      const itens: Record<string, unknown>[] = []
      for (const i of itensBrutos) {
        const resumo = await resumoItem(db, i.id as string)
        const ajustes = (await db.all('SELECT a.*, u.nome AS autor_nome FROM ped_ajustes_obrigacao a LEFT JOIN ped_usuarios u ON u.id = a.autor_id WHERE a.item_id = ? ORDER BY a.criado_em', i.id))
        if (!verComercial) delete i.referencia_comercial
        itens.push({ ...i, ...resumo, restantes: Math.max(resumo.contratada - resumo.realizadas, 0), ajustes })
      }
      const ocorrencias = (await db.all(`${SQL_OCORRENCIAS} WHERE o.matricula_id = ? ORDER BY i.criado_em, o.numero`, mid)) as Record<string, unknown>[]
      // Histórico de todas as ocorrências da matrícula numa consulta só.
      const hist = (await db.all('SELECT h.*, u.nome AS autor_nome FROM ped_ocorrencia_historico h JOIN ped_ocorrencias o ON o.id = h.ocorrencia_id LEFT JOIN ped_usuarios u ON u.id = h.autor_id WHERE o.matricula_id = ? ORDER BY h.criado_em', mid)) as Record<string, unknown>[]
      const histPor = new Map<string, Record<string, unknown>[]>()
      for (const h of hist) histPor.set(h.ocorrencia_id as string, [...(histPor.get(h.ocorrencia_id as string) ?? []), h])
      for (const o of ocorrencias) {
        if (!verNotas) delete o.notas_internas
        o.historico = histPor.get(o.id as string) ?? []
      }
      const contatos = (await db.all('SELECT c.*, u.nome AS responsavel_nome FROM ped_contatos c LEFT JOIN ped_usuarios u ON u.id = c.responsavel_id WHERE c.matricula_id = ? ORDER BY c.data DESC, c.criado_em DESC', mid))
      const pausas = (await db.all('SELECT p.*, u.nome AS decidido_por_nome FROM ped_pausas p LEFT JOIN ped_usuarios u ON u.id = p.decidido_por WHERE p.matricula_id = ? ORDER BY p.inicio DESC', mid))
      const feedbacks = (await db.all('SELECT f.*, u.nome AS responsavel_nome FROM ped_feedbacks f LEFT JOIN ped_usuarios u ON u.id = f.responsavel_id WHERE f.matricula_id = ? ORDER BY f.data DESC', mid))
      const tipos = [verNotas && 'operacional', verPedag && 'pedagogica'].filter(Boolean) as string[]
      const anotacoes = tipos.length
        ? (await db.all(`SELECT a.*, u.nome AS autor_nome FROM ped_anotacoes a LEFT JOIN ped_usuarios u ON u.id = a.autor_id WHERE a.matricula_id = ? AND a.tipo IN (${tipos.map(() => '?').join(',')}) ORDER BY a.criado_em DESC`, mid, ...tipos))
        : []
      const conquistas = (await db.all('SELECT c.*, u.nome AS autor_nome, v.nome AS validada_por_nome FROM ped_conquistas c LEFT JOIN ped_usuarios u ON u.id = c.autor_id LEFT JOIN ped_usuarios v ON v.id = c.validada_por WHERE c.matricula_id = ? ORDER BY c.data DESC', mid))
      const renovacoes = (await db.all('SELECT id, data_inicio, situacao FROM ped_matriculas WHERE matricula_anterior_id = ?', mid))
      saida.push({ ...m, itens, ocorrencias, contatos, pausas, feedbacks, anotacoes, conquistas, renovacoes })
    }
    const auditoria = tem(req, 'auditoria:ver')
      ? (await db.all('SELECT a.*, u.nome AS autor_nome FROM ped_auditoria a LEFT JOIN ped_usuarios u ON u.id = a.autor_id WHERE a.pessoa_id = ? ORDER BY a.criado_em DESC LIMIT 300', req.params.id))
      : null
    // Acesso ao Portal = conta de cliente do backoffice ligada a esta pessoa.
    const acesso = ((await db.get('SELECT usuario_id AS id, email, 1 AS ativo FROM ped_acessos_aluna WHERE pessoa_id = ?', req.params.id)) as Record<string, unknown> | undefined) ?? null
    res.json({ pessoa, matriculas: saida, auditoria, acesso_portal: acesso })
  })

  /* ---------------- Matrícula: dados, contrato, conferência, onboarding ---------------- */

  r.put('/matriculas/:id/dados', async (req, res) => {
    if (!tem(req, 'comercial:editar') && !tem(req, 'matriculas:decidir')) exigir(req, 'comercial:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({
        programa_id: id(),
        turma_id: id(),
        data_boas_vindas: data('a data de boas-vindas'),
        data_inicio: dataObrig('a data de início da vigência'),
        data_fim: data('a data de término'),
        responsavel_id: id(),
        mentora_id: id(),
        canal_venda_id: id(),
        motivo_alteracao_vigencia: texto(500),
      }),
      req.body,
    )
    if (d.data_fim && d.data_fim < d.data_inicio) throw new ErroHttp(400, 'O término da vigência não pode ser antes do início.')
    const mudouVigencia = d.data_inicio !== m.data_inicio || (d.data_fim ?? null) !== m.data_fim
    if (mudouVigencia && m.data_fim && !d.motivo_alteracao_vigencia) throw new ErroHttp(400, 'Informe o motivo da alteração da vigência.')
    await exigirOpcao(db, d.canal_venda_id, 'canal_venda', 'o canal de venda')
    await db.run('UPDATE ped_matriculas SET programa_id=?, turma_id=?, data_boas_vindas=?, data_inicio=?, data_fim=?, responsavel_id=?, mentora_id=?, canal_venda_id=?, atualizado_em=?, autor_id=? WHERE id=?', d.programa_id ?? null, d.turma_id ?? null, d.data_boas_vindas ?? null, d.data_inicio, d.data_fim ?? null, d.responsavel_id ?? null, d.mentora_id ?? null, d.canal_venda_id ?? null, agoraIso(), req.usuario!.id, m.id)
    await sincronizarStatusAluna(db, req, m.pessoa_id)
    await auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: mudouVigencia ? 'vigencia_alterada' : 'dados_atualizados', matricula_id: m.id, dados: { antes: { data_inicio: m.data_inicio, data_fim: m.data_fim }, depois: d } })
    res.json({ ok: true })
  })

  r.put('/matriculas/:id/contrato', async (req, res) => {
    exigir(req, 'comercial:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({ contrato_situacao: z.enum(['pendente', 'enviado', 'assinado']), contrato_link: link(), fonte_comercial: texto(500), condicoes_comerciais: texto(4000) }),
      req.body,
    )
    await db.run('UPDATE ped_matriculas SET contrato_situacao=?, contrato_link=?, fonte_comercial=?, condicoes_comerciais=?, atualizado_em=?, autor_id=? WHERE id=?', d.contrato_situacao, d.contrato_link ?? null, d.fonte_comercial ?? null, d.condicoes_comerciais ?? null, agoraIso(), req.usuario!.id, m.id)
    await auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: 'contrato_atualizado', matricula_id: m.id, dados: { de: m.contrato_situacao, para: d.contrato_situacao } })
    res.json({ ok: true })
  })

  // ET02: conferir pacote e bônus contra a fonte comercial.
  r.post('/matriculas/:id/conferencia', async (req, res) => {
    exigir(req, 'comercial:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ conferida: z.boolean(), fonte_comercial: texto(500) }), req.body)
    if (d.conferida && !(d.fonte_comercial ?? m.fonte_comercial)) throw new ErroHttp(400, 'Informe a fonte comercial usada na conferência (ex.: contrato, proposta, Hotmart).')
    await db.run('UPDATE ped_matriculas SET conferencia_comercial=?, conferida_por=?, conferida_em=?, fonte_comercial=COALESCE(?, fonte_comercial), atualizado_em=? WHERE id=?', d.conferida ? 'conferida' : 'pendente', d.conferida ? req.usuario!.id : null, d.conferida ? agoraIso() : null, d.fonte_comercial ?? null, agoraIso(), m.id)
    await auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: d.conferida ? 'pacote_conferido' : 'conferencia_reaberta', matricula_id: m.id, dados: d })
    res.json({ ok: true })
  })

  // RN14: onboarding e contrato são controles independentes.
  r.put('/matriculas/:id/onboarding', async (req, res) => {
    exigir(req, 'onboarding:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({
        onboarding_situacao: z.enum(['pendente', 'agendado', 'realizado']),
        onboarding_data: data('a data do onboarding'),
        onboarding_responsavel_id: id(),
        onboarding_checklist: z.array(z.object({ item: z.string().trim().min(1).max(200), feito: z.boolean() })).max(40).default([]),
        onboarding_pendencias: texto(2000),
        proximo_passo: texto(500),
      }),
      req.body,
    )
    if (d.onboarding_situacao === 'realizado') {
      if (!d.onboarding_data) throw new ErroHttp(400, 'Informe a data em que o onboarding foi realizado.')
      if (d.onboarding_data > hoje()) throw new ErroHttp(400, 'A data de realização não pode estar no futuro.')
    }
    await db.run('UPDATE ped_matriculas SET onboarding_situacao=?, onboarding_data=?, onboarding_responsavel_id=?, onboarding_checklist=?, onboarding_pendencias=?, proximo_passo=?, atualizado_em=? WHERE id=?', d.onboarding_situacao, d.onboarding_data ?? null, d.onboarding_responsavel_id ?? null, JSON.stringify(d.onboarding_checklist), d.onboarding_pendencias ?? null, d.proximo_passo ?? null, agoraIso(), m.id)
    await auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: 'onboarding_atualizado', matricula_id: m.id, dados: d })
    res.json({ ok: true })
  })

  /* ---------------- Itens contratados e ajustes (RF03, IN08) ---------------- */

  r.post('/matriculas/:id/itens', async (req, res) => {
    exigir(req, 'comercial:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(esquemaItem, req.body)
    const iid = await transacao(db, async (tx) => {
      const iid = await criarItem(tx, req, m.id, d)
      await auditar(tx, req, { entidade: 'item', entidade_id: iid, acao: 'criado', matricula_id: m.id, dados: d })
      return iid
    })
    res.status(201).json({ id: iid })
  })

  r.put('/itens/:id', async (req, res) => {
    if (!tem(req, 'comercial:editar')) exigir(req, 'entregas:editar')
    const item = (await db.get('SELECT * FROM ped_itens_contratados WHERE id = ?', req.params.id)) as Record<string, unknown> | undefined
    if (!item) throw new ErroHttp(404, 'Item não encontrado.')
    await exigirAcessoMatricula(db, req, item.matricula_id as string)
    const d = validar(esquemaItem.omit({ quantidade: true, origem: true }), req.body)
    const podeComercial = tem(req, 'comercial:editar')
    await db.run('UPDATE ped_itens_contratados SET tipo_id=?, descricao=?, profissional_id=?, especialidade=?, duracao_min=?, referencia_comercial=?, observacoes=?, atualizado_em=?, autor_id=? WHERE id=?', d.tipo_id ?? null, d.descricao, d.profissional_id ?? null, d.especialidade ?? null, d.duracao_min ?? null,
      podeComercial ? (d.referencia_comercial ?? null) : item.referencia_comercial, d.observacoes ?? null, agoraIso(), req.usuario!.id, item.id,)
    await auditar(db, req, { entidade: 'item', entidade_id: item.id as string, acao: 'atualizado', matricula_id: item.matricula_id as string, dados: d })
    res.json({ ok: true })
  })

  r.post('/itens/:id/ajustes', async (req, res) => {
    exigir(req, 'obrigacoes:ajustar')
    const item = (await db.get('SELECT * FROM ped_itens_contratados WHERE id = ?', req.params.id)) as Record<string, unknown> | undefined
    if (!item) throw new ErroHttp(404, 'Item não encontrado.')
    await exigirAcessoMatricula(db, req, item.matricula_id as string)
    const d = validar(
      z.object({
        delta: z.coerce.number().int().refine((v) => v !== 0, 'O ajuste não pode ser zero.'),
        tipo: z.enum(['ajuste', 'excecao']),
        motivo: textoObrig('o motivo do ajuste', 1000),
      }),
      req.body,
    )
    const r0 = await resumoItem(db, item.id as string)
    if (r0.contratada + d.delta < r0.realizadas) throw new ErroHttp(400, `A quantidade não pode ficar abaixo das ${r0.realizadas} já realizadas.`)
    await transacao(db, async (tx) => {
      tx.run('INSERT INTO ped_ajustes_obrigacao (id, item_id, delta, tipo, motivo, autor_id, criado_em) VALUES (?,?,?,?,?,?,?)', novoId(), item.id, d.delta, d.tipo, d.motivo, req.usuario!.id, agoraIso())
      await sincronizarOcorrencias(tx, req, item.id as string, `Redução registrada: ${d.motivo}`, { delta: d.delta })
      await auditar(tx, req, { entidade: 'item', entidade_id: item.id as string, acao: d.tipo === 'excecao' ? 'excecao_registrada' : 'quantidade_ajustada', matricula_id: item.matricula_id as string, dados: d })
    })
    res.json({ ok: true, ...(await resumoItem(db, item.id as string)) })
  })

  /* ---------------- Pausa (RN12) ---------------- */

  r.post('/matriculas/:id/pausas', async (req, res) => {
    exigir(req, 'matriculas:decidir')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    if (m.situacao !== 'ativa') throw new ErroHttp(400, 'Somente matrículas ativas podem ser pausadas.')
    const d = validar(z.object({ inicio: dataObrig('o início da pausa'), fim: data('o fim previsto'), motivo: textoObrig('o motivo operacional', 500) }), req.body)
    if (d.fim && d.fim < d.inicio) throw new ErroHttp(400, 'O fim da pausa não pode ser antes do início.')
    const pid = novoId()
    await transacao(db, async (tx) => {
      tx.run('INSERT INTO ped_pausas (id, matricula_id, inicio, fim, motivo, criado_em, autor_id) VALUES (?,?,?,?,?,?,?)', pid, m.id, d.inicio, d.fim ?? null, d.motivo, agoraIso(), req.usuario!.id)
      // A pausa NÃO altera vigência nem previsões: a decisão de prazos fica pendente.
      tx.run("UPDATE ped_matriculas SET situacao='pausada', atualizado_em=? WHERE id=?", agoraIso(), m.id)
      await auditar(tx, req, { entidade: 'pausa', entidade_id: pid, acao: 'pausa_registrada', matricula_id: m.id, dados: d })
    })
    await sincronizarStatusAluna(db, req, m.pessoa_id)
    res.status(201).json({ id: pid })
  })

  r.post('/pausas/:id/encerrar', async (req, res) => {
    exigir(req, 'matriculas:decidir')
    const p = (await db.get('SELECT * FROM ped_pausas WHERE id = ?', req.params.id)) as Record<string, string> | undefined
    if (!p) throw new ErroHttp(404, 'Pausa não encontrada.')
    await exigirAcessoMatricula(db, req, p.matricula_id)
    const d = validar(z.object({ fim: dataObrig('a data de retorno') }), req.body)
    if (d.fim < p.inicio) throw new ErroHttp(400, 'O retorno não pode ser antes do início da pausa.')
    await transacao(db, async (tx) => {
      tx.run('UPDATE ped_pausas SET fim=? WHERE id=?', d.fim, p.id)
      tx.run("UPDATE ped_matriculas SET situacao='ativa', atualizado_em=? WHERE id=? AND situacao='pausada'", agoraIso(), p.matricula_id)
      await auditar(tx, req, { entidade: 'pausa', entidade_id: p.id, acao: 'pausa_encerrada', matricula_id: p.matricula_id, dados: d })
    })
    await sincronizarStatusAluna(db, req, ((await db.get('SELECT pessoa_id FROM ped_matriculas WHERE id = ?', p.matricula_id)) as { pessoa_id: string }).pessoa_id)
    res.json({ ok: true })
  })

  r.post('/pausas/:id/decisao', async (req, res) => {
    exigir(req, 'matriculas:decidir')
    const p = (await db.get('SELECT * FROM ped_pausas WHERE id = ?', req.params.id)) as Record<string, string> | undefined
    if (!p) throw new ErroHttp(404, 'Pausa não encontrada.')
    const m = await exigirAcessoMatricula(db, req, p.matricula_id)
    if (p.decisao_prazos !== 'pendente') throw new ErroHttp(409, 'A decisão sobre os prazos desta pausa já foi registrada.')
    const d = validar(
      z.object({
        decisao: z.enum(['manter', 'estender']),
        dias_extensao: z.coerce.number().int().min(1).max(730).optional(),
        mover_previsoes: z.boolean().default(false),
        justificativa: textoObrig('a justificativa da decisão', 1000),
      }),
      req.body,
    )
    if (d.decisao === 'estender' && !d.dias_extensao) throw new ErroHttp(400, 'Informe quantos dias estender.')
    // Leitura antes da transação: as ocorrências que vão andar no calendário.
    const abertas = d.decisao === 'estender' && d.dias_extensao && d.mover_previsoes
      ? ((await db.all("SELECT id, data_prevista FROM ped_ocorrencias WHERE matricula_id=? AND situacao NOT IN ('realizada','cancelada','agendada') AND data_prevista >= ?", m.id, p.inicio)) as { id: string; data_prevista: string }[])
      : []
    await transacao(db, async (tx) => {
      tx.run('UPDATE ped_pausas SET decisao_prazos=?, dias_extensao=?, mover_previsoes=?, decisao_justificativa=?, decidido_por=?, decidido_em=? WHERE id=?', d.decisao, d.dias_extensao ?? null, d.mover_previsoes ? 1 : 0, d.justificativa, req.usuario!.id, agoraIso(), p.id)
      if (d.decisao === 'estender' && d.dias_extensao) {
        if (m.data_fim) {
          const novoFim = somarDias(m.data_fim, d.dias_extensao)
          tx.run('UPDATE ped_matriculas SET data_fim=?, atualizado_em=? WHERE id=?', novoFim, agoraIso(), m.id)
          await auditar(tx, req, { entidade: 'matricula', entidade_id: m.id, acao: 'vigencia_alterada', matricula_id: m.id, dados: { de: m.data_fim, para: novoFim, motivo: `Decisão sobre pausa: ${d.justificativa}` } })
        }
        for (const o of abertas) {
          const nova = somarDias(o.data_prevista, d.dias_extensao)
          tx.run('UPDATE ped_ocorrencias SET data_prevista_original = COALESCE(data_prevista_original, data_prevista), data_prevista=?, atualizado_em=? WHERE id=?', nova, agoraIso(), o.id)
          await historico(tx, req, o.id, 'previsao_alterada', o.data_prevista, nova, `Decisão sobre pausa: ${d.justificativa}`)
        }
      }
      await auditar(tx, req, { entidade: 'pausa', entidade_id: p.id, acao: 'decisao_prazos', matricula_id: m.id, dados: d })
    })
    res.json({ ok: true })
  })

  /* ---------------- Encerrar, cancelar (RN16) ---------------- */

  r.post('/matriculas/:id/finalizar', async (req, res) => {
    exigir(req, 'matriculas:decidir')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ tipo: z.enum(['encerrada', 'cancelada']), data: dataObrig('a data'), motivo: texto(1000) }), req.body)
    if (d.tipo === 'cancelada' && !d.motivo) throw new ErroHttp(400, 'Informe o motivo do cancelamento.')
    if (m.situacao === 'encerrada' || m.situacao === 'cancelada') throw new ErroHttp(409, 'Esta matrícula já foi finalizada.')
    await transacao(db, async (tx) => {
      // Nada é apagado e as obrigações em aberto continuam registradas como estão.
      tx.run('UPDATE ped_matriculas SET situacao=?, encerramento_data=?, encerramento_motivo=?, atualizado_em=? WHERE id=?', d.tipo, d.data, d.motivo ?? null, agoraIso(), m.id)
      tx.run('UPDATE ped_pausas SET fim = COALESCE(fim, ?) WHERE matricula_id = ?', d.data, m.id)
      await auditar(tx, req, { entidade: 'matricula', entidade_id: m.id, acao: d.tipo === 'cancelada' ? 'cancelada' : 'encerrada', matricula_id: m.id, dados: d })
    })
    await sincronizarStatusAluna(db, req, m.pessoa_id)
    res.json({ ok: true })
  })

  /* ---------------- Renovação: transferência explícita de pendências (RN04) ---------------- */

  r.post('/matriculas/:id/transferencias', async (req, res) => {
    exigir(req, 'matriculas:decidir')
    const destino = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({ item_origem_id: idObrig('o item da matrícula anterior'), quantidade: z.coerce.number().int().min(1, 'Transfira pelo menos 1.'), motivo: textoObrig('o motivo da transferência', 1000) }),
      req.body,
    )
    const item = (await db.get('SELECT * FROM ped_itens_contratados WHERE id = ?', d.item_origem_id)) as Record<string, unknown> | undefined
    if (!item) throw new ErroHttp(404, 'Item de origem não encontrado.')
    if (item.matricula_id !== destino.matricula_anterior_id) throw new ErroHttp(400, 'Só é possível transferir pendências da matrícula anterior vinculada a esta renovação.')
    const r0 = await resumoItem(db, item.id as string)
    const restantes = r0.contratada - r0.realizadas
    if (d.quantidade > restantes) throw new ErroHttp(400, `Só restam ${restantes} entrega(s) neste item.`)
    const novoItem = await transacao(db, async (tx) => {
      const agora = agoraIso()
      const novoItem = await criarItem(tx, req, destino.id, {
        tipo_id: item.tipo_id as string | null,
        descricao: item.descricao as string,
        quantidade: 0,
        profissional_id: item.profissional_id as string | null,
        especialidade: item.especialidade as string | null,
        duracao_min: item.duracao_min as number | null,
        origem: 'ajuste',
        referencia_comercial: 'Transferência de pendência da matrícula anterior',
        observacoes: d.motivo,
      })
      // Sai da origem e entra no destino como ajustes vinculados: nada é duplicado.
      tx.run("INSERT INTO ped_ajustes_obrigacao (id, item_id, delta, tipo, motivo, item_relacionado_id, autor_id, criado_em) VALUES (?,?,?,'transferencia_saida',?,?,?,?)", novoId(), item.id, -d.quantidade, d.motivo, novoItem, req.usuario!.id, agora)
      tx.run("INSERT INTO ped_ajustes_obrigacao (id, item_id, delta, tipo, motivo, item_relacionado_id, autor_id, criado_em) VALUES (?,?,?,'transferencia_entrada',?,?,?,?)", novoId(), novoItem, d.quantidade, d.motivo, item.id, req.usuario!.id, agora)
      await sincronizarOcorrencias(tx, req, item.id as string, `Transferida para a renovação: ${d.motivo}`, { delta: -d.quantidade })
      await sincronizarOcorrencias(tx, req, novoItem, d.motivo, { novo: { matricula_id: destino.id, quantidade: d.quantidade } })
      await auditar(tx, req, { entidade: 'item', entidade_id: novoItem, acao: 'pendencia_transferida', matricula_id: destino.id, dados: { ...d, matricula_origem: item.matricula_id } })
      await auditar(tx, req, { entidade: 'item', entidade_id: item.id as string, acao: 'pendencia_transferida_saida', matricula_id: item.matricula_id as string, dados: { ...d, matricula_destino: destino.id } })
      return novoItem
    })
    res.status(201).json({ id: novoItem })
  })

  /* ---------------- Satisfação, continuidade e anotações (RF10) ---------------- */

  r.post('/matriculas/:id/feedbacks', async (req, res) => {
    if (!tem(req, 'entregas:editar')) exigir(req, 'alunas:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ data: dataObrig(), responsavel_id: id(), feedback: textoObrig('o feedback', 2000), acao_acompanhamento: texto(1000) }), req.body)
    const fid = novoId()
    await db.run('INSERT INTO ped_feedbacks (id, matricula_id, data, responsavel_id, feedback, acao_acompanhamento, criado_em, autor_id) VALUES (?,?,?,?,?,?,?,?)', fid, m.id, d.data, d.responsavel_id ?? req.usuario!.id, d.feedback, d.acao_acompanhamento ?? null, agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'feedback', entidade_id: fid, acao: 'registrado', matricula_id: m.id })
    res.status(201).json({ id: fid })
  })

  r.put('/matriculas/:id/continuidade', async (req, res) => {
    if (!tem(req, 'entregas:editar')) exigir(req, 'comercial:editar')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ interesse_renovacao: z.enum(['sim', 'nao', 'talvez', 'nao_informado']) }), req.body)
    await db.run('UPDATE ped_matriculas SET interesse_renovacao=?, atualizado_em=? WHERE id=?', d.interesse_renovacao, agoraIso(), m.id)
    await auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: 'interesse_renovacao', matricula_id: m.id, dados: d })
    res.json({ ok: true })
  })

  r.post('/matriculas/:id/anotacoes', async (req, res) => {
    const d = validar(z.object({ tipo: z.enum(['operacional', 'pedagogica']), texto: textoObrig('o texto', 2000) }), req.body)
    exigir(req, d.tipo === 'operacional' ? 'notas:internas' : 'notas:pedagogicas')
    const m = await exigirAcessoMatricula(db, req, req.params.id as string)
    const aid = novoId()
    await db.run('INSERT INTO ped_anotacoes (id, matricula_id, tipo, texto, criado_em, autor_id) VALUES (?,?,?,?,?,?)', aid, m.id, d.tipo, d.texto, agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'anotacao', entidade_id: aid, acao: 'registrada', matricula_id: m.id, dados: { tipo: d.tipo } })
    res.status(201).json({ id: aid })
  })

  return r
}
