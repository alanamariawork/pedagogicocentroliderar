-- 0002 (27/11/2026): forma de pagamento fiel à planilha e lotes de importação.
-- 1) Novas formas: boleto (banco não informado), cartão (não informado), a conferir.
-- 2) Texto original da planilha em cada parcela (forma_planilha).
-- 3) Lote de importação em alunas, contratações e parcelas, para desfazer uma carga inteira.
PRAGMA defer_foreign_keys = on;

CREATE TABLE importacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL DEFAULT (datetime('now')),
  descricao TEXT,
  por TEXT,
  autorizacao TEXT,
  n_alunas INTEGER NOT NULL DEFAULT 0,
  n_contratacoes INTEGER NOT NULL DEFAULT 0,
  n_parcelas INTEGER NOT NULL DEFAULT 0,
  situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa','desfeita')),
  desfeita_em TEXT,
  desfeita_por TEXT,
  desfeita_autorizacao TEXT
);

ALTER TABLE alunas ADD COLUMN lote_id INTEGER REFERENCES importacoes(id);
ALTER TABLE contratacoes ADD COLUMN lote_id INTEGER REFERENCES importacoes(id);

CREATE TABLE parcelas_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contratacao_id INTEGER NOT NULL REFERENCES contratacoes(id),
  numero TEXT NOT NULL,
  vencimento TEXT NOT NULL,
  valor REAL NOT NULL,
  forma TEXT NOT NULL DEFAULT 'pix' CHECK (forma IN ('pix','boleto','boleto_c6','boleto_stone','cartao','cartao_ni','cartao_recorrente','link','a_conferir','outra')),
  forma_planilha TEXT,              -- texto original da coluna "forma" da planilha
  quem_gera TEXT,
  link_pagamento TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','paga','a_conferir','transferida','cancelada')),
  valor_pago REAL NOT NULL DEFAULT 0,
  pago_em TEXT,
  obs TEXT,
  lote_id INTEGER REFERENCES importacoes(id)
);
INSERT INTO parcelas_nova (id, contratacao_id, numero, vencimento, valor, forma, quem_gera, link_pagamento, status, valor_pago, pago_em, obs)
  SELECT id, contratacao_id, numero, vencimento, valor, forma, quem_gera, link_pagamento, status, valor_pago, pago_em, obs FROM parcelas;
DROP TABLE parcelas;
ALTER TABLE parcelas_nova RENAME TO parcelas;
CREATE INDEX idx_parcelas_venc ON parcelas(vencimento, status);
CREATE INDEX idx_parcelas_lote ON parcelas(lote_id);
CREATE INDEX idx_contratacoes_lote ON contratacoes(lote_id);
CREATE INDEX idx_alunas_lote ON alunas(lote_id);
