-- =====================================================================
-- Fase 1 do Portal Centro Liderar: fundação multiproduto + identidade +
-- matrícula + base de autenticação de clientes.
--
-- Tudo aditivo: nenhuma tabela existente é recriada, nenhuma coluna
-- existente muda de tipo/regra. `evento` ganha uma FK opcional para
-- `produto` (alter table add column, seguro sobre dados existentes,
-- mesmo padrão já usado em 0004_pessoa_rg_endereco.sql).
--
-- Convenções mantidas: uuid -> TEXT (crypto.randomUUID() pela aplicação),
-- timestamptz -> TEXT ISO 8601 em UTC, boolean -> INTEGER 0/1,
-- checks com GLOB de classe única (comprovadamente aceitos pelo D1,
-- ver 0003_cores_compativeis.sql para o histórico do que NÃO funciona).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Produto: experiência/marca recorrente do Centro Liderar (MQA, MQA
-- Master, Efeito Diamante). Independente de "evento": um evento é uma
-- ocorrência/edição de um produto (a "oferta").
-- ---------------------------------------------------------------------
create table produto (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  nome            text not null check (length(trim(nome)) between 1 and 160),
  -- Identificador estável para referência técnica (ex.: 'mqa', 'mqa-master', 'efeito-diamante').
  slug            text not null check (slug = lower(slug) and length(slug) between 1 and 80 and slug not glob '*[^a-z0-9-]*'),
  descricao       text,
  ativo           integer not null default 1 check (ativo in (0, 1)),
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index produto_slug_unico_idx on produto (organizacao_id, slug);
create unique index produto_nome_unico_idx on produto (organizacao_id, lower(trim(nome)));

-- `evento` passa a poder pertencer a um produto (a "oferta" é o próprio
-- evento existente — não renomeado, para não recriar uma tabela com
-- dezenas de dependências e dados reais em produção). Nula = evento sem
-- produto vinculado ainda (compatível com todo dado existente).
alter table evento add column produto_id text references produto(id);
create index evento_produto_idx on evento (produto_id) where produto_id is not null;

-- ---------------------------------------------------------------------
-- Empresa: negócio ao qual uma ou mais pessoas podem estar vinculadas.
-- N:N versionada (pessoa_empresa) porque a mesma pessoa pode mudar de
-- empresa entre uma matrícula e outra, e o vínculo tem vigência.
-- ---------------------------------------------------------------------
create table empresa (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  nome            text not null check (length(trim(nome)) between 1 and 160),
  cnpj            text check (cnpj is null or (length(cnpj) = 14 and cnpj not glob '*[^0-9]*')),
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index empresa_cnpj_unico_idx on empresa (organizacao_id, cnpj) where cnpj is not null;

create table pessoa_empresa (
  id           text primary key,
  pessoa_id    text not null references pessoa(id),
  empresa_id   text not null references empresa(id),
  -- Papel da pessoa na empresa (proprietária, sócia, diretora, colaboradora...). Livre, sem lista fechada nesta fase.
  papel        text check (papel is null or length(trim(papel)) <= 80),
  vigente_de   text,
  vigente_ate  text,
  criado_por   text,
  criado_em    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (vigente_de is null or vigente_ate is null or vigente_ate >= vigente_de)
);
create index pessoa_empresa_pessoa_idx on pessoa_empresa (pessoa_id);
create index pessoa_empresa_empresa_idx on pessoa_empresa (empresa_id);

-- ---------------------------------------------------------------------
-- Matrícula: vínculo Pessoa x Oferta (evento), com papel e estado de
-- acesso próprios. Existe INDEPENDENTE de venda/ingresso: `ingresso_id`
-- é opcional para cobrir papéis sem compra (palestrante, staff,
-- convidada) sem fabricar uma venda fictícia (decisão de negócio 3.7).
--
-- Estado (status): 'pendente' (aguardando o gatilho de acesso) ->
-- 'ativa' (acesso liberado) -> 'bloqueada' (acesso removido; histórico
-- preservado; reversível). `bloqueio_automatico` distingue um bloqueio
-- decidido pelo sistema (ex.: ingresso cancelado no comercial, reversível
-- automaticamente se o ingresso for reaberto) de um bloqueio decidido por
-- uma pessoa administradora (sticky: só volta por reativação explícita).
--
-- Unicidade: uma pessoa tem no máximo uma matrícula por oferta (evento) —
-- o mesmo padrão de "uma pessoa, um ingresso ativo por evento" que já
-- existe em `ingresso_participante_unica_idx`, mas sem exceção de status
-- cancelado: a MESMA linha é reativada/bloqueada ao longo do tempo, nunca
-- duplicada, para o histórico permanecer contínuo e auditável.
-- ---------------------------------------------------------------------
create table matricula (
  id                   text primary key,
  organizacao_id       text not null references organizacao(id),
  evento_id            text not null references evento(id),
  pessoa_id            text not null references pessoa(id),
  papel                text not null default 'participante'
                       check (papel in ('participante', 'mentorada', 'convidada', 'palestrante', 'staff')),
  status               text not null default 'pendente' check (status in ('pendente', 'ativa', 'bloqueada')),
  -- Origem livre (campanha, canal) e/ou vínculo com a matrícula que originou esta (ex.: MQA Master com origem no MQA13),
  -- para reconstruir trajetórias entre produtos sem exigir analytics dedicado nesta fase.
  origem_texto         text check (origem_texto is null or length(trim(origem_texto)) <= 160),
  origem_matricula_id  text references matricula(id),
  -- Nula quando a matrícula não nasceu de uma venda (papel sem compra, ou concessão administrativa direta).
  ingresso_id          text references ingresso(id),
  ativada_em           text,
  bloqueio_automatico  integer not null default 0 check (bloqueio_automatico in (0, 1)),
  bloqueada_em         text,
  bloqueada_por        text,
  motivo_bloqueio      text,
  criado_por           text,
  criado_em            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (evento_id, pessoa_id),
  check (status <> 'ativa' or ativada_em is not null),
  check (status <> 'bloqueada' or (bloqueada_em is not null and length(trim(coalesce(motivo_bloqueio, ''))) >= 5))
);
create index matricula_pessoa_idx on matricula (pessoa_id);
create index matricula_evento_idx on matricula (evento_id);
create index matricula_origem_idx on matricula (origem_matricula_id) where origem_matricula_id is not null;
create index matricula_ingresso_idx on matricula (ingresso_id) where ingresso_id is not null;

-- ---------------------------------------------------------------------
-- Cliente: vínculo de autenticação da pessoa com o Portal. Reaproveita
-- literalmente `usuario`/`sessao` (mesmo motor de login do time interno:
-- PBKDF2, cookie de sessão) em vez de criar um segundo sistema de login —
-- decisão de arquitetura 8. Uma pessoa tem no máximo uma conta na vida
-- inteira (unique em pessoa_id); um usuario pode ter `membro` (equipe),
-- `cliente` (Portal), os dois ao mesmo tempo, ou nenhum.
-- ---------------------------------------------------------------------
create table cliente (
  usuario_id  text primary key references usuario(id),
  pessoa_id   text not null unique references pessoa(id),
  criado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Convite de primeiro acesso e recuperação de senha do Portal: mesmo
-- padrão de segurança de `sessao` (token aleatório; só o hash SHA-256
-- fica gravado). `finalidade` distingue os dois usos para não precisar de
-- duas tabelas quase idênticas.
create table convite_cliente (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  pessoa_id       text not null references pessoa(id),
  finalidade      text not null check (finalidade in ('convite', 'recuperacao')),
  token_hash      text not null unique,
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expira_em       text not null,
  usado_em        text
);
create index convite_cliente_pessoa_idx on convite_cliente (pessoa_id, finalidade, usado_em);

-- Aceite versionado de Termos de Uso / Política de Privacidade. O
-- conteúdo jurídico em si (texto, versão vigente) é decisão de negócio
-- pendente — esta tabela só registra QUE e QUANDO a pessoa aceitou qual
-- versão, o suficiente para a fundação não bloquear a etapa jurídica.
create table termos_aceite (
  id          text primary key,
  usuario_id  text not null references usuario(id),
  documento   text not null check (documento in ('termos_uso', 'politica_privacidade')),
  versao      text not null check (length(trim(versao)) between 1 and 40),
  aceito_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index termos_aceite_usuario_idx on termos_aceite (usuario_id);
