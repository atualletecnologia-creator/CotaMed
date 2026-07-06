alter table produtos
add column if not exists data_atualizacao_custo timestamp,
add column if not exists usuario_atualizacao text,
add column if not exists origem_preco text;

create table if not exists historico_precos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid references produtos(id) on delete cascade,
  custo_unitario_antigo numeric,
  custo_unitario_novo numeric,
  custo_caixa_antigo numeric,
  custo_caixa_novo numeric,
  data_alteracao timestamp default now(),
  usuario text,
  origem_preco text
);

create index if not exists idx_produtos_data_atualizacao_custo
on produtos (data_atualizacao_custo);

create index if not exists idx_historico_precos_produto
on historico_precos (produto_id);
