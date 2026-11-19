-- Livro indicado numa ação do Plano de Ação: liga a ação a um material da seção Livros da Biblioteca.
-- No portal, a ação mostra "Ir à Biblioteca", que abre a aba Livros com esse livro em destaque, e
-- de lá o botão "Adquirir um livro" leva à página do produto na Editora Prosperar.
-- Só acrescenta uma coluna opcional: nada existente é apagado ou alterado.
ALTER TABLE ped_acoes ADD COLUMN conteudo_id TEXT REFERENCES ped_conteudos(id);
