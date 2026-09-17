Correção da paginação das propostas de licitação

Problema encontrado:
- a função paginarItensProposta limitava cada página a no máximo 3 itens;
- o cálculo de peso das descrições era excessivamente alto;
- isso gerava folhas com 1 ou 2 produtos e muito espaço em branco.

Correção:
- até 10 itens por página, respeitando o tamanho estimado das descrições;
- cálculo de altura menos agressivo;
- redução dos espaços verticais do cabeçalho/título nas páginas de tabela;
- linhas continuam protegidas contra quebra no meio;
- total e valor por extenso continuam na última página da tabela.
