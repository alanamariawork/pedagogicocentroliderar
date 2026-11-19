-- Mural em formato de feed: tipo de oferta (produto ou serviço), categorias configuráveis, nome do
-- negócio, preço, link externo, detalhes por tipo, imagens (capa, galeria, logo), curtidas e
-- comentários. Só acrescenta colunas, tabelas e registros: nada existente é apagado ou alterado,
-- e as publicações antigas continuam aparecendo (sem imagens, com a categoria antiga).

-- Categorias do mural, configuráveis pela equipe (Conteúdos do portal › Mural).
CREATE TABLE ped_mural_categorias (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativa INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL, autor_id TEXT
);
CREATE UNIQUE INDEX ped_ux_mural_categoria_nome ON ped_mural_categorias(lower(nome));

ALTER TABLE ped_mural ADD COLUMN tipo TEXT CHECK (tipo IN ('produto','servico'));
ALTER TABLE ped_mural ADD COLUMN categoria_id TEXT REFERENCES ped_mural_categorias(id);
ALTER TABLE ped_mural ADD COLUMN negocio_nome TEXT;
ALTER TABLE ped_mural ADD COLUMN preco_centavos INTEGER CHECK (preco_centavos IS NULL OR preco_centavos >= 0);
ALTER TABLE ped_mural ADD COLUMN preco_consultar INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ped_mural ADD COLUMN link_externo TEXT;
-- Detalhes do modelo (JSON): produto → caracteristicas, como_comprar; serviço → atendimento, beneficios, formato, local.
ALTER TABLE ped_mural ADD COLUMN detalhes TEXT;
ALTER TABLE ped_mural ADD COLUMN editada_em TEXT;

-- As publicações antigas de produto ou serviço ganham o tipo correspondente (a categoria antiga fica como está).
UPDATE ped_mural SET tipo = categoria WHERE tipo IS NULL AND categoria IN ('produto','servico');

-- Imagens das publicações (o arquivo fica no R2). Enviadas antes de salvar a publicação ficam
-- soltas (mural_id nulo) e são apagadas depois de 1 dia se não forem usadas. Uma imagem tirada da
-- publicação pela autora fica marcada como 'removida' e deixa de aparecer.
CREATE TABLE ped_mural_imagens (
  id TEXT PRIMARY KEY,
  mural_id TEXT REFERENCES ped_mural(id),
  papel TEXT CHECK (papel IN ('capa','galeria','logo','removida')),
  ordem INTEGER NOT NULL DEFAULT 0,
  chave TEXT NOT NULL, nome TEXT NOT NULL, tipo TEXT NOT NULL, tamanho INTEGER NOT NULL,
  dona_pessoa_id TEXT REFERENCES ped_alunas(id),
  dona_equipe_id TEXT,
  criado_em TEXT NOT NULL
);
CREATE INDEX ped_ix_mural_imagens ON ped_mural_imagens(mural_id, papel, ordem);

-- Uma curtida por pessoa por publicação (a chave primária garante).
CREATE TABLE ped_mural_curtidas (
  mural_id TEXT NOT NULL REFERENCES ped_mural(id),
  pessoa_id TEXT NOT NULL REFERENCES ped_alunas(id),
  criado_em TEXT NOT NULL,
  PRIMARY KEY (mural_id, pessoa_id)
);

-- Comentários e respostas (um nível: a resposta aponta para o comentário principal).
CREATE TABLE ped_mural_comentarios (
  id TEXT PRIMARY KEY,
  mural_id TEXT NOT NULL REFERENCES ped_mural(id),
  pai_id TEXT REFERENCES ped_mural_comentarios(id),
  autora_pessoa_id TEXT REFERENCES ped_alunas(id),
  autora_nome TEXT NOT NULL,
  texto TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo','excluido','removido')),
  editado_em TEXT,
  moderado_por TEXT, moderado_em TEXT, motivo_moderacao TEXT,
  criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
);
CREATE INDEX ped_ix_mural_comentarios ON ped_mural_comentarios(mural_id, criado_em);

-- Categorias iniciais (sugestões; a equipe renomeia, desativa ou cria outras).
INSERT OR IGNORE INTO ped_mural_categorias (id, nome, ordem, criado_em, atualizado_em) VALUES
  ('8d1c0f00-0000-4000-8000-000000000001', 'Moda e acessórios', 1, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000002', 'Beleza e bem-estar', 2, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000003', 'Alimentação', 3, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000004', 'Casa e decoração', 4, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000005', 'Consultoria e mentoria', 5, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000006', 'Educação e cursos', 6, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000007', 'Saúde', 7, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000008', 'Eventos', 8, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z'),
  ('8d1c0f00-0000-4000-8000-000000000009', 'Outros', 99, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z');

-- Pergunta da reunião que ficou em aberto (aparece em Decisões pendentes).
INSERT OR IGNORE INTO ped_decisoes_pendentes (id, questao, impacto, situacao, criado_em, atualizado_em) VALUES
  ('2b0b8a3e-6a43-4f7e-9d0e-1119a0000001', 'O que é o "serviço de finalização"? Finalizar uma compra feita pelo Mural (checkout) ou marcar uma aula como concluída?', 'Até a definição: o Mural aceita link externo de compra (abre o site ou a loja da aluna) e contato direto; não há checkout próprio no Mural. A marcação de aula concluída continua como hoje (vídeo assistido a partir de 90%).', 'aberta', '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:00.000Z');
