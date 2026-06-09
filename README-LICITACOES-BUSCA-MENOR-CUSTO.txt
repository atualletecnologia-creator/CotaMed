Licitações - busca manual com menor custo

Arquivo alterado:
app/licitacoes/page.tsx

Mudança:
- Na busca manual de produto, o sistema agrupa produtos iguais sem considerar marca.
- Se existir o mesmo produto em várias marcas, mostra apenas a opção de menor custo.
- O menor custo respeita o tipo do item:
  - UNITÁRIO compara custo_unitario.
  - CAIXA compara custo_caixa.
