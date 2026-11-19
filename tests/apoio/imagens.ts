import { deflateSync } from 'node:zlib'

/*
 * Imagens PNG fictícias para testes e demonstração: um degradê entre duas cores, com uma faixa
 * clara no meio (lembra um produto em vitrine). Gerado aqui, sem fotos de pessoas reais.
 */

const TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(b: Uint8Array) {
  let c = 0xffffffff
  for (const x of b) c = TABELA[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloco(tipo: string, dados: Uint8Array) {
  const out = new Uint8Array(12 + dados.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, dados.length)
  out.set(new TextEncoder().encode(tipo), 4)
  out.set(dados, 8)
  v.setUint32(8 + dados.length, crc32(out.subarray(4, 8 + dados.length)))
  return out
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))

export function pngFicticio(largura: number, altura: number, de: string, para: string): Uint8Array {
  const [a, b] = [hex(de), hex(para)]
  const linhas = new Uint8Array(altura * (1 + largura * 3))
  for (let y = 0; y < altura; y++) {
    const base = y * (1 + largura * 3)
    linhas[base] = 0
    for (let x = 0; x < largura; x++) {
      const t = (x + y) / (largura + altura)
      const faixa = Math.abs(y - altura / 2) < altura * 0.12 && Math.abs(x - largura / 2) < largura * 0.3
      for (let k = 0; k < 3; k++) linhas[base + 1 + x * 3 + k] = faixa ? 248 : Math.round(a[k] + (b[k] - a[k]) * t)
    }
  }
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, largura)
  v.setUint32(4, altura)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const partes = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', new Uint8Array(deflateSync(linhas))), bloco('IEND', new Uint8Array())]
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}
