/**
 * Leitura assistida do contrato: procura no TEXTO do contrato a vigência, o programa, a quantidade de
 * cada tipo de encontro e os bônus. Não inventa nada: o que não for encontrado fica "pendente" para a
 * equipe preencher, e cada valor vem com o trecho de onde saiu, para conferência.
 *
 * O texto vem do próprio arquivo (PDF com texto, lido no navegador). Contrato digitalizado como imagem
 * não tem texto: todos os campos ficam pendentes.
 */

export interface CampoExtraido<T> {
  valor: T | null
  /** Trecho do contrato em que o valor foi encontrado. */
  trecho: string | null
  situacao: 'encontrado' | 'pendente'
}

export interface ItemExtraido {
  /** Chave estável do item dentro do contrato (não muda ao reprocessar o mesmo arquivo). */
  chave: string
  tipo_id: string | null
  descricao: string
  quantidade: number | null
  origem: 'pacote' | 'bonus'
  trecho: string
}

export interface DadosContrato {
  data_inicio: CampoExtraido<string>
  data_fim: CampoExtraido<string>
  duracao_meses: CampoExtraido<number>
  programa: CampoExtraido<{ id: string; nome: string }>
  itens: ItemExtraido[]
  /** O texto tinha conteúdo suficiente para leitura? */
  legivel: boolean
}

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18,
  dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
}

/** Minúsculas e sem acento, para comparar. */
export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function numero(t: string | undefined): number | null {
  if (!t) return null
  const n = Number(t)
  if (Number.isInteger(n) && n >= 0) return n
  return NUMEROS[normalizar(t)] ?? null
}

function dataBr(t: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t.trim())
  if (!m) return null
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(a, mes - 1, d))
  if (dt.getUTCMonth() !== mes - 1) return null
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function trechoEm(texto: string, inicio: number, fim: number): string {
  const a = Math.max(0, inicio - 40)
  const b = Math.min(texto.length, fim + 40)
  return `${a > 0 ? '…' : ''}${texto.slice(a, b).replace(/\s+/g, ' ').trim()}${b < texto.length ? '…' : ''}`
}

const pendente = <T>(): CampoExtraido<T> => ({ valor: null, trecho: null, situacao: 'pendente' })

const NUM = '(\\d{1,3}|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta)'

export function extrairContrato(
  textoOriginal: string,
  cadastros: { programas: { id: string; nome: string }[]; tipos: { id: string; nome: string }[] },
): DadosContrato {
  // O texto normalizado tem o mesmo tamanho do original (só tira acentos), então as posições batem.
  const texto = textoOriginal.normalize('NFC')
  const t = normalizar(texto)
  const legivel = t.replace(/\s+/g, '').length >= 80
  const saida: DadosContrato = { data_inicio: pendente(), data_fim: pendente(), duracao_meses: pendente(), programa: pendente(), itens: [], legivel }
  if (!legivel) return saida

  const DATA = '(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{4})'
  // "de 01/12/2026 a 30/11/2027" / "vigência ... entre 01/12/2026 e 30/11/2027"
  const periodo = new RegExp(`(?:vigencia|vigora|vigorar|periodo|prazo)[^.;]{0,80}?(?:de|entre|a partir de)\\s+${DATA}\\s*(?:a|ate|e)\\s+${DATA}`).exec(t)
  if (periodo) {
    const ini = dataBr(periodo[1])
    const fim = dataBr(periodo[2])
    const tr = trechoEm(texto, periodo.index, periodo.index + periodo[0].length)
    if (ini) saida.data_inicio = { valor: ini, trecho: tr, situacao: 'encontrado' }
    if (fim) saida.data_fim = { valor: fim, trecho: tr, situacao: 'encontrado' }
  }
  if (!saida.data_inicio.valor) {
    const m = new RegExp(`(?:inicio|inicia(?:-se)?|a partir de)[^.;\\d]{0,40}${DATA}`).exec(t)
    const v = m && dataBr(m[1])
    if (m && v) saida.data_inicio = { valor: v, trecho: trechoEm(texto, m.index, m.index + m[0].length), situacao: 'encontrado' }
  }
  if (!saida.data_fim.valor) {
    const m = new RegExp(`(?:termino|encerra(?:-se)?|fim|ate)[^.;\\d]{0,40}${DATA}`).exec(t)
    const v = m && dataBr(m[1])
    if (m && v) saida.data_fim = { valor: v, trecho: trechoEm(texto, m.index, m.index + m[0].length), situacao: 'encontrado' }
  }
  const meses = new RegExp(`(?:vigencia|prazo|duracao)[^.;]{0,60}?${NUM}\\s*(?:\\([^)]{1,30}\\)\\s*)?mes(?:es)?`).exec(t)
  if (meses) {
    const n = numero(meses[1])
    if (n) saida.duracao_meses = { valor: n, trecho: trechoEm(texto, meses.index, meses.index + meses[0].length), situacao: 'encontrado' }
  }

  // Programa: o nome cadastrado mais longo que aparece no texto.
  const programas = [...cadastros.programas].sort((a, b) => b.nome.length - a.nome.length)
  for (const p of programas) {
    const i = t.indexOf(normalizar(p.nome))
    if (p.nome.trim().length >= 3 && i >= 0) {
      saida.programa = { valor: { id: p.id, nome: p.nome }, trecho: trechoEm(texto, i, i + p.nome.length), situacao: 'encontrado' }
      break
    }
  }

  // Encontros: "3 (três) mentorias individuais", "02 sessões de Mentoria de Vendas".
  const tipos = [...cadastros.tipos].filter((x) => x.nome.trim().length >= 3).sort((a, b) => b.nome.length - a.nome.length)
  const usados: [number, number][] = []
  const sobrepoe = (a: number, b: number) => usados.some(([x, y]) => a < y && b > x)
  for (const tp of tipos) {
    const nome = escapar(normalizar(tp.nome))
    const re = new RegExp(`${NUM}\\s*(?:\\([^)]{1,30}\\)\\s*)?(?:encontros?|sessoes|sessao|aulas?|atendimentos?)?\\s*(?:de\\s+|individua(?:l|is)\\s+de\\s+)?${nome}`, 'g')
    let m: RegExpExecArray | null
    let k = 0
    while ((m = re.exec(t))) {
      if (sobrepoe(m.index, m.index + m[0].length)) continue
      usados.push([m.index, m.index + m[0].length])
      // Bônus quando a MESMA linha fala em bônus/cortesia antes ou logo depois do item.
      const antes = t.slice(Math.max(0, m.index - 120), m.index)
      const depois = t.slice(m.index + m[0].length, m.index + m[0].length + 40)
      const linhaAntes = antes.slice(antes.lastIndexOf('\n') + 1)
      const linhaDepois = depois.split('\n')[0]
      const bonus = /bonus|cortesia|brinde|presente/.test(linhaAntes) || /\b(?:bonus|cortesia|extra)\b/.test(linhaDepois)
      saida.itens.push({
        chave: `${bonus ? 'bonus' : 'pacote'}:${tp.id}:${k++}`,
        tipo_id: tp.id,
        descricao: tp.nome,
        quantidade: numero(m[1]),
        origem: bonus ? 'bonus' : 'pacote',
        trecho: trechoEm(texto, m.index, m.index + m[0].length),
      })
    }
  }

  // Bônus sem tipo cadastrado: linhas com "bônus" que ainda não viraram item.
  const reBonus = /(?:^|\n|[.;•\-–])\s*(?:\d+[.)]\s*)?(?:bonus|cortesia)\s*[:\-–]?\s*([^\n.;]{3,120})/g
  let b: RegExpExecArray | null
  let nb = 0
  while ((b = reBonus.exec(t))) {
    const ini = b.index + b[0].indexOf(b[1])
    if (sobrepoe(b.index, b.index + b[0].length)) continue
    const original = texto.slice(ini, ini + b[1].length).trim()
    const qtd = new RegExp(`^${NUM}\\b`).exec(b[1].trim())
    saida.itens.push({ chave: `bonus:livre:${nb++}`, tipo_id: null, descricao: original.slice(0, 200), quantidade: qtd ? numero(qtd[1]) : null, origem: 'bonus', trecho: trechoEm(texto, b.index, b.index + b[0].length) })
  }
  return saida
}
