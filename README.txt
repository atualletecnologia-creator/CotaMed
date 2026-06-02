Substitua:
app/licitacoes/page.tsx

Correção:
- Corrige erro de build: Type '"auto" | TipoPreco' is not assignable to type 'TipoPreco'.
- Quando o tipo padrão for "auto", resolve automaticamente para "unitario" ou "caixa" antes de chamar montarItemCotado.
