Substitua:
app/licitacoes/page.tsx

Melhorias:
- Identifica automaticamente CAIXA ou UNITÁRIO.
- Se o mesmo item existir em várias marcas no banco, escolhe a marca com menor custo.
- O menor custo respeita o tipo de preço detectado:
  - Se for CAIXA, compara custo_caixa.
  - Se for UNITÁRIO, compara custo_unitario.
- Mantém a seleção manual por item.
