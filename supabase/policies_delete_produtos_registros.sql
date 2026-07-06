-- Rode no Supabase SQL Editor se a exclusão for bloqueada por RLS.

-- Produtos: permite excluir somente registros do próprio usuário.
drop policy if exists "produtos_delete_own" on produtos;
create policy "produtos_delete_own"
on produtos for delete
using (auth.uid() = user_id);

-- Registros ANVISA: permite excluir somente registros do próprio usuário.
drop policy if exists "registros_anvisa_delete_own" on registros_anvisa;
create policy "registros_anvisa_delete_own"
on registros_anvisa for delete
using (auth.uid() = user_id);

-- Storage: permite excluir PDFs do bucket registros-anvisa dentro da pasta do próprio usuário.
drop policy if exists "storage_registros_delete_own" on storage.objects;
create policy "storage_registros_delete_own"
on storage.objects for delete
using (
  bucket_id = 'registros-anvisa'
  and auth.uid()::text = (storage.foldername(name))[1]
);
