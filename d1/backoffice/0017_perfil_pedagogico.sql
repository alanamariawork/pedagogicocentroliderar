-- =====================================================================
-- Sistema pedagógico (Produtos & Entrega): perfil da pessoa da equipe no sistema pedagógico.
--
-- Só acrescenta duas colunas, nulas para todo mundo que já existe (ninguém ganha acesso sozinho).
-- O valor é copiado de acesso_permitido para membro no primeiro login, como os papéis.
-- Perfis: admin, coordenacao, mentora, suporte. A aluna não usa esta coluna: ela é uma `cliente`.
-- =====================================================================
alter table membro add column perfil_pedagogico text
  check (perfil_pedagogico is null or perfil_pedagogico in ('admin', 'coordenacao', 'mentora', 'suporte'));
alter table acesso_permitido add column perfil_pedagogico text
  check (perfil_pedagogico is null or perfil_pedagogico in ('admin', 'coordenacao', 'mentora', 'suporte'));
