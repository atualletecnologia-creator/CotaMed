alter table produtos
add column if not exists quantidade_por_caixa numeric,
add column if not exists custo_unitario numeric,
add column if not exists custo_caixa numeric,
add column if not exists data_atualizacao_custo timestamp,
add column if not exists origem_preco text,
add column if not exists usuario_atualizacao text;

create index if not exists idx_produtos_user_item
on produtos(user_id, item);

create index if not exists idx_produtos_user_registro
on produtos(user_id, registro_anvisa);

create index if not exists idx_produtos_user_data_custo
on produtos(user_id, data_atualizacao_custo);
