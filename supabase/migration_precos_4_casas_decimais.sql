-- CotaMed: preços com quatro casas decimais
-- Execute este arquivo no SQL Editor do Supabase.
-- A migração altera somente colunas que já existirem no banco.

do $$
declare
  tabela text;
  coluna text;
begin
  foreach tabela in array array['produtos', 'itens_licitacao'] loop
    foreach coluna in array array['custo_unitario', 'custo_caixa', 'custo_usado', 'valor_unitario', 'valor_total'] loop
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tabela
          and column_name = coluna
      ) then
        execute format(
          'alter table public.%I alter column %I type numeric(18,4) using round(%I::numeric, 4)',
          tabela,
          coluna,
          coluna
        );
      end if;
    end loop;
  end loop;
end $$;
