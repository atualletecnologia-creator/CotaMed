Correção Banco de Preços

Arquivo alterado:
app/banco-precos/page.tsx

Corrige:
- Botão Desvincular registro/PDF restaurado.
- Vínculo automático ficou extremamente rígido.
- Se a planilha tiver número de registro: só vincula se o número for exatamente igual.
- Sem número de registro: só vincula se marca for exatamente igual e nome bater com muita segurança.
- Produto com marca diferente nunca será vinculado automaticamente, mesmo que o nome pareça parecido.
