-- Login por empresa e isolamento dos dados por usuário autenticado

create table if not exists empresas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique,
  nome text,
  email text,
  created_at timestamp default now()
);

alter table produtos enable row level security;
alter table licitacoes enable row level security;
alter table itens_licitacao enable row level security;
alter table historico_precos enable row level security;
alter table empresas enable row level security;

-- Garante que cada empresa veja somente seu próprio cadastro
drop policy if exists "empresas_select_own" on empresas;
create policy "empresas_select_own"
on empresas for select
using (auth.uid() = user_id);

drop policy if exists "empresas_insert_own" on empresas;
create policy "empresas_insert_own"
on empresas for insert
with check (auth.uid() = user_id);

drop policy if exists "empresas_update_own" on empresas;
create policy "empresas_update_own"
on empresas for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Produtos/banco de preços por empresa
drop policy if exists "produtos_select_own" on produtos;
create policy "produtos_select_own"
on produtos for select
using (auth.uid() = user_id);

drop policy if exists "produtos_insert_own" on produtos;
create policy "produtos_insert_own"
on produtos for insert
with check (auth.uid() = user_id);

drop policy if exists "produtos_update_own" on produtos;
create policy "produtos_update_own"
on produtos for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "produtos_delete_own" on produtos;
create policy "produtos_delete_own"
on produtos for delete
using (auth.uid() = user_id);

-- Licitações por empresa
drop policy if exists "licitacoes_select_own" on licitacoes;
create policy "licitacoes_select_own"
on licitacoes for select
using (auth.uid() = user_id);

drop policy if exists "licitacoes_insert_own" on licitacoes;
create policy "licitacoes_insert_own"
on licitacoes for insert
with check (auth.uid() = user_id);

drop policy if exists "licitacoes_update_own" on licitacoes;
create policy "licitacoes_update_own"
on licitacoes for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "licitacoes_delete_own" on licitacoes;
create policy "licitacoes_delete_own"
on licitacoes for delete
using (auth.uid() = user_id);

-- Itens da licitação ficam protegidos pelo dono da licitação
drop policy if exists "itens_licitacao_select_own" on itens_licitacao;
create policy "itens_licitacao_select_own"
on itens_licitacao for select
using (
  exists (
    select 1 from licitacoes
    where licitacoes.id = itens_licitacao.licitacao_id
    and licitacoes.user_id = auth.uid()
  )
);

drop policy if exists "itens_licitacao_insert_own" on itens_licitacao;
create policy "itens_licitacao_insert_own"
on itens_licitacao for insert
with check (
  exists (
    select 1 from licitacoes
    where licitacoes.id = itens_licitacao.licitacao_id
    and licitacoes.user_id = auth.uid()
  )
);

drop policy if exists "itens_licitacao_update_own" on itens_licitacao;
create policy "itens_licitacao_update_own"
on itens_licitacao for update
using (
  exists (
    select 1 from licitacoes
    where licitacoes.id = itens_licitacao.licitacao_id
    and licitacoes.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from licitacoes
    where licitacoes.id = itens_licitacao.licitacao_id
    and licitacoes.user_id = auth.uid()
  )
);

drop policy if exists "itens_licitacao_delete_own" on itens_licitacao;
create policy "itens_licitacao_delete_own"
on itens_licitacao for delete
using (
  exists (
    select 1 from licitacoes
    where licitacoes.id = itens_licitacao.licitacao_id
    and licitacoes.user_id = auth.uid()
  )
);

-- Histórico de preços fica protegido pelo dono do produto
drop policy if exists "historico_precos_select_own" on historico_precos;
create policy "historico_precos_select_own"
on historico_precos for select
using (
  exists (
    select 1 from produtos
    where produtos.id = historico_precos.produto_id
    and produtos.user_id = auth.uid()
  )
);

drop policy if exists "historico_precos_insert_own" on historico_precos;
create policy "historico_precos_insert_own"
on historico_precos for insert
with check (
  exists (
    select 1 from produtos
    where produtos.id = historico_precos.produto_id
    and produtos.user_id = auth.uid()
  )
);

-- Storage: crie um bucket privado chamado registros-anvisa
-- Estrutura recomendada: user_id/nome-do-arquivo.pdf
-- Exemplo: 00000000-0000-0000-0000-000000000000/dipirona_medley.pdf

insert into storage.buckets (id, name, public)
values ('registros-anvisa', 'registros-anvisa', false)
on conflict (id) do nothing;

drop policy if exists "storage_registros_select_own" on storage.objects;
create policy "storage_registros_select_own"
on storage.objects for select
using (
  bucket_id = 'registros-anvisa'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "storage_registros_insert_own" on storage.objects;
create policy "storage_registros_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'registros-anvisa'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "storage_registros_update_own" on storage.objects;
create policy "storage_registros_update_own"
on storage.objects for update
using (
  bucket_id = 'registros-anvisa'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'registros-anvisa'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "storage_registros_delete_own" on storage.objects;
create policy "storage_registros_delete_own"
on storage.objects for delete
using (
  bucket_id = 'registros-anvisa'
  and auth.uid()::text = (storage.foldername(name))[1]
);
