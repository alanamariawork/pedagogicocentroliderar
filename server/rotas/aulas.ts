/**
 * Aulas gravadas por mês do plano.
 * Equipe (conteudos:editar): cadastra, publica e retira aulas. Aluna: vê as aulas do mês e o progresso,
 * que é gravado no servidor a partir do próprio player do Vimeo (nunca só no navegador).
 */
import { Router, type Req as Request } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import { ErroHttp, exigir } from '../auth'
import { auditar, hoje, texto, textoObrig, validar } from '../servicos'
import { embedVimeo } from './acompanhamento'
import { matriculaDaAluna } from './portal'
import { aulasDaAluna } from '../aulas'
import { mesesDoPlano, MESES_MAXIMO, PERCENTUAL_ASSISTIDA, progressoDoMes } from '../../shared/linhaTempo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export function rotasAulas(db: BD, _ctx: ContextoApp) {
  const r = Router()

  const aluna = (req: Request) => {
    if (!req.usuario) throw new ErroHttp(401, 'Sua sessão expirou. Entre novamente.')
    if (req.usuario.perfil !== 'aluna' || !req.usuario.pessoa_id) throw new ErroHttp(403, 'O portal é exclusivo para alunas.')
    return req.usuario.pessoa_id
  }

  /* ---------------- Portal ---------------- */

  r.get('/portal/linha-do-tempo/:mes', async (req, res) => {
    const pessoaId = aluna(req)
    const m = await matriculaDaAluna(db, pessoaId)
    if (!m) throw new ErroHttp(404, 'Você ainda não tem uma matrícula ativa. Fale com a equipe.')
    const numero = Number(req.params.mes)
    const mes = mesesDoPlano(m.data_inicio, m.data_fim, hoje()).find((x) => x.numero === numero)
    if (!mes) throw new ErroHttp(404, 'Este mês não faz parte do seu plano.')
    const aulas = await aulasDaAluna(db, m.programa_id ?? null, pessoaId, numero)
    res.json({ programa: m.programa_nome ?? null, mes: { ...mes, progresso: progressoDoMes(aulas.map((a) => a.percentual)) }, aulas, percentual_assistida: PERCENTUAL_ASSISTIDA })
  })

  // O player informa o ponto alcançado; o servidor guarda o maior valor (voltar o vídeo não tira progresso).
  r.post('/portal/aulas/:id/progresso', async (req, res) => {
    const pessoaId = aluna(req)
    const d = validar(z.object({ percentual: z.coerce.number().min(0).max(100) }), req.body)
    const m = await matriculaDaAluna(db, pessoaId)
    if (!m) throw new ErroHttp(404, 'Você ainda não tem uma matrícula ativa.')
    const aula = (await db.get('SELECT id FROM ped_aulas WHERE id = ? AND publicado = 1 AND (programa_id IS NULL OR programa_id = ?)', req.params.id, m.programa_id ?? null)) as Linha | undefined
    if (!aula) throw new ErroHttp(404, 'Aula não encontrada.')
    const p = Math.floor(d.percentual)
    const concluida = p >= PERCENTUAL_ASSISTIDA ? agoraIso() : null
    await db.run(
      `INSERT INTO ped_aulas_progresso (aula_id, pessoa_id, percentual, concluida_em, atualizado_em) VALUES (?,?,?,?,?)
       ON CONFLICT(aula_id, pessoa_id) DO UPDATE SET
         percentual = MAX(percentual, excluded.percentual),
         concluida_em = COALESCE(concluida_em, excluded.concluida_em),
         atualizado_em = excluded.atualizado_em`,
      aula.id, pessoaId, p, concluida, agoraIso(),
    )
    const atual = (await db.get('SELECT percentual, concluida_em FROM ped_aulas_progresso WHERE aula_id = ? AND pessoa_id = ?', aula.id, pessoaId)) as Linha
    res.json({ percentual: atual.percentual, assistida: atual.percentual >= PERCENTUAL_ASSISTIDA })
  })

  /* ---------------- Equipe ---------------- */

  const esquema = z.object({
    programa_id: z.string().trim().max(64).nullish().transform((v) => v || null),
    mes: z.coerce.number().int().min(1, 'O mês começa em 1.').max(MESES_MAXIMO),
    titulo: textoObrig('o título', 200),
    descricao: texto(4000),
    video_url: textoObrig('o endereço do vídeo', 500),
    ordem: z.coerce.number().int().min(0).max(999).default(0),
  })
  const conferir = async (d: z.infer<typeof esquema>) => {
    const embed = embedVimeo(d.video_url)
    if (!embed) throw new ErroHttp(400, 'Use o endereço de um vídeo do Vimeo (https://vimeo.com/…).')
    if (d.programa_id && !(await db.get('SELECT 1 FROM ped_programas WHERE id = ?', d.programa_id))) throw new ErroHttp(400, 'Programa não encontrado.')
    return embed
  }
  async function aulaOu404(id: string) {
    const a = (await db.get('SELECT * FROM ped_aulas WHERE id = ?', id)) as Linha | undefined
    if (!a) throw new ErroHttp(404, 'Aula não encontrada.')
    return a
  }

  r.get('/aulas', async (req, res) => {
    exigir(req, 'conteudos:editar')
    res.json({
      aulas: await db.all(`SELECT a.*, pg.nome AS programa_nome, (SELECT COUNT(*) FROM ped_aulas_progresso p WHERE p.aula_id = a.id AND p.percentual >= ${PERCENTUAL_ASSISTIDA}) AS assistiram
                             FROM ped_aulas a LEFT JOIN ped_programas pg ON pg.id = a.programa_id ORDER BY a.mes, a.ordem, a.titulo`),
    })
  })

  r.post('/aulas', async (req, res) => {
    exigir(req, 'conteudos:editar')
    const d = validar(esquema, req.body)
    const embed = await conferir(d)
    const id = novoId()
    await db.run('INSERT INTO ped_aulas (id, programa_id, mes, titulo, descricao, video_url, publicado, ordem, criado_em, atualizado_em, autor_id) VALUES (?,?,?,?,?,?,0,?,?,?,?)', id, d.programa_id, d.mes, d.titulo, d.descricao ?? null, embed, d.ordem, agoraIso(), agoraIso(), req.usuario!.id)
    await auditar(db, req, { entidade: 'aula', entidade_id: id, acao: 'criada', dados: { mes: d.mes, titulo: d.titulo } })
    res.status(201).json({ id })
  })

  r.put('/aulas/:id', async (req, res) => {
    exigir(req, 'conteudos:editar')
    const a = await aulaOu404(req.params.id as string)
    const d = validar(esquema, req.body)
    const embed = await conferir(d)
    await db.run('UPDATE ped_aulas SET programa_id=?, mes=?, titulo=?, descricao=?, video_url=?, ordem=?, atualizado_em=?, autor_id=? WHERE id=?', d.programa_id, d.mes, d.titulo, d.descricao ?? null, embed, d.ordem, agoraIso(), req.usuario!.id, a.id)
    await auditar(db, req, { entidade: 'aula', entidade_id: a.id, acao: 'atualizada', dados: { mes: d.mes, titulo: d.titulo } })
    res.json({ ok: true })
  })

  r.post('/aulas/:id/publicar', async (req, res) => {
    exigir(req, 'conteudos:editar')
    const a = await aulaOu404(req.params.id as string)
    const d = validar(z.object({ publicado: z.boolean() }), req.body)
    await db.run('UPDATE ped_aulas SET publicado = ?, atualizado_em = ? WHERE id = ?', d.publicado ? 1 : 0, agoraIso(), a.id)
    await auditar(db, req, { entidade: 'aula', entidade_id: a.id, acao: d.publicado ? 'publicada' : 'despublicada' })
    res.json({ ok: true })
  })

  return r
}
