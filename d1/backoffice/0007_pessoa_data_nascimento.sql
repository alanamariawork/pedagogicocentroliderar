-- Data de nascimento no cadastro da pessoa (AAAA-MM-DD).
-- Opcional no banco: cadastros antigos, credenciamento e Portal continuam valendo sem ela.
-- A obrigatoriedade na hora da venda é regra da tela de nova inscrição, não do esquema.
-- ADD COLUMN não recria a tabela: seguro sobre os dados existentes (ficam com null).
alter table pessoa add column data_nascimento text
  check (data_nascimento is null or date(data_nascimento) = data_nascimento);
