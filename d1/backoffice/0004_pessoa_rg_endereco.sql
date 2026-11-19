-- RG e endereço no cadastro da pessoa, ambos opcionais.
-- RG fica como digitado (o formato muda de estado para estado e pode vir com órgão emissor).
-- Endereço é um texto livre: não há uso do sistema que precise dele separado em partes.
-- ADD COLUMN não recria a tabela: seguro sobre os dados existentes (ficam com null).
alter table pessoa add column rg text check (rg is null or length(trim(rg)) between 1 and 30);
alter table pessoa add column endereco text check (endereco is null or length(trim(endereco)) between 1 and 300);
