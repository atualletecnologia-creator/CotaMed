-- Execute no Supabase SQL Editor para deixar o que já está cadastrado em maiúsculo

UPDATE produtos
SET
  descricao = UPPER(descricao),
  apresentacao = UPPER(apresentacao),
  marca = UPPER(marca),
  registro_anvisa = UPPER(registro_anvisa)
WHERE true;

UPDATE registros_anvisa
SET
  item = UPPER(item),
  apresentacao = UPPER(apresentacao),
  marca = UPPER(marca),
  registro_anvisa = UPPER(registro_anvisa)
WHERE true;
