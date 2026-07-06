alter table produtos
add column if not exists pdf_url text;

alter table licitacoes
add column if not exists user_id uuid,
add column if not exists nome text,
add column if not exists margem numeric,
add column if not exists arquivo_original text,
add column if not exists arquivo_final text,
add column if not exists zip_registros text;

alter table itens_licitacao
add column if not exists tipo_cotacao text,
add column if not exists quantidade_por_caixa numeric,
add column if not exists custo_unitario numeric,
add column if not exists custo_caixa numeric,
add column if not exists custo_usado numeric;

create index if not exists idx_produtos_user_descricao
on produtos(user_id, descricao);

create index if not exists idx_produtos_user_custos
on produtos(user_id, custo_unitario, custo_caixa);
