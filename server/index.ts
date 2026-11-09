import { abrirBanco } from './db'
import { criarApp } from './app'
import { processarAvisos } from './servicos'

const db = abrirBanco()
const porta = Number(process.env.PORT ?? 3001)
const host = process.env.HOST ?? '127.0.0.1'

criarApp(db).listen(porta, host, () => {
  const total = (db.prepare('SELECT COUNT(*) n FROM usuarios').get() as { n: number }).n
  console.log(`Diamante Business | Gestão da Jornada — API em http://${host}:${porta}`)
  if (total === 0) console.log('Nenhum usuário cadastrado. Rode "npm run seed" (demonstração) ou "npm run criar-admin".')
})

// Avisos programados pela equipe: confere a cada minuto se algum horário chegou.
setInterval(() => {
  try {
    processarAvisos(db)
  } catch (e) {
    console.error('Falha ao processar avisos:', e)
  }
}, 60_000).unref()
