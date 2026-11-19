-- =====================================================================
-- Marketing de conteúdo (módulo Marketing do Backoffice): contas e perfis,
-- atividades com aprovação e resultados por publicação (Insights).
-- Origem: o sistema de marketing do Centro Liderar (repositório
-- mkt-grupomendes). Ver docs/marketing/01-integracao.md.
--
-- Sem chave estrangeira para usuario: api_acesso_remover apaga a conta de
-- quem sai da equipe, e o histórico do marketing precisa continuar legível.
-- Por isso o autor fica gravado como id + nome (retrato do momento).
-- =====================================================================

-- ---------------------------------------------------------------------
-- mkt_conta: perfis e canais administrados pelo Centro Liderar (não são
-- usuários). `chave` é o identificador usado nos registros de Insights
-- (ex.: 'Jaciara Mendes — Instagram'); `rotulo` é só o nome exibido.
-- ---------------------------------------------------------------------
create table mkt_conta (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  chave           text not null check (length(trim(chave)) between 1 and 120),
  rotulo          text not null check (length(trim(rotulo)) between 1 and 120),
  plataforma      text not null check (length(trim(plataforma)) between 1 and 60),
  perfil          text check (perfil is null or length(perfil) <= 200),
  ordem           integer not null default 0,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index mkt_conta_chave_idx on mkt_conta (organizacao_id, lower(chave));

-- ---------------------------------------------------------------------
-- mkt_atividade: uma entrega de conteúdo. Fluxo: em_producao → (enviar)
-- aguardando_aprovacao → aprovado | ajustes_solicitados → (enviar de novo,
-- versão + 1) aguardando_aprovacao. Data e hora no fuso de Fortaleza.
-- ---------------------------------------------------------------------
create table mkt_atividade (
  id                text primary key,
  organizacao_id    text not null references organizacao(id),
  titulo            text not null check (length(trim(titulo)) between 1 and 200),
  status            text not null default 'em_producao'
                    check (status in ('em_producao', 'ajustes_solicitados', 'aguardando_aprovacao', 'aprovado')),
  formato           text not null
                    check (formato in ('Reels', 'Carrossel', 'Estático', 'Live', 'Story', 'Endomarketing', 'Marketing Offline')),
  responsavel_id    text,
  responsavel_nome  text,
  data_postagem     text check (data_postagem is null or length(data_postagem) = 10),
  hora_postagem     text check (hora_postagem is null or length(hora_postagem) = 5),
  versao            integer not null default 1 check (versao >= 1),
  material_canva    text check (material_canva is null or length(material_canva) <= 2000),
  material_drive    text check (material_drive is null or length(material_drive) <= 2000),
  material_arte     text check (material_arte is null or length(material_arte) <= 2000),
  criado_por        text,
  criado_em         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (hora_postagem is null or data_postagem is not null),
  check ((responsavel_id is null) = (responsavel_nome is null))
);
create index mkt_atividade_data_idx on mkt_atividade (organizacao_id, data_postagem);

create table mkt_atividade_historico (
  id            text primary key,
  atividade_id  text not null references mkt_atividade(id) on delete cascade,
  quando        text not null,
  autor_id      text,
  autor_nome    text not null,
  acao          text not null check (acao in ('criada', 'editada', 'enviada', 'aprovada', 'ajustes', 'agendamento', 'material')),
  texto         text not null check (length(texto) <= 2000)
);
create index mkt_atividade_historico_idx on mkt_atividade_historico (atividade_id, quando);

-- ---------------------------------------------------------------------
-- mkt_insight: resultados de uma publicação. Métricas: null = não
-- informado (zero é resultado válido). Registros importados das planilhas
-- guardam aba e linha de origem e o score histórico, separado do score
-- recalculado pela regra (que nunca é gravado: é sempre calculado).
-- O id é texto livre porque os importados usam ids próprios
-- (ex.: 'import-funil-2026-liderar-4').
-- ---------------------------------------------------------------------
create table mkt_insight (
  id                 text primary key,
  organizacao_id     text not null references organizacao(id),
  conta              text not null check (length(trim(conta)) between 1 and 120),
  data               text check (data is null or length(data) = 10),
  regra              text not null default '' check (regra in ('', 'liderar', 'mqa')),
  coletado_em        text check (coletado_em is null or length(coletado_em) = 10),
  tipo               text not null default '',
  funil              text not null default '',
  formato            text not null default '',
  categoria          text not null default '',
  descricao          text not null default '' check (length(descricao) <= 2000),
  link               text not null default '' check (length(link) <= 2000),
  notas              text not null default '' check (length(notas) <= 4000),
  nao_seguidores     real check (nao_seguidores is null or nao_seguidores between 0 and 100),
  seguidores         real check (seguidores is null or seguidores between 0 and 100),
  cliques            real check (cliques is null or cliques >= 0),
  alcance            real check (alcance is null or alcance >= 0),
  reproducoes        real check (reproducoes is null or reproducoes >= 0),
  republicados       real check (republicados is null or republicados >= 0),
  repeticoes         real check (repeticoes is null or repeticoes >= 0),
  tempo_medio        real check (tempo_medio is null or tempo_medio >= 0),
  curtidas           real check (curtidas is null or curtidas >= 0),
  comentarios        real check (comentarios is null or comentarios >= 0),
  compartilhamentos  real check (compartilhamentos is null or compartilhamentos >= 0),
  salvamentos        real check (salvamentos is null or salvamentos >= 0),
  seguimentos        real check (seguimentos is null or seguimentos >= 0),
  origem_aba         text,
  origem_linha       integer,
  score_origem       real,
  formula_origem     text,
  criado_por         text,
  criado_em          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index mkt_insight_conta_idx on mkt_insight (organizacao_id, conta, data);
