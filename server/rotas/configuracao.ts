import { Router } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import { ErroHttp, exigir, exigirEquipe } from '../auth'
import { auditar, booleano, data, id, idObrig, link, minutos, texto, textoObrig, validar } from '../servicos'
import { CAMPOS_ALUNA, CORES_OPCAO, type Lista } from '../../shared/listas'
import type { Permissao } from '../../shared/permissoes'

const bool = () => booleano().optional()
const ordem = () => z.coerce.number().int().min(0).max(999).optional()

/** Cadastros simples configuráveis (RF11). Nada é apagado: desativar preserva o histórico. */
type Catalogo = { tabela: string; permissao: Permissao; esquema: z.ZodObject; ordem: string; lista?: Lista; checar?: (db: BD, d: Record<string, unknown>) => void }

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
    esquema: z.object({ nome: textoObrig('o nome'), especialidade: texto(200), contato: texto(200), ativo: bool() }),
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
    esquema: z.object({ nome: textoObrig('o nome'), descricao: texto(), ordem: ordem(), ativo: bool() }),
    ordem: 'ordem, nome',
  },
}

const CHAVES_CONFIG = {
  janela_termino_dias: z.coerce.number().int().min(1).max(365),
  texto_ajuda_aluna: z.string().trim().max(2000),
} as const

export function rotasConfiguracao(db: BD) {
  const r = Router()
  r.use(exigirEquipe)

  r.get('/catalogos', (_req, res) => {
    const saida: Record<string, unknown> = {}
    for (const [nome, c] of Object.entries(CATALOGOS))
      saida[nome] = c.lista
        ? db.prepare(`SELECT * FROM ${c.tabela} WHERE lista = ? ORDER BY ativo DESC, ${c.ordem}`).all(c.lista)
        : db.prepare(`SELECT * FROM ${c.tabela} ORDER BY ativo DESC, ${c.ordem}`).all()
    saida.campos_visibilidade = db.prepare('SELECT campo, visivel_aluna FROM campos_visibilidade').all()
    saida.configuracoes = Object.fromEntries((db.prepare('SELECT chave, valor FROM configuracoes').all() as { chave: string; valor: string }[]).map((x) => [x.chave, x.valor]))
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

    r.post(`/catalogos/${nome}`, (req, res) => {
      exigir(req, c.permissao)
      const d = validar(c.esquema, req.body) as Record<string, unknown>
      c.checar?.(db, d)
      const novo = novoId()
      const agora = agoraIso()
      const extra = c.lista ? ['lista'] : []
      db.prepare(
        `INSERT INTO ${c.tabela} (id, ${[...extra, ...campos].join(', ')}, criado_em, atualizado_em, autor_id) VALUES (?, ${[...extra, ...campos].map(() => '?').join(', ')}, ?, ?, ?)`,
      ).run(novo, ...(c.lista ? [c.lista] : []), ...normalizar(d), agora, agora, req.usuario!.id)
      auditar(db, req, { entidade: c.tabela, entidade_id: novo, acao: 'criado', dados: d })
      res.status(201).json({ id: novo })
    })

    r.put(`/catalogos/${nome}/:id`, (req, res) => {
      exigir(req, c.permissao)
      const d = validar(c.esquema, req.body) as Record<string, unknown>
      c.checar?.(db, d)
      const info = db
        .prepare(`UPDATE ${c.tabela} SET ${campos.map((k) => `${k} = ?`).join(', ')}, atualizado_em = ?, autor_id = ? WHERE id = ?${c.lista ? ' AND lista = ?' : ''}`)
        .run(...normalizar(d), agoraIso(), req.usuario!.id, req.params.id, ...(c.lista ? [c.lista] : []))
      if (info.changes === 0) throw new ErroHttp(404, 'Registro não encontrado.')
      auditar(db, req, { entidade: c.tabela, entidade_id: req.params.id as string, acao: 'atualizado', dados: d })
      res.json({ ok: true })
    })
  }

  // Marca "visível à aluna" de cada campo. Os campos sempre internos não podem ser liberados.
  r.put('/campos-visibilidade', (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(z.record(z.string(), z.boolean()), req.body)
    const up = db.prepare('UPDATE campos_visibilidade SET visivel_aluna = ?, atualizado_em = ?, autor_id = ? WHERE campo = ?')
    for (const [campo, visivel] of Object.entries(d)) {
      const def = CAMPOS_ALUNA.find((c) => c.campo === campo)
      if (!def) throw new ErroHttp(400, `Campo desconhecido: ${campo}.`)
      if (visivel && def.sempreInterno) throw new ErroHttp(400, `"${def.rotulo}" é um dado interno e não pode aparecer no portal.`)
      up.run(visivel ? 1 : 0, agoraIso(), req.usuario!.id, campo)
    }
    auditar(db, req, { entidade: 'campos_visibilidade', entidade_id: 'geral', acao: 'atualizado', dados: d })
    res.json({ ok: true })
  })

  r.put('/configuracoes', (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(z.object(CHAVES_CONFIG).partial(), req.body)
    const up = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
    for (const [k, v] of Object.entries(d)) if (v !== undefined) up.run(k, String(v))
    auditar(db, req, { entidade: 'configuracoes', entidade_id: 'geral', acao: 'atualizado', dados: d })
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

  r.get('/pacotes', (_req, res) => {
    const pacotes = db.prepare('SELECT p.*, pg.nome AS programa_nome FROM pacotes p LEFT JOIN programas pg ON pg.id = p.programa_id ORDER BY p.ativo DESC, p.nome').all() as Record<string, unknown>[]
    const itens = db
      .prepare('SELECT pi.*, t.nome AS tipo_nome, pr.nome AS profissional_nome FROM pacote_itens pi LEFT JOIN tipos_entregavel t ON t.id = pi.tipo_id LEFT JOIN profissionais pr ON pr.id = pi.profissional_id ORDER BY pi.ordem')
      .all() as Record<string, unknown>[]
    const usos = db.prepare('SELECT pacote_origem_id AS id, COUNT(*) n FROM matriculas WHERE pacote_origem_id IS NOT NULL GROUP BY pacote_origem_id').all() as { id: string; n: number }[]
    const mapaUsos = new Map(usos.map((u) => [u.id, u.n]))
    res.json(pacotes.map((p) => ({ ...p, itens: itens.filter((i) => i.pacote_id === p.id), matriculas_que_usaram: mapaUsos.get(p.id as string) ?? 0 })))
  })

  function gravarItensModelo(pacoteId: string, itens: z.infer<typeof esquemaItemModelo>[]) {
    db.prepare('DELETE FROM pacote_itens WHERE pacote_id = ?').run(pacoteId)
    const ins = db.prepare(
      `INSERT INTO pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, especialidade, duracao_min, origem, observacoes, ordem)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    itens.forEach((i, n) =>
      ins.run(novoId(), pacoteId, i.tipo_id ?? null, i.descricao, i.quantidade, i.profissional_id ?? null, i.especialidade ?? null, i.duracao_min ?? null, i.origem, i.observacoes ?? null, n),
    )
  }

  r.post('/pacotes', (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(esquemaPacote, req.body)
    const novo = novoId()
    const agora = agoraIso()
    db.transaction(() => {
      db.prepare('INSERT INTO pacotes (id, programa_id, nome, descricao, duracao_meses, ativo, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,1,?,?,?)').run(
        novo, d.programa_id ?? null, d.nome, d.descricao ?? null, d.duracao_meses ?? null, agora, agora, req.usuario!.id)
      gravarItensModelo(novo, d.itens)
      auditar(db, req, { entidade: 'pacote', entidade_id: novo, acao: 'criado', dados: d })
    })()
    res.status(201).json({ id: novo })
  })

  // Editar o modelo NÃO altera matrículas existentes: elas guardam uma cópia dos itens (RN03).
  r.put('/pacotes/:id', (req, res) => {
    exigir(req, 'config:editar')
    const d = validar(esquemaPacote, req.body)
    db.transaction(() => {
      const info = db
        .prepare('UPDATE pacotes SET programa_id=?, nome=?, descricao=?, duracao_meses=?, ativo=?, atualizado_em=?, autor_id=? WHERE id=?')
        .run(d.programa_id ?? null, d.nome, d.descricao ?? null, d.duracao_meses ?? null, d.ativo === false ? 0 : 1, agoraIso(), req.usuario!.id, req.params.id)
      if (info.changes === 0) throw new ErroHttp(404, 'Pacote não encontrado.')
      gravarItensModelo(req.params.id as string, d.itens)
      auditar(db, req, { entidade: 'pacote', entidade_id: req.params.id as string, acao: 'atualizado', dados: d })
    })()
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

  r.get('/decisoes', (_req, res) => {
    res.json(db.prepare("SELECT * FROM decisoes_pendentes ORDER BY CASE situacao WHEN 'aberta' THEN 0 WHEN 'em_analise' THEN 1 ELSE 2 END, criado_em").all())
  })

  function conferirDecisao(d: z.infer<typeof esquemaDecisao>) {
    if (d.situacao === 'decidida' && (!d.decisao || !d.data_decisao)) throw new ErroHttp(400, 'Para marcar como decidida, informe a decisão e a data.')
  }

  r.post('/decisoes', (req, res) => {
    exigir(req, 'decisoes:editar')
    const d = validar(esquemaDecisao, req.body)
    conferirDecisao(d)
    const novo = novoId()
    const agora = agoraIso()
    db.prepare(
      'INSERT INTO decisoes_pendentes (id, questao, impacto, responsavel, situacao, decisao, data_decisao, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(novo, d.questao, d.impacto ?? null, d.responsavel ?? null, d.situacao, d.decisao ?? null, d.data_decisao ?? null, agora, agora, req.usuario!.id)
    auditar(db, req, { entidade: 'decisao', entidade_id: novo, acao: 'criada', dados: d })
    res.status(201).json({ id: novo })
  })

  r.put('/decisoes/:id', (req, res) => {
    exigir(req, 'decisoes:editar')
    const d = validar(esquemaDecisao, req.body)
    conferirDecisao(d)
    const info = db
      .prepare('UPDATE decisoes_pendentes SET questao=?, impacto=?, responsavel=?, situacao=?, decisao=?, data_decisao=?, atualizado_em=?, autor_id=? WHERE id=?')
      .run(d.questao, d.impacto ?? null, d.responsavel ?? null, d.situacao, d.decisao ?? null, d.data_decisao ?? null, agoraIso(), req.usuario!.id, req.params.id)
    if (info.changes === 0) throw new ErroHttp(404, 'Decisão não encontrada.')
    auditar(db, req, { entidade: 'decisao', entidade_id: req.params.id as string, acao: 'atualizada', dados: d })
    res.json({ ok: true })
  })

  /* ---------------- Auditoria geral ---------------- */

  r.get('/auditoria', (req, res) => {
    exigir(req, 'auditoria:ver')
    const q = validar(z.object({ entidade: z.string().optional(), entidade_id: idObrig('o registro').optional() }), req.query)
    const linhas = db
      .prepare(
        `SELECT a.*, u.nome AS autor_nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.autor_id
         WHERE (@entidade IS NULL OR a.entidade = @entidade) AND (@entidade_id IS NULL OR a.entidade_id = @entidade_id)
         ORDER BY a.criado_em DESC LIMIT 300`,
      )
      .all({ entidade: q.entidade ?? null, entidade_id: q.entidade_id ?? null })
    res.json(linhas)
  })

  return r
}
