Atualização aplicada

1. Licitações
- Adicionada seleção de preço padrão: UNITÁRIO ou CAIXA.
- Adicionada seleção de preço UNITÁRIO/CAIXA por item.
- Mantida lista compacta sem tabela larga.
- Mantida seleção manual de produto.
- Textos importados ficam em MAIÚSCULO.

2. Registros ANVISA
- Cadastro força ITEM, APRESENTAÇÃO, MARCA e REGISTRO em MAIÚSCULO.
- Mantido padrão de arquivo: item_apresentacao_marca_venc-2028-04-15_reg-123456789.pdf.
- Adicionado botão EXCLUIR.
- Ao excluir, tenta remover o PDF do Storage e limpar vínculo no banco de preços.

3. Banco de Preços
- Importação força DESCRIÇÃO, APRESENTAÇÃO, MARCA, UNIDADE e REGISTRO em MAIÚSCULO.
- Mantido filtro COM PDF / SEM PDF.
- Adicionado botão EXCLUIR produto.

4. Supabase
- Se a exclusão for bloqueada por RLS, rode o arquivo:
  supabase/policies_delete_produtos_registros.sql

Depois de extrair:
npm install
npm run build

git add .
git commit -m "Atualiza tipo de preco exclusoes e maiusculas"
git push origin main
