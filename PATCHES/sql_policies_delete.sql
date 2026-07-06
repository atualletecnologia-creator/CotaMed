-- SQL opcional para garantir permissão de delete com RLS, se seu Supabase bloquear exclusão

-- Produtos
drop policy if exists "produtos_delete_own" on produtos;

create policy "produtos_delete_own"
on produtos for delete
using (auth.uid() = user_id);

-- Registros ANVISA
drop policy if exists "registros_anvisa_delete_own" on registros_anvisa;

create policy "registros_anvisa_delete_own"
on registros_anvisa for delete
using (auth.uid() = user_id);

-- Storage delete dos PDFs
drop policy if exists "storage_registros_delete_own" on storage.objects;

create policy "storage_registros_delete_own"
on storage.objects for delete
using (
  bucket_id = 'registros-anvisa'
  and auth.uid()::text = (storage.foldername(name))[1]
);
