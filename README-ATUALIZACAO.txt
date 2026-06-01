Atualização CotaMed — excluir registros/produtos e tipo de preço na licitação

Arquivos a alterar:
- app/licitacoes/page.tsx
- app/registros-anvisa/page.tsx
- app/banco-precos/page.tsx

Patches incluídos:
- PATCHES/licitacoes_tipo_preco.txt
- PATCHES/registros_excluir.txt
- PATCHES/banco_precos_excluir.txt
- PATCHES/sql_policies_delete.sql

Depois de alterar:
git add .
git commit -m "Adiciona tipo de preco e exclusao de registros e produtos"
git push origin main
