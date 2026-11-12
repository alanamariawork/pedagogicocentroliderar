-- Link do Google Meet de cada encontro (criado junto com o evento no Google Agenda da mentora).
-- Só acrescenta uma coluna e duas configurações: nada existente é apagado ou alterado.
ALTER TABLE ped_ocorrencias ADD COLUMN link_reuniao TEXT;

-- '1' = o evento no Google Agenda já sai com link do Google Meet.
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('agenda_google_meet', '1');
-- '1' = a aluna é convidada para o evento (o Google manda o convite para o e-mail dela em Clientes).
INSERT OR IGNORE INTO ped_configuracoes (chave, valor) VALUES ('agenda_convidar_aluna', '0');
