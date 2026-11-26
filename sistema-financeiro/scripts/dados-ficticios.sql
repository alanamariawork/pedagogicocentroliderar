-- SÓ PARA AMBIENTE LOCAL (wrangler d1 execute financeiro --local --file scripts/dados-ficticios.sql). Nunca rodar com --remote.
INSERT INTO alunas (id, nome, telefone, situacao_mentoria, responsavel) VALUES
 (1,'[TESTE] Ana Souza','5586900000001','ativa','financeiro'),
 (2,'[TESTE] Bia Lima','5586900000002','ativa','financeiro'),
 (3,'[TESTE] Olívia Reis','5586900000003','ativa','financeiro'),
 (4,'[TESTE] Rita Melo','5586900000004','encerrada','juridico');
INSERT INTO contratacoes (id, aluna_id, curso, data_venda, valor_total, condicao_negociada, origem) VALUES
 (1,1,'Mentoria FIC Diamante','2026-10-01',3000,'3x no Pix, todo dia 10','manual'),
 (2,2,'Curso FIC','2026-09-15',1500,'3x boleto Stone','manual'),
 (3,3,'Mentoria FIC Diamante','2026-11-20',2100,'3x por link de pagamento, a cada 30 dias','manual'),
 (4,4,'Mentoria FIC','2026-03-01',2000,'4x Pix','manual');
INSERT INTO parcelas (contratacao_id, numero, vencimento, valor, forma, status, valor_pago, quem_gera) VALUES
 (1,'1/3','2026-10-10',1000,'pix','paga',1000,NULL),(1,'2/3','2026-11-10',1000,'pix','aberta',0,NULL),(1,'3/3','2026-12-10',1000,'pix','aberta',0,NULL),
 (2,'1/3','2026-10-15',500,'boleto_stone','paga',500,NULL),(2,'2/3','2026-11-25',500,'boleto_stone','aberta',0,NULL),(2,'3/3','2026-11-27',500,'boleto_stone','aberta',0,NULL),
 (3,'1/3','2026-11-27',700,'link','aberta',0,'Elayne'),(3,'2/3','2026-12-27',700,'link','aberta',0,'Elayne'),(3,'3/3','2027-01-26',700,'link','aberta',0,'Elayne'),
 (4,'1/4','2026-04-01',500,'pix','aberta',0,NULL);
