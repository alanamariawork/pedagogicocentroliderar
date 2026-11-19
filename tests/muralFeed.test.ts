import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, type Ambiente, type Cliente } from './apoio/ambiente'
import { pngFicticio } from './apoio/imagens'
import { hojeSP, somarDias, somarMeses } from '../shared/datas'

/*
 * Mural em formato de feed (migration 0008): produto e serviço, imagens, busca e filtros, edição só
 * pela autora, curtidas (uma por pessoa), comentários e respostas, moderação com registro e as regras
 * de visibilidade conferidas no servidor. Dados e imagens fictícios.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

let amb: Ambiente
const c: Record<string, Cliente> = {}
let ana: Cliente // autora
let bia: Cliente // outra aluna ativa
let cris: Cliente // aluna com matrícula encerrada
let categoriaModa = ''
let categoriaServico = ''
const h = hojeSP()
const png = () => pngFicticio(40, 30, '#722642', '#dcc89f')

async function contar(sql: string, ...p: unknown[]) {
  return ((await amb.db.get(sql, ...p)) as { n: number }).n
}

beforeAll(async () => {
  amb = await abrirAmbiente()
  for (const [k, perfil] of [['admin', 'admin'], ['suporte', 'suporte'], ['mentora', 'mentora']] as const) {
    c[k] = await amb.entrar(await amb.criarEquipe(`${k}.mural@ficticio.local`, `${k} Mural Fictícia`, { perfil }))
  }
  const nova = async (nome: string, email: string) => {
    const r = await c.admin.post('/pessoas', { nome, email, telefone: '(11) 95555-0000', matricula: { data_inicio: somarMeses(h, -1), data_fim: somarDias(somarMeses(h, 3), -1), itens_extras: [] } })
    return { id: r.id as string, cli: await amb.entrar(await amb.criarAcessoPortal(email, r.id), 'portal') }
  }
  ana = (await nova('Ana Mural Fictícia', 'ana.mural@ficticio.local')).cli
  bia = (await nova('Bia Mural Fictícia', 'bia.mural@ficticio.local')).cli
  const cr = await nova('Cris Mural Fictícia', 'cris.mural@ficticio.local')
  cris = cr.cli
  await amb.db.run("UPDATE ped_matriculas SET situacao = 'encerrada' WHERE pessoa_id = ?", cr.id)
  const cats = (await ana.get('/portal/mural')).categorias as J[]
  categoriaModa = cats.find((x) => x.nome === 'Moda e acessórios')!.id
  categoriaServico = cats.find((x) => x.nome === 'Consultoria e mentoria')!.id
}, 240_000)

afterAll(async () => {
  await amb?.fechar()
})

const produto = (extra: J = {}) => ({
  tipo: 'produto',
  categoria_id: categoriaModa,
  negocio_nome: 'Ateliê Fictício',
  titulo: 'Vestido de linho fictício',
  descricao: 'Descrição fictícia do produto.',
  caracteristicas: ['Tamanhos P a G', 'Linho'],
  como_comprar: 'Pelo WhatsApp.',
  atendimento: 'não deve ser guardado em produto',
  preco_modo: 'valor',
  preco: '189,90',
  contato_canal: 'whatsapp',
  contato_valor: '(11) 90000-0000',
  link_externo: 'https://loja.exemplo.com/vestido',
  ...extra,
})

describe('Mural em formato de feed', () => {
  let p1 = ''
  let capa = ''
  let foto = ''

  it('imagens: aceita JPG/PNG/WEBP de verdade (confere o conteúdo), recusa o resto', async () => {
    const r = await ana.enviar('/portal/mural/imagens', 'capa.png', png())
    expect(r.status).toBe(201)
    capa = r.corpo.id
    foto = (await ana.enviar('/portal/mural/imagens', 'foto.PNG', png())).corpo.id
    expect((await ana.enviar('/portal/mural/imagens', 'falsa.png', new TextEncoder().encode('<script>alert(1)</script>'))).status).toBe(400)
    expect((await ana.enviar('/portal/mural/imagens', 'animada.gif', png())).status).toBe(400)
    expect((await cris.enviar('/portal/mural/imagens', 'x.png', png())).status).toBe(403) // matrícula encerrada
  })

  it('produto: a aluna cria com capa, galeria e preço; com moderação só ela vê até aprovar', async () => {
    const r = await ana.post('/portal/mural', produto({ capa_id: capa, galeria_ids: [foto] }))
    expect(r.situacao).toBe('pendente')
    p1 = r.id
    expect((await bia.get('/portal/mural')).publicadas).toHaveLength(0)
    expect((await bia.req('GET', `/portal/mural/${p1}`)).status).toBe(404)
    expect((await bia.req('GET', `/portal/mural/imagens/${capa}`)).status).toBe(404) // imagem de publicação pendente
    const minha = await ana.get(`/portal/mural/${p1}`)
    expect(minha).toMatchObject({ minha: true, pode_editar: true })
    expect(minha.publicacao).toMatchObject({ tipo: 'produto', preco_centavos: 18990, capa_id: capa, galeria_ids: [foto], detalhes: { caracteristicas: ['Tamanhos P a G', 'Linho'], como_comprar: 'Pelo WhatsApp.' } })
    expect(minha.publicacao.detalhes.atendimento).toBeUndefined() // só os campos do modelo de produto
    expect((await ana.get('/portal/mural')).minhas.map((x: J) => [x.id, x.situacao])).toEqual([[p1, 'pendente']])
    // A Gestão do Mural vê e aprova (com registro).
    expect((await c.suporte.get('/mural?situacao=pendente')).publicacoes.map((x: J) => x.id)).toContain(p1)
    await c.suporte.post(`/mural/${p1}/moderar`, { decisao: 'publicar' })
    expect(await contar("SELECT COUNT(*) AS n FROM ped_auditoria WHERE entidade = 'mural' AND entidade_id = ? AND acao = 'mural_publicar'", p1)).toBe(1)
  })

  it('feed e página: a outra aluna vê card, imagens e só o contato escolhido para a publicação', async () => {
    const feed = await bia.get('/portal/mural')
    expect(feed.publicadas[0]).toMatchObject({ id: p1, titulo: 'Vestido de linho fictício', negocio_nome: 'Ateliê Fictício', autora_nome: 'Ana Mural Fictícia', categoria_nome: 'Moda e acessórios', tipo: 'produto', capa_id: capa, curtidas: 0, comentarios: 0, curti: false })
    const pag = await bia.get(`/portal/mural/${p1}`)
    expect(pag.publicacao).toMatchObject({ contato_canal: 'whatsapp', contato_valor: '(11) 90000-0000', link_externo: 'https://loja.exemplo.com/vestido' })
    expect(pag.minha).toBe(false)
    expect(pag.pode_editar).toBe(false)
    const tudo = JSON.stringify(pag)
    expect(tudo).not.toContain('ana.mural@ficticio.local')
    expect(tudo).not.toContain('95555')
    expect(tudo).not.toContain('autora_pessoa_id')
    const img = await amb.api(new Request(`https://sistema.teste/api/ped/portal/mural/imagens/${capa}`, { headers: { Cookie: bia.cookie, 'X-CL-App': '1' } }))
    expect(img.status).toBe(200)
    expect(img.headers.get('Content-Type')).toBe('image/png')
    expect(img.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('serviço: guarda atendimento, benefícios, formato e local; "Consultar valor" no lugar do preço', async () => {
    const r = await bia.post('/portal/mural', {
      tipo: 'servico',
      categoria_id: categoriaServico,
      negocio_nome: 'Vitrine Fictícia',
      titulo: 'Consultoria de vitrine fictícia',
      descricao: 'Serviço fictício.',
      atendimento: 'Visita e proposta de layout.',
      beneficios: ['Vitrine que atrai'],
      formato: 'hibrido',
      local: 'Cidade Fictícia',
      caracteristicas: ['não deve ser guardado em serviço'],
      preco_modo: 'consultar',
      contato_canal: 'instagram',
      contato_valor: '@vitrine.ficticia',
    })
    await c.suporte.post(`/mural/${r.id}/moderar`, { decisao: 'publicar' })
    const p = (await ana.get(`/portal/mural/${r.id}`)).publicacao
    expect(p).toMatchObject({ tipo: 'servico', preco_consultar: true, preco_centavos: null, detalhes: { atendimento: 'Visita e proposta de layout.', beneficios: ['Vitrine que atrai'], formato: 'hibrido', local: 'Cidade Fictícia' } })
    expect(p.detalhes.caracteristicas).toBeUndefined()
  })

  it('busca por título ou negócio e filtros por categoria e tipo', async () => {
    const ids = async (qs: string) => ((await bia.get(`/portal/mural?${qs}`)).publicadas as J[]).map((x) => x.titulo)
    expect(await ids('q=ateli%C3%AA')).toEqual(['Vestido de linho fictício']) // nome do negócio
    expect(await ids('q=VITRINE')).toEqual(['Consultoria de vitrine fictícia']) // título, sem diferenciar maiúsculas
    expect(await ids('q=100%25')).toEqual([]) // curinga do LIKE é tratado como texto
    expect(await ids('tipo=servico')).toEqual(['Consultoria de vitrine fictícia'])
    expect(await ids(`categoria=${categoriaModa}`)).toEqual(['Vestido de linho fictício'])
    expect(await ids(`categoria=${categoriaModa}&tipo=servico`)).toEqual([])
  })

  it('validação no servidor: contato, link https e categoria', async () => {
    expect((await ana.req('POST', '/portal/mural', produto({ contato_valor: '123' }))).status).toBe(400)
    expect((await ana.req('POST', '/portal/mural', produto({ link_externo: 'javascript:alert(1)' }))).status).toBe(400)
    expect((await ana.req('POST', '/portal/mural', produto({ link_externo: 'http://sem-https.exemplo.com' }))).status).toBe(400)
    expect((await ana.req('POST', '/portal/mural', produto({ contato_canal: 'site', contato_valor: 'javascript:alert(1)' }))).status).toBe(400)
    expect((await ana.req('POST', '/portal/mural', produto({ categoria_id: 'nao-existe' }))).status).toBe(400)
    expect((await ana.req('POST', '/portal/mural', produto({ preco_modo: 'valor', preco: '' }))).status).toBe(400)
  })

  it('só a autora edita: outra aluna recebe 404; imagem de outra pessoa não pode ser usada', async () => {
    expect((await bia.req('PUT', `/portal/mural/${p1}`, produto({ titulo: 'Invadido' }))).status).toBe(404)
    expect((await bia.req('POST', `/portal/mural/${p1}/arquivar`)).status).toBe(404)
    expect((await bia.req('POST', '/portal/mural', produto({ capa_id: capa }))).status).toBe(400) // capa é da Ana
    expect((await c.suporte.req('PUT', `/mural/${p1}`, produto({ titulo: 'Equipe editando' }))).status).toBe(403) // a equipe modera, não edita a da aluna
    expect((await amb.db.get('SELECT titulo FROM ped_mural WHERE id = ?', p1)) as J).toMatchObject({ titulo: 'Vestido de linho fictício' })
  })

  let comentario = ''
  let resposta = ''

  it('curtidas: uma por pessoa, desfazer, e a contagem continua certa depois de recarregar', async () => {
    expect(await bia.post(`/portal/mural/${p1}/curtir`, { curtir: true })).toEqual({ curtidas: 1, comentarios: 0, curti: true })
    expect(await bia.post(`/portal/mural/${p1}/curtir`, { curtir: true })).toMatchObject({ curtidas: 1 }) // repetir não duplica
    expect(await ana.post(`/portal/mural/${p1}/curtir`, { curtir: true })).toMatchObject({ curtidas: 2, curti: true })
    expect(await bia.post(`/portal/mural/${p1}/curtir`, { curtir: false })).toMatchObject({ curtidas: 1, curti: false })
    expect((await bia.get('/portal/mural')).publicadas.find((x: J) => x.id === p1)).toMatchObject({ curtidas: 1, curti: false })
    expect((await ana.get(`/portal/mural/${p1}`)).publicacao).toMatchObject({ curtidas: 1, curti: true })
    expect(await contar('SELECT COUNT(*) AS n FROM ped_mural_curtidas WHERE mural_id = ?', p1)).toBe(1)
    expect((await cris.req('POST', `/portal/mural/${p1}/curtir`, { curtir: true })).status).toBe(404) // matrícula encerrada não vê o mural
  })

  it('comentários: comentar, responder (resposta de resposta vai para o principal), editar e excluir os próprios', async () => {
    comentario = (await bia.post(`/portal/mural/${p1}/comentarios`, { texto: 'Tem tamanho GG? (fictício)' })).id
    resposta = (await ana.post(`/portal/mural/${p1}/comentarios`, { texto: 'Por encomenda, sim. (fictício)', pai_id: comentario })).id
    const r2 = await bia.post(`/portal/mural/${p1}/comentarios`, { texto: 'Obrigada! (fictício)', pai_id: resposta })
    let lista = (await ana.get(`/portal/mural/${p1}`)).comentarios as J[]
    expect(lista.map((x) => [x.texto, x.pai_id, x.minha])).toEqual([
      ['Tem tamanho GG? (fictício)', null, false],
      ['Por encomenda, sim. (fictício)', comentario, true],
      ['Obrigada! (fictício)', comentario, false],
    ])
    expect(lista[0]).toMatchObject({ autora_nome: 'Bia Mural Fictícia' })
    expect(lista[0].criado_em).toBeTruthy()
    // Editar e excluir: só os próprios (conferido no servidor).
    expect((await ana.req('PUT', `/portal/mural/comentarios/${comentario}`, { texto: 'Alterado pela Ana' })).status).toBe(403)
    expect((await ana.req('DELETE', `/portal/mural/comentarios/${comentario}`)).status).toBe(403)
    await bia.put(`/portal/mural/comentarios/${comentario}`, { texto: 'Tem tamanho GG? Editado (fictício)' })
    expect(await bia.req('DELETE', `/portal/mural/comentarios/${r2.id}`).then((r) => r.corpo)).toMatchObject({ comentarios: 2 })
    lista = (await bia.get(`/portal/mural/${p1}`)).comentarios as J[]
    expect(lista.map((x) => x.texto)).toEqual(['Tem tamanho GG? Editado (fictício)', 'Por encomenda, sim. (fictício)'])
    expect(lista[0].editado_em).toBeTruthy()
    expect((await bia.get('/portal/mural')).publicadas.find((x: J) => x.id === p1).comentarios).toBe(2)
    expect((await cris.req('POST', `/portal/mural/${p1}/comentarios`, { texto: 'x' })).status).toBe(404)
  })

  it('moderação de comentários pela equipe, com registro; a aluna não vê o texto removido', async () => {
    expect((await c.mentora.req('POST', `/mural/comentarios/${comentario}/moderar`, { decisao: 'remover' })).status).toBe(403)
    await c.suporte.post(`/mural/comentarios/${comentario}/moderar`, { decisao: 'remover', motivo: 'Teste de moderação (fictício)' })
    const visto = (await ana.get(`/portal/mural/${p1}`)).comentarios as J[]
    // O principal some, mas continua como aviso porque tem resposta ativa; o texto não sai do servidor.
    expect(visto[0]).toMatchObject({ id: comentario, situacao: 'removido', texto: null })
    expect(JSON.stringify(visto)).not.toContain('Editado')
    const equipe = (await c.suporte.get(`/mural/${p1}`)).comentarios as J[]
    expect(equipe.find((x) => x.id === comentario)).toMatchObject({ texto: 'Tem tamanho GG? Editado (fictício)', motivo_moderacao: 'Teste de moderação (fictício)', moderado_por_nome: 'suporte Mural Fictícia' })
    expect(await contar("SELECT COUNT(*) AS n FROM ped_auditoria WHERE entidade = 'mural_comentario' AND entidade_id = ? AND acao = 'comentario_remover'", comentario)).toBe(1)
    expect((await bia.req('PUT', `/portal/mural/comentarios/${comentario}`, { texto: 'voltei' })).status).toBe(404) // removido não se edita
    await c.suporte.post(`/mural/comentarios/${comentario}/moderar`, { decisao: 'restaurar' })
    expect(((await ana.get(`/portal/mural/${p1}`)).comentarios as J[])[0]).toMatchObject({ situacao: 'ativo', texto: 'Tem tamanho GG? Editado (fictício)' })
  })

  it('edição pela autora: com moderação volta para aprovação; troca de imagens preserva o arquivo', async () => {
    const nova = (await ana.enviar('/portal/mural/imagens', 'nova.webp', new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBPVP8 ')]))).corpo.id
    const r = await ana.put(`/portal/mural/${p1}`, produto({ titulo: 'Vestido de linho fictício (novo)', capa_id: nova, galeria_ids: [] }))
    expect(r.situacao).toBe('pendente')
    expect((await bia.get('/portal/mural')).publicadas.some((x: J) => x.id === p1)).toBe(false)
    const p = (await ana.get(`/portal/mural/${p1}`)).publicacao
    expect(p).toMatchObject({ titulo: 'Vestido de linho fictício (novo)', capa_id: nova, galeria_ids: [] })
    expect(p.editada_em).toBeTruthy()
    expect(await contar("SELECT COUNT(*) AS n FROM ped_mural_imagens WHERE mural_id = ? AND papel = 'removida'", p1)).toBe(2)
    await c.suporte.post(`/mural/${p1}/moderar`, { decisao: 'publicar' })
    // Curtidas e comentários continuam depois da edição.
    expect((await bia.get(`/portal/mural/${p1}`)).publicacao).toMatchObject({ curtidas: 1, comentarios: 2 })
  })

  it('publicação direta e "só a equipe publica" seguem Configurações; a equipe publica e edita as dela', async () => {
    await c.admin.put('/configuracoes', { mural_publicacao: 'direta' })
    expect((await bia.post('/portal/mural', produto({ titulo: 'Direto (fictício)', negocio_nome: 'Loja da Bia' }))).situacao).toBe('publicada')
    await c.admin.put('/configuracoes', { mural_publicacao: 'somente_equipe' })
    expect((await bia.req('POST', '/portal/mural', produto())).status).toBe(403)
    expect((await ana.req('PUT', `/portal/mural/${p1}`, produto())).status).toBe(403)
    expect((await ana.get('/portal/mural')).pode_publicar).toBe(false)
    await c.admin.put('/configuracoes', { mural_publicacao: 'moderada' })
    const img = (await c.suporte.enviar('/mural/imagens', 'evento.png', png())).corpo.id
    const eq = await c.suporte.post('/mural', { ...produto({ tipo: 'servico', categoria_id: categoriaServico, contato_canal: 'email', contato_valor: 'equipe@exemplo.com' }), capa_id: img, autora_nome: 'Equipe Fictícia' })
    await c.suporte.put(`/mural/${eq.id}`, { ...produto({ tipo: 'servico', categoria_id: categoriaServico, titulo: 'Evento da equipe (fictício)', contato_canal: 'email', contato_valor: 'equipe@exemplo.com' }), capa_id: img, autora_nome: 'Equipe Fictícia' })
    expect((await bia.get(`/portal/mural/${eq.id}`)).publicacao).toMatchObject({ titulo: 'Evento da equipe (fictício)', autora_nome: 'Equipe Fictícia', da_equipe: true })
    expect((await c.mentora.req('GET', '/mural')).status).toBe(403)
  })

  it('categorias configuráveis: a equipe cria e desativa; desativada some para novas publicações', async () => {
    const nova = (await c.suporte.post('/mural/categorias', { nome: 'Artesanato (fictícia)', ordem: 10 })).id
    expect((await c.suporte.req('POST', '/mural/categorias', { nome: 'artesanato (FICTÍCIA)' })).status).toBe(409)
    expect(((await ana.get('/portal/mural')).categorias as J[]).some((x) => x.id === nova)).toBe(true)
    await c.suporte.put(`/mural/categorias/${nova}`, { nome: 'Artesanato (fictícia)', ordem: 10, ativa: false })
    expect(((await ana.get('/portal/mural')).categorias as J[]).some((x) => x.id === nova)).toBe(false)
    expect((await ana.req('POST', '/portal/mural', produto({ categoria_id: nova }))).status).toBe(400)
    expect(await contar("SELECT COUNT(*) AS n FROM ped_auditoria WHERE entidade = 'mural_categoria' AND entidade_id = ?", nova)).toBe(2)
    expect((await c.mentora.req('POST', '/mural/categorias', { nome: 'x' })).status).toBe(403)
  })

  it('visibilidade: matrícula encerrada não vê o feed (regra "ativas"); com "todas" vê, mas não interage', async () => {
    const r = await cris.get('/portal/mural')
    expect(r).toMatchObject({ pode_ver: false, pode_publicar: false, pode_interagir: false, publicadas: [] })
    expect((await cris.req('GET', `/portal/mural/${p1}`)).status).toBe(404)
    await c.admin.put('/configuracoes', { mural_visibilidade: 'todas' })
    expect((await cris.get('/portal/mural')).publicadas.length).toBeGreaterThan(0)
    expect((await cris.get(`/portal/mural/${p1}`)).pode_interagir).toBe(false)
    expect((await cris.req('POST', `/portal/mural/${p1}/curtir`, { curtir: true })).status).toBe(403)
    await c.admin.put('/configuracoes', { mural_visibilidade: 'ativas' })
    // Equipe não usa as rotas do portal.
    expect((await c.suporte.req('GET', '/portal/mural')).status).toBe(403)
  })

  it('arquivar pela autora tira do feed e registra', async () => {
    await ana.post(`/portal/mural/${p1}/arquivar`, {})
    expect((await bia.get('/portal/mural')).publicadas.some((x: J) => x.id === p1)).toBe(false)
    expect((await bia.req('GET', `/portal/mural/${p1}`)).status).toBe(404)
    expect((await ana.req('PUT', `/portal/mural/${p1}`, produto())).status).toBe(409)
    expect(await contar("SELECT COUNT(*) AS n FROM ped_auditoria WHERE entidade = 'mural' AND entidade_id = ? AND acao = 'arquivada_pela_aluna'", p1)).toBe(1)
  })
})
