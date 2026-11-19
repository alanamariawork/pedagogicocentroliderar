create trigger movimentacao_estoque_sem_alteracao before update on movimentacao_estoque
begin
  select raise(abort, 'MOVIMENTACAO_IMUTAVEL');
end;
create trigger movimentacao_estoque_sem_exclusao before delete on movimentacao_estoque
begin
  select raise(abort, 'MOVIMENTACAO_IMUTAVEL');
end;
