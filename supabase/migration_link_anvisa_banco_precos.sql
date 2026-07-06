alter table produtos
add column if not exists pdf_url text;

create index if not exists idx_produtos_link_anvisa
on produtos(user_id, item, apresentacao, marca, registro_anvisa);

create index if not exists idx_registros_anvisa_link_produto
on registros_anvisa(user_id, item, apresentacao, marca, registro_anvisa);

-- Atualiza produtos já existentes tentando vincular com registros_anvisa
-- Critério 1: mesmo user_id + mesmo registro_anvisa
update produtos p
set
  vencimento_registro = coalesce(r.vencimento_registro, p.vencimento_registro),
  pdf_url = coalesce(r.pdf_path, p.pdf_url)
from registros_anvisa r
where p.user_id = r.user_id
  and p.registro_anvisa is not null
  and r.registro_anvisa is not null
  and regexp_replace(lower(p.registro_anvisa), '[^a-z0-9]', '', 'g') =
      regexp_replace(lower(r.registro_anvisa), '[^a-z0-9]', '', 'g');

-- Critério 2: mesmo user_id + item + apresentação + marca
update produtos p
set
  registro_anvisa = coalesce(r.registro_anvisa, p.registro_anvisa),
  vencimento_registro = coalesce(r.vencimento_registro, p.vencimento_registro),
  pdf_url = coalesce(r.pdf_path, p.pdf_url)
from registros_anvisa r
where p.user_id = r.user_id
  and regexp_replace(lower(coalesce(p.item, '')), '[^a-z0-9]', '', 'g') =
      regexp_replace(lower(coalesce(r.item, '')), '[^a-z0-9]', '', 'g')
  and regexp_replace(lower(coalesce(p.apresentacao, '')), '[^a-z0-9]', '', 'g') =
      regexp_replace(lower(coalesce(r.apresentacao, '')), '[^a-z0-9]', '', 'g')
  and regexp_replace(lower(coalesce(p.marca, '')), '[^a-z0-9]', '', 'g') =
      regexp_replace(lower(coalesce(r.marca, '')), '[^a-z0-9]', '', 'g');
