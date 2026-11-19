-- Validação de cor compatível com o D1.
-- A 0001 validava cores com um padrão GLOB de seis classes (#[0-9a-fA-F]... seis vezes).
-- O D1 recusa padrões GLOB desse tamanho ('LIKE or GLOB pattern too complex') ao gravar
-- qualquer cor. O SQLite comum aceita, por isso só apareceu no runtime do Cloudflare.
-- Nova regra, equivalente: 7 caracteres, começa com #, e o resto só tem dígitos hexadecimais.
--
-- O SQLite não altera CHECK de tabela existente: as três tabelas são recriadas. Foi aplicada
-- com o banco VAZIO (23/09/2026). Em banco com dados, recriar evento apagaria em cascata as
-- imagens e condições (ON DELETE CASCADE não é adiado): nunca reaplicar sobre dados reais.
pragma defer_foreign_keys = true;

create table evento_novo (
  id                        text primary key,
  organizacao_id            text not null references organizacao(id),
  nome                      text not null check (length(trim(nome)) between 1 and 160),
  data_inicio               text,
  data_fim                  text,
  local                     text,
  capacidade                integer check (capacidade is null or capacidade > 0),
  capacidade_situacao       text not null default 'estimada' check (capacidade_situacao in ('estimada', 'confirmada')),
  status                    text not null default 'planejamento'
                            check (status in ('planejamento', 'vendas_abertas', 'vendas_encerradas', 'realizado', 'cancelado')),
  observacoes               text,
  cor_primaria              text check (cor_primaria is null or (length(cor_primaria) = 7 and substr(cor_primaria, 1, 1) = '#' and substr(cor_primaria, 2) not glob '*[^0-9a-fA-F]*')),
  cor_acento                text check (cor_acento   is null or (length(cor_acento) = 7 and substr(cor_acento, 1, 1) = '#' and substr(cor_acento, 2) not glob '*[^0-9a-fA-F]*')),
  cor_profunda              text check (cor_profunda is null or (length(cor_profunda) = 7 and substr(cor_profunda, 1, 1) = '#' and substr(cor_profunda, 2) not glob '*[^0-9a-fA-F]*')),
  cor_clara                 text check (cor_clara    is null or (length(cor_clara) = 7 and substr(cor_clara, 1, 1) = '#' and substr(cor_clara, 2) not glob '*[^0-9a-fA-F]*')),
  imagem_capa_url           text,
  presenca_diaria           integer not null default 0 check (presenca_diaria in (0, 1)),
  meta_comercial_ingressos  integer check (meta_comercial_ingressos is null or meta_comercial_ingressos > 0),
  criado_em                 text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (data_inicio is null or data_fim is null or data_fim >= data_inicio)
);
insert into evento_novo select * from evento;
drop table evento;
alter table evento_novo rename to evento;
create index evento_organizacao_idx on evento (organizacao_id);

create table categoria_ingresso_novo (
  id                    text primary key,
  evento_id             text not null references evento(id),
  nome                  text not null check (length(trim(nome)) between 1 and 80),
  preco_centavos        integer not null default 0 check (preco_centavos >= 0),
  quantidade_planejada  integer check (quantidade_planejada is null or quantidade_planejada >= 0),
  ativa                 integer not null default 1 check (ativa in (0, 1)),
  ordem                 integer not null default 0,
  cor_pulseira          text check (cor_pulseira is null or (length(cor_pulseira) = 7 and substr(cor_pulseira, 1, 1) = '#' and substr(cor_pulseira, 2) not glob '*[^0-9a-f]*')),
  criado_em             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (id, evento_id)
);
insert into categoria_ingresso_novo select * from categoria_ingresso;
drop table categoria_ingresso;
alter table categoria_ingresso_novo rename to categoria_ingresso;
create unique index categoria_nome_unico_idx on categoria_ingresso (evento_id, lower(trim(nome)));

create table evento_zona_novo (
  id             text primary key,
  evento_id      text not null references evento(id),
  nome           text not null check (length(trim(nome)) between 1 and 40),
  cor            text check (cor is null or (length(cor) = 7 and substr(cor, 1, 1) = '#' and substr(cor, 2) not glob '*[^0-9a-fA-F]*')),
  capacidade     integer not null check (capacidade >= 0),
  observacao     text check (observacao is null or length(observacao) <= 200),
  ativa          integer not null default 1 check (ativa in (0, 1)),
  ordem          integer not null default 0,
  criado_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (id, evento_id)
);
insert into evento_zona_novo select * from evento_zona;
drop table evento_zona;
alter table evento_zona_novo rename to evento_zona;
create unique index evento_zona_nome_idx on evento_zona (evento_id, lower(trim(nome)));
create index evento_zona_evento_idx on evento_zona (evento_id);
