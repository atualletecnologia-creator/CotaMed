-- Opcional: substituir item numérico pela própria descrição nos produtos já cadastrados
update produtos
set item = descricao
where descricao is not null
  and (item is null or item ~ '^[0-9]+$' or item ~ '^[0-9]{3}$');
