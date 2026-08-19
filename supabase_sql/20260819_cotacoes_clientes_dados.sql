-- CotaMed - Clientes de cotações e dados da empresa
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.clientes_cotacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cnpj text,
  inscricao_estadual text,
  endereco text,
  telefone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clientes_cotacao_user_nome
  on public.clientes_cotacao (user_id, nome);

alter table public.clientes_cotacao enable row level security;

drop policy if exists "clientes_cotacao_select_own" on public.clientes_cotacao;
create policy "clientes_cotacao_select_own"
  on public.clientes_cotacao for select
  using (auth.uid() = user_id);

drop policy if exists "clientes_cotacao_insert_own" on public.clientes_cotacao;
create policy "clientes_cotacao_insert_own"
  on public.clientes_cotacao for insert
  with check (auth.uid() = user_id);

drop policy if exists "clientes_cotacao_update_own" on public.clientes_cotacao;
create policy "clientes_cotacao_update_own"
  on public.clientes_cotacao for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "clientes_cotacao_delete_own" on public.clientes_cotacao;
create policy "clientes_cotacao_delete_own"
  on public.clientes_cotacao for delete
  using (auth.uid() = user_id);

create table if not exists public.dados_empresa_cotacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text,
  cnpj text,
  inscricao_estadual text,
  endereco text,
  telefone text,
  email text,
  logo_base64 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dados_empresa_cotacao enable row level security;

drop policy if exists "dados_empresa_cotacao_select_own" on public.dados_empresa_cotacao;
create policy "dados_empresa_cotacao_select_own"
  on public.dados_empresa_cotacao for select
  using (auth.uid() = user_id);

drop policy if exists "dados_empresa_cotacao_insert_own" on public.dados_empresa_cotacao;
create policy "dados_empresa_cotacao_insert_own"
  on public.dados_empresa_cotacao for insert
  with check (auth.uid() = user_id);

drop policy if exists "dados_empresa_cotacao_update_own" on public.dados_empresa_cotacao;
create policy "dados_empresa_cotacao_update_own"
  on public.dados_empresa_cotacao for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
