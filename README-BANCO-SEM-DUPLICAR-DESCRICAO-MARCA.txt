Banco de Preços - proteção contra duplicados

Arquivo alterado:
app/banco-precos/page.tsx

Correção:
- Se a planilha tiver ID, atualiza pelo ID.
- Se não tiver ID, procura produto com mesma descrição + marca.
- Se encontrar, atualiza o produto existente.
- Se não encontrar, insere como novo.
- Incluído SQL opcional para remover duplicados e criar índice único por descrição + marca.
