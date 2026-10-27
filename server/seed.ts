import { existsSync, rmSync } from 'node:fs'
import { abrirBanco } from './db'
import { popularDemonstracao, SENHA_DEMO, USUARIOS_DEMO } from './demo'

/** Cria um banco de DEMONSTRAÇÃO. Uso: npm run seed  (use --recriar para apagar o banco de demonstração atual). */
const caminho = process.env.DB_PATH ?? 'data/efeito-diamante.db'
if (process.argv.includes('--recriar') && existsSync(caminho)) {
  for (const sufixo of ['', '-wal', '-shm']) rmSync(caminho + sufixo, { force: true })
}
const db = abrirBanco(caminho)
const existentes = (db.prepare('SELECT COUNT(*) n FROM usuarios').get() as { n: number }).n
if (existentes > 0) {
  console.error(`O banco ${caminho} já tem dados. Para recriar a demonstração do zero: npm run seed -- --recriar`)
  process.exit(1)
}
await popularDemonstracao(db)
console.log('Demonstração criada. Usuários (senha para todos: ' + SENHA_DEMO + '):')
for (const u of USUARIOS_DEMO) console.log(`  ${u.perfil.padEnd(12)} ${u.email}`)
console.log('  aluna        beatriz@demo.local, carla@demo.local, daniela@demo.local, elisa@demo.local, fernanda@demo.local, gabriela@demo.local')
