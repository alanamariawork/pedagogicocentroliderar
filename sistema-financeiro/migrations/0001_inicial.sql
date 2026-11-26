-- Sistema de controle de pagamento das alunas – Centro Liderar
-- Base de produção começa VAZIA. Dados fictícios só no ambiente local (scripts/dados-ficticios.sql).

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin','financeiro','comercial','juridico','consulta')),
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  expira_em TEXT NOT NULL
);

CREATE TABLE tentativas_login (
  email TEXT NOT NULL,
  quando TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE alunas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  situacao_mentoria TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao_mentoria IN ('ativa','encerrada','pausada','cancelada')),
  responsavel TEXT NOT NULL DEFAULT 'financeiro' CHECK (responsavel IN ('financeiro','juridico')),
  promessa_ate TEXT,
  em_analise_jaciara INTEGER NOT NULL DEFAULT 0,
  obs TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contratacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aluna_id INTEGER NOT NULL REFERENCES alunas(id),
  curso TEXT NOT NULL,
  data_venda TEXT,
  valor_total REAL NOT NULL DEFAULT 0,
  condicao_negociada TEXT,          -- texto original do sistema de vendas
  vendedora TEXT,
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('sistema','evento','planilha','manual')),
  situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa','renegociada','quitada','cancelada')),
  contratacao_origem_id INTEGER REFERENCES contratacoes(id),
  saldo_transferido REAL NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE parcelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contratacao_id INTEGER NOT NULL REFERENCES contratacoes(id),
  numero TEXT NOT NULL,             -- "Entrada", "2/6"
  vencimento TEXT NOT NULL,         -- AAAA-MM-DD
  valor REAL NOT NULL,
  forma TEXT NOT NULL DEFAULT 'pix' CHECK (forma IN ('pix','boleto_c6','boleto_stone','cartao','cartao_recorrente','link','outra')),
  quem_gera TEXT,                   -- ex.: Elayne (link de pagamento)
  link_pagamento TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','a_conferir','transferida','cancelada')),
  valor_pago REAL NOT NULL DEFAULT 0,
  pago_em TEXT,
  obs TEXT
);
CREATE INDEX idx_parcelas_venc ON parcelas(vencimento, status);

CREATE TABLE transacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,       -- E2E do Pix, nosso número, NSU, ou chave manual
  data TEXT NOT NULL,
  valor REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'a_conferir' CHECK (status IN ('confirmada','a_conferir','estornada')),
  aluna_id INTEGER REFERENCES alunas(id),
  parcela_id INTEGER REFERENCES parcelas(id),
  pagador TEXT,
  obs TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE evidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transacao_id INTEGER NOT NULL REFERENCES transacoes(id),
  fonte TEXT NOT NULL CHECK (fonte IN ('c6','stone','c6pay','conta_azul','comprovante','planilha','manual')),
  referencia TEXT,
  detalhe TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (transacao_id, fonte, referencia)
);

CREATE TABLE mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,       -- aluna|parcelas|tipo
  aluna_id INTEGER REFERENCES alunas(id),
  parcela_ids TEXT,
  tipo TEXT NOT NULL,               -- lembrete, pedido_link, link, vencida, atraso
  destino TEXT NOT NULL,            -- aluna ou Elayne
  telefone TEXT,
  texto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparada' CHECK (status IN ('preparada','bloqueada','enviada','sem_confirmacao','falhou')),
  motivo TEXT,
  data_prevista TEXT NOT NULL,
  atualizado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE relatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('dia','inadimplencia')),
  data TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tipo, data)
);

CREATE TABLE decisoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aluna_id INTEGER REFERENCES alunas(id),
  texto TEXT NOT NULL,
  decidido_por TEXT NOT NULL,
  data TEXT NOT NULL,
  evidencia TEXT,
  registrado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE autorizacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria TEXT NOT NULL,
  escopo TEXT NOT NULL,
  limites TEXT,
  valida_de TEXT,
  valida_ate TEXT,
  autorizado_por TEXT NOT NULL,
  evidencia TEXT,
  situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa','suspensa','vencida'))
);

CREATE TABLE regras (
  codigo TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','definida')),
  valor TEXT
);

CREATE TABLE configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE execucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  quando TEXT NOT NULL DEFAULT (datetime('now')),
  resumo TEXT,
  por TEXT
);

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL DEFAULT (datetime('now')),
  usuario TEXT,
  acao TEXT NOT NULL,
  entidade TEXT,
  entidade_id TEXT,
  detalhe TEXT
);

INSERT INTO regras (codigo, descricao, situacao, valor) VALUES
 ('R1','Corte de inadimplência (atraso superior a um mês)','pendente','30 dias da parcela mais antiga (provisório)'),
 ('R2','Contatos depois da cadência D-1, D+1, D+3','pendente','Sem mensagem automática depois da D+3'),
 ('R3','Retomada da cobrança depois de promessa de pagamento','pendente','Envio bloqueado enquanto houver promessa'),
 ('R4','Cobrar enquanto Jaciara analisa o caso','pendente','Envio bloqueado durante a análise'),
 ('R5','Mentoria pausada ou cancelada','pendente','Saldo consultável; nenhuma mensagem'),
 ('R6','Validade da conferência antes do envio','pendente','Só com conferência do mesmo dia'),
 ('R7','Conciliado no Conta Azul basta como prova?','pendente','Evidência, não prova; vale C6/Stone');

INSERT INTO configuracoes (chave, valor) VALUES
 ('elayne_nome','Elayne Rocha GM'),
 ('elayne_telefone','558694238708'),
 ('grupo_jace',''),
 ('corte_inadimplencia_dias','30'),
 ('ultima_conferencia','');
