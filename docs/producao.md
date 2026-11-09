# Publicação e teste em produção

Nada foi publicado. Este roteiro é para quem tem acesso à conta Cloudflare “Centro Liderar”, e só deve ser seguido depois da confirmação da responsável pelo projeto.

São dois Workers na mesma conta, com o mesmo banco D1 (`centro-liderar-eventos`):

- **sistema** (backoffice): recebe todos os acessos e repassa `/produtos/*`, `/api/ped/*` e `/portal/diamante-business/*` ao pedagógico pela ligação direta entre Workers (service binding `PEDAGOGICO`).
- **pedagogico** (este repositório): não tem endereço público (`workers_dev: false`). Ele lê a sessão do backoffice e chama o entrypoint `Pedagogico` do backoffice (binding `BACKOFFICE`) para gravar em Clientes.

Nenhum dos dois passos apaga dados ou tabelas. As migrations só acrescentam: duas colunas no backoffice (`0017_perfil_pedagogico.sql`) e as tabelas `ped_` no pedagógico (`0001_ped_esquema.sql`).

## Antes de começar

1. Aplique o pacote de alteração do backoffice no repositório dele e rode `npm test` e `npm run typecheck` lá. Os dois precisam passar.
2. Rode `npm test` e `npm run typecheck` neste repositório.
3. Faça uma cópia do banco de produção (só leitura, não altera nada):
   ```bash
   npx wrangler d1 export centro-liderar-eventos --remote --output backup-AAAAMMDD.sql
   ```
   O D1 também guarda o histórico dos últimos 30 dias (Time Travel), que permite voltar o banco a um minuto anterior.

## Ordem de publicação

A ordem importa: a visão `ped_usuarios` do pedagógico usa a coluna `membro.perfil_pedagogico`, que nasce na migration do backoffice.

1. **Banco, parte do backoffice** (no repositório do backoffice):
   ```bash
   npx wrangler d1 migrations list DB --remote    # deve listar só 0017_perfil_pedagogico.sql como pendente
   npx wrangler d1 migrations apply DB --remote
   ```
   Se aparecer outra migration pendente além da 0017, pare e confira antes de aplicar.

2. **Bucket dos anexos** (uma vez só):
   ```bash
   npx wrangler r2 bucket create pedagogico-anexos
   ```

3. **Banco, parte do pedagógico** (neste repositório). A tabela de controle é `ped_migracoes`, separada da do backoffice:
   ```bash
   npm run db:producao:listar                     # deve listar só 0001_ped_esquema.sql
   npx wrangler d1 migrations apply DB --remote
   ```

4. **Worker do pedagógico** (neste repositório):
   ```bash
   npm run deploy                                 # build + wrangler deploy (Worker "pedagogico")
   ```
   Se a Cloudflare recusar a publicação porque o entrypoint `Pedagogico` do backoffice ainda não existe, publique primeiro o backoffice (passo 5) com a linha `"services"` do `wrangler.jsonc` dele comentada, depois este Worker, e depois o backoffice de novo com a linha.

5. **Worker do backoffice** (no repositório do backoffice):
   ```bash
   npm run deploy
   ```
   A partir daqui o menu “Produtos & Entrega” abre o sistema pedagógico em `/produtos/`.

6. **Perfis da equipe:** em Configurações › Equipe e permissões, no backoffice, para cada pessoa que vai usar o sistema, escolha o perfil no seletor “Produtos & Entrega” (Administração, Coordenação, Suporte/CS ou Mentora). Quem fica sem perfil não vê o menu. O mesmo campo aparece em Configurações › Usuários, dentro do sistema pedagógico.

7. **Cadastros iniciais** (pela tela, com o perfil Administração): programas, profissionais, tipos de entregável, trilhas e etapas, pacotes. Nenhum conteúdo oficial vem pronto.

## Como desfazer

- **Telas:** `npx wrangler rollback` no backoffice volta para a versão anterior, com a página antiga de Produtos & Entrega e sem o repasse. O pedagógico fica sem endereço até ser religado.
- **Banco:** as tabelas `ped_` e as duas colunas novas podem ficar; elas não atrapalham a versão anterior do backoffice. Não apague tabelas para desfazer.

## Checklist de teste, um usuário de cada perfil

Use contas de teste com e-mails que a equipe controla. Uma pessoa que vira aluna não pode ser excluída de Clientes (proteção do pacote do backoffice), então use para a aluna de teste uma pessoa marcada como teste no nome, por exemplo “TESTE Diamante”.

| # | Perfil e conta | O que fazer | Resultado esperado |
|---|---|---|---|
| 1 | **Administração** (administradora do backoffice) | Entrar no backoffice e clicar em “Produtos & Entrega” | Abre `/produtos/` sem pedir login de novo. O topo mostra “Administração” e o link “Voltar ao backoffice” |
| 2 | Administração | Configurações › Equipe e permissões (backoffice): dar perfil Coordenação, Suporte/CS e Mentora a três contas de teste | Os perfis aparecem também em Configurações › Usuários no pedagógico |
| 3 | Administração | Abrir `/produtos/diamante-business`, `/produtos/mqa-master` e `/produtos/empresaria-que-vende` | Os três levam para `/produtos/` |
| 4 | **Coordenação** | Nova aluna › buscar em Clientes uma pessoa que já existe | A pessoa aparece com nome, e-mail e telefone (sem CPF). Ao vincular, não surge outro cadastro em Clientes |
| 5 | Coordenação | Nova aluna com um e-mail que já existe em Clientes, sem usar a busca | Mensagem de que o e-mail já existe; nada é criado |
| 6 | Coordenação | Nova aluna “TESTE Diamante” com e-mail novo e uma matrícula | A pessoa aparece em Clientes no backoffice, uma vez só |
| 7 | Coordenação | Na ficha, alterar o telefone | O telefone novo aparece em Clientes no backoffice |
| 8 | Coordenação | Na ficha, “Convidar para o portal” | Recusado: o convite é só da Administração |
| 9 | Administração | Na ficha da aluna de teste, “Convidar para o portal” | O backoffice envia o e-mail de primeiro acesso |
| 10 | **Aluna** (TESTE Diamante) | Abrir o e-mail, criar a senha, aceitar os termos | Entra direto em `/portal/diamante-business/` |
| 11 | Aluna | Digitar `/produtos/` e `/` na barra de endereço | Volta para o portal dela; não vê nenhuma tela da equipe |
| 12 | Aluna | Em Meus Dados, mudar o telefone | O telefone novo aparece em Clientes; nome e e-mail não podem ser mudados por ela |
| 13 | Aluna | Sair | Vai para `/portal/entrar` |
| 14 | **Suporte/CS** | Abrir uma ficha | Vê a ficha, mas não as anotações pedagógicas privadas |
| 15 | **Mentora** | Entrar pelo menu | Vê só Minha agenda e Alunas da agenda, com as próprias alunas |
| 16 | **Equipe sem perfil** (por exemplo, só Vendas) | Procurar o menu “Produtos & Entrega”; depois abrir `/produtos/` direto | O menu não aparece; o endereço direto mostra “Sem acesso” com o link para o backoffice |
| 17 | **Cliente do Portal que não é aluna** (por exemplo, participante do MQA) | Entrar no Portal | Vê o Portal de sempre, sem o Diamante Business; `/portal/diamante-business/` leva de volta para `/portal` |
| 18 | Administração | Clientes (backoffice): tentar excluir a aluna de teste | Recusado: ela é aluna do sistema pedagógico |

Se algum item falhar, anote o número, o perfil e o que apareceu na tela.
