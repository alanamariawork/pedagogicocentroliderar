-- =====================================================================
-- Loja Centro Liderar — Etapa 1 da evolução do módulo Loja: edição de
-- preço com histórico, estoque mínimo e classificação das movimentações.
--
-- Só mudanças ADITIVAS (alter table ... add column / create table): nenhuma
-- tabela existente é recriada, nenhum CHECK existente é alterado, nenhum
-- dado existente é reescrito. Ver docs/loja/02-evolucao-estoque-precos.md.
-- =====================================================================

-- Estoque mínimo por variação (opcional). O alerta "Estoque baixo" é sempre
-- CALCULADO (saldo <= estoque_minimo), nunca gravado.
alter table item_variacao add column estoque_minimo integer check (estoque_minimo is null or estoque_minimo >= 0);

-- Classificação de negócio da movimentação. O `tipo` original (direção:
-- entrada/transferencia/consumo/ajuste_±) continua sendo a fonte do saldo;
-- `subtipo` diz o PORQUÊ (compra, venda, devolução, perda/avaria...). Linhas
-- antigas ficam com subtipo nulo e são classificadas na leitura a partir de
-- tipo + venda_loja_item_id + motivo (worker/regras/estoque.ts, CLASSE_SQL) —
-- movimentacao_estoque é imutável, nada é reescrito.
alter table movimentacao_estoque add column subtipo text check (subtipo is null or subtipo in (
  'compra', 'venda', 'transferencia', 'ajuste_inventario', 'ajuste_manual', 'perda_avaria', 'devolucao', 'consumo_interno'));
-- Referência livre (ex.: id da venda, nº da nota do fornecedor).
alter table movimentacao_estoque add column referencia text check (referencia is null or length(trim(referencia)) between 1 and 120);

-- ---------------------------------------------------------------------
-- price_history: uma linha por alteração de custo e/ou preço de venda de uma
-- variação (SKU). Valores em CENTAVOS (inteiro). Append-only (gatilhos em
-- 0016_loja_precos_gatilhos.sql). Vendas já feitas nunca dependem desta
-- tabela: o preço e o custo da venda são snapshot em venda_loja_item.
-- ---------------------------------------------------------------------
create table price_history (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  sku_id          text not null references item_variacao(id),
  custo_antigo    integer check (custo_antigo is null or custo_antigo >= 0),
  custo_novo      integer check (custo_novo is null or custo_novo >= 0),
  venda_antigo    integer check (venda_antigo is null or venda_antigo >= 0),
  venda_novo      integer check (venda_novo is null or venda_novo >= 0),
  origem          text not null default 'edicao' check (origem in ('cadastro', 'edicao', 'reajuste_em_massa')),
  usuario         text not null,
  usuario_nome    text,
  data            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index price_history_sku_idx on price_history (sku_id, data);
create index price_history_organizacao_idx on price_history (organizacao_id, data);
