create trigger ingresso_credenciado_protegido
before update of status, participante_id, categoria_id on ingresso
for each row
when ((new.status = 'cancelado' and old.status <> 'cancelado')
      or new.participante_id is not old.participante_id
      or new.categoria_id is not old.categoria_id)
 and exists (select 1 from credencial where ingresso_id = old.id and ativa = 1)
begin
  select raise(abort, 'CREDENCIADO_ATIVO');
end;

create trigger auditoria_sem_alteracao before update on auditoria
begin
  select raise(abort, 'AUDITORIA_IMUTAVEL');
end;
create trigger auditoria_sem_exclusao before delete on auditoria
begin
  select raise(abort, 'AUDITORIA_IMUTAVEL');
end;
