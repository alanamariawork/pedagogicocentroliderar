import { Router } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, transacao, type BD, type TX } from '../db'
import { ErroHttp, exigir, exigirEquipe } from '../auth'
import { auditar, booleano, data, id, idObrig, link, minutos, texto, textoObrig, validar } from '../servicos'
import { CAMPOS_ALUNA, CORES_OPCAO, type Lista } from '../../shared/listas'
import type { Permissao } from '../../shared/permissoes'
import { CORES_PILAR } from '../../shared/pilares'

const bool = () => booleano().optional()
const ordem = () => z.coerce.number().int().min(0).max(999).optional()

/** Cadastros simples configuráveis (RF11). Nada é apagado: desativar preserva o histórico. */
type Catalogo = { tabela: string; permissao: Permissao; esquema: z.ZodObject; ordem: string; lista?: Lista; checar?: (db: BD, d: Record<string, unknown>) => Promise<void> | void }

const esquemaOpcao = z.object({ nome: textoObrig('o nome', 80), cor: z.enum(CORES_OPCAO).default('neutro'), ordem: ordem(), ativo: bool() })
const opcoes = (lista: Lista): Catalogo => ({ tabela: 'opcoes_lista', permissao: 'config:editar', esquema: esquemaOpcao, ordem: 'ordem, nome', lista })

const CATALOGOS: Record<string, Catalogo> = {
  'status-aluna': opcoes('status_aluna'),
  saude: opcoes('saude'),
  engajamento: opcoes('engajamento'),
  segmentos: opcoes('segmento'),
  'canais-venda': opcoes('canal_venda'),
  programas: {
    tabela: 'programas',
    permissao: 'config:editar',
    esquema: z.object({ nome: textoObrig('o nome'), descricao: texto(), ativo: bool() }),
    ordem: 'nome',
  },
  profissionais: {
    tabela: 'profissionais',
    permissao: 'config:editar',
    esquema: z.object({
      nome: textoObrig('o nome'),
      especialidade: texto(200),
      contato: texto(200),
      // E-mail profissional da agenda. Vazio = vale o e-mail da conta da equipe vinculada (Equipe e permissões).
      email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(200)]).optional().transform((v) => v || null),
      ativo: bool(),
    }),
    ordem: 'nome',
  },
  'tipos-entregavel': {
    tabela: 'tipos_entregavel',
    permissao: 'config:editar',
    esquema: z.object({
      nome: textoObrig('o nome'),
      descricao: texto(),
      duracao_padrao_min: minutos(),
      individual: bool(),
      ativo: bool(),
    }),
    ordem: 'nome',
  },
  'motivos-impedimento': {
    tabela: 'motivos_impedimento',
    permissao: 'config:editar',
    esquema: z.object({ nome: textoObrig('o nome'), exige_descricao: bool(), ativo: bool() }),
    ordem: 'nome',
  },
  trilhas: {
    tabela: 'trilhas',
    permissao: 'pedagogico:configurar',
    esquema: z.object({ nome: textoObrig('o nome'), descricao: texto(), ordem: ordem(), ativo: bool() }),
    ordem: 'ordem, nome',
  },
  turmas: {
    tabela: 'turmas',
    permissao: 'config:editar',
    esquema: z.object({ nome: textoObrig('o nome'), descricao: texto(), data_inicio: data('a data de início'), ativo: bool() }),
    ordem: 'nome',
  },
  frases: {
    tabela: 'frases',
    permissao: 'config:editar',
    esquema: z.object({ texto: textoObrig('a frase', 500), autoria: texto(200), ativo: bool() }),
    ordem: 'criado_em',
  },
  links: {
    tabela: 'links',
    permissao: 'config:editar',
    esquema: z.object({
      titulo: textoObrig('o título', 120),
      url: z.string({ error: 'Informe o endereço do link.' }).trim().min(1, 'Informe o endereço do link.').pipe(link() as unknown as z.ZodType<string, string>),
      categoria: texto(80),
      descricao: texto(300),
      destaque_inicio: bool(),
      ordem: ordem(),
      ativo: bool(),
    }),
    ordem: "COALESCE(categoria, ''), ordem, titulo",
  },
  pilares: {
    tabela: 'pilares',
    permissao: 'pedagogico:configurar',
    esquema: z.object({ nome: textoObrig('o nome'), descricao: texto(), cor: z.enum(CORES_PILAR).optional(), ordem: ordem(), ativo: bool() }),
    ordem: 'ordem, nome',
  },
}

const CHAVES_CONFIG = {
  janela_termino_dias: z.coerce.number().int().min(1).max(365),
  texto_ajuda_aluna: z.string().trim().max(2000),
  agenda_antecedencia_horas: z.coerce.number().int().min(0).max(720),
  agenda_dias_a_frente: z.coerce.number().int().min(1).max(180),
  mural_publicacao: z.enum(['direta', 'moderada', 'somente_equipe']),
  mural_visibilidade: z.enum(['ativas', 'todas']),
} as const

export function rotasConfiguracao(db: BD, ctx: ContextoApp) {
  const r = Router()
  r.use(exigirEquipe)

  r.get('/catalogos', async (_req, res) => {
    const saida: Record<string, unknown> = {}
    for (const [nome, c] of Object.entries(CATALOGOS))
      saida[nome] = c.lista
        ? (await db.all(`SELECT * FROM ped_${c.tabela} WHERE lista = ? ORDER BY ativo DESC, ${c.ordem}`, c.lista))
        : (await db.all(`SELECT * FROM ped_${c.tabela} ORDER BY ativo DESC, ${c.ordem}`))
    saida.campos_visibilidade = (await db.all('SELECT campo, visivel_aluna FROM ped_campos_visibilidade'))
    saida.configuracoes = Object.fromEntries(((await db.all('SELECT chave, valor FROM ped_configuracoes')) as { chave: string; valor: string }[]).map((x) => [x.chave, x.valor]))
    res.json(saida)
  })

  for (const [nome, c] of Object.entries(CATALOGOS)) {
    const campos = Object.keys(c.esquema.shape)
    const normalizar = (d: Record<string, unknown>) =>
      campos.map((k) => {
        const v = d[k]
        if (typeof v === 'boolean') return v ? 1 : 0
        if (v === undefined) return k === 'ativo' || k === 'individual' ? 1 : ['ordem', 'exige_descricao', 'destaque_inicio'].includes(k) ? 0 : null
        return v
      })

    r.post(`/catalogos/${nome}`, async (req, res) => {
      exigir(req, c.permissao)
      const d = validar(c.esquema, req.body) as Record<string, unknown>
      await c.checar?.(db, d)
      const novo = novoId()
      const agora = agoraIso()
      const extra = c.lista ? ['lista'] : []
      await db.run(`INSERT INTO ped_${c.tabela} (id, ${[...extra, ...campos].join(', ')}, criado_em, atualizado_em, autor_id) VALUES (?, ${[...extra, ...campos].map(() => '?').join(', ')}, ?, ?, ?)`, novo, ...(c.lista ? [c.lista] : []), ...normalizar(d), agora, agora, req.usuario!.id)
      await auditar(db, req, { entidade: c.tabela, entidade_id: novo, acao: 'criado', dados: d })
      res.status(201).json({ id: novo })
    })

    r.put(`/catalogos/${nome}/:id`, async (req, res) => {
      exigir(req, c.permissao)
      const d = validar(c.esquema, req.body) as Record<string, unknown>
      await c.checar?.(db, d)
      const info = (await db.run(`UPDATE ped_${c.tabela} SET ${campos.map((k) => `${k} = ?`).join(', ')}, atualizado_em = ?, autor_id = ? WHERE id = ?${c.lista ? ' AND lista = ?' : ''}`, ...normalizar(d), agoraIso(), req.usuario!.id, req.params.id, ...(c.lista ? [c.lista] : [])))
      if (info.changes === 0) throw new ErroHttp(404, 'Registro não encontrado.')
      await auditar(db, req, { entidade: c.tabela, entidade_id: req.params.id as string, acao: 'atualizado', dados: d })
      res.json({ ok: true })
    })
  }

  // Marca "visível à aluna" de cada campo. Os campos sempre internos não podem ser liberados.
  r.put('/campos-visibilidade', async (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(z.record(z.string(), z.boolean()), req.body)
    await transacao(db, async (tx) => {
      for (const [campo, visivel] of Object.entries(d)) {
        const def = CAMPOS_ALUNA.find((c) => c.campo === campo)
        if (!def) throw new ErroHttp(400, `Campo desconhecido: ${campo}.`)
        if (visivel && def.sempreInterno) throw new ErroHttp(400, `"${def.rotulo}" é um dado interno e não pode aparecer no portal.`)
        tx.run('UPDATE ped_campos_visibilidade SET visivel_aluna = ?, atualizado_em = ?, autor_id = ? WHERE campo = ?', visivel ? 1 : 0, agoraIso(), req.usuario!.id, campo)
      }
      await auditar(tx, req, { entidade: 'campos_visibilidade', entidade_id: 'geral', acao: 'atualizado', dados: d })
    })
    res.json({ ok: true })
  })

  r.put('/configuracoes', async (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(z.object(CHAVES_CONFIG).partial(), req.body)
    await transacao(db, async (tx) => {
      for (const [k, v] of Object.entries(d)) if (v !== undefined) tx.run('INSERT INTO ped_configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor', k, String(v))
      await auditar(tx, req, { entidade: 'configuracoes', entidade_id: 'geral', acao: 'atualizado', dados: d })
    })
    res.json({ ok: true })
  })

  /* ---------------- Modelos de pacote (RF03) ---------------- */

  const esquemaItemModelo = z.object({
    tipo_id: id(),
    descricao: textoObrig('a descrição do item'),
    quantidade: z.coerce.number({ error: 'Informe a quantidade.' }).int().min(0, 'A quantidade não pode ser negativa.').max(500),
    profissional_id: id(),
    especialidade: texto(200),
    duracao_min: minutos(),
    origem: z.enum(['pacote', 'bonus']).default('pacote'),
    observacoes: texto(),
  })
  const esquemaPacote = z.object({
    programa_id: id(),
    nome: textoObrig('o nome do pacote'),
    descricao: texto(),
    duracao_meses: z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(1).max(60).nullable()),
    ativo: booleano().optional(),
    itens: z.array(esquemaItemModelo).max(100),
  })

  r.get('/pacotes', async (_req, res) => {
    const pacotes = (await db.all('SELECT p.*, pg.nome AS programa_nome FROM ped_pacotes p LEFT JOIN ped_programas pg ON pg.id = p.programa_id ORDER BY p.ativo DESC, p.nome')) as Record<string, unknown>[]
    const itens = (await db.all('SELECT pi.*, t.nome AS tipo_nome, pr.nome AS profissional_nome FROM ped_pacote_itens pi LEFT JOIN ped_tipos_entregavel t ON t.id = pi.tipo_id LEFT JOIN ped_profissionais pr ON pr.id = pi.profissional_id ORDER BY pi.ordem')) as Record<string, unknown>[]
    const usos = (await db.all('SELECT pacote_origem_id AS id, COUNT(*) n FROM ped_matriculas WHERE pacote_origem_id IS NOT NULL GROUP BY pacote_origem_id')) as { id: string; n: number }[]
    const mapaUsos = new Map(usos.map((u) => [u.id, u.n]))
    res.json(pacotes.map((p) => ({ ...p, itens: itens.filter((i) => i.pacote_id === p.id), matriculas_que_usaram: mapaUsos.get(p.id as string) ?? 0 })))
  })

  function gravarItensModelo(tx: TX, pacoteId: string, itens: z.infer<typeof esquemaItemModelo>[]) {
    tx.run('DELETE FROM ped_pacote_itens WHERE pacote_id = ?', pacoteId)
    itens.forEach((i, n) =>
      tx.run(
        `INSERT INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, especialidade, duracao_min, origem, observacoes, ordem)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        novoId(), pacoteId, i.tipo_id ?? null, i.descricao, i.quantidade, i.profissional_id ?? null, i.especialidade ?? null, i.duracao_min ?? null, i.origem, i.observacoes ?? null, n,
      ),
    )
  }

  r.post('/pacotes', async (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(esquemaPacote, req.body)
    const novo = novoId()
    const agora = agoraIso()
    await transacao(db, async (tx) => {
      tx.run('INSERT INTO ped_pacotes (id, programa_id, nome, descricao, duracao_meses, ativo, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,1,?,?,?)', novo, d.programa_id ?? null, d.nome, d.descricao ?? null, d.duracao_meses ?? null, agora, agora, req.usuario!.id)
      gravarItensModelo(tx, novo, d.itens)
      await auditar(tx, req, { entidade: 'pacote', entidade_id: novo, acao: 'criado', dados: d })
    })
    res.status(201).json({ id: novo })
  })

  // Editar o modelo NÃO altera matrículas existentes: elas guardam uma cópia dos itens (RN03).
  r.put('/pacotes/:id', async (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(esquemaPacote, req.body)
    if (!(await db.get('SELECT 1 FROM ped_pacotes WHERE id = ?', req.params.id))) throw new ErroHttp(404, 'Pacote não encontrado.')
    await transacao(db, async (tx) => {
      tx.run('UPDATE ped_pacotes SET programa_id=?, nome=?, descricao=?, duracao_meses=?, ativo=?, atualizado_em=?, autor_id=? WHERE id=?', d.programa_id ?? null, d.nome, d.descricao ?? null, d.duracao_meses ?? null, d.ativo === false ? 0 : 1, agoraIso(), req.usuario!.id, req.params.id)
      gravarItensModelo(tx, req.params.id as string, d.itens)
      await auditar(tx, req, { entidade: 'pacote', entidade_id: req.params.id as string, acao: 'atualizado', dados: d })
    })
    res.json({ ok: true })
  })

  /* ---------------- Decisões pendentes (RF11) ---------------- */

  const esquemaDecisao = z.object({
    questao: textoObrig('a questão', 1000),
    impacto: texto(),
    responsavel: texto(200),
    situacao: z.enum(['aberta', 'em_analise', 'decidida']).default('aberta'),
    decisao: texto(),
    data_decisao: data('a data da decisão'),
  })

  r.get('/decisoes', async (_req, res) => {
    res.json((await db.all("SELECT * FROM ped_decisoes_pendentes ORDER BY CASE situacao WHEN 'aberta' THEN 0 WHEN 'em_analise' THEN 1 ELSE 2 END, criado_em")))
  })

  async function conferirDecisao(d: z.infer<typeof esquemaDecisao>) {
    if (d.situacao === 'decidida' && (!d.decisao || !d.data_decisao)) throw new ErroHttp(400, 'Para marcar como decidida, informe a decisão e a data.')
  }

  r.post('/decisoes', async (req, res) => {
    exigir(req, 'decisoes:editar')
    const d = validar(esquemaDecisao, req.body)
    await conferirDecisao(d)
    const novo = novoId()
    const agora = agoraIso()
    await db.run('INSERT INTO ped_decisoes_pendentes (id, questao, impacto, responsavel, situacao, decisao, data_decisao, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?)', novo, d.questao, d.impacto ?? null, d.responsavel ?? null, d.situacao, d.decisao ?? null, d.data_decisao ?? null, agora, agora, req.usuario!.id)
    await auditar(db, req, { entidade: 'decisao', entidade_id: novo, acao: 'criada', dados: d })
    res.status(201).json({ id: novo })
  })

  r.put('/decisoes/:id', async (req, res) => {
    exigir(req, 'decisoes:editar')
    const d = validar(esquemaDecisao, req.body)
    await conferirDecisao(d)
    const info = (await db.run('UPDATE ped_decisoes_pendentes SET questao=?, impacto=?, responsavel=?, situacao=?, decisao=?, data_decisao=?, atualizado_em=?, autor_id=? WHERE id=?', d.questao, d.impacto ?? null, d.responsavel ?? null, d.situacao, d.decisao ?? null, d.data_decisao ?? null, agoraIso(), req.usuario!.id, req.params.id))
    if (info.changes === 0) throw new ErroHttp(404, 'Decisão não encontrada.')
    await auditar(db, req, { entidade: 'decisao', entidade_id: req.params.id as string, acao: 'atualizada', dados: d })
    res.json({ ok: true })
  })

  /* ---------------- Auditoria geral ---------------- */

  r.get('/auditoria', async (req, res) => {
    exigir(req, 'auditoria:ver')
    const q = validar(z.object({ entidade: z.string().optional(), entidade_id: idObrig('o registro').optional() }), req.query)
    const linhas = (await db.all(`SELECT a.*, u.nome AS autor_nome FROM ped_auditoria a LEFT JOIN ped_usuarios u ON u.id = a.autor_id
         WHERE (@entidade IS NULL OR a.entidade = @entidade) AND (@entidade_id IS NULL OR a.entidade_id = @entidade_id)
         ORDER BY a.criado_em DESC LIMIT 300`, { entidade: q.entidade ?? null, entidade_id: q.entidade_id ?? null }))
    res.json(linhas)
  })

  return r
}
