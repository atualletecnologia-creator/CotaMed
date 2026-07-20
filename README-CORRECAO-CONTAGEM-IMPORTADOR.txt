Correção do importador

- Remove SELECT após INSERT, que podia falhar por RLS mesmo com a inserção concluída.
- Corrige a contagem de produtos novos e atualizados.
- Mantém atualização de produtos existentes.
- Preserva registro ANVISA, vencimento e PDF.
- Exibe erro detalhado caso algum item não seja gravado.
