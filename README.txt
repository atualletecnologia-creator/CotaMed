Substitua:
app/licitacoes/page.tsx

Correções:
- Evita cotar como CAIXA quando o item é unitário.
- Agora só marca CAIXA quando há indicação clara: C/100, CX, CAIXA, EMBALAGEM, PACOTE, PCT, CARTELA.
- Não força CAIXA apenas por "100 COMP", "100MG", "100ML".
- Melhor custo agora só compara produtos com match confiável e próximos do melhor resultado.
- Aumenta a busca de candidatos para identificar mais itens cadastrados.
