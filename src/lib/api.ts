import { useCallback, useEffect, useRef, useState } from 'react'

// Registros vindos da API. A validação das regras acontece no servidor.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Reg = Record<string, any>

export class ErroApi extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

let aoExpirar: (() => void) | null = null
export function definirAoExpirar(fn: () => void) {
  aoExpirar = fn
}

export async function api<T = Reg>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/api${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'diamante-business' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.')
  }
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (r.status === 401 && caminho !== '/auth/login' && caminho !== '/auth/eu') aoExpirar?.()
    throw new ErroApi(r.status, (json as { erro?: string }).erro ?? 'Não foi possível concluir a operação.')
  }
  return json as T
}

/** Envia um arquivo como corpo cru; o nome vai no cabeçalho. */
export async function enviarArquivo<T = Reg>(caminho: string, arquivo: File): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/api${caminho}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Requested-With': 'diamante-business', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name) },
      body: arquivo,
    })
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.')
  }
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (r.status === 401) aoExpirar?.()
    throw new ErroApi(r.status, `${arquivo.name}: ${(json as { erro?: string }).erro ?? 'não foi possível enviar o arquivo.'}`)
  }
  return json as T
}

export const get = <T = Reg>(c: string) => api<T>('GET', c)
export const post = <T = Reg>(c: string, b: unknown = {}) => api<T>('POST', c, b)
export const put = <T = Reg>(c: string, b: unknown = {}) => api<T>('PUT', c, b)
export const del = <T = Reg>(c: string) => api<T>('DELETE', c)

/** Carrega um recurso e oferece `recarregar`. `caminho` nulo não carrega. */
export function useDados<T = Reg>(caminho: string | null) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(!!caminho)
  const atual = useRef(caminho)
  atual.current = caminho

  const recarregar = useCallback(async () => {
    if (!caminho) return
    setCarregando(true)
    setErro(null)
    try {
      const d = await get<T>(caminho)
      if (atual.current === caminho) setDados(d)
    } catch (e) {
      if (atual.current === caminho) setErro(e instanceof Error ? e.message : 'Erro ao carregar.')
    } finally {
      if (atual.current === caminho) setCarregando(false)
    }
  }, [caminho])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  return { dados, erro, carregando, recarregar }
}

export function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocorreu um erro inesperado. Tente novamente.'
}

export function baixarCsv(nome: string, linhas: (string | number | null | undefined)[][]) {
  const csv = linhas
    .map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
