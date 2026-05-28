alter table produtos
add column if not exists quantidade_por_caixa numeric,
add column if not exists custo_unitario numeric,
add column if not exists custo_caixa numeric;

alter table itens_licitacao
add column if not exists tipo_cotacao text,
add column if not exists quantidade_por_caixa numeric,
add column if not exists custo_unitario numeric,
add column if not exists custo_caixa numeric,
add column if not exists custo_usado numeric;

create index if not exists idx_produtos_custo_unitario on produtos (custo_unitario);
create index if not exists idx_produtos_custo_caixa on produtos (custo_caixa);
