-- =====================================================================
-- Avisos às alunas também por e-mail e WhatsApp.
--
-- Cada aviso do sino (ped_notificacoes) de uma aluna gera um envio por canal. O envio nunca
-- depende da gravação do aviso: a fila guarda a situação de cada canal (enviado, falhou com o
-- motivo, não configurado dizendo o que falta) e a equipe pode tentar de novo sem duplicar.
-- Só ACRESCENTA uma tabela e duas configurações; nada é apagado.
-- =====================================================================

CREATE TABLE ped_envios_aviso (
  id TEXT PRIMARY KEY,
  notificacao_id TEXT NOT NULL REFERENCES ped_notificacoes(id),
  pessoa_id TEXT NOT NULL REFERENCES ped_alunas(id),
  canal TEXT NOT NULL CHECK (canal IN ('email','whatsapp')),
  situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','enviado','falhou','nao_configurado','desligado')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  detalhe TEXT, id_externo TEXT,
  proxima_tentativa TEXT, enviado_em TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL,
  UNIQUE (notificacao_id, canal)
);
CREATE INDEX ped_ix_envios_aviso_fila ON ped_envios_aviso(situacao, proxima_tentativa);
CREATE INDEX ped_ix_envios_aviso_pessoa ON ped_envios_aviso(pessoa_id, criado_em);

-- Liga/desliga cada canal (Configurações › Parâmetros). Ligado: envia assim que o canal estiver configurado.
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('avisos_email', '1');
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('avisos_whatsapp', '1');
