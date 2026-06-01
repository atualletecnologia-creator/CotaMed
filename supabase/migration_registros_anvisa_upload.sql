create table if not exists registros_anvisa (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  item text,
  apresentacao text,
  marca text,
  vencimento_registro date,
  registro_anvisa text,
  nome_arquivo text,
  pdf_path text,
  created_at timestamp default now()
);

alter table registros_anvisa enable row level security;

drop policy if exists "registros_anvisa_select_own" on registros_anvisa;
create policy "registros_anvisa_select_own"
on registros_anvisa for select
using (auth.uid() = user_id);

drop policy if exists "registros_anvisa_insert_own" on registros_anvisa;
create policy "registros_anvisa_insert_own"
on registros_anvisa for insert
with check (auth.uid() = user_id);

drop policy if exists "registros_anvisa_update_own" on registros_anvisa;
create policy "registros_anvisa_update_own"
on registros_anvisa for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "registros_anvisa_delete_own" on registros_anvisa;
create policy "registros_anvisa_delete_own"
on registros_anvisa for delete
using (auth.uid() = user_id);

create index if not exists idx_registros_anvisa_user_id on registros_anvisa(user_id);
create index if not exists idx_registros_anvisa_item on registros_anvisa(item);
create index if not exists idx_registros_anvisa_registro on registros_anvisa(registro_anvisa);
create index if not exists idx_registros_anvisa_vencimento on registros_anvisa(vencimento_registro);

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
