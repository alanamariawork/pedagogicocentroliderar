# Efeito Diamante | Gestão da Jornada

Sistema interno do Centro Liderar (Grupo Mendes) para acompanhar as mentoradas do programa Efeito Diamante. Ele cobre matrículas, entregáveis contratados, entregas do mês, agenda e capacidade, contatos e impedimentos, a jornada pedagógica com validação humana, conquistas, satisfação e o portal da aluna.

É um piloto funcional, não uma maquete. Os dados ficam gravados em banco, o login é real e as permissões são verificadas no servidor em cada requisição.

> Todos os dados de demonstração são **fictícios** (nomes "Demo", e-mails `@demo.local`). Nenhum dado real de aluna foi importado. Conteúdos marcados com **[Demo]** são exemplos e precisam ser substituídos pelo conteúdo oficial.

## Como rodar

Você precisa de **Node.js 20.11 ou mais recente**.

```bash
npm install
npm run seed            # cria data/efeito-diamante.db com a demonstração
npm run dev             # API em 127.0.0.1:3001 e tela em http://localhost:5173
```

Para recriar a demonstração do zero, rode `npm run seed -- --recriar`.

Usuários da demonstração (a senha é `diamante2026` para todos):

| Perfil | E-mail |
|---|---|
| Administração | admin@demo.local |
| Coordenação pedagógica | coordenacao@demo.local |
| Suporte/CS | suporte@demo.local |
| Comercial | comercial@demo.local |
| Mentora (só vê as próprias alunas) | mentora@demo.local |
| Alunas (portal) | beatriz@, carla@, daniela@, elisa@, fernanda@, gabriela@demo.local |

### Uso real (sem demonstração)

```bash
npm install
npm run build
npm run criar-admin     # pergunta nome, e-mail e senha do primeiro administrador
NODE_ENV=production npm start   # serve a API e a tela em http://127.0.0.1:3001
```

Depois disso, cadastre o restante pela própria tela: em **Configurações**, os programas, profissionais, tipos de entregável, motivos, parâmetros, usuários e regras de acesso; em **Trilhas e etapas**, o modelo pedagógico; e em **Pacotes**, os modelos de pacote.

### Variáveis de ambiente (todas opcionais)

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` / `HOST` | `3001` / `127.0.0.1` | Endereço do servidor |
| `DB_PATH` | `data/efeito-diamante.db` | Arquivo do banco SQLite |
| `NODE_ENV=production` | — | Liga o cookie `Secure` (exige HTTPS) |
| `COOKIE_SECURE` | segue `NODE_ENV` | Use `false` para testar o build de produção por HTTP local |
| `TRUST_PROXY` | `false` | `true` se estiver atrás de um proxy HTTPS |
| `SENHA_DEMO` | `diamante2026` | Senha dos usuários da demonstração |
| `HOJE_FIXO` | — | Fixa a data "de hoje" (AAAA-MM-DD), útil em testes |

O código não guarda nenhum segredo. **Backup:** copie o arquivo do banco (e os arquivos `-wal`/`-shm`, se existirem) com o servidor parado.

### Publicar

Nada foi publicado. Para publicar, você precisa de um servidor com Node, disco persistente para o arquivo do banco e HTTPS na frente (por exemplo, um proxy reverso). Rode com `NODE_ENV=production` e `TRUST_PROXY=true`.

## Testes

```bash
npm test          # 29 testes: 22 de aceite (CA01–CA16 + segurança) e 7 de cálculo
npm run typecheck
```

Os testes de aceite sobem o servidor de verdade com um banco em memória e percorrem a API com cada perfil. Veja `docs/criterios-de-aceite.md`.

## Documentação

- [docs/uso.md](docs/uso.md): o guia de uso por perfil e tela.
- [docs/arquitetura.md](docs/arquitetura.md): a estrutura, o modelo de dados, a segurança e onde cada regra RN01–RN16 está implementada.
- [docs/criterios-de-aceite.md](docs/criterios-de-aceite.md): o que foi testado e como.
- [docs/limitacoes.md](docs/limitacoes.md): as limitações, as premissas e as decisões em aberto.
