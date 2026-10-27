import { Router, type Request } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
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
} from '../servicos'
import { somarDias } from '../../shared/datas'

const esquemaPessoa = z.object({
  nome: textoObrig('o nome', 200),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().toLowerCase().email('E-mail inválido.').nullable().optional()),
  telefone: texto(40),
  cidade: texto(120),
  observacao_operacional: texto(500),
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
  turma: texto(120),
  data_inicio: dataObrig('a data de início da vigência'),
  data_fim: data('a data de término da vigência'),
  responsavel_id: id(),
  mentora_id: id(),
  contrato_situacao: z.enum(['pendente', 'enviado', 'assinado']).default('pendente'),
  contrato_link: link(),
  fonte_comercial: texto(500),
  condicoes_comerciais: texto(4000),
  matricula_anterior_id: id(),
  pacote_id: id(),
  itens_extras: z.array(esquemaItem).max(100).default([]),
})

export function rotasAlunas(db: BD) {
  const r = Router()
  r.use(exigirEquipe)

  /* ---------------- Lista (RF02) ---------------- */

  r.get('/pessoas', (req, res) => {
    exigir(req, 'alunas:ver')
    const q = validar(z.object({ busca: z.string().max(100).optional(), situacao: z.string().optional() }), req.query)
    const esc = escopoMatriculas(req)
    const pessoas = db
      .prepare(
        `SELECT p.id, p.nome, p.email, p.telefone, p.demonstracao,
           (SELECT COUNT(*) FROM matriculas m WHERE m.pessoa_id = p.id AND ${esc.sql}) AS matriculas
         FROM pessoas p
         WHERE (@busca IS NULL OR p.nome LIKE @busca OR p.email LIKE @busca OR p.telefone LIKE @busca)
           AND EXISTS (SELECT 1 FROM matriculas m WHERE m.pessoa_id = p.id AND ${esc.sql}) OR (@ver_sem_matricula = 1 AND NOT EXISTS (SELECT 1 FROM matriculas m WHERE m.pessoa_id = p.id) AND (@busca IS NULL OR p.nome LIKE @busca))
         ORDER BY p.nome COLLATE NOCASE`,
      )
      .all({ busca: q.busca ? `%${q.busca}%` : null, ver_sem_matricula: req.usuario!.perfil === 'mentora' ? 0 : 1, ...esc.params }) as Record<string, unknown>[]

    const atuais = db
      .prepare(
        `SELECT m.id, m.pessoa_id, m.situacao, m.contrato_situacao, m.onboarding_situacao, m.data_inicio, m.data_fim, m.matricula_anterior_id,
                pg.nome AS programa_nome, t.nome AS trilha_nome, pl.nome AS pilar_nome,
                (SELECT COUNT(*) FROM ocorrencias o WHERE o.matricula_id = m.id AND o.situacao NOT IN ('realizada','cancelada')) AS entregas_restantes,
                (SELECT COUNT(*) FROM ocorrencias o WHERE o.matricula_id = m.id AND o.situacao NOT IN ('realizada','cancelada') AND o.data_prevista < @hoje) AS entregas_vencidas
         FROM matriculas m LEFT JOIN programas pg ON pg.id = m.programa_id
         LEFT JOIN jornadas j ON j.matricula_id = m.id LEFT JOIN trilhas t ON t.id = j.trilha_id LEFT JOIN pilares pl ON pl.id = j.pilar_id
         WHERE ${esc.sql}
         ORDER BY CASE m.situacao WHEN 'ativa' THEN 0 WHEN 'pausada' THEN 1 ELSE 2 END, m.data_inicio DESC`,
      )
      .all({ hoje: hoje(), ...esc.params }) as Record<string, unknown>[]
    const porPessoa = new Map<string, Record<string, unknown>>()
    for (const m of atuais) if (!porPessoa.has(m.pessoa_id as string)) porPessoa.set(m.pessoa_id as string, m)
    let lista = pessoas.map((p) => ({ ...p, matricula_atual: porPessoa.get(p.id as string) ?? null }))
    if (q.situacao) lista = lista.filter((p) => (p.matricula_atual as { situacao?: string } | null)?.situacao === q.situacao)
    res.json(lista)
  })

  /* ---------------- Cadastro: pessoa + matrícula (ET01) ---------------- */

  function criarMatricula(req: Request, pessoaId: string, d: z.infer<typeof esquemaMatricula>): string {
    if (d.data_fim && d.data_fim < d.data_inicio) throw new ErroHttp(400, 'O término da vigência não pode ser antes do início.')
    if (d.matricula_anterior_id) {
      const ant = db.prepare('SELECT pessoa_id FROM matriculas WHERE id = ?').get(d.matricula_anterior_id) as { pessoa_id: string } | undefined
      if (!ant || ant.pessoa_id !== pessoaId) throw new ErroHttp(400, 'A matrícula anterior precisa ser da mesma pessoa.')
    }
    const pacote = d.pacote_id
      ? (db.prepare('SELECT * FROM pacotes WHERE id = ?').get(d.pacote_id) as { id: string; nome: string } | undefined)
      : undefined
    if (d.pacote_id && !pacote) throw new ErroHttp(400, 'Pacote não encontrado.')
    const mid = novoId()
    const agora = agoraIso()
    db.prepare(
      `INSERT INTO matriculas (id, pessoa_id, programa_id, matricula_anterior_id, turma, data_inicio, data_fim, situacao, contrato_situacao, contrato_link,
         fonte_comercial, condicoes_comerciais, responsavel_id, mentora_id, pacote_origem_id, pacote_origem_nome, criado_em, atualizado_em, autor_id)
       VALUES (?,?,?,?,?,?,?,'ativa',?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      mid, pessoaId, d.programa_id ?? null, d.matricula_anterior_id ?? null, d.turma ?? null, d.data_inicio, d.data_fim ?? null,
      d.contrato_situacao, d.contrato_link ?? null, d.fonte_comercial ?? null, d.condicoes_comerciais ?? null,
      d.responsavel_id ?? null, d.mentora_id ?? null, pacote?.id ?? null, pacote?.nome ?? null, agora, agora, req.usuario!.id,
    )
    // RN03: aplicar o modelo = COPIAR os itens. Mudanças futuras no modelo não afetam esta matrícula.
    const itens: z.infer<typeof esquemaItem>[] = []
    if (pacote) {
      const modelo = db.prepare('SELECT * FROM pacote_itens WHERE pacote_id = ? ORDER BY ordem').all(pacote.id) as Record<string, unknown>[]
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
    for (const i of itens) criarItem(req, mid, i)
    auditar(db, req, { entidade: 'matricula', entidade_id: mid, acao: d.matricula_anterior_id ? 'renovacao_criada' : 'criada', matricula_id: mid, pessoa_id: pessoaId, dados: { ...d, itens: itens.length } })
    return mid
  }

  function criarItem(req: Request, matriculaId: string, i: z.infer<typeof esquemaItem>, extra?: { pacote_item_origem_id?: string }) {
    const iid = novoId()
    const agora = agoraIso()
    db.prepare(
      `INSERT INTO itens_contratados (id, matricula_id, tipo_id, descricao, quantidade, profissional_id, especialidade, duracao_min, origem, referencia_comercial, observacoes, pacote_item_origem_id, criado_em, atualizado_em, autor_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(iid, matriculaId, i.tipo_id ?? null, i.descricao, i.quantidade, i.profissional_id ?? null, i.especialidade ?? null, i.duracao_min ?? null, i.origem, i.referencia_comercial ?? null, i.observacoes ?? null, extra?.pacote_item_origem_id ?? null, agora, agora, req.usuario!.id)
    sincronizarOcorrencias(db, req, iid, 'Ajuste de quantidade')
    return iid
  }

  r.post('/pessoas', (req, res) => {
    exigir(req, 'alunas:editar')
    const d = validar(esquemaPessoa.extend({ matricula: esquemaMatricula.optional() }), req.body)
    if (d.matricula) exigir(req, 'matriculas:criar')
    if (d.email && db.prepare('SELECT 1 FROM pessoas WHERE email = ?').get(d.email))
      throw new ErroHttp(409, 'Já existe uma pessoa com este e-mail. Abra a ficha existente e crie uma nova matrícula nela.')
    const pid = novoId()
    let mid: string | null = null
    db.transaction(() => {
      const agora = agoraIso()
      db.prepare('INSERT INTO pessoas (id, nome, email, telefone, cidade, observacao_operacional, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,?,?,?)').run(
        pid, d.nome, d.email ?? null, d.telefone ?? null, d.cidade ?? null, d.observacao_operacional ?? null, agora, agora, req.usuario!.id)
      auditar(db, req, { entidade: 'pessoa', entidade_id: pid, acao: 'criada', pessoa_id: pid, dados: { nome: d.nome } })
      if (d.matricula) mid = criarMatricula(req, pid, d.matricula)
    })()
    res.status(201).json({ id: pid, matricula_id: mid })
  })

  r.put('/pessoas/:id', (req, res) => {
    exigir(req, 'alunas:editar')
    const d = validar(esquemaPessoa, req.body)
    if (d.email && db.prepare('SELECT 1 FROM pessoas WHERE email = ? AND id <> ?').get(d.email, req.params.id)) throw new ErroHttp(409, 'Já existe outra pessoa com este e-mail.')
    const info = db
      .prepare('UPDATE pessoas SET nome=?, email=?, telefone=?, cidade=?, observacao_operacional=?, atualizado_em=?, autor_id=? WHERE id=?')
      .run(d.nome, d.email ?? null, d.telefone ?? null, d.cidade ?? null, d.observacao_operacional ?? null, agoraIso(), req.usuario!.id, req.params.id)
    if (info.changes === 0) throw new ErroHttp(404, 'Pessoa não encontrada.')
    auditar(db, req, { entidade: 'pessoa', entidade_id: req.params.id as string, acao: 'atualizada', pessoa_id: req.params.id as string, dados: d })
    res.json({ ok: true })
  })

  r.post('/matriculas', (req, res) => {
    exigir(req, 'matriculas:criar')
    const d = validar(esquemaMatricula.extend({ pessoa_id: idObrig('a pessoa') }), req.body)
    if (!db.prepare('SELECT 1 FROM pessoas WHERE id = ?').get(d.pessoa_id)) throw new ErroHttp(404, 'Pessoa não encontrada.')
    let mid = ''
    db.transaction(() => {
      mid = criarMatricula(req, d.pessoa_id, d)
    })()
    res.status(201).json({ id: mid })
  })

  /* ---------------- Ficha (RF02) ---------------- */

  r.get('/pessoas/:id', (req, res) => {
    exigir(req, 'alunas:ver')
    const pessoa = db.prepare('SELECT * FROM pessoas WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!pessoa) throw new ErroHttp(404, 'Pessoa não encontrada.')
    const esc = escopoMatriculas(req)
    const matriculas = db
      .prepare(
        `SELECT m.*, pg.nome AS programa_nome, ur.nome AS responsavel_nome, pr.nome AS mentora_nome, uo.nome AS onboarding_responsavel_nome, uc.nome AS conferida_por_nome
         FROM matriculas m LEFT JOIN programas pg ON pg.id = m.programa_id LEFT JOIN usuarios ur ON ur.id = m.responsavel_id
         LEFT JOIN profissionais pr ON pr.id = m.mentora_id LEFT JOIN usuarios uo ON uo.id = m.onboarding_responsavel_id
         LEFT JOIN usuarios uc ON uc.id = m.conferida_por
         WHERE m.pessoa_id = @pid AND ${esc.sql} ORDER BY m.data_inicio DESC, m.criado_em DESC`,
      )
      .all({ pid: req.params.id, ...esc.params }) as Record<string, unknown>[]
    if (matriculas.length === 0 && req.usuario!.perfil === 'mentora') throw new ErroHttp(404, 'Pessoa não encontrada ou sem acesso.')

    const verComercial = tem(req, 'comercial:ver')
    const verNotas = tem(req, 'notas:internas')
    const verPedag = tem(req, 'notas:pedagogicas')
    const saida = matriculas.map((m) => {
      const mid = m.id as string
      if (!verComercial) {
        delete m.condicoes_comerciais
        delete m.fonte_comercial
        delete m.contrato_link
      }
      const itens = (db
        .prepare(
          `SELECT i.*, t.nome AS tipo_nome, pr.nome AS profissional_nome FROM itens_contratados i
           LEFT JOIN tipos_entregavel t ON t.id = i.tipo_id LEFT JOIN profissionais pr ON pr.id = i.profissional_id
           WHERE i.matricula_id = ? ORDER BY i.criado_em`,
        )
        .all(mid) as Record<string, unknown>[]).map((i) => {
        const resumo = resumoItem(db, i.id as string)
        const ajustes = db.prepare('SELECT a.*, u.nome AS autor_nome FROM ajustes_obrigacao a LEFT JOIN usuarios u ON u.id = a.autor_id WHERE a.item_id = ? ORDER BY a.criado_em').all(i.id)
        if (!verComercial) delete i.referencia_comercial
        return { ...i, ...resumo, restantes: Math.max(resumo.contratada - resumo.realizadas, 0), ajustes }
      })
      const ocorrencias = (db.prepare(`${SQL_OCORRENCIAS} WHERE o.matricula_id = ? ORDER BY i.criado_em, o.numero`).all(mid) as Record<string, unknown>[]).map((o) => {
        if (!verNotas) delete o.notas_internas
        return {
          ...o,
          historico: db.prepare('SELECT h.*, u.nome AS autor_nome FROM ocorrencia_historico h LEFT JOIN usuarios u ON u.id = h.autor_id WHERE h.ocorrencia_id = ? ORDER BY h.criado_em').all(o.id),
        }
      })
      const contatos = db
        .prepare('SELECT c.*, u.nome AS responsavel_nome FROM contatos c LEFT JOIN usuarios u ON u.id = c.responsavel_id WHERE c.matricula_id = ? ORDER BY c.data DESC, c.criado_em DESC')
        .all(mid)
      const pausas = db.prepare('SELECT p.*, u.nome AS decidido_por_nome FROM pausas p LEFT JOIN usuarios u ON u.id = p.decidido_por WHERE p.matricula_id = ? ORDER BY p.inicio DESC').all(mid)
      const feedbacks = db.prepare('SELECT f.*, u.nome AS responsavel_nome FROM feedbacks f LEFT JOIN usuarios u ON u.id = f.responsavel_id WHERE f.matricula_id = ? ORDER BY f.data DESC').all(mid)
      const tipos = [verNotas && 'operacional', verPedag && 'pedagogica'].filter(Boolean) as string[]
      const anotacoes = tipos.length
        ? db
            .prepare(`SELECT a.*, u.nome AS autor_nome FROM anotacoes a LEFT JOIN usuarios u ON u.id = a.autor_id WHERE a.matricula_id = ? AND a.tipo IN (${tipos.map(() => '?').join(',')}) ORDER BY a.criado_em DESC`)
            .all(mid, ...tipos)
        : []
      const conquistas = db.prepare('SELECT c.*, u.nome AS autor_nome, v.nome AS validada_por_nome FROM conquistas c LEFT JOIN usuarios u ON u.id = c.autor_id LEFT JOIN usuarios v ON v.id = c.validada_por WHERE c.matricula_id = ? ORDER BY c.data DESC').all(mid)
      const renovacoes = db.prepare('SELECT id, data_inicio, situacao FROM matriculas WHERE matricula_anterior_id = ?').all(mid)
      return { ...m, itens, ocorrencias, contatos, pausas, feedbacks, anotacoes, conquistas, renovacoes }
    })
    const auditoria = tem(req, 'auditoria:ver')
      ? db.prepare('SELECT a.*, u.nome AS autor_nome FROM auditoria a LEFT JOIN usuarios u ON u.id = a.autor_id WHERE a.pessoa_id = ? ORDER BY a.criado_em DESC LIMIT 300').all(req.params.id)
      : null
    const acesso = db.prepare("SELECT id, email, ativo FROM usuarios WHERE pessoa_id = ? AND perfil = 'aluna'").get(req.params.id) ?? null
    res.json({ pessoa, matriculas: saida, auditoria, acesso_portal: acesso })
  })

  /* ---------------- Matrícula: dados, contrato, conferência, onboarding ---------------- */

  r.put('/matriculas/:id/dados', (req, res) => {
    if (!tem(req, 'comercial:editar') && !tem(req, 'matriculas:decidir')) exigir(req, 'comercial:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({
        programa_id: id(),
        turma: texto(120),
        data_inicio: dataObrig('a data de início da vigência'),
        data_fim: data('a data de término'),
        responsavel_id: id(),
        mentora_id: id(),
        motivo_alteracao_vigencia: texto(500),
      }),
      req.body,
    )
    if (d.data_fim && d.data_fim < d.data_inicio) throw new ErroHttp(400, 'O término da vigência não pode ser antes do início.')
    const mudouVigencia = d.data_inicio !== m.data_inicio || (d.data_fim ?? null) !== m.data_fim
    if (mudouVigencia && m.data_fim && !d.motivo_alteracao_vigencia) throw new ErroHttp(400, 'Informe o motivo da alteração da vigência.')
    db.prepare('UPDATE matriculas SET programa_id=?, turma=?, data_inicio=?, data_fim=?, responsavel_id=?, mentora_id=?, atualizado_em=?, autor_id=? WHERE id=?').run(
      d.programa_id ?? null, d.turma ?? null, d.data_inicio, d.data_fim ?? null, d.responsavel_id ?? null, d.mentora_id ?? null, agoraIso(), req.usuario!.id, m.id)
    auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: mudouVigencia ? 'vigencia_alterada' : 'dados_atualizados', matricula_id: m.id, dados: { antes: { data_inicio: m.data_inicio, data_fim: m.data_fim }, depois: d } })
    res.json({ ok: true })
  })

  r.put('/matriculas/:id/contrato', (req, res) => {
    exigir(req, 'comercial:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({ contrato_situacao: z.enum(['pendente', 'enviado', 'assinado']), contrato_link: link(), fonte_comercial: texto(500), condicoes_comerciais: texto(4000) }),
      req.body,
    )
    db.prepare('UPDATE matriculas SET contrato_situacao=?, contrato_link=?, fonte_comercial=?, condicoes_comerciais=?, atualizado_em=?, autor_id=? WHERE id=?').run(
      d.contrato_situacao, d.contrato_link ?? null, d.fonte_comercial ?? null, d.condicoes_comerciais ?? null, agoraIso(), req.usuario!.id, m.id)
    auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: 'contrato_atualizado', matricula_id: m.id, dados: { de: m.contrato_situacao, para: d.contrato_situacao } })
    res.json({ ok: true })
  })

  // ET02: conferir pacote e bônus contra a fonte comercial.
  r.post('/matriculas/:id/conferencia', (req, res) => {
    exigir(req, 'comercial:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ conferida: z.boolean(), fonte_comercial: texto(500) }), req.body)
    if (d.conferida && !(d.fonte_comercial ?? m.fonte_comercial)) throw new ErroHttp(400, 'Informe a fonte comercial usada na conferência (ex.: contrato, proposta, Hotmart).')
    db.prepare('UPDATE matriculas SET conferencia_comercial=?, conferida_por=?, conferida_em=?, fonte_comercial=COALESCE(?, fonte_comercial), atualizado_em=? WHERE id=?').run(
      d.conferida ? 'conferida' : 'pendente', d.conferida ? req.usuario!.id : null, d.conferida ? agoraIso() : null, d.fonte_comercial ?? null, agoraIso(), m.id)
    auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: d.conferida ? 'pacote_conferido' : 'conferencia_reaberta', matricula_id: m.id, dados: d })
    res.json({ ok: true })
  })

  // RN14: onboarding e contrato são controles independentes.
  r.put('/matriculas/:id/onboarding', (req, res) => {
    exigir(req, 'onboarding:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
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
    db.prepare(
      'UPDATE matriculas SET onboarding_situacao=?, onboarding_data=?, onboarding_responsavel_id=?, onboarding_checklist=?, onboarding_pendencias=?, proximo_passo=?, atualizado_em=? WHERE id=?',
    ).run(d.onboarding_situacao, d.onboarding_data ?? null, d.onboarding_responsavel_id ?? null, JSON.stringify(d.onboarding_checklist), d.onboarding_pendencias ?? null, d.proximo_passo ?? null, agoraIso(), m.id)
    auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: 'onboarding_atualizado', matricula_id: m.id, dados: d })
    res.json({ ok: true })
  })

  /* ---------------- Itens contratados e ajustes (RF03, IN08) ---------------- */

  r.post('/matriculas/:id/itens', (req, res) => {
    exigir(req, 'comercial:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(esquemaItem, req.body)
    let iid = ''
    db.transaction(() => {
      iid = criarItem(req, m.id, d)
      auditar(db, req, { entidade: 'item', entidade_id: iid, acao: 'criado', matricula_id: m.id, dados: d })
    })()
    res.status(201).json({ id: iid })
  })

  r.put('/itens/:id', (req, res) => {
    if (!tem(req, 'comercial:editar')) exigir(req, 'entregas:editar')
    const item = db.prepare('SELECT * FROM itens_contratados WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!item) throw new ErroHttp(404, 'Item não encontrado.')
    exigirAcessoMatricula(db, req, item.matricula_id as string)
    const d = validar(esquemaItem.omit({ quantidade: true, origem: true }), req.body)
    const podeComercial = tem(req, 'comercial:editar')
    db.prepare(
      'UPDATE itens_contratados SET tipo_id=?, descricao=?, profissional_id=?, especialidade=?, duracao_min=?, referencia_comercial=?, observacoes=?, atualizado_em=?, autor_id=? WHERE id=?',
    ).run(
      d.tipo_id ?? null, d.descricao, d.profissional_id ?? null, d.especialidade ?? null, d.duracao_min ?? null,
      podeComercial ? (d.referencia_comercial ?? null) : item.referencia_comercial, d.observacoes ?? null, agoraIso(), req.usuario!.id, item.id,
    )
    auditar(db, req, { entidade: 'item', entidade_id: item.id as string, acao: 'atualizado', matricula_id: item.matricula_id as string, dados: d })
    res.json({ ok: true })
  })

  r.post('/itens/:id/ajustes', (req, res) => {
    exigir(req, 'obrigacoes:ajustar')
    const item = db.prepare('SELECT * FROM itens_contratados WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
    if (!item) throw new ErroHttp(404, 'Item não encontrado.')
    exigirAcessoMatricula(db, req, item.matricula_id as string)
    const d = validar(
      z.object({
        delta: z.coerce.number().int().refine((v) => v !== 0, 'O ajuste não pode ser zero.'),
        tipo: z.enum(['ajuste', 'excecao']),
        motivo: textoObrig('o motivo do ajuste', 1000),
      }),
      req.body,
    )
    const r0 = resumoItem(db, item.id as string)
    if (r0.contratada + d.delta < r0.realizadas) throw new ErroHttp(400, `A quantidade não pode ficar abaixo das ${r0.realizadas} já realizadas.`)
    db.transaction(() => {
      db.prepare('INSERT INTO ajustes_obrigacao (id, item_id, delta, tipo, motivo, autor_id, criado_em) VALUES (?,?,?,?,?,?,?)').run(novoId(), item.id, d.delta, d.tipo, d.motivo, req.usuario!.id, agoraIso())
      sincronizarOcorrencias(db, req, item.id as string, `Redução registrada: ${d.motivo}`)
      auditar(db, req, { entidade: 'item', entidade_id: item.id as string, acao: d.tipo === 'excecao' ? 'excecao_registrada' : 'quantidade_ajustada', matricula_id: item.matricula_id as string, dados: d })
    })()
    res.json({ ok: true, ...resumoItem(db, item.id as string) })
  })

  /* ---------------- Pausa (RN12) ---------------- */

  r.post('/matriculas/:id/pausas', (req, res) => {
    exigir(req, 'matriculas:decidir')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    if (m.situacao !== 'ativa') throw new ErroHttp(400, 'Somente matrículas ativas podem ser pausadas.')
    const d = validar(z.object({ inicio: dataObrig('o início da pausa'), fim: data('o fim previsto'), motivo: textoObrig('o motivo operacional', 500) }), req.body)
    if (d.fim && d.fim < d.inicio) throw new ErroHttp(400, 'O fim da pausa não pode ser antes do início.')
    const pid = novoId()
    db.transaction(() => {
      db.prepare('INSERT INTO pausas (id, matricula_id, inicio, fim, motivo, criado_em, autor_id) VALUES (?,?,?,?,?,?,?)').run(pid, m.id, d.inicio, d.fim ?? null, d.motivo, agoraIso(), req.usuario!.id)
      // A pausa NÃO altera vigência nem previsões: a decisão de prazos fica pendente.
      db.prepare("UPDATE matriculas SET situacao='pausada', atualizado_em=? WHERE id=?").run(agoraIso(), m.id)
      auditar(db, req, { entidade: 'pausa', entidade_id: pid, acao: 'pausa_registrada', matricula_id: m.id, dados: d })
    })()
    res.status(201).json({ id: pid })
  })

  r.post('/pausas/:id/encerrar', (req, res) => {
    exigir(req, 'matriculas:decidir')
    const p = db.prepare('SELECT * FROM pausas WHERE id = ?').get(req.params.id) as Record<string, string> | undefined
    if (!p) throw new ErroHttp(404, 'Pausa não encontrada.')
    exigirAcessoMatricula(db, req, p.matricula_id)
    const d = validar(z.object({ fim: dataObrig('a data de retorno') }), req.body)
    if (d.fim < p.inicio) throw new ErroHttp(400, 'O retorno não pode ser antes do início da pausa.')
    db.transaction(() => {
      db.prepare('UPDATE pausas SET fim=? WHERE id=?').run(d.fim, p.id)
      db.prepare("UPDATE matriculas SET situacao='ativa', atualizado_em=? WHERE id=? AND situacao='pausada'").run(agoraIso(), p.matricula_id)
      auditar(db, req, { entidade: 'pausa', entidade_id: p.id, acao: 'pausa_encerrada', matricula_id: p.matricula_id, dados: d })
    })()
    res.json({ ok: true })
  })

  r.post('/pausas/:id/decisao', (req, res) => {
    exigir(req, 'matriculas:decidir')
    const p = db.prepare('SELECT * FROM pausas WHERE id = ?').get(req.params.id) as Record<string, string> | undefined
    if (!p) throw new ErroHttp(404, 'Pausa não encontrada.')
    const m = exigirAcessoMatricula(db, req, p.matricula_id)
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
    db.transaction(() => {
      db.prepare('UPDATE pausas SET decisao_prazos=?, dias_extensao=?, mover_previsoes=?, decisao_justificativa=?, decidido_por=?, decidido_em=? WHERE id=?').run(
        d.decisao, d.dias_extensao ?? null, d.mover_previsoes ? 1 : 0, d.justificativa, req.usuario!.id, agoraIso(), p.id)
      if (d.decisao === 'estender' && d.dias_extensao) {
        if (m.data_fim) {
          const novoFim = somarDias(m.data_fim, d.dias_extensao)
          db.prepare('UPDATE matriculas SET data_fim=?, atualizado_em=? WHERE id=?').run(novoFim, agoraIso(), m.id)
          auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: 'vigencia_alterada', matricula_id: m.id, dados: { de: m.data_fim, para: novoFim, motivo: `Decisão sobre pausa: ${d.justificativa}` } })
        }
        if (d.mover_previsoes) {
          const abertas = db
            .prepare("SELECT id, data_prevista FROM ocorrencias WHERE matricula_id=? AND situacao NOT IN ('realizada','cancelada','agendada') AND data_prevista >= ?")
            .all(m.id, p.inicio) as { id: string; data_prevista: string }[]
          for (const o of abertas) {
            const nova = somarDias(o.data_prevista, d.dias_extensao)
            db.prepare('UPDATE ocorrencias SET data_prevista_original = COALESCE(data_prevista_original, data_prevista), data_prevista=?, atualizado_em=? WHERE id=?').run(nova, agoraIso(), o.id)
            historico(db, req, o.id, 'previsao_alterada', o.data_prevista, nova, `Decisão sobre pausa: ${d.justificativa}`)
          }
        }
      }
      auditar(db, req, { entidade: 'pausa', entidade_id: p.id, acao: 'decisao_prazos', matricula_id: m.id, dados: d })
    })()
    res.json({ ok: true })
  })

  /* ---------------- Encerrar, cancelar (RN16) ---------------- */

  r.post('/matriculas/:id/finalizar', (req, res) => {
    exigir(req, 'matriculas:decidir')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ tipo: z.enum(['encerrada', 'cancelada']), data: dataObrig('a data'), motivo: texto(1000) }), req.body)
    if (d.tipo === 'cancelada' && !d.motivo) throw new ErroHttp(400, 'Informe o motivo do cancelamento.')
    if (m.situacao === 'encerrada' || m.situacao === 'cancelada') throw new ErroHttp(409, 'Esta matrícula já foi finalizada.')
    db.transaction(() => {
      // Nada é apagado e as obrigações em aberto continuam registradas como estão.
      db.prepare('UPDATE matriculas SET situacao=?, encerramento_data=?, encerramento_motivo=?, atualizado_em=? WHERE id=?').run(d.tipo, d.data, d.motivo ?? null, agoraIso(), m.id)
      db.prepare('UPDATE pausas SET fim = COALESCE(fim, ?) WHERE matricula_id = ?').run(d.data, m.id)
      auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: d.tipo === 'cancelada' ? 'cancelada' : 'encerrada', matricula_id: m.id, dados: d })
    })()
    res.json({ ok: true })
  })

  /* ---------------- Renovação: transferência explícita de pendências (RN04) ---------------- */

  r.post('/matriculas/:id/transferencias', (req, res) => {
    exigir(req, 'matriculas:decidir')
    const destino = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(
      z.object({ item_origem_id: idObrig('o item da matrícula anterior'), quantidade: z.coerce.number().int().min(1, 'Transfira pelo menos 1.'), motivo: textoObrig('o motivo da transferência', 1000) }),
      req.body,
    )
    const item = db.prepare('SELECT * FROM itens_contratados WHERE id = ?').get(d.item_origem_id) as Record<string, unknown> | undefined
    if (!item) throw new ErroHttp(404, 'Item de origem não encontrado.')
    if (item.matricula_id !== destino.matricula_anterior_id) throw new ErroHttp(400, 'Só é possível transferir pendências da matrícula anterior vinculada a esta renovação.')
    const r0 = resumoItem(db, item.id as string)
    const restantes = r0.contratada - r0.realizadas
    if (d.quantidade > restantes) throw new ErroHttp(400, `Só restam ${restantes} entrega(s) neste item.`)
    let novoItem = ''
    db.transaction(() => {
      const agora = agoraIso()
      novoItem = criarItem(req, destino.id, {
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
      db.prepare("INSERT INTO ajustes_obrigacao (id, item_id, delta, tipo, motivo, item_relacionado_id, autor_id, criado_em) VALUES (?,?,?,'transferencia_saida',?,?,?,?)").run(
        novoId(), item.id, -d.quantidade, d.motivo, novoItem, req.usuario!.id, agora)
      db.prepare("INSERT INTO ajustes_obrigacao (id, item_id, delta, tipo, motivo, item_relacionado_id, autor_id, criado_em) VALUES (?,?,?,'transferencia_entrada',?,?,?,?)").run(
        novoId(), novoItem, d.quantidade, d.motivo, item.id, req.usuario!.id, agora)
      sincronizarOcorrencias(db, req, item.id as string, `Transferida para a renovação: ${d.motivo}`)
      sincronizarOcorrencias(db, req, novoItem, d.motivo)
      auditar(db, req, { entidade: 'item', entidade_id: novoItem, acao: 'pendencia_transferida', matricula_id: destino.id, dados: { ...d, matricula_origem: item.matricula_id } })
      auditar(db, req, { entidade: 'item', entidade_id: item.id as string, acao: 'pendencia_transferida_saida', matricula_id: item.matricula_id as string, dados: { ...d, matricula_destino: destino.id } })
    })()
    res.status(201).json({ id: novoItem })
  })

  /* ---------------- Satisfação, continuidade e anotações (RF10) ---------------- */

  r.post('/matriculas/:id/feedbacks', (req, res) => {
    if (!tem(req, 'entregas:editar')) exigir(req, 'alunas:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ data: dataObrig(), responsavel_id: id(), feedback: textoObrig('o feedback', 2000), acao_acompanhamento: texto(1000) }), req.body)
    const fid = novoId()
    db.prepare('INSERT INTO feedbacks (id, matricula_id, data, responsavel_id, feedback, acao_acompanhamento, criado_em, autor_id) VALUES (?,?,?,?,?,?,?,?)').run(
      fid, m.id, d.data, d.responsavel_id ?? req.usuario!.id, d.feedback, d.acao_acompanhamento ?? null, agoraIso(), req.usuario!.id)
    auditar(db, req, { entidade: 'feedback', entidade_id: fid, acao: 'registrado', matricula_id: m.id })
    res.status(201).json({ id: fid })
  })

  r.put('/matriculas/:id/continuidade', (req, res) => {
    if (!tem(req, 'entregas:editar')) exigir(req, 'comercial:editar')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const d = validar(z.object({ interesse_renovacao: z.enum(['sim', 'nao', 'talvez', 'nao_informado']) }), req.body)
    db.prepare('UPDATE matriculas SET interesse_renovacao=?, atualizado_em=? WHERE id=?').run(d.interesse_renovacao, agoraIso(), m.id)
    auditar(db, req, { entidade: 'matricula', entidade_id: m.id, acao: 'interesse_renovacao', matricula_id: m.id, dados: d })
    res.json({ ok: true })
  })

  r.post('/matriculas/:id/anotacoes', (req, res) => {
    const d = validar(z.object({ tipo: z.enum(['operacional', 'pedagogica']), texto: textoObrig('o texto', 2000) }), req.body)
    exigir(req, d.tipo === 'operacional' ? 'notas:internas' : 'notas:pedagogicas')
    const m = exigirAcessoMatricula(db, req, req.params.id as string)
    const aid = novoId()
    db.prepare('INSERT INTO anotacoes (id, matricula_id, tipo, texto, criado_em, autor_id) VALUES (?,?,?,?,?,?)').run(aid, m.id, d.tipo, d.texto, agoraIso(), req.usuario!.id)
    auditar(db, req, { entidade: 'anotacao', entidade_id: aid, acao: 'registrada', matricula_id: m.id, dados: { tipo: d.tipo } })
    res.status(201).json({ id: aid })
  })

  return r
}
