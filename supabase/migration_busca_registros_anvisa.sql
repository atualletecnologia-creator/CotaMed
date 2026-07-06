create index if not exists idx_registros_anvisa_user_busca
on registros_anvisa(user_id, item, marca, registro_anvisa, apresentacao);

create index if not exists idx_registros_anvisa_created_at
on registros_anvisa(created_at);
