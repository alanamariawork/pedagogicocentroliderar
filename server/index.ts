import { abrirBanco } from './db'
import { criarApp } from './app'

const db = abrirBanco()
const porta = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'

criarApp(db).listen(porta, host, () => {
  const total = (db.prepare('SELECT COUNT(*) n FROM usuarios').get() as { n: number }).n
  console.log(`Efeito Diamante | Gestão da Jornada — API em http://${host}:${porta}`)
  if (total === 0) console.log('Nenhum usuário cadastrado. Rode "npm run seed" (demonstração) ou "npm run criar-admin".')
})
