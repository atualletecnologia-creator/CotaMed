Dashboard - contagem real

Arquivo alterado:
app/dashboard/page.tsx

Correção:
- O card "Itens no banco" agora usa count exact do Supabase.
- Não depende mais de carregar a lista limitada de produtos.
- Deve mostrar corretamente 1084 produtos ou mais.
