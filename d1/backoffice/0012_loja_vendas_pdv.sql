-- =====================================================================
-- Loja Centro Liderar: Vendas / PDV — construído sobre a fundação de
-- Catálogo/Estoque (0010/0011, PR #7 + PR #8, já validada e em produção —
-- NÃO alterada por esta migração). Ver docs/loja/01-arquitetura-pdv-vendas.md.
--
-- `venda_loja` é deliberadamente SEPARADA de `venda`/`venda_pagamento`
-- (0001_esquema.sql): aquelas são a venda de INGRESSO de evento (evento_id
-- obrigatório, parcelas, condição comercial, cupom, mentorada) —
-- estruturalmente incompatível com uma venda de mercadoria física.
-- =====================================================================

-- ---------------------------------------------------------------------
-- venda_loja: cabeçalho. `numero` só é atribuído na CONCLUSÃO (nunca na
-- criação do rascunho) — um carrinho abandonado nunca "queima" um número;
-- todo número corresponde a uma venda realmente concluída, como um recibo
-- de verdade.
-- ---------------------------------------------------------------------
create table venda_loja (
  id                   text primary key,
  organizacao_id       text not null references organizacao(id),
  numero               integer check (numero is null or numero > 0),
  status               text not null default 'rascunho' check (status in ('rascunho', 'concluida', 'cancelada')),
  local_estoque_id     text not null references local_estoque(id),
  cliente_id           text references pessoa(id),
  canal                text not null check (canal in ('escritorio', 'evento', 'comercial', 'feira', 'online', 'outro')),
  contexto             text check (contexto is null or length(trim(contexto)) <= 160),
  evento_id            text references evento(id),
  subtotal_centavos    integer not null default 0 check (subtotal_centavos >= 0),
  desconto_centavos    integer not null default 0 check (desconto_centavos >= 0),
  total_centavos       integer not null default 0 check (total_centavos >= 0),
  observacao           text check (observacao is null or length(observacao) <= 1000),
  criado_por           text,
  criado_em            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  concluido_por        text,
  concluido_em         text,
  cancelado_por        text,
  cancelado_em         text,
  motivo_cancelamento  text,
  check (desconto_centavos <= subtotal_centavos),
  check (total_centavos = subtotal_centavos - desconto_centavos),
  check (status = 'rascunho' or numero is not null),
  check (status <> 'concluida' or (concluido_por is not null and concluido_em is not null)),
  check (status <> 'cancelada' or (cancelado_por is not null and cancelado_em is not null and length(trim(coalesce(motivo_cancelamento, ''))) >= 3)),
  -- Red Team pré-PR: reforço no próprio banco de que uma venda concluída nunca tem total zerado —
  -- nenhum desconto (nem de administrador) pode chegar a 100% do subtotal; saída gratuita/cortesia
  -- tem fluxo próprio (ajuste/consumo de estoque), nunca uma venda_loja de R$ 0,00.
  check (status <> 'concluida' or total_centavos > 0)
);
create unique index venda_loja_numero_idx on venda_loja (organizacao_id, numero) where numero is not null;
create index venda_loja_status_idx on venda_loja (organizacao_id, status, criado_em);
create index venda_loja_local_idx on venda_loja (local_estoque_id);
create index venda_loja_cliente_idx on venda_loja (cliente_id) where cliente_id is not null;
create index venda_loja_evento_idx on venda_loja (evento_id) where evento_id is not null;

-- ---------------------------------------------------------------------
-- venda_loja_item: 1 linha por SKU vendido. Preço e custo são sempre
-- SNAPSHOT do momento da venda — nunca recalculados a partir do catálogo
-- atual, para que uma mudança futura de preço nunca altere uma venda já
-- feita (histórico íntegro).
-- ---------------------------------------------------------------------
create table venda_loja_item (
  id                       text primary key,
  venda_loja_id            text not null references venda_loja(id),
  item_variacao_id         text not null references item_variacao(id),
  descricao                text not null check (length(trim(descricao)) between 1 and 200),
  quantidade               integer not null check (quantidade > 0),
  preco_unitario_centavos  integer not null check (preco_unitario_centavos >= 0),
  desconto_centavos        integer not null default 0 check (desconto_centavos >= 0),
  custo_unitario_centavos  integer check (custo_unitario_centavos is null or custo_unitario_centavos >= 0),
  total_centavos           integer not null check (total_centavos >= 0),
  criado_em                text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (venda_loja_id, item_variacao_id),
  check (desconto_centavos <= preco_unitario_centavos * quantidade),
  check (total_centavos = preco_unitario_centavos * quantidade - desconto_centavos)
);
create index venda_loja_item_venda_idx on venda_loja_item (venda_loja_id);
create index venda_loja_item_variacao_idx on venda_loja_item (item_variacao_id);

-- ---------------------------------------------------------------------
-- venda_loja_pagamento: 1 → N desde o V1 (uma venda pode ter mais de uma
-- forma de pagamento), mesmo que a tela comece simples com um pagamento
-- só. Reaproveita a mesma lista administrável de forma de pagamento já
-- usada pela venda de ingresso (cadastro_opcao.tipo = 'forma_pagamento').
-- ---------------------------------------------------------------------
create table venda_loja_pagamento (
  id                  text primary key,
  venda_loja_id       text not null references venda_loja(id),
  forma_pagamento_id  text not null references cadastro_opcao(id),
  valor_centavos      integer not null check (valor_centavos > 0),
  criado_por          text,
  criado_em           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index venda_loja_pagamento_venda_idx on venda_loja_pagamento (venda_loja_id);

-- ---------------------------------------------------------------------
-- Vínculo aditivo entre a baixa de estoque e a venda que a originou. A baixa
-- continua usando tipo = 'consumo' (já existente) — nenhum tipo novo foi
-- adicionado ao CHECK de movimentacao_estoque, para não precisar recriar
-- essa tabela (ver docs/loja/01-arquitetura-pdv-vendas.md, seção 2.3, para a
-- decisão e a alternativa rejeitada).
-- ---------------------------------------------------------------------
alter table movimentacao_estoque add column venda_loja_item_id text references venda_loja_item(id);
create index movimentacao_venda_loja_item_idx on movimentacao_estoque (venda_loja_item_id) where venda_loja_item_id is not null;

-- Imutabilidade de venda_loja/venda_loja_item/venda_loja_pagamento (UPDATE/DELETE bloqueados): ver
-- 0013_loja_pdv_gatilhos.sql. Gatilho não pode ir neste arquivo — wrangler d1 migrations apply
-- --remote não aceita `create trigger` (ver docs/cloudflare-migracao.md, "Atenção: migrações com
-- gatilho"), mesmo motivo já aplicado a 0010/0011 da fundação Loja/Estoque.
