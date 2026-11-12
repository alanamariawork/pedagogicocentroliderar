/**
 * SÓ DESENVOLVIMENTO LOCAL: cria o banco do `wrangler dev` (.wrangler/state) com as migrations do
 * backoffice e do pedagógico e os dados de demonstração, e imprime cookies de sessão para testar
 * cada perfil no navegador. Nunca rodar contra produção (não há como: usa só o D1 local).
 */
import { abrirAmbiente } from './ambiente'
import { CONTAS, popularDemonstracao } from './demo'

const amb = await abrirAmbiente({ pasta: '.wrangler/state' })
await popularDemonstracao(amb)
const saida: Record<string, string> = {}
for (const [email, escopo] of [
  ['admin@demo.local', 'equipe'],
  ['coordenacao@demo.local', 'equipe'],
  ['mentora@demo.local', 'equipe'],
  ['suporte@demo.local', 'equipe'],
  ['beatriz@demo.local', 'portal'],
] as const)
  saida[email] = (await amb.entrar(CONTAS[email], escopo)).cookie
console.log(JSON.stringify(saida, null, 2))
await amb.fechar()
