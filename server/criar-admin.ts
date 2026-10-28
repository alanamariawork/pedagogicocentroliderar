import { createInterface } from 'node:readline/promises'
import { abrirBanco, agoraIso, novoId } from './db'
import { garantirPermissoesPadrao, gerarHashSenha, validarForcaSenha } from './auth'

/** Cria o primeiro usuário de Administração. Uso: npm run criar-admin */
const rl = createInterface({ input: process.stdin, output: process.stdout })
const nome = (await rl.question('Nome: ')).trim()
const email = (await rl.question('E-mail: ')).trim().toLowerCase()
const senha = await rl.question('Senha (mín. 10 caracteres, letras e números): ')
rl.close()
const erro = !nome || !email.includes('@') ? 'Informe nome e e-mail válidos.' : validarForcaSenha(senha)
if (erro) {
  console.error(erro)
  process.exit(1)
}
const db = abrirBanco()
garantirPermissoesPadrao(db)
if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) {
  console.error('Já existe um usuário com este e-mail.')
  process.exit(1)
}
const agora = agoraIso()
db.prepare("INSERT INTO usuarios (id, nome, email, senha_hash, perfil, ativo, criado_em, atualizado_em) VALUES (?,?,?,?, 'admin', 1, ?, ?)").run(
  novoId(), nome, email, gerarHashSenha(senha), agora, agora)
console.log(`Administração criada para ${email}.`)
