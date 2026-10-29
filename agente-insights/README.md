# Agente de Insights do Instagram

Agente do Claude que roda **todo dia às 8h (horário de Brasília)** como uma tarefa
agendada do Claude Code. Ele fica fora do sistema de marketing: não altera o
sistema, só coleta e entrega os dados.

## O que ele faz a cada dia

1. Calcula a data de 7 dias atrás (fuso America/Sao_Paulo).
2. Para cada conta em [`contas.json`](contas.json), busca pela **API oficial do
   Instagram** (Graph API da Meta) os posts do feed e Reels publicados nesse dia.
3. Pega as métricas de cada post e grava em `dados/`:
   - `insights.json`: todos os registros, no mesmo formato da página de Insights
     do sistema (`RegistroInsight`), um por post (`id` = `ig-<id do post>`);
   - `insights.csv`: a mesma coisa em planilha (abre no Excel/Google Planilhas);
   - `ultimo-relatorio.md`: o resumo do dia, por conta.
4. Se o post já foi coletado antes, atualiza as métricas sem duplicar e sem
   apagar funil, categoria ou observações preenchidos à mão.
5. Faz commit dos dados e envia o resumo.

### Métricas

| Campo do sistema | Vem da API |
|---|---|
| Alcance geral | `reach` |
| Visualizações | `views` |
| Curtidas, comentários, compartilhamentos, salvamentos | `likes`, `comments`, `shares`, `saved` |
| Novos seguidores | `follows` (só posts do feed) |
| Tempo médio (s) | `ig_reels_avg_watch_time` (só Reels) |

Alcance de seguidores/não seguidores, cliques no link, republicações e
repetições **não vêm por post na API**: ficam vazios (diferente de zero) para
preencher à mão, se quiser. Stories não entram, porque somem em 24h.

## Configuração (uma vez)

### 1. Na Meta

1. As contas de Instagram (Centro Liderar, MQA, Diamante Business e Jaciara
   Mendes) precisam ser **Profissionais** e estar ligadas a uma Página do Facebook.
2. Crie um app em [Meta for Developers](https://developers.facebook.com/) com as
   permissões `instagram_basic`, `instagram_manage_insights`,
   `pages_show_list` e `pages_read_engagement`.
3. Quem administra as Páginas gera um **token de longa duração** (ou, melhor, um
   token de Usuário do Sistema no Gerenciador de Negócios, que não expira).

### 2. No ambiente do Claude

Em Configurações do projeto → Ambiente na nuvem → Adicionar ambiente:

- **Acesso à rede:** adicionar `graph.facebook.com` nos domínios permitidos.
- **Variável de ambiente:** `META_ACCESS_TOKEN=<o token>`.

Nunca cole o token em conversa nem no repositório.

### 3. Contas

Em [`contas.json`](contas.json), preencha `usuario_instagram` de cada conta (o @).
O agente acha o `instagram_id` sozinho. Para conferir o que o token enxerga:

```
python agente-insights/coletar.py --listar-contas
```

`conta` precisa ser igual ao nome usado no sistema; `regra` é a regra de score
(`liderar`, `mqa` ou vazio).

## Rodar à mão

```
python agente-insights/coletar.py                  # posts de 7 dias atrás
python agente-insights/coletar.py --data 2026-10-22
python -m unittest agente-insights/test_coletar.py # testes, com a API simulada
```
