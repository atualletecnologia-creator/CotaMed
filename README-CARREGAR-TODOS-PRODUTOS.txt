Correção limite de 1000 produtos

Arquivo alterado:
app/banco-precos/page.tsx

Correção:
- O sistema agora busca produtos em lotes de 1000 até carregar todos.
- Não depende mais de uma única consulta limitada pelo Supabase.
- Também carrega registros ANVISA em lotes.
- Deve exibir os 1084 produtos cadastrados.
