create trigger price_history_sem_alteracao before update on price_history
begin
  select raise(abort, 'HISTORICO_PRECO_IMUTAVEL');
end;
create trigger price_history_sem_exclusao before delete on price_history
begin
  select raise(abort, 'HISTORICO_PRECO_IMUTAVEL');
end;
