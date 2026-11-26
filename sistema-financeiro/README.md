# Contas a Receber – Centro Liderar

Aplicação web no Cloudflare (Workers + banco D1) que reúne a rotina do Assistente Financeiro: alunas de todos os cursos, contratações com a condição negociada, parcelas por forma de pagamento, conferência (C6, Stone, C6 Pay, Conta Azul), mensagens de cobrança, inadimplência, relatório do dia para a Elayne e projeção.

## O que o sistema faz
| Tela | Para quê |
|---|---|
| Painel | Recebido no mês, o que vence hoje e amanhã, inadimplência, o que falta conferir e a fila de mensagens |
| Alunas | Ficha de cada aluna: contratações, condição negociada, parcelas, pagamentos com evidências, mensagens e decisões da Jaciara |
| Nova venda | Cadastra a aluna exatamente como foi negociado (entrada, nº de parcelas, forma, link, mensal ou a cada N dias) e gera as parcelas |
| Mensagens | Fila do dia: lembrete D-1, link no dia (pedido à Elayne em D-1), vencida D+1, atraso D+3. Botão abre o WhatsApp com o texto pronto; quem envia é uma pessoa |
| Conferência | Importa o extrato (CSV) do C6, Stone, C6 Pay ou Conta Azul, junta o mesmo pagamento numa transação só e sugere a parcela |
| Inadimplência | Relatório para o grupo do Setor Financeiro, por faixa de atraso, jurídico separado, e respostas a perguntas com "inadimplência" |
| Relatório do dia | Resumo para a Elayne, com botão para o WhatsApp dela |
| Projeção | Saldo em aberto por mês e por forma de pagamento |
| Importar | Carga da planilha (CSV) com prévia e registro da autorização |
| Configurações | Contatos, regras R1 a R7, usuários e perfis, autorizações, execuções e auditoria |

Rotina automática (dias úteis, horário de Fortaleza): **8h40** gera a fila de mensagens; **17h30** salva o relatório do dia; **segunda 9h** salva o relatório de inadimplência.

## Regras que o sistema aplica
- Cada aluna paga como negociou. A cadência muda com a forma de pagamento (link: pedido à Elayne em D-1, link para a aluna no dia, conferência em D+1).
- Uma mensagem por aluna por dia. Nada sai para quem pagou, mandou comprovante, está no jurídico, com mentoria pausada ou cancelada, com promessa de pagamento ou em análise pela Jaciara.
- Cobrança só com conferência do mesmo dia (R6). Sem isso, as mensagens ficam bloqueadas.
- C6, Stone e C6 Pay (capturada) confirmam. Conta Azul e comprovante ficam "a conferir". Previsto no Conta Azul e cartão só autorizado são ignorados. Estorno desfaz o pagamento.
- Renegociação: o saldo antigo vira "transferido", que não é pago.
- Envio automático de WhatsApp **não** está ligado: depende de um canal oficial (P15) e de autorização registrada.

## Segurança
- Login com e-mail e senha (hash PBKDF2), sessão de 12 horas, bloqueio após 5 tentativas em 15 minutos.
- Perfis: admin, financeiro, comercial, jurídico e consulta (consulta não vê valores).
- Cabeçalhos de segurança (CSP com nonce, HSTS), proteção contra envio de formulário de outro site, auditoria de cada alteração.
- Nenhuma senha ou chave no código. O único segredo é `SETUP_TOKEN`, usado uma vez para criar a primeira pessoa administradora.
- A base de produção começa **vazia**. Dados fictícios só no ambiente local.

## Publicar (primeira vez)
No computador de quem tem acesso à conta Cloudflare:
```bash
npm install
npx wrangler login                      # abre o navegador; entrar na conta do Centro Liderar
npx wrangler d1 create financeiro       # copiar o database_id para wrangler.jsonc
npx wrangler d1 migrations apply financeiro --remote
openssl rand -hex 24 | tee codigo-instalacao.txt | npx wrangler secret put SETUP_TOKEN
npx wrangler deploy
```
Depois, abrir `https://<endereço>/setup`, informar o código do arquivo `codigo-instalacao.txt`, criar a administradora e apagar o arquivo.

## Desenvolvimento local
```bash
npm install
cp .dev.vars.exemplo .dev.vars
npx wrangler d1 migrations apply financeiro --local
npx wrangler d1 execute financeiro --local --file scripts/dados-ficticios.sql   # só local
npx wrangler dev
npm test
```
