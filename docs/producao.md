# Colocar o sistema na aba Produtos & Entrega

Quem faz isso precisa ter acesso à conta Cloudflare “Centro Liderar”, e só depois da confirmação da responsável pelo projeto. Os passos não apagam dados: as migrations só acrescentam colunas e tabelas.

## 1. Aplicar o pacote no backoffice

No repositório do backoffice, numa branch nova:

```bash
git apply produtos-entrega-pedagogico.patch
npm test
```

## 2. Rodar as duas migrations (nesta ordem)

```bash
# no repositório do backoffice
npx wrangler d1 migrations apply DB --remote

# neste repositório
npx wrangler d1 migrations apply DB --remote
```

As migrations deste repositório já incluem a `0002_ped_ajustes_reuniao_1111.sql` (ajustes da reunião de 11/11).

## 3. Publicar os dois Workers (nesta ordem)

```bash
# neste repositório (só na primeira vez, cria a pasta dos anexos)
npx wrangler r2 bucket create pedagogico-anexos
npm install && npm run deploy

# no repositório do backoffice
npm run deploy
```

Depois disso, a aba “Produtos & Entrega” já abre o sistema. Para dar acesso a alguém da equipe, vá em Configurações › Equipe e permissões e escolha o perfil dessa pessoa no seletor “Produtos & Entrega”.

Se a Cloudflare recusar o primeiro `deploy`, inverta a ordem dos dois Workers.

Para desfazer, rode `npx wrangler rollback` no backoffice. A aba volta a ser como era antes.

## 4. Confirmações por WhatsApp e Google Agenda (opcional)

Só depois de ter as credenciais da Meta e da conta de serviço do Google. Os nomes dos segredos estão em [reuniao-1111.md](reuniao-1111.md). Cadastre cada um com `npx wrangler secret put NOME` neste repositório. Sem eles o sistema funciona normalmente e mostra “confirmação pendente”, sem enviar nada.

## Teste rápido, um usuário de cada perfil

| Perfil | O que conferir |
|---|---|
| Administração | Clicar em “Produtos & Entrega” abre o sistema sem pedir login de novo |
| Coordenação | “Nova aluna” encontra quem já está em Clientes e não cria cadastro duplicado |
| Suporte/CS e Mentora | Entram pela aba. A Mentora vê só a própria agenda e as próprias alunas |
| Aluna | Depois do convite do Portal, entra em `/portal/diamante-business/` e não abre as telas da equipe |
| Equipe sem perfil | Não vê a aba |
