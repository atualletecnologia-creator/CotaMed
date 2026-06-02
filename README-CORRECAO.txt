Correção Banco de Preços

Substitua:
app/banco-precos/page.tsx

Corrige:
- Volta o botão Desvincular PDF/Registro em cada produto.
- Cadastro/importação não vincula registro automaticamente quando a marca for diferente.
- Se tiver nome igual mas marca diferente, fica sem PDF para selecionar manualmente.
- Vínculo automático exige marca igual + score seguro, ou registro ANVISA exato.
