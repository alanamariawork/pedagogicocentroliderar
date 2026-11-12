import { Router } from '../http'
import type { ContextoApp } from '../contexto'
import { z } from 'zod'
import { agoraIso, novoId, type BD } from '../db'
import { ErroHttp, exigir, exigirEquipe } from '../auth'
import { auditar, data, destinatariosAviso, id, processarAvisos, proximoEnvio, texto, textoObrig, validar } from '../servicos'
import { agoraSP, horarioValido } from '../../shared/datas'
import { processarEnviosAvisos } from '../avisosExternos'
import { telefoneWhatsapp } from '../confirmacoes'

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

export function rotasAvisos(db: BD, ctx: ContextoApp) {
  const r = Router()
  r.use(exigirEquipe)

  r.get('/avisos', async (req, res) => {
    exigir(req, 'avisos:enviar')
    await processarAvisos(db)
    const lista = (await db.all(`SELECT a.*, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, t.nome AS turma_nome, u.nome AS autor_nome
         FROM ped_avisos_programados a LEFT JOIN ped_pessoas p ON p.id = a.pessoa_id LEFT JOIN ped_turmas t ON t.id = a.turma_id LEFT JOIN ped_usuarios u ON u.id = a.autor_id
         ORDER BY a.ativo DESC, COALESCE(a.proximo_envio, a.ultimo_envio) DESC`)) as Record<string, unknown>[]
    const comContagem = []
    for (const a of lista) comContagem.push({ ...a, destinatarias: (await destinatariosAviso(db, a)).length })
    res.json(comContagem)
  })

  r.post('/avisos', async (req, res) => {
    exigir(req, 'avisos:enviar')
    const d = validar(esquema, req.body)
    const agora = agoraSP()
    const inicio = d.inicio ?? agora
    if (d.publico === 'aluna' && (!d.pessoa_id || !(await db.get('SELECT 1 FROM ped_pessoas WHERE id = ?', d.pessoa_id)))) throw new ErroHttp(400, 'Escolha a aluna.')
    if (d.publico === 'turma' && (!d.turma_id || !(await db.get('SELECT 1 FROM ped_turmas WHERE id = ?', d.turma_id)))) throw new ErroHttp(400, 'Escolha a turma.')
    if (d.recorrencia === 'nenhuma' && d.fim) d.fim = null
    if (d.fim && d.fim < inicio.slice(0, 10)) throw new ErroHttp(400, 'A data final da repetição não pode ser antes do primeiro envio.')
    const aid = novoId()
    const t = agoraIso()
    await db.run(`INSERT INTO ped_avisos_programados (id, titulo, detalhe, link, publico, pessoa_id, turma_id, inicio, recorrencia, fim, proximo_envio, criado_em, atualizado_em, autor_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, aid, d.titulo, d.detalhe ?? null, d.link ?? null, d.publico, d.publico === 'aluna' ? d.pessoa_id : null, d.publico === 'turma' ? d.turma_id : null,
      inicio, d.recorrencia, d.fim ?? null, inicio, t, t, req.usuario!.id)
    await auditar(db, req, { entidade: 'aviso', entidade_id: aid, acao: 'criado', pessoa_id: d.publico === 'aluna' ? d.pessoa_id : undefined, dados: d })
    await processarAvisos(db) // se o horário já chegou, entrega agora
    const a = (await db.get('SELECT envios, proximo_envio FROM ped_avisos_programados WHERE id = ?', aid)) as { envios: number; proximo_envio: string | null }
    res.status(201).json({ id: aid, ...a })
  })

  // Corrigir o texto ou o fim da repetição sem mudar quem recebe nem o calendário.
  r.put('/avisos/:id', async (req, res) => {
    exigir(req, 'avisos:enviar')
    const d = validar(z.object({ titulo: textoObrig('o título', 120), detalhe: texto(1000), link: linkPortal, fim: data('a data final da repetição') }), req.body)
    const info = (await db.run('UPDATE ped_avisos_programados SET titulo=?, detalhe=?, link=?, fim=?, atualizado_em=?, autor_id=? WHERE id=?', d.titulo, d.detalhe ?? null, d.link ?? null, d.fim ?? null, agoraIso(), req.usuario!.id, req.params.id))
    if (!info.changes) throw new ErroHttp(404, 'Aviso não encontrado.')
    await auditar(db, req, { entidade: 'aviso', entidade_id: req.params.id as string, acao: 'atualizado', dados: d })
    res.json({ ok: true })
  })

  // Pausar ou retomar a repetição. Ao retomar, o próximo envio é o próximo horário da série a partir de agora.
  r.post('/avisos/:id/ativo', async (req, res) => {
    exigir(req, 'avisos:enviar')
    const { ativo } = validar(z.object({ ativo: z.boolean() }), req.body)
    const a = (await db.get('SELECT * FROM ped_avisos_programados WHERE id = ?', req.params.id)) as Record<string, string | number | null> | undefined
    if (!a) throw new ErroHttp(404, 'Aviso não encontrado.')
    let prox = a.proximo_envio as string | null
    if (ativo) {
      const agora = agoraSP()
      if (!prox || prox <= agora) prox = a.recorrencia === 'nenhuma' ? (a.envios ? null : agora) : proximoDaSerie(a, agora)
      if (prox && a.fim && prox.slice(0, 10) > (a.fim as string)) prox = null
      if (!prox) throw new ErroHttp(409, 'Este aviso já terminou. Crie um novo aviso.')
    }
    await db.run('UPDATE ped_avisos_programados SET ativo = ?, proximo_envio = ?, atualizado_em = ? WHERE id = ?', ativo ? 1 : 0, prox, agoraIso(), a.id)
    await auditar(db, req, { entidade: 'aviso', entidade_id: a.id as string, acao: ativo ? 'retomado' : 'pausado' })
    res.json({ ok: true })
  })

  /* ---------------- Envio por e-mail e WhatsApp ---------------- */

  // O que falta configurar em cada canal (o e-mail é do backoffice: só dá para saber tentando).
  r.get('/avisos/canais', async (req, res) => {
    exigir(req, 'avisos:enviar')
    const c = ctx.confirmacoes?.config
    const faltaWhatsapp = [!c?.whatsappToken && 'WHATSAPP_TOKEN', !c?.whatsappNumeroId && 'WHATSAPP_PHONE_NUMBER_ID', !c?.whatsappModeloAviso && 'WHATSAPP_MODELO_AVISO'].filter(Boolean)
    const cfg = Object.fromEntries(((await db.all("SELECT chave, valor FROM ped_configuracoes WHERE chave IN ('avisos_email','avisos_whatsapp')")) as { chave: string; valor: string }[]).map((x) => [x.chave, x.valor]))
    res.json({
      email: { ligado: (cfg.avisos_email ?? '1') === '1' },
      whatsapp: { ligado: (cfg.avisos_whatsapp ?? '1') === '1', falta: faltaWhatsapp },
    })
  })

  // Cada aviso entregue no sino, com a situação do e-mail e do WhatsApp e o texto para envio manual.
  r.get('/avisos/envios', async (req, res) => {
    exigir(req, 'avisos:enviar')
    const filtros: string[] = []
    const params: unknown[] = []
    if (req.query.aviso_id) (filtros.push('n.aviso_id = ?'), params.push(req.query.aviso_id))
    if (req.query.pessoa_id) (filtros.push('ac.pessoa_id = ?'), params.push(req.query.pessoa_id))
    const linhas = (await db.all(
      `SELECT n.id AS notificacao_id, n.titulo, n.detalhe, n.link, n.criado_em, n.aviso_id, ac.pessoa_id, p.nome AS pessoa_nome, p.codigo AS pessoa_codigo, p.telefone,
              ev.id AS envio_id, ev.canal, ev.situacao, ev.detalhe AS envio_detalhe, ev.tentativas, ev.enviado_em
         FROM ped_notificacoes n JOIN ped_acessos_aluna ac ON ac.usuario_id = n.usuario_id JOIN ped_pessoas p ON p.id = ac.pessoa_id
         JOIN ped_envios_aviso ev ON ev.notificacao_id = n.id
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        ORDER BY n.criado_em DESC LIMIT 400`,
      ...params,
    )) as Record<string, string | number | null>[]
    const origem = new URL(req.raw.url).origin
    const porAviso = new Map<string, Record<string, unknown>>()
    for (const l of linhas) {
      const k = l.notificacao_id as string
      if (!porAviso.has(k)) {
        const telefone = telefoneWhatsapp(l.telefone as string | null)
        const texto = [l.titulo, l.detalhe, `Veja no portal: ${origem}/portal/diamante-business/${l.link ?? ''}`].filter(Boolean).join('\n\n')
        porAviso.set(k, {
          notificacao_id: k, titulo: l.titulo, detalhe: l.detalhe, criado_em: l.criado_em, aviso_id: l.aviso_id,
          pessoa_id: l.pessoa_id, pessoa_nome: l.pessoa_nome, pessoa_codigo: l.pessoa_codigo,
          // Envio manual: abre o WhatsApp da equipe com a mensagem pronta para esta aluna.
          whatsapp_manual: telefone ? `https://wa.me/${telefone}?text=${encodeURIComponent(String(texto))}` : null,
          canais: {},
        })
      }
      ;(porAviso.get(k)!.canais as Record<string, unknown>)[l.canal as string] = { id: l.envio_id, situacao: l.situacao, detalhe: l.envio_detalhe, tentativas: l.tentativas, enviado_em: l.enviado_em }
    }
    res.json({ envios: [...porAviso.values()].slice(0, 100) })
  })

  // "Enviar agora" (fila pendente) ou "Tentar novamente" (linhas escolhidas). A mesma linha é reaproveitada: nunca duplica.
  r.post('/avisos/envios/tentar', async (req, res) => {
    exigir(req, 'avisos:enviar')
    const d = validar(z.object({ ids: z.array(z.string().max(64)).max(200).optional() }), req.body)
    const enviados = await processarEnviosAvisos(db, ctx, d.ids ? { ids: d.ids } : {})
    await auditar(db, req, { entidade: 'aviso', entidade_id: 'envios', acao: 'envio_externo_tentado', dados: { linhas: d.ids?.length ?? 'fila', enviados } })
    res.json({ ok: true, enviados })
  })

  return r
}

function proximoDaSerie(a: Record<string, unknown>, agora: string): string | null {
  const inicio = a.inicio as string
  return inicio > agora ? inicio : proximoEnvio(inicio, a.recorrencia as string, agora)
}
