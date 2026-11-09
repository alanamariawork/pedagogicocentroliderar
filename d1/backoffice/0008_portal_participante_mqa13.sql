-- =====================================================================
-- PR #5: Portal Centro Liderar — Experiência da Participante (MQA13).
--
-- Tudo aditivo (ALTER TABLE ADD COLUMN / CREATE TABLE novas). Nenhuma tabela
-- existente é recriada, nenhum tipo de coluna muda, nenhum dado existente
-- precisa de backfill (defaults cobrem linhas já existentes sem ambiguidade).
-- Ver docs/portal-v1/21-especificacao-definitiva-pr5-portal-participante-mqa13.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Escopo de sessão (Bloco A): uma sessão nasce 'equipe' (login do backoffice,
-- worker/sessao.ts:entrar) ou 'portal' (login do Portal, worker/regras/
-- portal-auth.ts:entrarPortal/aceitarConvite/redefinirSenhaPortal). membroAtual()
-- e clienteAtual() passam a exigir o escopo correto antes de checar o vínculo
-- membro/cliente — uma sessão do Portal nunca ganha poder de equipe, mesmo
-- quando a mesma identidade também é membro (e vice-versa).
--
-- Toda sessão existente antes desta migration nasceu de /api/entrar (o Portal
-- nunca teve UI em produção) — o default 'equipe' é correto para os dados já
-- existentes, sem backfill.
-- ---------------------------------------------------------------------
alter table sessao add column escopo text not null default 'equipe' check (escopo in ('equipe', 'portal'));

-- ---------------------------------------------------------------------
-- Intenção da participante (Bloco B): pergunta de boas-vindas, deliberadamente
-- separada do Diagnóstico AGE (pergunta_diagnostico/resposta_diagnostico) —
-- pertence à experiência inicial da participante, não à leitura estruturada
-- do negócio. Uma coluna simples em matricula, não uma tabela/engine nova.
-- ---------------------------------------------------------------------
alter table matricula add column intencao_texto text check (intencao_texto is null or length(intencao_texto) <= 2000);

-- ---------------------------------------------------------------------
-- Conteúdo por edição (Bloco B): conteudo.produto_id continua NOT NULL e
-- continua sendo a fonte de reuso entre ofertas do mesmo produto (Jornada).
-- evento_id é um escopo ADICIONAL, só usado quando o conteúdo é específico de
-- uma edição (Guia, Pós-MQA) — nunca reutilizável entre ofertas nesse caso.
-- finalidade distingue Guia de Pós-MQA de forma explícita: nunca por título,
-- texto, ordem ou convenção de nomenclatura. NULL = conteúdo comum de
-- Jornada/Preparação, comportamento atual, 100% inalterado.
-- ---------------------------------------------------------------------
alter table conteudo add column evento_id text references evento(id);
alter table conteudo add column ordem integer not null default 0;
alter table conteudo add column finalidade text check (finalidade is null or finalidade in ('guia', 'pos_evento'));
create index conteudo_evento_idx on conteudo (evento_id, finalidade) where evento_id is not null;

-- ---------------------------------------------------------------------
-- Encontro (Bloco B): Esquenta, lives e demais encontros ligados à Oferta.
-- Estado (agendado/ao_vivo/encerrado) é sempre CALCULADO a partir de
-- inicio_em/fim_em e do relógio no momento da leitura — nunca armazenado, para
-- nunca ficar desatualizado. cancelado_em é a única exceção editorial manual,
-- com precedência sobre o cálculo temporal. conteudo_id opcional referencia o
-- replay/materiais pós-encontro, reaproveitando o mesmo conteudo (sem duplicar
-- o mecanismo de mídia).
-- ---------------------------------------------------------------------
create table encontro (
  id                    text primary key,
  organizacao_id        text not null references organizacao(id),
  evento_id             text not null references evento(id),
  titulo                text not null check (length(trim(titulo)) between 1 and 160),
  descricao             text check (descricao is null or length(descricao) <= 2000),
  inicio_em             text not null,
  fim_em                text not null,
  url_entrada           text check (url_entrada is null or lower(substr(url_entrada, 1, 8)) = 'https://'),
  conteudo_id           text references conteudo(id),
  cancelado_em          text,
  motivo_cancelamento   text,
  criado_por            text,
  criado_em             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (fim_em >= inicio_em),
  check (cancelado_em is null or length(trim(coalesce(motivo_cancelamento, ''))) >= 5)
);
create index encontro_evento_idx on encontro (evento_id, inicio_em);

-- ---------------------------------------------------------------------
-- Data e horário por dia do evento (Bloco B): NÃO assume que todos os dias de
-- uma edição têm o mesmo horário (o MQA13 real coincide — 3 dias, 09h-19h —
-- mas isso é coincidência de calendário, não regra: uma edição futura pode ter
-- horários diferentes por dia). evento.data_inicio/data_fim NÃO são tocados —
-- continuam o resumo de intervalo (só dia) já usado para listar/ordenar
-- eventos. evento_dia é uma camada de detalhe OPCIONAL e aditiva: um evento
-- sem nenhuma linha aqui continua funcionando exatamente como hoje (o Portal
-- cai de volta para data_inicio/data_fim, sem hora precisa). Estado (futuro/
-- hoje/passado) é calculado a partir de inicio_em/fim_em, nunca armazenado.
-- ---------------------------------------------------------------------
create table evento_dia (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  evento_id       text not null references evento(id),
  data            text not null check (date(data) = data),
  inicio_em       text not null,
  fim_em          text not null,
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (evento_id, data),
  check (fim_em >= inicio_em)
);
create index evento_dia_evento_idx on evento_dia (evento_id, data);
