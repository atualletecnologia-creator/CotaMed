create extension if not exists "pgcrypto";

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  item text,
  descricao text,
  apresentacao text,
  marca text,
  registro_anvisa text,
  vencimento_registro date,
  unidade text,
  quantidade_por_caixa numeric,
  custo_unitario numeric,
  custo_caixa numeric,

  -- DATA DA ÚLTIMA ATUALIZAÇÃO DO CUSTO
  data_atualizacao_custo timestamp,
  usuario_atualizacao text,
  origem_preco text,

  pdf_url text,
  created_at timestamp default now()
);

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

create table if not exists licitacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  nome text,
  margem numeric,
  arquivo_original text,
  arquivo_final text,
  zip_registros text,
  created_at timestamp default now()
);

create table if not exists itens_licitacao (
  id uuid primary key default gen_random_uuid(),
  licitacao_id uuid references licitacoes(id) on delete cascade,
  numero_item text,
  descricao text,
  quantidade numeric,
  unidade text,
  tipo_cotacao text,
  quantidade_por_caixa numeric,
  custo_unitario numeric,
  custo_caixa numeric,
  custo_usado numeric,
  marca text,
  registro_anvisa text,
  valor_unitario numeric,
  valor_total numeric,
  created_at timestamp default now()
);

create index if not exists idx_produtos_item 
on produtos using gin (
  to_tsvector(
    'portuguese',
    coalesce(item,'') || ' ' ||
    coalesce(descricao,'') || ' ' ||
    coalesce(marca,'') || ' ' ||
    coalesce(registro_anvisa,'')
  )
);

create index if not exists idx_produtos_registro on produtos (registro_anvisa);
create index if not exists idx_produtos_custo_unitario on produtos (custo_unitario);
create index if not exists idx_produtos_custo_caixa on produtos (custo_caixa);
create index if not exists idx_produtos_data_atualizacao_custo on produtos (data_atualizacao_custo);
create index if not exists idx_historico_precos_produto on historico_precos (produto_id);
