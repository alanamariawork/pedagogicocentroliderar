-- =====================================================================
-- PR #2: Jornada, Conteúdo, Diagnóstico e Inteligência da Turma.
--
-- Tudo aditivo (create table novas, nenhuma tabela existente tocada). Reaproveita a fundação do
-- PR #1: produto, evento (= oferta), matricula, pessoa, auditoria, RBAC — ver
-- docs/portal-v1/14-fase1-implementacao.md e 13-especificacao-funcional-v1.md.
--
-- Sem nome de MQA13 em tabela/coluna alguma: tudo referencia produto_id/evento_id genéricos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Conteúdo: pertence ao PRODUTO (reutilizável entre ofertas do mesmo produto, ex.: MQA13/MQA14),
-- não à oferta. A jornada de uma oferta específica é quem referencia o conteúdo (etapa_jornada).
--
-- Referência de vídeo: campos neutros de fornecedor (não amarrados ao Cloudflare Stream nem a
-- nenhum outro provedor — ver docs/portal-v1/15-arquitetura-conteudo-video.md, que já registrou a
-- decisão de Stream, mas NENHUMA integração real é criada nesta migration/fase).
-- ---------------------------------------------------------------------
create table conteudo (
  id                     text primary key,
  organizacao_id         text not null references organizacao(id),
  produto_id             text not null references produto(id),
  titulo                 text not null check (length(trim(titulo)) between 1 and 160),
  descricao              text check (descricao is null or length(descricao) <= 2000),
  texto                  text,
  imagem_url             text,
  -- Neutro de fornecedor: nenhuma integração de vídeo real nesta fase (ver 15-arquitetura-conteudo-video.md).
  video_provider         text check (video_provider is null or length(trim(video_provider)) <= 40),
  video_referencia       text check (video_referencia is null or length(trim(video_referencia)) <= 200),
  video_duracao_segundos integer check (video_duracao_segundos is null or video_duracao_segundos > 0),
  -- Lista de materiais/links opcionais: [{ "titulo": "...", "url": "..." }, ...].
  materiais              text check (materiais is null or (json_valid(materiais) and json_type(materiais) = 'array')),
  status                 text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'arquivado')),
  criado_por             text,
  criado_em              text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index conteudo_produto_idx on conteudo (produto_id, status);
create index conteudo_organizacao_idx on conteudo (organizacao_id);

-- ---------------------------------------------------------------------
-- Jornada de preparação: pertence à OFERTA (evento). Uma sequência única de etapas — sem módulos,
-- sem trilhas dentro de trilhas, sem pré-requisito entre etapas (README funcional do PR #2).
-- ---------------------------------------------------------------------
create table jornada (
  id             text primary key,
  organizacao_id text not null references organizacao(id),
  evento_id      text not null unique references evento(id),
  status         text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'encerrada')),
  ativada_em     text,
  ativada_por    text,
  encerrada_em   text,
  encerrada_por  text,
  criado_por     text,
  criado_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (status <> 'ativa' or ativada_em is not null),
  check (status <> 'encerrada' or encerrada_em is not null)
);

-- Etapa: 'conteudo' referencia um `conteudo` (reutilizável); 'diagnostico' é o marcador da etapa
-- de formulário (o diagnóstico em si é por oferta — ver pergunta_diagnostico abaixo — não há
-- necessidade de uma entidade "diagnostico" própria além disso: é 1:1 implícito com a oferta).
-- Ordem é recomendada, não bloqueante (sem unique em (jornada_id, ordem), mesmo padrão já usado em
-- categoria_ingresso.ordem/cadastro_opcao.ordem — reordenar não precisa de transação de troca).
create table etapa_jornada (
  id             text primary key,
  jornada_id     text not null references jornada(id),
  tipo           text not null check (tipo in ('conteudo', 'diagnostico')),
  conteudo_id    text references conteudo(id),
  titulo         text not null check (length(trim(titulo)) between 1 and 160),
  descricao      text check (descricao is null or length(descricao) <= 2000),
  ordem          integer not null default 0,
  obrigatoria    integer not null default 1 check (obrigatoria in (0, 1)),
  status         text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'arquivada')),
  criado_por     text,
  criado_em      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (tipo <> 'conteudo' or conteudo_id is not null),
  check (tipo <> 'diagnostico' or conteudo_id is null)
);
create index etapa_jornada_jornada_idx on etapa_jornada (jornada_id, ordem);
create index etapa_jornada_conteudo_idx on etapa_jornada (conteudo_id) where conteudo_id is not null;

-- ---------------------------------------------------------------------
-- Diagnóstico configurável por oferta. Pergunta pertence diretamente ao evento (não há entidade
-- "diagnóstico" própria: um evento tem no máximo um conjunto de perguntas, é 1:1 implícito).
--
-- Lógica condicional mínima (decisão do PR #2, seção 13): "esta pergunta só se aplica quando a
-- resposta de OUTRA pergunta for um valor específico" — não é uma engine de regras genérica, é só
-- essa comparação simples, suficiente para os casos reais do diagnóstico do MQA.
-- ---------------------------------------------------------------------
create table pergunta_diagnostico (
  id                  text primary key,
  organizacao_id      text not null references organizacao(id),
  evento_id           text not null references evento(id),
  enunciado           text not null check (length(trim(enunciado)) between 1 and 500),
  tipo                text not null check (tipo in ('escolha_unica', 'texto_curto', 'texto_longo', 'numero')),
  -- Opções (só para escolha_unica): ["Opção 1", "Opção 2", ...]. Sempre configurável pelo
  -- Backoffice — nunca uma lista fixa em código (decisão explícita: faixas de faturamento e
  -- segmentos ainda não foram fechados pelo Leonardo).
  opcoes              text check (opcoes is null or (json_valid(opcoes) and json_type(opcoes) = 'array')),
  obrigatoria         integer not null default 1 check (obrigatoria in (0, 1)),
  ordem               integer not null default 0,
  status              text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'inativa')),
  -- Deixa de ser aplicável (some do formulário, não conta como obrigatória) quando a pergunta
  -- `condicao_pergunta_id` foi respondida exatamente com `condicao_opcao`. Ex.: "faturamento
  -- mensal" com condicao_pergunta_id = pergunta "papel profissional" e condicao_opcao = "Ainda
  -- não tenho empresa/negócio" — some para quem respondeu isso, continua para as demais opções.
  -- É uma exclusão, não uma lista de inclusão: o caso real tem UM valor que desativa a pergunta,
  -- não vários que a ativam, e isso é suficiente sem precisar de uma lista/engine genérica.
  condicao_pergunta_id text references pergunta_diagnostico(id),
  condicao_opcao        text check (condicao_opcao is null or length(trim(condicao_opcao)) <= 200),
  criado_por          text,
  criado_em           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (tipo = 'escolha_unica' or opcoes is null),
  check ((condicao_pergunta_id is null) = (condicao_opcao is null))
);
create index pergunta_diagnostico_evento_idx on pergunta_diagnostico (evento_id, ordem);

-- Resposta: pertence a Matrícula (que já é Pessoa x Oferta — não precisa repetir pessoa_id/
-- evento_id, evita fonte de verdade duplicada) x Pergunta. Uma pessoa respondendo o mesmo produto
-- em ofertas diferentes (MQA13 e MQA14) tem respostas completamente independentes, porque são
-- matrículas diferentes.
create table resposta_diagnostico (
  id             text primary key,
  matricula_id   text not null references matricula(id),
  pergunta_id    text not null references pergunta_diagnostico(id),
  valor_texto    text check (valor_texto is null or length(valor_texto) <= 5000),
  valor_opcao    text check (valor_opcao is null or length(trim(valor_opcao)) <= 200),
  respondida_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizada_em  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (matricula_id, pergunta_id)
);
create index resposta_diagnostico_pergunta_idx on resposta_diagnostico (pergunta_id);

-- Conclusão de etapa: ação explícita ("Concluir e continuar") para conteúdo, ou envio válido do
-- formulário para diagnóstico — nunca inferida de percentual assistido de vídeo (decisão funcional
-- do PR #2, seção 8: posição assistida != conclusão da etapa).
create table conclusao_etapa (
  id             text primary key,
  matricula_id   text not null references matricula(id),
  etapa_id       text not null references etapa_jornada(id),
  origem         text not null check (origem in ('acao_explicita', 'formulario_enviado')),
  concluida_em   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (matricula_id, etapa_id)
);
create index conclusao_etapa_matricula_idx on conclusao_etapa (matricula_id);
