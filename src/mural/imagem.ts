/**
 * Prepara a foto antes do envio: fotos grandes (comuns no celular) são reduzidas para no máximo
 * 1600 px no lado maior e convertidas para JPG, ficando bem abaixo do limite de 5 MB do servidor.
 * Formatos que o navegador não consegue abrir (ex.: HEIC fora do iPhone) recebem uma mensagem clara.
 */
const LADO_MAX = 1600
const ACEITOS = ['image/jpeg', 'image/png', 'image/webp']
export const ACEITAR_IMAGENS = 'image/jpeg,image/png,image/webp'

export async function prepararImagem(arquivo: File): Promise<File> {
  const leve = ACEITOS.includes(arquivo.type) && arquivo.size <= 1.5 * 1024 * 1024
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(arquivo)
  } catch {
    if (leve) return arquivo
    throw new Error(`${arquivo.name}: formato não suportado. Envie JPG, PNG ou WEBP.`)
  }
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
  if (leve && escala === 1) {
    bitmap.close()
    return arquivo
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem neste navegador.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Não foi possível preparar a imagem neste navegador.')
  const nome = arquivo.name.replace(/\.[^.]+$/, '') || 'imagem'
  return new File([blob], `${nome}.jpg`, { type: 'image/jpeg' })
}
