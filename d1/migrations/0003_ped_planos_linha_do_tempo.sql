-- =====================================================================
-- Planos oficiais do Diamante Business (4, 6 e 12 meses) e aulas por mês do plano.
--
-- Só ACRESCENTA: tabelas novas de aulas e, quando ainda não existem com o mesmo nome, o programa,
-- as profissionais, os tipos de encontro e os três planos. Nada é apagado nem sobrescrito.
-- Durações não foram informadas e ficam vazias (nunca são somadas como zero).
-- =====================================================================

-- Aulas gravadas (Vimeo) de cada mês do plano. Sem programa = valem para todos os programas.
CREATE TABLE ped_aulas (
  id TEXT PRIMARY KEY,
  programa_id TEXT REFERENCES ped_programas(id),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 36),
  titulo TEXT NOT NULL, descricao TEXT,
  video_url TEXT NOT NULL,
  publicado INTEGER NOT NULL DEFAULT 0, ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE INDEX ped_ix_aulas_mes ON ped_aulas(programa_id, mes, publicado, ordem);

-- Quanto de cada aula a aluna já assistiu (o maior ponto alcançado no vídeo, de 0 a 100).
CREATE TABLE ped_aulas_progresso (
  aula_id TEXT NOT NULL REFERENCES ped_aulas(id),
  pessoa_id TEXT NOT NULL REFERENCES ped_alunas(id),
  percentual INTEGER NOT NULL DEFAULT 0 CHECK (percentual BETWEEN 0 AND 100),
  concluida_em TEXT,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (aula_id, pessoa_id)
);

-- Programa
INSERT INTO ped_programas (id, nome, descricao, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8000-000000000001', 'Diamante Business', 'Programa de acompanhamento do Centro Liderar.', 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_programas WHERE lower(trim(nome)) = 'diamante business');

-- Profissionais citadas nos planos
INSERT INTO ped_profissionais (id, nome, especialidade, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8001-000000000001', 'Jaciara Mendes', 'Mentorias individuais', 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_profissionais WHERE lower(trim(nome)) = lower('Jaciara Mendes'));
INSERT INTO ped_profissionais (id, nome, especialidade, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8001-000000000002', 'Thallyta Medeiros', 'Análise do modelo de negócio', 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_profissionais WHERE lower(trim(nome)) = lower('Thallyta Medeiros'));
INSERT INTO ped_profissionais (id, nome, especialidade, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8001-000000000003', 'Leonardo Mendes', 'Consultoria financeira', 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_profissionais WHERE lower(trim(nome)) = lower('Leonardo Mendes'));

-- Tipos de encontro dos planos (individual = a aluna marca horário pelo portal)
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000001', 'Mentoria individual com Jaciara Mendes', NULL, 1, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Mentoria individual com Jaciara Mendes'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000002', 'Aprende & Age', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Aprende & Age'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000003', 'Pense Financeiro', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Pense Financeiro'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000004', 'Destrave da Mente', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave da Mente'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000005', 'Posicionamento e Branding', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Posicionamento e Branding'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000006', 'Vendas e Instagram', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Vendas e Instagram'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000007', 'Destrave de IA', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave de IA'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000008', 'Check-in Diamante', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Check-in Diamante'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000009', 'Análise individual do Modelo de Negócio', NULL, 1, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Análise individual do Modelo de Negócio'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000010', 'Workshop de Perfil Comportamental', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop de Perfil Comportamental'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000011', 'Planejamento Estratégico', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Planejamento Estratégico'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000012', 'Consultoria Financeira individual', NULL, 1, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Consultoria Financeira individual'));
INSERT INTO ped_tipos_entregavel (id, nome, duracao_padrao_min, individual, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8002-000000000013', 'Workshop Ativa Casal', NULL, 0, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop Ativa Casal'));

-- Diamante Business — 4 meses de acompanhamento
INSERT INTO ped_pacotes (id, programa_id, nome, descricao, duracao_meses, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_programas WHERE lower(trim(nome)) = 'diamante business' ORDER BY criado_em LIMIT 1), 'Diamante Business — 4 meses de acompanhamento', 'Acompanhamento, suporte, comunidade, plataformas e LídIA. Experiências presenciais e bônus conforme calendário e condições confirmadas. Total: 25 encontros em 4 meses.', 4, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_pacotes WHERE lower(trim(nome)) = lower('Diamante Business — 4 meses de acompanhamento'));
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000001', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Mentoria individual com Jaciara Mendes') ORDER BY criado_em LIMIT 1), 'Mentorias individuais com Jaciara Mendes', 2, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Jaciara Mendes') ORDER BY criado_em LIMIT 1), NULL, 'pacote', NULL, 1
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000002', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Aprende & Age') ORDER BY criado_em LIMIT 1), 'Encontros Aprende & Age', 4, NULL, NULL, 'pacote', NULL, 2
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000003', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Pense Financeiro') ORDER BY criado_em LIMIT 1), 'Encontros Pense Financeiro', 4, NULL, NULL, 'pacote', NULL, 3
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000004', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave da Mente') ORDER BY criado_em LIMIT 1), 'Encontros Destrave da Mente', 4, NULL, NULL, 'pacote', NULL, 4
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000005', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Posicionamento e Branding') ORDER BY criado_em LIMIT 1), 'Encontros de Posicionamento e Branding', 3, NULL, NULL, 'pacote', NULL, 5
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000006', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Vendas e Instagram') ORDER BY criado_em LIMIT 1), 'Encontros de Vendas e Instagram', 3, NULL, NULL, 'pacote', 'Dois temas no mesmo encontro.', 6
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000007', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave de IA') ORDER BY criado_em LIMIT 1), 'Encontros Destrave de IA', 3, NULL, NULL, 'pacote', NULL, 7
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000008', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Check-in Diamante') ORDER BY criado_em LIMIT 1), 'Check-in Diamante', 1, NULL, NULL, 'pacote', NULL, 8
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000009', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Análise individual do Modelo de Negócio') ORDER BY criado_em LIMIT 1), 'Análise individual do Modelo de Negócio com Thallyta Medeiros', 1, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Thallyta Medeiros') ORDER BY criado_em LIMIT 1), NULL, 'pacote', NULL, 9
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000010', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop de Perfil Comportamental') ORDER BY criado_em LIMIT 1), 'Workshop de Perfil Comportamental (online, em grupo)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 10
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000011', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Planejamento Estratégico') ORDER BY criado_em LIMIT 1), 'Planejamento Estratégico (online, em grupo)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 11
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000012', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Consultoria Financeira individual') ORDER BY criado_em LIMIT 1), 'Consultoria Financeira individual com Leonardo Mendes (online)', 1, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Leonardo Mendes') ORDER BY criado_em LIMIT 1), NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 12
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000400000013', 'd1a00000-0000-4000-8003-000000000004', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop Ativa Casal') ORDER BY criado_em LIMIT 1), 'Workshop Ativa Casal (presencial)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 13
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000004');

-- Diamante Business — 6 meses de acompanhamento
INSERT INTO ped_pacotes (id, programa_id, nome, descricao, duracao_meses, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_programas WHERE lower(trim(nome)) = 'diamante business' ORDER BY criado_em LIMIT 1), 'Diamante Business — 6 meses de acompanhamento', 'Acompanhamento individual, suporte, comunidade, plataformas, grupo individual e LídIA. Experiências presenciais e bônus conforme calendário e condições confirmadas. Total: 35 encontros em 6 meses.', 6, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_pacotes WHERE lower(trim(nome)) = lower('Diamante Business — 6 meses de acompanhamento'));
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000001', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Mentoria individual com Jaciara Mendes') ORDER BY criado_em LIMIT 1), 'Mentorias individuais com Jaciara Mendes', 3, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Jaciara Mendes') ORDER BY criado_em LIMIT 1), NULL, 'pacote', NULL, 1
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000002', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Aprende & Age') ORDER BY criado_em LIMIT 1), 'Encontros Aprende & Age', 6, NULL, NULL, 'pacote', NULL, 2
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000003', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Pense Financeiro') ORDER BY criado_em LIMIT 1), 'Encontros Pense Financeiro', 6, NULL, NULL, 'pacote', NULL, 3
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000004', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave da Mente') ORDER BY criado_em LIMIT 1), 'Encontros Destrave da Mente', 6, NULL, NULL, 'pacote', NULL, 4
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000005', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Posicionamento e Branding') ORDER BY criado_em LIMIT 1), 'Encontros de Posicionamento e Branding', 4, NULL, NULL, 'pacote', NULL, 5
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000006', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Vendas e Instagram') ORDER BY criado_em LIMIT 1), 'Encontros de Vendas e Instagram', 4, NULL, NULL, 'pacote', NULL, 6
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000007', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave de IA') ORDER BY criado_em LIMIT 1), 'Encontros Destrave de IA', 4, NULL, NULL, 'pacote', NULL, 7
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000008', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Check-in Diamante') ORDER BY criado_em LIMIT 1), 'Check-in Diamante', 1, NULL, NULL, 'pacote', NULL, 8
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000009', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Análise individual do Modelo de Negócio') ORDER BY criado_em LIMIT 1), 'Análise individual do Modelo de Negócio com Thallyta Medeiros', 1, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Thallyta Medeiros') ORDER BY criado_em LIMIT 1), NULL, 'pacote', NULL, 9
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000010', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop de Perfil Comportamental') ORDER BY criado_em LIMIT 1), 'Workshop de Perfil Comportamental (online, em grupo)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 10
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000011', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Planejamento Estratégico') ORDER BY criado_em LIMIT 1), 'Planejamento Estratégico (online, em grupo)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 11
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000012', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Consultoria Financeira individual') ORDER BY criado_em LIMIT 1), 'Consultoria Financeira individual com Leonardo Mendes (online)', 1, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Leonardo Mendes') ORDER BY criado_em LIMIT 1), NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 12
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-000600000013', 'd1a00000-0000-4000-8003-000000000006', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop Ativa Casal') ORDER BY criado_em LIMIT 1), 'Workshop Ativa Casal (presencial)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 13
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000006');

-- Diamante Business — 12 meses de acompanhamento
INSERT INTO ped_pacotes (id, programa_id, nome, descricao, duracao_meses, ativo, criado_em, atualizado_em)
SELECT 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_programas WHERE lower(trim(nome)) = 'diamante business' ORDER BY criado_em LIMIT 1), 'Diamante Business — 12 meses de acompanhamento', 'Acompanhamento individual, suporte, comunidade, plataformas, grupo individual e LídIA. Experiências e bônus conforme calendário oficial. Total: 67 encontros em 12 meses.', 12, 1, '2026-11-12T00:00:00.000Z', '2026-11-12T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM ped_pacotes WHERE lower(trim(nome)) = lower('Diamante Business — 12 meses de acompanhamento'));
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000001', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Mentoria individual com Jaciara Mendes') ORDER BY criado_em LIMIT 1), 'Mentorias individuais com Jaciara Mendes', 5, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Jaciara Mendes') ORDER BY criado_em LIMIT 1), NULL, 'pacote', NULL, 1
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000002', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Aprende & Age') ORDER BY criado_em LIMIT 1), 'Encontros Aprende & Age', 12, NULL, NULL, 'pacote', NULL, 2
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000003', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Pense Financeiro') ORDER BY criado_em LIMIT 1), 'Encontros Pense Financeiro', 12, NULL, NULL, 'pacote', NULL, 3
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000004', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave da Mente') ORDER BY criado_em LIMIT 1), 'Encontros Destrave da Mente', 12, NULL, NULL, 'pacote', NULL, 4
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000005', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Posicionamento e Branding') ORDER BY criado_em LIMIT 1), 'Encontros de Posicionamento e Branding', 8, NULL, NULL, 'pacote', NULL, 5
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000006', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Vendas e Instagram') ORDER BY criado_em LIMIT 1), 'Encontros de Vendas e Instagram', 8, NULL, NULL, 'pacote', NULL, 6
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000007', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Destrave de IA') ORDER BY criado_em LIMIT 1), 'Encontros Destrave de IA', 8, NULL, NULL, 'pacote', NULL, 7
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000008', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Check-in Diamante') ORDER BY criado_em LIMIT 1), 'Check-in Diamante', 1, NULL, NULL, 'pacote', NULL, 8
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000009', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Análise individual do Modelo de Negócio') ORDER BY criado_em LIMIT 1), 'Análise individual do Modelo de Negócio com Thallyta Medeiros', 1, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Thallyta Medeiros') ORDER BY criado_em LIMIT 1), NULL, 'pacote', NULL, 9
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000010', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop de Perfil Comportamental') ORDER BY criado_em LIMIT 1), 'Workshop de Perfil Comportamental (online, em grupo)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 10
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000011', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Planejamento Estratégico') ORDER BY criado_em LIMIT 1), 'Planejamento Estratégico (online, em grupo)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 11
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000012', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Consultoria Financeira individual') ORDER BY criado_em LIMIT 1), 'Consultoria Financeira individual com Leonardo Mendes (online)', 1, (SELECT id FROM ped_profissionais WHERE lower(trim(nome)) = lower('Leonardo Mendes') ORDER BY criado_em LIMIT 1), NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 12
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
INSERT OR IGNORE INTO ped_pacote_itens (id, pacote_id, tipo_id, descricao, quantidade, profissional_id, duracao_min, origem, observacoes, ordem)
SELECT 'd1a00000-0000-4000-8004-001200000013', 'd1a00000-0000-4000-8003-000000000012', (SELECT id FROM ped_tipos_entregavel WHERE lower(trim(nome)) = lower('Workshop Ativa Casal') ORDER BY criado_em LIMIT 1), 'Workshop Ativa Casal (presencial)', 1, NULL, NULL, 'bonus', 'Bônus conforme calendário e condições confirmadas.', 13
WHERE EXISTS (SELECT 1 FROM ped_pacotes WHERE id = 'd1a00000-0000-4000-8003-000000000012');
