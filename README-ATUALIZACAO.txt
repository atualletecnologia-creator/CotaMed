Atualização CotaMed — busca local melhorada e timeout da IA

Substitua:
lib/buscaInteligente.ts
app/api/ia/match-produto/route.ts

Depois aplique a instrução em:
PATCHES/alteracao-necessaria-licitacoes.txt

Melhorias:
- Reconhece GENTAMICINA INJ 40MG x Gentamicina, sulfato 40mg/ml 1ml, solução injetável.
- INJ passa a equivaler a injetável.
- Sulfato/cloridrato deixam de atrapalhar a busca.
- Compara 40MG com 40MG/ML.
- IA agora tem timeout e não deve ficar carregando infinito.

Depois:
git add .
git commit -m "Melhora busca local e timeout da IA"
git push
