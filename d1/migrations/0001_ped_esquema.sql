-- =====================================================================
-- Sistema pedagógico (Diamante Business | Gestão da Jornada): esquema inicial no D1 compartilhado
-- com o backoffice do Centro Liderar.
--
-- Só ACRESCENTA: nenhuma tabela do backoffice é recriada, alterada ou apagada. Todas as tabelas daqui
-- têm o prefixo ped_ (o backoffice já tem pessoa, matricula, jornada, auditoria...).
-- Contas, sessões e login são os do backoffice (usuario, sessao, membro, cliente): não há tabela de
-- usuário própria. Esta migration roda na tabela de controle ped_migracoes (wrangler.jsonc), separada
-- das migrations do backoffice. Sem dados de demonstração: só listas iniciais e permissões padrão.
-- =====================================================================

CREATE TABLE ped_perfil_permissoes (
  perfil TEXT NOT NULL,
  permissao TEXT NOT NULL,
  PRIMARY KEY (perfil, permissao)
);

CREATE TABLE ped_configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE ped_programas (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_profissionais (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, especialidade TEXT, contato TEXT, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT,
  -- Conta da equipe (backoffice) que atua como esta profissional: é o que liga a mentora às alunas dela.
  usuario_id TEXT UNIQUE REFERENCES usuario(id)
);

CREATE TABLE ped_tipos_entregavel (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, duracao_padrao_min INTEGER,
  individual INTEGER NOT NULL DEFAULT 1, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_motivos_impedimento (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, exige_descricao INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_pacotes (
  id TEXT PRIMARY KEY, programa_id TEXT REFERENCES ped_programas(id), nome TEXT NOT NULL, descricao TEXT,
  duracao_meses INTEGER, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_pacote_itens (
  id TEXT PRIMARY KEY, pacote_id TEXT NOT NULL REFERENCES ped_pacotes(id),
  tipo_id TEXT REFERENCES ped_tipos_entregavel(id), descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  profissional_id TEXT REFERENCES ped_profissionais(id), especialidade TEXT,
  duracao_min INTEGER, origem TEXT NOT NULL DEFAULT 'pacote' CHECK (origem IN ('pacote','bonus')),
  observacoes TEXT, ordem INTEGER NOT NULL DEFAULT 0
);

-- A aluna É uma pessoa do módulo Clientes: o id é o mesmo de pessoa(id). Nome, e-mail, telefone e CPF
-- ficam só em `pessoa` (cadastro único); aqui ficam apenas os dados da gestão pedagógica.
CREATE TABLE ped_alunas (
  id TEXT PRIMARY KEY REFERENCES pessoa(id), cidade TEXT,
  observacao_operacional TEXT, demonstracao INTEGER NOT NULL DEFAULT 0, fonte TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT,
  codigo INTEGER, instagram TEXT, linkedin TEXT, site TEXT, empresa TEXT, segmento_id TEXT REFERENCES ped_opcoes_lista(id), subsegmento TEXT, responsavel_id TEXT REFERENCES usuario(id), data_entrada TEXT, status_id TEXT REFERENCES ped_opcoes_lista(id), saude_id TEXT REFERENCES ped_opcoes_lista(id), engajamento_id TEXT REFERENCES ped_opcoes_lista(id), em_risco INTEGER NOT NULL DEFAULT 0);

CREATE TABLE ped_matriculas (
  id TEXT PRIMARY KEY,
  pessoa_id TEXT NOT NULL REFERENCES ped_alunas(id),
  programa_id TEXT REFERENCES ped_programas(id),
  matricula_anterior_id TEXT REFERENCES ped_matriculas(id),
  turma TEXT,
  data_inicio TEXT, data_fim TEXT,
  situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa','pausada','encerrada','cancelada')),
  contrato_situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (contrato_situacao IN ('pendente','enviado','assinado')),
  contrato_link TEXT,
  fonte_comercial TEXT, condicoes_comerciais TEXT,
  responsavel_id TEXT REFERENCES usuario(id),
  mentora_id TEXT REFERENCES ped_profissionais(id),
  pacote_origem_id TEXT REFERENCES ped_pacotes(id), pacote_origem_nome TEXT,
  conferencia_comercial TEXT NOT NULL DEFAULT 'pendente' CHECK (conferencia_comercial IN ('pendente','conferida')),
  conferida_por TEXT, conferida_em TEXT,
  onboarding_situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (onboarding_situacao IN ('pendente','agendado','realizado')),
  onboarding_data TEXT, onboarding_responsavel_id TEXT REFERENCES usuario(id),
  onboarding_checklist TEXT, onboarding_pendencias TEXT, proximo_passo TEXT,
  encerramento_data TEXT, encerramento_motivo TEXT,
  interesse_renovacao TEXT,
  demonstracao INTEGER NOT NULL DEFAULT 0, fonte TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
, turma_id TEXT REFERENCES ped_turmas(id), data_boas_vindas TEXT, canal_venda_id TEXT REFERENCES ped_opcoes_lista(id));

CREATE INDEX ped_ix_matriculas_pessoa ON ped_matriculas(pessoa_id);

CREATE TABLE ped_itens_contratados (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  tipo_id TEXT REFERENCES ped_tipos_entregavel(id),
  descricao TEXT NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  profissional_id TEXT REFERENCES ped_profissionais(id), especialidade TEXT,
  duracao_min INTEGER,
  origem TEXT NOT NULL CHECK (origem IN ('pacote','bonus','ajuste')),
  referencia_comercial TEXT, observacoes TEXT,
  pacote_item_origem_id TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE INDEX ped_ix_itens_matricula ON ped_itens_contratados(matricula_id);

CREATE TABLE ped_ajustes_obrigacao (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES ped_itens_contratados(id),
  delta INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ajuste','excecao','transferencia_saida','transferencia_entrada','cancelamento')),
  motivo TEXT NOT NULL,
  item_relacionado_id TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE TABLE ped_ocorrencias (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES ped_itens_contratados(id),
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  numero INTEGER NOT NULL,
  data_prevista TEXT, data_prevista_original TEXT,
  data_agendada TEXT,
  data_realizada TEXT,
  duracao_min INTEGER,
  profissional_id TEXT REFERENCES ped_profissionais(id),
  situacao TEXT NOT NULL DEFAULT 'prevista'
    CHECK (situacao IN ('prevista','aguardando_agenda','disponivel_agendar','agendada','realizada','cancelada','conferencia')),
  cancelamento_motivo TEXT,
  resumo_compartilhavel TEXT,
  notas_internas TEXT,
  responsavel_resolucao_id TEXT REFERENCES usuario(id),
  valor_original TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE INDEX ped_ix_ocorrencias_matricula ON ped_ocorrencias(matricula_id);

CREATE INDEX ped_ix_ocorrencias_item ON ped_ocorrencias(item_id);

CREATE TABLE ped_ocorrencia_historico (
  id TEXT PRIMARY KEY,
  ocorrencia_id TEXT NOT NULL REFERENCES ped_ocorrencias(id),
  tipo TEXT NOT NULL,
  valor_anterior TEXT, valor_novo TEXT,
  previsao_original TEXT,
  motivo TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE TABLE ped_disponibilidades (
  id TEXT PRIMARY KEY,
  profissional_id TEXT NOT NULL REFERENCES ped_profissionais(id),
  inicio TEXT NOT NULL, fim TEXT NOT NULL,
  observacao TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT,
  CHECK (fim > inicio)
);

CREATE TABLE ped_reservas (
  id TEXT PRIMARY KEY,
  profissional_id TEXT NOT NULL REFERENCES ped_profissionais(id),
  ocorrencia_id TEXT NOT NULL REFERENCES ped_ocorrencias(id),
  inicio TEXT NOT NULL, fim TEXT NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1,
  fora_disponibilidade INTEGER NOT NULL DEFAULT 0,
  liberada_em TEXT, liberada_motivo TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT,
  CHECK (fim > inicio)
);

CREATE TRIGGER ped_tg_reserva_sem_sobreposicao
BEFORE INSERT ON ped_reservas WHEN NEW.ativa = 1
BEGIN
  SELECT RAISE(ABORT, 'conflito_horario') WHERE EXISTS (
    SELECT 1 FROM ped_reservas r WHERE r.profissional_id = NEW.profissional_id AND r.ativa = 1
      AND r.inicio < NEW.fim AND r.fim > NEW.inicio);
  SELECT RAISE(ABORT, 'ocorrencia_ja_reservada') WHERE EXISTS (
    SELECT 1 FROM ped_reservas r WHERE r.ocorrencia_id = NEW.ocorrencia_id AND r.ativa = 1);
END;

CREATE TABLE ped_contatos (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  ocorrencia_id TEXT REFERENCES ped_ocorrencias(id),
  data TEXT NOT NULL, canal TEXT NOT NULL,
  responsavel_id TEXT REFERENCES usuario(id),
  resumo TEXT, resultado TEXT, proxima_acao TEXT, proxima_tentativa TEXT,
  link_externo TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_impedimentos (
  id TEXT PRIMARY KEY,
  ocorrencia_id TEXT NOT NULL REFERENCES ped_ocorrencias(id),
  motivo_id TEXT REFERENCES ped_motivos_impedimento(id),
  descricao TEXT,
  responsavel_id TEXT REFERENCES usuario(id),
  ativo INTEGER NOT NULL DEFAULT 1,
  resolvido_em TEXT, resolucao TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_trilhas (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_pilares (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_etapas (
  id TEXT PRIMARY KEY,
  trilha_id TEXT NOT NULL REFERENCES ped_trilhas(id),
  pilar_id TEXT REFERENCES ped_pilares(id),
  titulo TEXT NOT NULL, objetivo TEXT, criterio_conclusao TEXT,
  links TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_etapa_prerequisitos (
  etapa_id TEXT NOT NULL REFERENCES ped_etapas(id),
  requer_etapa_id TEXT NOT NULL REFERENCES ped_etapas(id),
  PRIMARY KEY (etapa_id, requer_etapa_id),
  CHECK (etapa_id <> requer_etapa_id)
);

CREATE TABLE ped_etapa_atividades_modelo (
  id TEXT PRIMARY KEY, etapa_id TEXT NOT NULL REFERENCES ped_etapas(id),
  titulo TEXT NOT NULL, descricao TEXT, link TEXT, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ped_jornadas (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL UNIQUE REFERENCES ped_matriculas(id),
  trilha_id TEXT REFERENCES ped_trilhas(id),
  pilar_id TEXT REFERENCES ped_pilares(id),
  diagnostico_operacional TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_jornada_etapas (
  id TEXT PRIMARY KEY,
  jornada_id TEXT NOT NULL REFERENCES ped_jornadas(id),
  etapa_id TEXT NOT NULL REFERENCES ped_etapas(id),
  situacao TEXT NOT NULL DEFAULT 'bloqueada' CHECK (situacao IN ('bloqueada','liberada','concluida')),
  prazo_individual TEXT,
  validador_id TEXT REFERENCES usuario(id),
  liberada_em TEXT, liberada_por TEXT,
  concluida_em TEXT, concluida_por TEXT,
  UNIQUE (jornada_id, etapa_id)
);

CREATE TABLE ped_atividades (
  id TEXT PRIMARY KEY,
  jornada_etapa_id TEXT NOT NULL REFERENCES ped_jornada_etapas(id),
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  modelo_id TEXT,
  titulo TEXT NOT NULL, descricao TEXT, link TEXT,
  situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','em_execucao','enviada','validada','em_revisao')),
  prazo TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_evidencias (
  id TEXT PRIMARY KEY,
  atividade_id TEXT NOT NULL REFERENCES ped_atividades(id),
  texto TEXT, link TEXT, data_execucao TEXT,
  registrada_por_equipe INTEGER NOT NULL DEFAULT 0,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE TABLE ped_anexos (
  id TEXT PRIMARY KEY,
  atividade_id TEXT NOT NULL REFERENCES ped_atividades(id),
  evidencia_id TEXT REFERENCES ped_evidencias(id),
  nome TEXT NOT NULL, tipo TEXT NOT NULL, tamanho INTEGER NOT NULL,
  -- O conteúdo fica no R2 (bucket dos anexos), na chave abaixo: o D1 não guarda valores acima de 2 MB.
  chave TEXT NOT NULL UNIQUE,
  autor_id TEXT NOT NULL, criado_em TEXT NOT NULL
);

CREATE INDEX ped_ix_anexos_evidencia ON ped_anexos(evidencia_id);

CREATE TABLE ped_validacoes (
  id TEXT PRIMARY KEY,
  alvo_tipo TEXT NOT NULL CHECK (alvo_tipo IN ('atividade','etapa_liberacao','etapa_conclusao','conquista')),
  alvo_id TEXT NOT NULL,
  matricula_id TEXT,
  decisao TEXT NOT NULL,
  comentario TEXT,
  excecao INTEGER NOT NULL DEFAULT 0,
  justificativa TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE TABLE ped_conquistas (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  titulo TEXT NOT NULL,
  situacao_anterior TEXT, acao_aplicada TEXT, evidencia TEXT, resultado_percebido TEXT,
  data TEXT NOT NULL,
  validada INTEGER NOT NULL DEFAULT 0, validada_por TEXT, validada_em TEXT,
  visivel_aluna INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_pausas (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  inicio TEXT NOT NULL, fim TEXT,
  motivo TEXT NOT NULL,
  decisao_prazos TEXT NOT NULL DEFAULT 'pendente' CHECK (decisao_prazos IN ('pendente','manter','estender')),
  dias_extensao INTEGER, mover_previsoes INTEGER NOT NULL DEFAULT 0,
  decisao_justificativa TEXT, decidido_por TEXT, decidido_em TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_feedbacks (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  data TEXT NOT NULL, responsavel_id TEXT REFERENCES usuario(id),
  feedback TEXT NOT NULL, acao_acompanhamento TEXT,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_anotacoes (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('operacional','pedagogica')),
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_decisoes_pendentes (
  id TEXT PRIMARY KEY,
  questao TEXT NOT NULL, impacto TEXT, responsavel TEXT,
  situacao TEXT NOT NULL DEFAULT 'aberta' CHECK (situacao IN ('aberta','em_analise','decidida')),
  decisao TEXT, data_decisao TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);

CREATE TABLE ped_auditoria (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL, entidade_id TEXT NOT NULL,
  acao TEXT NOT NULL,
  pessoa_id TEXT, matricula_id TEXT,
  dados TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL
);

CREATE INDEX ped_ix_auditoria_matricula ON ped_auditoria(matricula_id);

CREATE INDEX ped_ix_auditoria_pessoa ON ped_auditoria(pessoa_id);

CREATE UNIQUE INDEX ped_ux_pessoas_codigo ON ped_alunas(codigo);

CREATE TABLE ped_turmas (
          id TEXT PRIMARY KEY, nome TEXT NOT NULL, descricao TEXT, data_inicio TEXT,
          ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );

CREATE TABLE ped_diagnosticos (
          id TEXT PRIMARY KEY,
          matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
          versao TEXT NOT NULL CHECK (versao IN ('inicio','fim')),
          area TEXT NOT NULL CHECK (area IN ('situacao','objetivos','desafios','expectativas')),
          conteudo TEXT NOT NULL,
          criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT,
          UNIQUE (matricula_id, versao, area)
        );

CREATE TABLE ped_metas (
          id TEXT PRIMARY KEY,
          matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
          nome TEXT NOT NULL, unidade TEXT,
          valor_inicial REAL NOT NULL, valor_alvo REAL NOT NULL, valor_atual REAL,
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );

CREATE INDEX ped_ix_metas_matricula ON ped_metas(matricula_id);

CREATE TABLE ped_frases (
          id TEXT PRIMARY KEY, texto TEXT NOT NULL, autoria TEXT,
          ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );

CREATE TABLE ped_links (
          id TEXT PRIMARY KEY, titulo TEXT NOT NULL, url TEXT NOT NULL, categoria TEXT, descricao TEXT,
          destaque_inicio INTEGER NOT NULL DEFAULT 0, ordem INTEGER NOT NULL DEFAULT 0,
          ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );

CREATE TABLE ped_notificacoes (
          id TEXT PRIMARY KEY,
          usuario_id TEXT NOT NULL REFERENCES usuario(id),
          titulo TEXT NOT NULL, detalhe TEXT, link TEXT,
          lida_em TEXT, criado_em TEXT NOT NULL
        , aviso_id TEXT REFERENCES ped_avisos_programados(id));

CREATE INDEX ped_ix_notificacoes_usuario ON ped_notificacoes(usuario_id, criado_em);

CREATE TABLE ped_opcoes_lista (
          id TEXT PRIMARY KEY,
          lista TEXT NOT NULL,
          codigo TEXT,
          nome TEXT NOT NULL,
          cor TEXT NOT NULL DEFAULT 'neutro',
          ordem INTEGER NOT NULL DEFAULT 0,
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT,
          UNIQUE (lista, codigo)
        );

CREATE INDEX ped_ix_opcoes_lista ON ped_opcoes_lista(lista, ordem);

CREATE TABLE ped_campos_visibilidade (
          campo TEXT PRIMARY KEY,
          visivel_aluna INTEGER NOT NULL DEFAULT 0,
          atualizado_em TEXT NOT NULL, autor_id TEXT
        );

CREATE TABLE ped_avisos_programados (
          id TEXT PRIMARY KEY,
          titulo TEXT NOT NULL,
          detalhe TEXT,
          link TEXT,
          publico TEXT NOT NULL CHECK (publico IN ('aluna','turma','ativas')),
          pessoa_id TEXT REFERENCES ped_alunas(id),
          turma_id TEXT REFERENCES ped_turmas(id),
          inicio TEXT NOT NULL,
          recorrencia TEXT NOT NULL DEFAULT 'nenhuma' CHECK (recorrencia IN ('nenhuma','diaria','semanal','mensal')),
          fim TEXT,
          proximo_envio TEXT,
          envios INTEGER NOT NULL DEFAULT 0,
          ultimo_envio TEXT,
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
        );

CREATE INDEX ped_ix_avisos_proximo ON ped_avisos_programados(ativo, proximo_envio);

-- ---------------------------------------------------------------------
-- Visões de leitura (nada é copiado)
-- ---------------------------------------------------------------------

-- Aluna com os dados de identidade vindos de Clientes (pessoa).
CREATE VIEW ped_pessoas AS
SELECT a.*, p.nome AS nome, p.email AS email, p.telefone AS telefone, p.cpf AS cpf
FROM ped_alunas a JOIN pessoa p ON p.id = a.id;

-- Quem é quem no sistema pedagógico, para mostrar nomes e escolher responsáveis.
-- Equipe: membro do backoffice; o perfil vem de membro.perfil_pedagogico (administrador do backoffice
-- sem perfil escolhido = admin). Alunas: contas do Portal (cliente) que não são da equipe.
CREATE VIEW ped_usuarios AS
SELECT m.usuario_id AS id, m.nome AS nome, m.email AS email,
       COALESCE(m.perfil_pedagogico, CASE WHEN EXISTS (SELECT 1 FROM json_each(m.papeis) j WHERE j.value = 'admin') THEN 'admin' END) AS perfil,
       NULL AS pessoa_id,
       (SELECT pr.id FROM ped_profissionais pr WHERE pr.usuario_id = m.usuario_id) AS profissional_id,
       CASE WHEN COALESCE(m.perfil_pedagogico, CASE WHEN EXISTS (SELECT 1 FROM json_each(m.papeis) j WHERE j.value = 'admin') THEN 'admin' END) IS NULL THEN 0 ELSE 1 END AS ativo
FROM membro m
UNION ALL
SELECT c.usuario_id, p.nome, u.email, 'aluna', c.pessoa_id, NULL, 1
FROM cliente c JOIN usuario u ON u.id = c.usuario_id JOIN pessoa p ON p.id = c.pessoa_id
WHERE NOT EXISTS (SELECT 1 FROM membro m WHERE m.usuario_id = c.usuario_id);

-- Conta do Portal de cada aluna (inclusive de quem também é da equipe): usada para os avisos do sino.
CREATE VIEW ped_acessos_aluna AS
SELECT c.usuario_id AS usuario_id, c.pessoa_id AS pessoa_id, u.email AS email
FROM cliente c JOIN usuario u ON u.id = c.usuario_id;

-- Listas iniciais, campos visíveis à aluna e permissões padrão por perfil.
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('f5916b45-9250-43fe-adef-c73995f735bd', 'status_aluna', 'a_iniciar', 'A iniciar', 'info', 1, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('e2acd861-127c-4e8a-9b24-e3f6cd301be9', 'status_aluna', 'ativa', 'Ativa', 'sucesso', 2, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('1b5f0ddd-4407-4fb9-8503-b36f0a24ee9a', 'status_aluna', 'pausada', 'Pausada', 'alerta', 3, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('2ed793af-fb58-43ce-bd33-7eaaba3582af', 'status_aluna', 'concluida', 'Concluída', 'neutro', 4, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('6dda33d4-c72b-4895-b1a3-b2e2cfc46a21', 'status_aluna', 'cancelada', 'Cancelada', 'perigo', 5, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('dbb0977d-32d2-4789-90bc-93a2b83af821', 'saude', 'saudavel', 'Saudável', 'sucesso', 1, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('12088a7f-946a-4d0d-b894-b4d4449c2db1', 'saude', 'atencao', 'Atenção', 'alerta', 2, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('1c47c746-86c3-4194-87de-5fa06def6f76', 'saude', 'critico', 'Crítico', 'perigo', 3, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('8509eeb1-f3ce-415f-888c-41451ccd0bc1', 'engajamento', 'alto', 'Alto', 'sucesso', 1, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('381cfe98-ca5c-457b-9b36-afd23fc36f2c', 'engajamento', 'medio', 'Médio', 'alerta', 2, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_opcoes_lista (id, lista, codigo, nome, cor, ordem, criado_em, atualizado_em) VALUES ('b6ca0958-0025-474b-924b-a35c1bf139da', 'engajamento', 'baixo', 'Baixo', 'perigo', 3, '2026-11-09T00:00:00.000Z', '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('nome', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('email', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('telefone', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('cidade', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('empresa', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('segmento', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('subsegmento', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('redes', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('data_entrada', 1, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('responsavel', 0, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('status', 0, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('saude', 0, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('engajamento', 0, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('em_risco', 0, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_campos_visibilidade (campo, visivel_aluna, atualizado_em) VALUES ('observacao', 0, '2026-11-09T00:00:00.000Z');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'alunas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'alunas:todas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'alunas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'matriculas:criar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'comercial:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'comercial:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'obrigacoes:ajustar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'matriculas:decidir');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'onboarding:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'entregas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'entregas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'entregas:realizar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'agenda:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'notas:internas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'notas:pedagogicas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'jornada:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'jornada:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'jornada:validar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'pedagogico:configurar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'conquistas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'conquistas:validar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'indicadores:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'config:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'avisos:enviar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'decisoes:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'auditoria:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('admin', 'usuarios:admin');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'alunas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'alunas:todas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'alunas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'matriculas:criar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'comercial:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'comercial:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'obrigacoes:ajustar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'matriculas:decidir');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'onboarding:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'entregas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'entregas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'entregas:realizar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'agenda:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'notas:internas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'notas:pedagogicas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'jornada:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'jornada:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'jornada:validar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'pedagogico:configurar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'conquistas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'conquistas:validar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'indicadores:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'config:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'avisos:enviar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'decisoes:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('coordenacao', 'auditoria:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'alunas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'alunas:todas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'avisos:enviar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'alunas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'matriculas:criar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'comercial:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'onboarding:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'entregas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'entregas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'entregas:realizar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'agenda:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'notas:internas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'jornada:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'jornada:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'conquistas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'indicadores:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('suporte', 'auditoria:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'alunas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'entregas:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'entregas:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'entregas:realizar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'agenda:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'notas:internas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'notas:pedagogicas');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'jornada:ver');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'jornada:editar');
INSERT INTO ped_perfil_permissoes (perfil, permissao) VALUES ('mentora', 'conquistas:editar');
