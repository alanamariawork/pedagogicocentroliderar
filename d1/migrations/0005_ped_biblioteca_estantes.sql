-- Estantes da Biblioteca do portal e progresso dos vídeos da Biblioteca.
-- Só cria tabelas, uma coluna nova e permissões: nada existente é apagado ou alterado.

-- Estante: agrupa materiais da Biblioteca (arquivos, links e vídeos). Só aparece para a aluna quando publicada.
CREATE TABLE ped_estantes (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  publicada INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  autor_id TEXT
);
CREATE INDEX ped_ix_estantes_publicada ON ped_estantes(publicada, ordem);

-- Material da Biblioteca pode ficar dentro de uma estante (vazio = fora de estante, como antes).
ALTER TABLE ped_conteudos ADD COLUMN estante_id TEXT REFERENCES ped_estantes(id);
CREATE INDEX ped_ix_conteudos_estante ON ped_conteudos(estante_id, publicado, ordem);

-- Quanto de cada vídeo da Biblioteca a aluna já assistiu (o servidor guarda o maior ponto alcançado).
CREATE TABLE ped_conteudos_progresso (
  conteudo_id TEXT NOT NULL REFERENCES ped_conteudos(id),
  pessoa_id TEXT NOT NULL REFERENCES ped_alunas(id),
  percentual INTEGER NOT NULL DEFAULT 0 CHECK (percentual BETWEEN 0 AND 100),
  concluida_em TEXT,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (conteudo_id, pessoa_id)
);
CREATE INDEX ped_ix_conteudos_progresso_pessoa ON ped_conteudos_progresso(pessoa_id);

-- Biblioteca: Administração, Coordenação e Suporte criam estantes e materiais (a Administração pode mudar em Regras de acesso).
INSERT OR IGNORE INTO ped_perfil_permissoes (perfil, permissao) VALUES
  ('admin', 'biblioteca:editar'), ('coordenacao', 'biblioteca:editar'), ('suporte', 'biblioteca:editar');
