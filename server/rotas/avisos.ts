import { Router } from 'express'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import { ErroHttp, exigir, exigirEquipe } from '../auth'
import { auditar, data, destinatariosAviso, id, processarAvisos, proximoEnvio, texto, textoObrig, validar } from '../servicos'
import { agoraSP, horarioValido } from '../../shared/datas'

/** O link do aviso só pode abrir uma página do próprio portal (ex.: #/jornada). */
const linkPortal = z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^#\/[a-z0-9-]+(\/[A-Za-z0-9-]+)?$/, 'Escolha uma página do portal.').nullable().optional())

const esquema = z.object({
  titulo: textoObrig('o título', 120),
  detalhe: texto(1000),
  link: linkPortal,
  publico: z.enum(['aluna', 'turma', 'ativas'], { error: 'Escolha para quem é o aviso.' }),
  pessoa_id: id(),
  turma_id: id(),
  inicio: z.string().refine(horarioValido, 'Informe data e hora do envio.').optional(),
  recorrencia: z.enum(['nenhuma', 'diaria', 'semanal', 'mensal']).default('nenhuma'),
  fim: data('a data final da repetição'),
})

export function rotasAvisos(db: BD) {
  const r = Router()
  r.use(exigirEquipe)

  r.get('/avisos', (req, res) => {
    exigir(req, 'avisos:enviar')
    processarAvisos(db)
    const lista = db
      .prepare(
        `SELECT a.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, t.nome AS turma_nome, u.nome AS autor_nome
         FROM avisos_programados a LEFT JOIN pessoas p ON p.id = a.pessoa_id LEFT JOIN turmas t ON t.id = a.turma_id LEFT JOIN usuarios u ON u.id = a.autor_id
         ORDER BY a.ativo DESC, COALESCE(a.proximo_envio, a.ultimo_envio) DESC`,
      )
      .all() as Record<string, unknown>[]
    res.json(lista.map((a) => ({ ...a, destinatarias: destinatariosAviso(db, a).length })))
  })

  r.post('/avisos', (req, res) => {
    exigir(req, 'avisos:enviar')
    const d = validar(esquema, req.body)
    const agora = agoraSP()
    const inicio = d.inicio ?? agora
    if (d.publico === 'aluna' && (!d.pessoa_id || !db.prepare('SELECT 1 FROM pessoas WHERE id = ?').get(d.pessoa_id))) throw new ErroHttp(400, 'Escolha a aluna.')
    if (d.publico === 'turma' && (!d.turma_id || !db.prepare('SELECT 1 FROM turmas WHERE id = ?').get(d.turma_id))) throw new ErroHttp(400, 'Escolha a turma.')
    if (d.recorrencia === 'nenhuma' && d.fim) d.fim = null
    if (d.fim && d.fim < inicio.slice(0, 10)) throw new ErroHttp(400, 'A data final da repetição não pode ser antes do primeiro envio.')
    const aid = novoId()
    const t = agoraIso()
    db.prepare(
      `INSERT INTO avisos_programados (id, titulo, detalhe, link, publico, pessoa_id, turma_id, inicio, recorrencia, fim, proximo_envio, criado_em, atualizado_em, autor_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(aid, d.titulo, d.detalhe ?? null, d.link ?? null, d.publico, d.publico === 'aluna' ? d.pessoa_id : null, d.publico === 'turma' ? d.turma_id : null,
      inicio, d.recorrencia, d.fim ?? null, inicio, t, t, req.usuario!.id)
    auditar(db, req, { entidade: 'aviso', entidade_id: aid, acao: 'criado', pessoa_id: d.publico === 'aluna' ? d.pessoa_id : undefined, dados: d })
    processarAvisos(db) // se o horário já chegou, entrega agora
    const a = db.prepare('SELECT envios, proximo_envio FROM avisos_programados WHERE id = ?').get(aid) as { envios: number; proximo_envio: string | null }
    res.status(201).json({ id: aid, ...a })
  })

  // Corrigir o texto ou o fim da repetição sem mudar quem recebe nem o calendário.
  r.put('/avisos/:id', (req, res) => {
    exigir(req, 'avisos:enviar')
    const d = validar(z.object({ titulo: textoObrig('o título', 120), detalhe: texto(1000), link: linkPortal, fim: data('a data final da repetição') }), req.body)
    const info = db.prepare('UPDATE avisos_programados SET titulo=?, detalhe=?, link=?, fim=?, atualizado_em=?, autor_id=? WHERE id=?').run(
      d.titulo, d.detalhe ?? null, d.link ?? null, d.fim ?? null, agoraIso(), req.usuario!.id, req.params.id)
    if (!info.changes) throw new ErroHttp(404, 'Aviso não encontrado.')
    auditar(db, req, { entidade: 'aviso', entidade_id: req.params.id as string, acao: 'atualizado', dados: d })
    res.json({ ok: true })
  })

  // Pausar ou retomar a repetição. Ao retomar, o próximo envio é o próximo horário da série a partir de agora.
  r.post('/avisos/:id/ativo', (req, res) => {
    exigir(req, 'avisos:enviar')
    const { ativo } = validar(z.object({ ativo: z.boolean() }), req.body)
    const a = db.prepare('SELECT * FROM avisos_programados WHERE id = ?').get(req.params.id) as Record<string, string | number | null> | undefined
    if (!a) throw new ErroHttp(404, 'Aviso não encontrado.')
    let prox = a.proximo_envio as string | null
    if (ativo) {
      const agora = agoraSP()
      if (!prox || prox <= agora) prox = a.recorrencia === 'nenhuma' ? (a.envios ? null : agora) : proximoDaSerie(a, agora)
      if (prox && a.fim && prox.slice(0, 10) > (a.fim as string)) prox = null
      if (!prox) throw new ErroHttp(409, 'Este aviso já terminou. Crie um novo aviso.')
    }
    db.prepare('UPDATE avisos_programados SET ativo = ?, proximo_envio = ?, atualizado_em = ? WHERE id = ?').run(ativo ? 1 : 0, prox, agoraIso(), a.id)
    auditar(db, req, { entidade: 'aviso', entidade_id: a.id as string, acao: ativo ? 'retomado' : 'pausado' })
    res.json({ ok: true })
  })

  return r
}

function proximoDaSerie(a: Record<string, unknown>, agora: string): string | null {
  const inicio = a.inicio as string
  return inicio > agora ? inicio : proximoEnvio(inicio, a.recorrencia as string, agora)
}
