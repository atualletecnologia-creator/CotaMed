create or replace view relatorio_produtos_desatualizados_30_dias as
select
  id,
  user_id,
  item,
  descricao,
  apresentacao,
  marca,
  registro_anvisa,
  custo_unitario,
  custo_caixa,
  quantidade_por_caixa,
  data_atualizacao_custo,
  extract(day from now() - data_atualizacao_custo) as dias_desatualizado
from produtos
where data_atualizacao_custo is null
   or data_atualizacao_custo < now() - interval '30 days';

create or replace view relatorio_registros_anvisa_vencidos as
select
  id,
  user_id,
  item,
  descricao,
  apresentacao,
  marca,
  registro_anvisa,
  vencimento_registro,
  pdf_url
from produtos
where vencimento_registro is not null
  and vencimento_registro < current_date;
