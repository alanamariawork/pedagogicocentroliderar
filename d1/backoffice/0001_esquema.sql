-- =====================================================================
-- Centro Liderar · Eventos — esquema D1 (SQLite)
--
-- Tradução do estado FINAL das 22 migrações Postgres da versão anterior,
-- com o mínimo de mudanças de semântica. Convenções:
--   uuid            → TEXT (gerado pela aplicação: crypto.randomUUID())
--   timestamptz     → TEXT ISO 8601 em UTC ('2026-09-23T13:45:00.000Z')
--   date            → TEXT 'AAAA-MM-DD'
--   boolean         → INTEGER 0/1
--   text[] / jsonb  → TEXT com JSON
--   regex (~)       → GLOB + length (SQLite/D1 não tem REGEXP)
--
-- O que era regra em função/gatilho plpgsql agora vive no Worker (worker/regras).
-- O banco mantém as barreiras que não dependem de código: CHECK, UNIQUE,
-- chaves estrangeiras (o D1 sempre aplica) e dois gatilhos de proteção.
--
-- Mudança deliberada em relação ao Postgres: as tabelas do financeiro NÃO
-- apagam em cascata junto com o evento. No Postgres, excluir um evento podia
-- levar o orçamento embora sem aviso. Aqui a exclusão é recusada e a regra
-- de exclusão explica o motivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Organização, login e equipe
-- ---------------------------------------------------------------------
create table organizacao (
  id         text primary key,
  nome       text not null check (length(trim(nome)) > 0),
  criado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Contas de login (login próprio do Worker). Senha: PBKDF2-SHA256.
create table usuario (
  id                text primary key,
  email             text not null unique check (email = lower(trim(email)) and instr(email, '@') > 1),
  senha_hash        text not null,
  senha_sal         text not null,
  senha_iteracoes   integer not null check (senha_iteracoes > 0),
  -- 1 = criada ou redefinida pelo administrador: a pessoa precisa criar a própria senha.
  senha_provisoria  integer not null default 1 check (senha_provisoria in (0, 1)),
  falhas_seguidas   integer not null default 0 check (falhas_seguidas >= 0),
  bloqueado_ate     text,
  criado_em         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sessões. Guarda só o hash do token: o token em si fica no cookie HttpOnly.
create table sessao (
  token_hash     text primary key,
  usuario_id     text not null references usuario(id) on delete cascade,
  criada_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expira_em      text not null,
  ultimo_uso_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index sessao_usuario_idx on sessao (usuario_id);

create table membro (
  usuario_id      text primary key references usuario(id),
  organizacao_id  text not null references organizacao(id),
  nome            text not null,
  email           text not null,
  papeis          text not null check (json_valid(papeis) and json_type(papeis) = 'array' and json_array_length(papeis) > 0),
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index membro_email_unico_idx on membro (organizacao_id, lower(email));

create table acesso_permitido (
  email           text primary key check (email = lower(trim(email)) and instr(email, '@') > 1),
  organizacao_id  text not null references organizacao(id),
  nome            text,
  papeis          text not null check (json_valid(papeis) and json_type(papeis) = 'array' and json_array_length(papeis) > 0),
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------
-- Listas configuráveis
-- ---------------------------------------------------------------------
create table cadastro_opcao (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  tipo            text not null check (tipo in ('origem', 'forma_pagamento', 'plataforma', 'responsavel')),
  nome            text not null check (length(trim(nome)) between 1 and 80),
  ativa           integer not null default 1 check (ativa in (0, 1)),
  ordem           integer not null default 0,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index cadastro_opcao_nome_unico_idx on cadastro_opcao (organizacao_id, tipo, lower(trim(nome)));

-- ---------------------------------------------------------------------
-- Evento, categorias, condições e zonas
-- ---------------------------------------------------------------------
create table evento (
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
  cor_primaria              text check (cor_primaria is null or cor_primaria glob '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  cor_acento                text check (cor_acento   is null or cor_acento   glob '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  cor_profunda              text check (cor_profunda is null or cor_profunda glob '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  cor_clara                 text check (cor_clara    is null or cor_clara    glob '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  imagem_capa_url           text,
  presenca_diaria           integer not null default 0 check (presenca_diaria in (0, 1)),
  meta_comercial_ingressos  integer check (meta_comercial_ingressos is null or meta_comercial_ingressos > 0),
  criado_em                 text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (data_inicio is null or data_fim is null or data_fim >= data_inicio)
);
create index evento_organizacao_idx on evento (organizacao_id);

create table evento_imagem (
  evento_id       text primary key references evento(id) on delete cascade,
  tipo            text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp')),
  dados_base64    text not null check (length(dados_base64) <= 1400000),
  largura         integer check (largura > 0),
  altura          integer check (altura > 0),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por  text
);

create table categoria_ingresso (
  id                    text primary key,
  evento_id             text not null references evento(id),
  nome                  text not null check (length(trim(nome)) between 1 and 80),
  preco_centavos        integer not null default 0 check (preco_centavos >= 0),
  quantidade_planejada  integer check (quantidade_planejada is null or quantidade_planejada >= 0),
  ativa                 integer not null default 1 check (ativa in (0, 1)),
  ordem                 integer not null default 0,
  cor_pulseira          text check (cor_pulseira is null or cor_pulseira glob '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  criado_em             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (id, evento_id)
);
create unique index categoria_nome_unico_idx on categoria_ingresso (evento_id, lower(trim(nome)));

create table categoria_condicao (
  id              text primary key,
  evento_id       text not null,
  categoria_id    text not null,
  nome            text not null check (length(trim(nome)) between 1 and 60),
  preco_centavos  integer not null check (preco_centavos >= 0),
  aceita_pix      integer not null default 0 check (aceita_pix in (0, 1)),
  max_parcelas    integer check (max_parcelas is null or max_parcelas between 1 and 36),
  ordem           integer not null default 0,
  ativa           integer not null default 1 check (ativa in (0, 1)),
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  foreign key (categoria_id, evento_id) references categoria_ingresso (id, evento_id) on delete cascade,
  check (aceita_pix = 1 or max_parcelas is not null)
);
create unique index categoria_condicao_nome_idx on categoria_condicao (categoria_id, lower(trim(nome)));
create index categoria_condicao_evento_idx on categoria_condicao (evento_id);

create table evento_zona (
  id             text primary key,
  evento_id      text not null references evento(id),
  nome           text not null check (length(trim(nome)) between 1 and 40),
  cor            text check (cor is null or cor glob '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  capacidade     integer not null check (capacidade >= 0),
  observacao     text check (observacao is null or length(observacao) <= 200),
  ativa          integer not null default 1 check (ativa in (0, 1)),
  ordem          integer not null default 0,
  criado_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (id, evento_id)
);
create unique index evento_zona_nome_idx on evento_zona (evento_id, lower(trim(nome)));
create index evento_zona_evento_idx on evento_zona (evento_id);

-- ---------------------------------------------------------------------
-- Pessoas e programa Diamante
-- ---------------------------------------------------------------------
create table pessoa (
  id              text primary key,
  organizacao_id  text not null references organizacao(id),
  nome            text not null check (length(trim(nome)) between 1 and 160),
  telefone        text check (telefone is null or (length(telefone) between 8 and 15 and telefone not glob '*[^0-9]*')),
  email           text check (email is null or (email = lower(email) and instr(email, '@') > 1)),
  cpf             text check (cpf is null or (length(cpf) = 11 and cpf not glob '*[^0-9]*')),
  observacoes     text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create unique index pessoa_cpf_unico_idx on pessoa (organizacao_id, cpf) where cpf is not null;
create index pessoa_telefone_idx on pessoa (organizacao_id, telefone);
create index pessoa_email_idx on pessoa (organizacao_id, email);

create table mentorada (
  id             text primary key,
  evento_id      text not null references evento(id),
  pessoa_id      text not null references pessoa(id),
  codigo         text not null check (length(codigo) between 2 and 20 and codigo glob '[A-Z0-9]*' and codigo not glob '*[^A-Z0-9-]*'),
  situacao       text not null default 'ativa' check (situacao in ('ativa', 'inativa')),
  entrou_em      text,
  observacoes    text check (observacoes is null or length(observacoes) <= 500),
  criado_por     text,
  criado_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (evento_id, codigo),
  unique (evento_id, pessoa_id),
  unique (id, evento_id)
);
create index mentorada_evento_idx on mentorada (evento_id, situacao);

create table mentorada_premio (
  id             text primary key,
  mentorada_id   text not null references mentorada(id) on delete cascade,
  marco          integer not null check (marco in (10, 30, 50, 70, 90, 110, 130)),
  entregue_em    text not null,
  responsavel    text not null check (length(trim(responsavel)) between 2 and 120),
  observacao     text check (observacao is null or length(observacao) <= 500),
  registrado_por text,
  registrado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (mentorada_id, marco)
);

-- ---------------------------------------------------------------------
-- Venda e ingresso
-- ---------------------------------------------------------------------
create table venda (
  id                         text primary key,
  evento_id                  text not null references evento(id),
  comprador_id               text not null references pessoa(id),
  data_venda                 text not null,
  forma_pagamento_id         text references cadastro_opcao(id),
  plataforma_id              text references cadastro_opcao(id),
  parcelas                   integer check (parcelas is null or parcelas between 1 and 36),
  responsavel_id             text references cadastro_opcao(id),
  origem_id                  text references cadastro_opcao(id),
  indicado_por               text check (indicado_por is null or length(indicado_por) <= 160),
  cupom                      text check (cupom is null or length(cupom) <= 60),
  observacoes                text,
  criado_por                 text,
  pagamento_dispensado       integer not null default 0 check (pagamento_dispensado in (0, 1)),
  pagamento_dispensa_motivo  text,
  pagamento_dispensado_por   text,
  pagamento_dispensado_em    text,
  condicao_id                text references categoria_condicao(id),
  condicao_nome              text,
  condicao_aceita_pix        integer check (condicao_aceita_pix is null or condicao_aceita_pix in (0, 1)),
  condicao_max_parcelas      integer,
  link_pagamento             text check (link_pagamento is null or (
                               lower(substr(link_pagamento, 1, 8)) = 'https://' and length(link_pagamento) between 9 and 500
                               and link_pagamento not glob '*[ ' || char(9) || char(10) || char(13) || ']*')),
  mentorada_id               text,
  excecao_motivo             text,
  excecao_max_parcelas       integer,
  excecao_autorizada_por     text,
  excecao_autorizada_em      text,
  criado_em                  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em              text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (id, evento_id),
  foreign key (mentorada_id, evento_id) references mentorada (id, evento_id),
  check (pagamento_dispensado = 0 or length(trim(coalesce(pagamento_dispensa_motivo, ''))) >= 5),
  check ((excecao_motivo is null and excecao_max_parcelas is null and excecao_autorizada_por is null and excecao_autorizada_em is null)
      or (length(trim(coalesce(excecao_motivo, ''))) >= 10 and excecao_max_parcelas between 1 and 36
          and excecao_autorizada_por is not null and excecao_autorizada_em is not null))
);
create index venda_evento_idx on venda (evento_id, data_venda);
create index venda_comprador_idx on venda (comprador_id);
create index venda_mentorada_idx on venda (mentorada_id) where mentorada_id is not null;

-- Ingresso = a vaga. Só 'confirmado' ocupa capacidade.
create table ingresso (
  id                     text primary key,
  venda_id               text not null,
  evento_id              text not null,
  categoria_id           text not null,
  participante_id        text references pessoa(id),
  zona_id                text,
  numero                 integer not null check (numero >= 1),
  valor_centavos         integer not null check (valor_centavos >= 0),
  preco_base_centavos    integer check (preco_base_centavos is null or preco_base_centavos >= 0),
  preco_tabela_centavos  integer check (preco_tabela_centavos is null or preco_tabela_centavos >= 0),
  status                 text not null default 'pendente' check (status in ('pendente', 'confirmado', 'cancelado')),
  confirmado_em          text,
  cancelado_em           text,
  motivo_cancelamento    text,
  excedeu_categoria      integer not null default 0 check (excedeu_categoria in (0, 1)),
  excedeu_capacidade     integer not null default 0 check (excedeu_capacidade in (0, 1)),
  justificativa_excesso  text,
  autorizado_por         text,
  autorizado_em          text,
  criado_em              text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Venda, categoria e zona pertencem ao MESMO evento do ingresso.
  foreign key (venda_id, evento_id) references venda (id, evento_id),
  foreign key (categoria_id, evento_id) references categoria_ingresso (id, evento_id),
  foreign key (zona_id, evento_id) references evento_zona (id, evento_id),
  unique (venda_id, numero),
  check (status <> 'confirmado' or confirmado_em is not null),
  check (status <> 'cancelado' or cancelado_em is not null),
  check ((excedeu_categoria = 0 and excedeu_capacidade = 0) or length(trim(coalesce(justificativa_excesso, ''))) >= 5)
);
create index ingresso_evento_status_idx on ingresso (evento_id, status);
create index ingresso_categoria_status_idx on ingresso (categoria_id, status);
create index ingresso_zona_status_idx on ingresso (zona_id, status);
create index ingresso_venda_idx on ingresso (venda_id);
create index ingresso_participante_idx on ingresso (participante_id);
-- A mesma pessoa não pode ter dois ingressos ativos no mesmo evento.
create unique index ingresso_participante_unica_idx on ingresso (evento_id, participante_id)
  where participante_id is not null and status <> 'cancelado';

-- ---------------------------------------------------------------------
-- Pagamentos e plano de parcelas
-- ---------------------------------------------------------------------
create table venda_pagamento (
  id                        text primary key,
  venda_id                  text not null references venda(id),
  valor_centavos            integer not null check (valor_centavos > 0),
  data_pagamento            text not null,
  forma_pagamento_id        text references cadastro_opcao(id),
  plataforma_id             text references cadastro_opcao(id),
  observacao                text check (observacao is null or length(observacao) <= 500),
  situacao                  text not null default 'valido' check (situacao in ('valido', 'estornado', 'recusado')),
  registrado_por            text,
  registrado_em             text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  estornado_por             text,
  estornado_em              text,
  estorno_motivo            text,
  chave_idempotencia        text,
  conferencia               text not null default 'pendente' check (conferencia in ('pendente', 'confirmado', 'recusado')),
  conferido_por             text,
  conferido_em              text,
  conferencia_motivo        text,
  liquidacao                text check (liquidacao is null or liquidacao in ('liquidado', 'aguardando')),
  liquidacao_prevista       text,
  liquidado_em              text,
  liquidado_registrado_por  text,
  taxa_centavos             integer,
  taxa_registrada_por       text,
  taxa_registrada_em        text,
  check (situacao <> 'estornado' or length(trim(coalesce(estorno_motivo, ''))) >= 5),
  check (liquidacao is null or conferencia = 'confirmado'),
  check (situacao <> 'recusado' or (conferencia = 'recusado' and length(trim(coalesce(conferencia_motivo, ''))) >= 5)),
  check (taxa_centavos is null or conferencia = 'confirmado'),
  check (taxa_centavos is null or (taxa_centavos >= 0 and taxa_centavos <= valor_centavos))
);
create index venda_pagamento_venda_idx on venda_pagamento (venda_id, situacao);
create unique index venda_pagamento_chave_idx on venda_pagamento (chave_idempotencia) where chave_idempotencia is not null;
create index venda_pagamento_conferencia_idx on venda_pagamento (conferencia, liquidacao) where situacao = 'valido';

create table venda_parcela (
  id                   text primary key,
  venda_id             text not null references venda(id),
  numero               integer not null check (numero between 0 and 60),
  valor_centavos       integer not null check (valor_centavos > 0),
  vencimento           text not null,
  situacao             text not null default 'vigente' check (situacao in ('vigente', 'substituida')),
  criado_por           text,
  criado_em            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  substituida_por      text,
  substituida_em       text,
  motivo_substituicao  text,
  check (situacao = 'vigente' or length(trim(coalesce(motivo_substituicao, ''))) >= 5)
);
create unique index venda_parcela_numero_vigente_idx on venda_parcela (venda_id, numero) where situacao = 'vigente';
create index venda_parcela_vencimento_idx on venda_parcela (vencimento) where situacao = 'vigente';

-- ---------------------------------------------------------------------
-- Credenciamento e presença
-- ---------------------------------------------------------------------
create table credencial (
  id                 text primary key,
  evento_id          text not null references evento(id),
  ingresso_id        text not null references ingresso(id),
  participante_id    text not null references pessoa(id),
  participante_nome  text not null,
  categoria_nome     text not null,
  cor_pulseira       text,
  pulseira_entregue  integer not null check (pulseira_entregue = 1),
  reemissoes         integer not null default 0 check (reemissoes >= 0),
  ativa              integer not null default 1 check (ativa in (0, 1)),
  credenciado_por    text,
  credenciado_em     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  anulada_por        text,
  anulada_em         text,
  motivo_anulacao    text,
  check (ativa = 1 or length(trim(coalesce(motivo_anulacao, ''))) >= 10)
);
-- Barreira final contra credenciamento duplicado: uma credencial ativa por ingresso.
create unique index credencial_ativa_por_ingresso_idx on credencial (ingresso_id) where ativa = 1;
create index credencial_evento_idx on credencial (evento_id, credenciado_em desc);

create table presenca (
  id               text primary key,
  evento_id        text not null references evento(id),
  ingresso_id      text not null references ingresso(id),
  credencial_id    text not null references credencial(id),
  dia              text not null,
  origem           text not null check (origem in ('credenciamento', 'recepcao', 'retroativa')),
  justificativa    text,
  ativa            integer not null default 1 check (ativa in (0, 1)),
  registrada_por   text,
  registrada_em    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  anulada_por      text,
  anulada_em       text,
  motivo_anulacao  text,
  check (origem <> 'retroativa' or length(trim(coalesce(justificativa, ''))) >= 10),
  check (ativa = 1 or length(trim(coalesce(motivo_anulacao, ''))) >= 10)
);
create unique index presenca_unica_por_dia_idx on presenca (ingresso_id, dia) where ativa = 1;
create index presenca_evento_dia_idx on presenca (evento_id, dia) where ativa = 1;

-- ---------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------
create table auditoria (
  id              integer primary key autoincrement,
  organizacao_id  text not null,
  evento_id       text,
  entidade        text not null,
  entidade_id     text,
  acao            text not null,
  dados           text not null default '{}' check (json_valid(dados)),
  usuario_id      text,
  usuario_nome    text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index auditoria_entidade_idx on auditoria (entidade, entidade_id);
create index auditoria_evento_idx on auditoria (evento_id, criado_em desc);

-- ---------------------------------------------------------------------
-- Financeiro gerencial: orçamento, fornecedores e despesas
-- ---------------------------------------------------------------------
create table orcamento (
  id                 text primary key,
  evento_id          text not null unique references evento(id),
  aprovado_centavos  integer check (aprovado_centavos is null or aprovado_centavos >= 0),
  observacao         text,
  criado_por         text,
  criado_em          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por     text,
  atualizado_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table orcamento_categoria (
  id              text primary key,
  evento_id       text not null references evento(id),
  pai_id          text references orcamento_categoria(id) on delete cascade,
  nome            text not null check (length(trim(nome)) > 0),
  ordem           integer not null default 0,
  tipo            text not null default 'direta' check (tipo in ('direta', 'rateio_corporativo')),
  ativa           integer not null default 1 check (ativa in (0, 1)),
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por  text,
  atualizado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index orcamento_categoria_evento_idx on orcamento_categoria (evento_id);

create table fornecedor (
  id          text primary key,
  evento_id   text not null references evento(id),
  nome        text not null check (length(trim(nome)) > 0),
  documento   text,
  contato     text,
  ativo       integer not null default 1 check (ativo in (0, 1)),
  criado_por  text,
  criado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index fornecedor_evento_idx on fornecedor (evento_id);

create table orcamento_item (
  id                                text primary key,
  evento_id                         text not null references evento(id),
  categoria_id                      text not null references orcamento_categoria(id),
  fornecedor_id                     text references fornecedor(id),
  descricao                         text not null check (length(trim(descricao)) > 0),
  quantidade                        integer not null default 1 check (quantidade > 0),
  valor_unitario_previsto_centavos  integer not null check (valor_unitario_previsto_centavos >= 0),
  valor_previsto_centavos           integer not null check (valor_previsto_centavos >= 0),
  valor_contratado_centavos         integer check (valor_contratado_centavos is null or valor_contratado_centavos >= 0),
  situacao                          text not null default 'planejado' check (situacao in ('planejado', 'contratado', 'cancelado')),
  motivo_cancelamento               text,
  ordem                             integer not null default 0,
  criado_por                        text,
  criado_em                         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por                    text,
  atualizado_em                     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index orcamento_item_evento_idx on orcamento_item (evento_id);
create index orcamento_item_categoria_idx on orcamento_item (categoria_id);

create table despesa (
  id                          text primary key,
  evento_id                   text not null references evento(id),
  item_id                     text not null references orcamento_item(id),
  valor_reconhecido_centavos  integer not null check (valor_reconhecido_centavos > 0),
  competencia                 text not null,
  vencimento                  text,
  situacao                    text not null default 'reconhecida' check (situacao in ('reconhecida', 'cancelada')),
  motivo_cancelamento         text,
  criado_por                  text,
  criado_em                   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index despesa_evento_idx on despesa (evento_id);
create index despesa_item_idx on despesa (item_id);

create table despesa_pagamento (
  id                  text primary key,
  despesa_id          text not null references despesa(id),
  valor_centavos      integer not null check (valor_centavos > 0),
  data_pagamento      text not null,
  tipo                text not null default 'normal' check (tipo in ('normal', 'retencao', 'devolucao')),
  situacao            text not null default 'valido' check (situacao in ('valido', 'estornado')),
  motivo_estorno      text,
  chave_idempotencia  text unique,
  criado_por          text,
  criado_em           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index despesa_pagamento_despesa_idx on despesa_pagamento (despesa_id);

-- ---------------------------------------------------------------------
-- DRE configurável
-- ---------------------------------------------------------------------
-- Alíquota em milésimos de ponto percentual (6,5% = 6500): inteiro exato, sem
-- arredondamento de ponto flutuante. Equivale ao numeric(6,3) do Postgres.
create table evento_tributo (
  id                   text primary key,
  evento_id            text not null references evento(id),
  nome                 text not null check (length(trim(nome)) > 0),
  aliquota_milesimos   integer not null check (aliquota_milesimos > 0 and aliquota_milesimos <= 100000),
  ativo                integer not null default 1 check (ativo in (0, 1)),
  criado_por           text,
  criado_em            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por       text,
  atualizado_em        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index evento_tributo_evento_idx on evento_tributo (evento_id);

create table dre_estrutura (
  id          text primary key,
  evento_id   text not null references evento(id),
  nome        text not null default 'Estrutura padrão',
  origem      text not null default 'modelo_inicial' check (origem in ('modelo_inicial', 'modelo_salvo', 'personalizada')),
  ativa       integer not null default 1 check (ativa in (0, 1)),
  criado_por  text,
  criado_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index dre_estrutura_evento_idx on dre_estrutura (evento_id);
create unique index dre_estrutura_uma_ativa_idx on dre_estrutura (evento_id) where ativa = 1;

create table dre_linha (
  id                      text primary key,
  estrutura_id            text not null references dre_estrutura(id) on delete cascade,
  pai_id                  text references dre_linha(id) on delete cascade,
  nome                    text not null check (length(trim(nome)) > 0),
  ordem                   integer not null default 0,
  tipo                    text not null check (tipo in ('grupo', 'conta', 'subtotal', 'indicador', 'ajuste_manual')),
  ativa                   integer not null default 1 check (ativa in (0, 1)),
  fonte                   text check (fonte is null or fonte in ('venda', 'taxa_plataforma', 'tributo', 'orcamento_categoria')),
  categoria_orcamento_id  text references orcamento_categoria(id),
  regime                  text not null default 'competencia' check (regime in ('competencia', 'caixa')),
  formula                 text check (formula is null or json_valid(formula)),
  criado_por              text,
  criado_em               text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_por          text,
  atualizado_em           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (tipo <> 'conta' or fonte is not null),
  check (tipo in ('subtotal', 'indicador') or formula is null)
);
create index dre_linha_estrutura_idx on dre_linha (estrutura_id);
create index dre_linha_pai_idx on dre_linha (pai_id);

create table dre_ajuste_manual (
  id                   text primary key,
  linha_id             text not null references dre_linha(id),
  valor_centavos       integer not null,
  motivo               text not null check (length(trim(motivo)) > 0),
  situacao             text not null default 'ativo' check (situacao in ('ativo', 'cancelado')),
  motivo_cancelamento  text,
  criado_por           text,
  criado_em            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index dre_ajuste_manual_linha_idx on dre_ajuste_manual (linha_id);

create table dre_modelo (
  id              text primary key,
  organizacao_id  text not null references organizacao(id) on delete cascade,
  nome            text not null check (length(trim(nome)) > 0),
  descricao       text,
  criado_por      text,
  criado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index dre_modelo_organizacao_idx on dre_modelo (organizacao_id);

create table dre_modelo_linha (
  id                            text primary key,
  modelo_id                     text not null references dre_modelo(id) on delete cascade,
  pai_id                        text references dre_modelo_linha(id) on delete cascade,
  nome                          text not null,
  ordem                         integer not null default 0,
  tipo                          text not null check (tipo in ('grupo', 'conta', 'subtotal', 'indicador', 'ajuste_manual')),
  fonte                         text check (fonte is null or fonte in ('venda', 'taxa_plataforma', 'tributo', 'orcamento_categoria')),
  categoria_orcamento_nome      text,
  categoria_orcamento_pai_nome  text,
  regime                        text not null default 'competencia' check (regime in ('competencia', 'caixa')),
  formula                       text check (formula is null or json_valid(formula))
);
create index dre_modelo_linha_modelo_idx on dre_modelo_linha (modelo_id);
