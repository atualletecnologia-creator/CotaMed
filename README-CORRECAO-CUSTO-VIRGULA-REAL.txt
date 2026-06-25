Correção Licitações - custo manual com vírgula

Arquivo alterado:
app/licitacoes/page.tsx

Correção:
- O campo de custo manual agora guarda o texto digitado.
- Aceita digitar 0,90 sem transformar imediatamente em 0.
- Aceita 1,25, 10,50 e 1.234,56.
- O cálculo usa a conversão correta para número.
