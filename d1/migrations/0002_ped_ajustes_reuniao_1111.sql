-- =====================================================================
-- Ajustes da reunião de 11/11/2026 (Diamante Business | Gestão da Jornada).
--
-- Só ACRESCENTA colunas e tabelas ped_ (nada do backoffice é alterado, nada é apagado).
-- Sem dados de demonstração: só configurações iniciais, permissões padrão das novas funções e as
-- decisões que a reunião deixou em aberto.
-- =====================================================================

-- Pilares com cor própria (Ação, Gestão e Escala são identificados por cor na equipe e no portal).
ALTER TABLE ped_pilares ADD COLUMN cor TEXT;

-- Etapa adaptada para uma matrícula: o modelo geral e a jornada das outras alunas não mudam.
ALTER TABLE ped_jornada_etapas ADD COLUMN titulo_personalizado TEXT;
ALTER TABLE ped_jornada_etapas ADD COLUMN objetivo_personalizado TEXT;
ALTER TABLE ped_jornada_etapas ADD COLUMN personalizada_por TEXT REFERENCES usuario(id);
ALTER TABLE ped_jornada_etapas ADD COLUMN personalizada_em TEXT;
-- Atividade adaptada ou retirada só desta matrícula (retirar não apaga: as evidências continuam).
ALTER TABLE ped_atividades ADD COLUMN arquivada INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ped_atividades ADD COLUMN personalizada_por TEXT REFERENCES usuario(id);
ALTER TABLE ped_atividades ADD COLUMN personalizada_em TEXT;

-- E-mail profissional da mentora (agenda). Se vazio, vale o e-mail da conta da equipe vinculada.
ALTER TABLE ped_profissionais ADD COLUMN email TEXT;

-- Confirmação por WhatsApp e evento no Google Agenda de cada agendamento. Uma linha por canal, ação e
-- versão do agendamento (a reserva): tentar de novo usa a mesma linha, sem nova reserva nem envio repetido.
CREATE TABLE ped_integracoes (
  id TEXT PRIMARY KEY,
  ocorrencia_id TEXT NOT NULL REFERENCES ped_ocorrencias(id),
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','google_agenda')),
  acao TEXT NOT NULL CHECK (acao IN ('confirmar','atualizar','cancelar')),
  referencia TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','enviado','falhou','nao_configurado','descartado')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  detalhe TEXT,
  id_externo TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL,
  UNIQUE (ocorrencia_id, canal, acao, referencia)
);
CREATE INDEX ped_ix_integracoes_ocorrencia ON ped_integracoes(ocorrencia_id);

-- Contrato anexado à matrícula. O arquivo fica no R2 (acesso restrito); o mesmo arquivo (mesmo hash)
-- nunca gera um segundo documento.
CREATE TABLE ped_contratos (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  nome TEXT NOT NULL, tipo TEXT NOT NULL, tamanho INTEGER NOT NULL,
  chave TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  dados_extraidos TEXT,
  dados_aplicados TEXT,
  confirmado_por TEXT REFERENCES usuario(id), confirmado_em TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL,
  UNIQUE (matricula_id, hash)
);
-- Item criado a partir de um contrato: a origem (hash do arquivo + linha do contrato) não se repete
-- na mesma matrícula, então aplicar de novo não duplica entregáveis nem bônus.
ALTER TABLE ped_itens_contratados ADD COLUMN contrato_origem TEXT;
CREATE UNIQUE INDEX ped_ux_itens_contrato_origem ON ped_itens_contratados(matricula_id, contrato_origem) WHERE contrato_origem IS NOT NULL;

-- Transcrição do encontro (só área administrativa) e Plano de Ação (rascunho → revisão → publicação).
CREATE TABLE ped_transcricoes (
  id TEXT PRIMARY KEY,
  ocorrencia_id TEXT NOT NULL UNIQUE REFERENCES ped_ocorrencias(id),
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  texto TEXT NOT NULL,
  fonte TEXT NOT NULL DEFAULT 'manual' CHECK (fonte IN ('manual','automatica')),
  autor_id TEXT, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);

CREATE TABLE ped_acoes (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  ocorrencia_id TEXT REFERENCES ped_ocorrencias(id),
  titulo TEXT NOT NULL, descricao TEXT, prazo TEXT,
  situacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho','em_revisao','publicada','arquivada')),
  andamento TEXT NOT NULL DEFAULT 'a_fazer' CHECK (andamento IN ('a_fazer','em_andamento','concluida')),
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','transcricao')),
  revisada_por TEXT, revisada_em TEXT, publicada_por TEXT, publicada_em TEXT,
  autor_id TEXT, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE INDEX ped_ix_acoes_matricula ON ped_acoes(matricula_id, situacao);

-- Vitória enviada pela própria aluna (vai para a fila de validação como as demais).
ALTER TABLE ped_conquistas ADD COLUMN enviada_pela_aluna INTEGER NOT NULL DEFAULT 0;

-- Depoimento da aluna: um único espaço por encontro ou atividade.
CREATE TABLE ped_depoimentos (
  id TEXT PRIMARY KEY,
  matricula_id TEXT NOT NULL REFERENCES ped_matriculas(id),
  alvo_tipo TEXT NOT NULL CHECK (alvo_tipo IN ('encontro','atividade')),
  alvo_id TEXT NOT NULL,
  texto TEXT NOT NULL,
  autor_id TEXT, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL,
  UNIQUE (alvo_tipo, alvo_id)
);

-- Conteúdos publicados no portal: Rotina, Biblioteca (com a categoria Ferramentas) e Livros.
CREATE TABLE ped_conteudos (
  id TEXT PRIMARY KEY,
  secao TEXT NOT NULL CHECK (secao IN ('rotina','biblioteca','livros')),
  categoria TEXT,
  titulo TEXT NOT NULL, descricao TEXT,
  link TEXT, video_url TEXT, compra_url TEXT,
  arquivo_chave TEXT UNIQUE, arquivo_nome TEXT, arquivo_tipo TEXT, arquivo_tamanho INTEGER,
  publicado INTEGER NOT NULL DEFAULT 0, ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE INDEX ped_ix_conteudos_secao ON ped_conteudos(secao, publicado, ordem);

-- Mural de oportunidades: o contato publicado é só o escolhido para aquela publicação.
CREATE TABLE ped_mural (
  id TEXT PRIMARY KEY,
  autora_pessoa_id TEXT REFERENCES ped_alunas(id),
  autora_equipe_id TEXT REFERENCES usuario(id),
  autora_nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('oportunidade','produto','servico')),
  titulo TEXT NOT NULL, descricao TEXT NOT NULL,
  contato_canal TEXT NOT NULL CHECK (contato_canal IN ('whatsapp','email','instagram','site','outro')),
  contato_valor TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'pendente' CHECK (situacao IN ('pendente','publicada','recusada','arquivada')),
  moderada_por TEXT, moderada_em TEXT, motivo_moderacao TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE INDEX ped_ix_mural_situacao ON ped_mural(situacao, criado_em);

-- Configurações iniciais (editáveis em Configurações).
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('janela_termino_dias', '45');
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('agenda_antecedencia_horas', '24');
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('agenda_dias_a_frente', '30');
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('mural_publicacao', 'moderada');
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('mural_visibilidade', 'ativas');

-- Permissões das novas funções (a Administração pode mudar em Regras de acesso).
INSERT OR IGNORE INTO ped_perfil_permissoes (perfil, permissao) VALUES
  ('admin', 'transcricoes:ver'), ('admin', 'acoes:editar'), ('admin', 'acoes:publicar'), ('admin', 'contratos:ver'), ('admin', 'conteudos:editar'), ('admin', 'mural:moderar'),
  ('coordenacao', 'transcricoes:ver'), ('coordenacao', 'acoes:editar'), ('coordenacao', 'acoes:publicar'), ('coordenacao', 'contratos:ver'), ('coordenacao', 'conteudos:editar'), ('coordenacao', 'mural:moderar'),
  ('mentora', 'transcricoes:ver'), ('mentora', 'acoes:editar'),
  ('suporte', 'mural:moderar');

-- Decisões que a reunião deixou em aberto (aparecem em Decisões pendentes).
INSERT OR IGNORE INTO ped_decisoes_pendentes (id, questao, impacto, situacao, criado_em, atualizado_em) VALUES
  ('2b0b8a3e-6a43-4f7e-9d0e-1111a0000001', 'Qual presença acompanhar: mentorias individuais, aulas coletivas ou as duas? Como comprovar a participação?', 'Um horário reservado ou um vídeo disponível não comprovam participação. Hoje só o encontro marcado como realizado pela equipe registra presença individual; aulas coletivas não têm registro.', 'aberta', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('2b0b8a3e-6a43-4f7e-9d0e-1111a0000002', 'Quem revisa e publica o Plano de Ação gerado a partir da transcrição?', 'Proposta adotada até a decisão: rascunho → revisão pela equipe autorizada (permissão "Publicar ações") → publicação para a aluna.', 'aberta', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('2b0b8a3e-6a43-4f7e-9d0e-1111a0000003', 'Mural: quem publica direto, quem vê e se há moderação?', 'Padrão adotado: as alunas enviam e a equipe aprova antes de publicar; só alunas com matrícula ativa veem. Ajustável em Configurações.', 'aberta', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('2b0b8a3e-6a43-4f7e-9d0e-1111a0000004', 'Quem recebe a confirmação por WhatsApp e o convite do Google Agenda de cada marcação?', 'Sem essa definição, os envios ficam como "não configurado" e o agendamento interno segue normalmente.', 'aberta', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('2b0b8a3e-6a43-4f7e-9d0e-1111a0000005', 'O que significa "visualização do prazo" no portal?', 'Até a decisão: o Início mostra a vigência do contrato e a Jornada mostra o prazo individual da etapa, quando cadastrado.', 'aberta', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z'),
  ('2b0b8a3e-6a43-4f7e-9d0e-1111a0000006', 'E-commerce dos livros: catálogo, pagamento e entrega', 'O backoffice tem a Loja (venda presencial/PDV), sem venda online. O portal mostra os livros com o link de compra quando houver; não há PDF dos livros.', 'aberta', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z');
