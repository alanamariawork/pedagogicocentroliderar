create trigger venda_loja_protegida before update on venda_loja
when old.status = 'cancelada'
  or (old.status = 'concluida' and (
        new.status not in ('concluida', 'cancelada')
        or new.numero is not old.numero
        or new.organizacao_id is not old.organizacao_id
        or new.local_estoque_id is not old.local_estoque_id
        or new.cliente_id is not old.cliente_id
        or new.canal is not old.canal
        or new.contexto is not old.contexto
        or new.evento_id is not old.evento_id
        or new.subtotal_centavos is not old.subtotal_centavos
        or new.desconto_centavos is not old.desconto_centavos
        or new.total_centavos is not old.total_centavos
        or new.observacao is not old.observacao
        or new.criado_por is not old.criado_por
        or new.criado_em is not old.criado_em
        or new.concluido_por is not old.concluido_por
        or new.concluido_em is not old.concluido_em
      ))
begin
  select raise(abort, 'VENDA_LOJA_IMUTAVEL');
end;
create trigger venda_loja_sem_exclusao before delete on venda_loja
when old.status in ('concluida', 'cancelada')
begin
  select raise(abort, 'VENDA_LOJA_IMUTAVEL');
end;
create trigger venda_loja_item_protegido before update on venda_loja_item
when (select status from venda_loja where id = old.venda_loja_id) <> 'rascunho'
begin
  select raise(abort, 'VENDA_LOJA_IMUTAVEL');
end;
create trigger venda_loja_item_sem_exclusao before delete on venda_loja_item
when (select status from venda_loja where id = old.venda_loja_id) <> 'rascunho'
begin
  select raise(abort, 'VENDA_LOJA_IMUTAVEL');
end;
create trigger venda_loja_pagamento_sem_alteracao before update on venda_loja_pagamento
begin
  select raise(abort, 'VENDA_LOJA_IMUTAVEL');
end;
create trigger venda_loja_pagamento_sem_exclusao before delete on venda_loja_pagamento
begin
  select raise(abort, 'VENDA_LOJA_IMUTAVEL');
end;
