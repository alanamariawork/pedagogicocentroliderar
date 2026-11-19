import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abrirAmbiente, type Ambiente, type Cliente } from './apoio/ambiente'
import { hojeSP, somarDias, somarMeses } from '../shared/datas'
import { conferirVideo, embedVimeo, embedYoutube } from '../server/videos'

/*
 * Vídeos do YouTube (não listados) no Banco de Aulas e na Biblioteca, ao lado dos do Vimeo que já
 * existiam. O link vira o player youtube-nocookie e o progresso é gravado como no Vimeo. Dados fictícios.
 */

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const PLAYER = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'

describe('Links do YouTube aceitos', () => {
  it('watch, youtu.be, shorts, live, embed e nocookie viram o mesmo player', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'http://youtu.be/dQw4w9WgXcQ',
      '  https://youtu.be/dQw4w9WgXcQ  ',
    ])
      expect(embedYoutube(url), url).toBe(PLAYER)
  })
  it('lista, canal, id inválido e outro site são recusados', () => {
    for (const url of ['https://www.youtube.com/playlist?list=PL123', 'https://www.youtube.com/@canal', 'https://youtube.com/watch?v=1', 'https://youtu.be/', 'https://exemplo.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.exemplo.com/watch?v=dQw4w9WgXcQ', 'não é link'])
      expect(embedYoutube(url), url).toBeNull()
  })
  it('conferirVideo: YouTube, Vimeo, vazio e link que não serve', () => {
    expect(conferirVideo('https://youtu.be/dQw4w9WgXcQ')).toBe(PLAYER)
    expect(conferirVideo('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871')
    expect(conferirVideo('https://player.vimeo.com/video/76979871?h=abc')).toBe(embedVimeo('https://vimeo.com/76979871/abc'))
    expect(conferirVideo('')).toBeNull()
    expect(conferirVideo(null)).toBeNull()
    expect(() => conferirVideo('https://exemplo.com/video.mp4')).toThrow(/YouTube/)
  })
})

describe('YouTube nas aulas do plano e na Biblioteca', () => {
  let amb: Ambiente
  let coord: Cliente
  let aluna: Cliente
  beforeAll(async () => {
    amb = await abrirAmbiente()
    coord = await amb.entrar(await amb.criarEquipe('coord.yt@ficticio.local', 'Coordenação Fictícia', { perfil: 'coordenacao' }))
    const pacote = ((await coord.get('/pacotes')) as J[]).find((x) => x.nome === 'Diamante Business — 4 meses de acompanhamento')!
    const h = hojeSP()
    const inicio = somarMeses(h, -1)
    const r = await coord.post('/pessoas', { nome: 'Aluna YouTube Fictícia', email: 'yt@ficticio.local', telefone: '(11) 95555-0000', matricula: { programa_id: pacote.programa_id, pacote_id: pacote.id, data_inicio: inicio, data_fim: somarDias(somarMeses(inicio, 4), -1), itens_extras: [] } })
    aluna = await amb.entrar(await amb.criarAcessoPortal('yt@ficticio.local', r.id), 'portal')
  }, 240_000)
  afterAll(async () => {
    await amb?.fechar()
  })

  it('aula com link do YouTube: a aluna recebe o player e o progresso é gravado; Vimeo continua valendo', async () => {
    const yt = (await coord.post('/aulas', { mes: 1, titulo: 'Aula no YouTube', video_url: 'https://youtu.be/dQw4w9WgXcQ', ordem: 1 })).id
    const vimeo = (await coord.post('/aulas', { mes: 1, titulo: 'Aula no Vimeo', video_url: 'https://vimeo.com/111111111', ordem: 2 })).id
    for (const id of [yt, vimeo]) await coord.post(`/aulas/${id}/publicar`, { publicado: true })
    const mes = await aluna.get('/portal/linha-do-tempo/1')
    expect(mes.aulas.map((a: J) => a.video_url)).toEqual([PLAYER, 'https://player.vimeo.com/video/111111111'])
    expect(await aluna.post(`/portal/aulas/${yt}/progresso`, { percentual: 92 })).toMatchObject({ assistida: true })
    expect((await coord.get('/aulas')).aulas.find((a: J) => a.id === yt).assistiram).toBe(1)
    // Trocar o vídeo de Vimeo para YouTube na edição.
    await coord.put(`/aulas/${vimeo}`, { mes: 1, titulo: 'Aula no Vimeo', video_url: 'https://www.youtube.com/watch?v=abcdefghijk', ordem: 2 })
    expect((await aluna.get('/portal/linha-do-tempo/1')).aulas[1].video_url).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk')
    expect((await coord.req('POST', '/aulas', { mes: 1, titulo: 'X', video_url: 'https://www.youtube.com/playlist?list=PL1' })).status).toBe(400)
  })

  it('Biblioteca com link do YouTube: player no portal e progresso da aluna', async () => {
    const id = (await coord.post('/conteudos', { secao: 'biblioteca', categoria: 'Vídeos', titulo: 'Vídeo fictício no YouTube', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).id
    await coord.post(`/conteudos/${id}/publicar`, { publicado: true })
    const item = (await aluna.get('/portal/conteudos/biblioteca')).itens.find((x: J) => x.id === id)
    expect(item.video_url).toBe(PLAYER)
    expect(await aluna.post(`/portal/conteudos/${id}/progresso`, { percentual: 50 })).toMatchObject({ percentual: 50, assistida: false })
    expect((await coord.req('POST', '/conteudos', { secao: 'livros', titulo: 'Livro', video_url: 'https://youtu.be/dQw4w9WgXcQ' })).status).toBe(400)
  })
})
