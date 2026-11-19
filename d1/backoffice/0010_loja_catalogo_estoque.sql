-- =====================================================================
-- Loja Centro Liderar: Catálogo, Estoque e Movimentações.
--
-- Fundação nova (nenhuma tabela existente é alterada). Ver documento de
-- arquitetura em docs/loja/00-arquitetura-catalogo-estoque.md para a
-- justificativa completa de cada decisão abaixo.
--
-- `item_catalogo` é deliberadamente DIFERENTE de `produto` (0005_portal_
-- fundacao.sql): `produto` é a experiência educacional/comercial (MQA, MQA
-- Master, Efeito Diamante); `item_catalogo` é mercadoria física OU material
-- de consumo/operação da Loja Centro Liderar — a Loja não pertence a nenhum
-- `produto` nem a nenhum `evento`.
--
-- Saldo de estoque NUNCA é uma coluna: é sempre calculado por agregação
-- sobre movimentacao_estoque (mesmo princípio de estadoEventoDia/
-- statusEfetivoEncontro — sempre derivado, nunca armazenado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- item_catalogo: produto base, mercadoria (vendável) OU material de
-- consumo/operação (apostila, crachá, cordão — nunca vendido). A natureza é
-- explícita aqui porque a planilha real do depósito mistura as duas na
-- mesma lista, sem nenhum campo que as diferencie.
-- ---------------------------------------------------------------------
create table item_catalogo (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  nome            text not null check (length(trim(nome)) between 1 and 160),
  natureza        text not null check (natureza in ('mercadoria', 'material_consumo')),
  descricao       text check (descricao is null or length(descricao) <= 2000),
  ativo           integer not null default 1 check (ativo in (0, 1)),
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index item_catalogo_organizacao_idx on item_catalogo (organizacao_id, natureza, ativo);
create unique index item_catalogo_nome_unico_idx on item_catalogo (organizacao_id, lower(trim(nome)));

-- ---------------------------------------------------------------------
-- item_variacao: a SKU de verdade — todo item_catalogo tem pelo menos uma
-- linha aqui, mesmo sem variação real (um livro sem tamanho/cor ganha uma
-- única variação com os dois campos nulos; nenhum código especial de
-- "produto sem variação" em lugar nenhum do sistema).
-- ---------------------------------------------------------------------
create table item_variacao (
  id                      text primary key,
  organizacao_id          text not null references organizacao(id),
  item_catalogo_id        text not null references item_catalogo(id),
  tamanho                 text check (tamanho is null or length(trim(tamanho)) between 1 and 20),
  cor                     text check (cor is null or length(trim(cor)) between 1 and 40),
  -- Código técnico opcional, livre hoje — preparado para código de barras futuro sem bloquear nada agora.
  sku                     text check (sku is null or length(trim(sku)) between 1 and 60),
  custo_centavos          integer check (custo_centavos is null or custo_centavos >= 0),
  preco_venda_centavos    integer check (preco_venda_centavos is null or preco_venda_centavos >= 0),
  ativo                   integer not null default 1 check (ativo in (0, 1)),
  criado_por              text,
  criado_em               text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index item_variacao_item_idx on item_variacao (item_catalogo_id, ativo);
create unique index item_variacao_sku_unico_idx on item_variacao (organizacao_id, sku) where sku is not null;
-- Mesmo item_catalogo não pode ter duas variações idênticas (mesmo tamanho+cor, tratando nulo como vazio).
create unique index item_variacao_combinacao_unica_idx on item_variacao (item_catalogo_id, coalesce(tamanho, ''), coalesce(cor, ''));

-- ---------------------------------------------------------------------
-- local_estoque: onde a mercadoria/material fisicamente está. evento_id é
-- OPCIONAL e só um contexto — nunca uma dependência estrutural (a Loja
-- funciona inteiramente sem nenhum evento). 'permanente' = depósito/escritório;
-- 'temporario' = um evento, uma feira etc.
-- ---------------------------------------------------------------------
create table local_estoque (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  nome            text not null check (length(trim(nome)) between 1 and 160),
  tipo            text not null check (tipo in ('permanente', 'temporario')),
  evento_id       text references evento(id),
  ativo           integer not null default 1 check (ativo in (0, 1)),
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index local_estoque_organizacao_idx on local_estoque (organizacao_id, ativo);
create index local_estoque_evento_idx on local_estoque (evento_id) where evento_id is not null;

-- ---------------------------------------------------------------------
-- movimentacao_estoque: única fonte de verdade do saldo — nunca editada nem
-- apagada (correções são uma movimentação nova). quantidade é sempre
-- positiva; a direção vem do `tipo` + qual de local_origem/local_destino
-- está preenchido:
--   entrada            -> só local_destino
--   transferencia      -> local_origem E local_destino (diferentes)
--   consumo            -> só local_origem (sai do sistema, ex.: material usado num evento)
--   ajuste_positivo    -> só local_destino (ex.: contagem física encontrou mais)
--   ajuste_negativo    -> só local_origem (ex.: avaria, perda, contagem física encontrou menos)
-- ---------------------------------------------------------------------
create table movimentacao_estoque (
  id                  text primary key,
  organizacao_id      text not null references organizacao(id),
  item_variacao_id    text not null references item_variacao(id),
  tipo                text not null check (tipo in ('entrada', 'transferencia', 'consumo', 'ajuste_positivo', 'ajuste_negativo')),
  quantidade          integer not null check (quantidade > 0),
  local_origem_id     text references local_estoque(id),
  local_destino_id    text references local_estoque(id),
  motivo              text check (motivo is null or length(trim(motivo)) <= 2000),
  criado_por          text,
  criado_em           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (
    (tipo = 'entrada' and local_origem_id is null and local_destino_id is not null) or
    (tipo = 'transferencia' and local_origem_id is not null and local_destino_id is not null and local_origem_id <> local_destino_id) or
    (tipo = 'consumo' and local_origem_id is not null and local_destino_id is null) or
    (tipo = 'ajuste_positivo' and local_origem_id is null and local_destino_id is not null) or
    (tipo = 'ajuste_negativo' and local_origem_id is not null and local_destino_id is null)
  ),
  check (tipo not in ('consumo', 'ajuste_positivo', 'ajuste_negativo') or length(trim(coalesce(motivo, ''))) >= 3)
);
create index movimentacao_variacao_idx on movimentacao_estoque (item_variacao_id, criado_em);
create index movimentacao_local_origem_idx on movimentacao_estoque (local_origem_id, item_variacao_id) where local_origem_id is not null;
create index movimentacao_local_destino_idx on movimentacao_estoque (local_destino_id, item_variacao_id) where local_destino_id is not null;

-- Imutabilidade de movimentacao_estoque (UPDATE/DELETE bloqueados): ver 0011_loja_gatilhos.sql.
-- Gatilho não pode ir neste arquivo — wrangler d1 migrations apply --remote não aceita
-- `create trigger` (ver docs/cloudflare-migracao.md, "Atenção: migrações com gatilho").
