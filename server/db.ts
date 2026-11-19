/** Identificadores e carimbos de data. O acesso ao banco (D1) fica em server/bd.ts. */
export type { BD, TX, BDouTX } from './bd'
export { transacao } from './bd'

export const novoId = () => crypto.randomUUID()
export const agoraIso = () => new Date().toISOString()
