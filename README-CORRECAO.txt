Correção Banco de Preços

Substitua:
app/banco-precos/page.tsx

Correção:
- Vínculo automático ficou super rígido.
- Se a planilha tiver registro ANVISA, só vincula se o número for exatamente igual.
- Se a planilha não tiver registro, só vincula se:
  1. Marca for exatamente igual.
  2. Nome do produto bater forte.
- Acentos, barras /, vírgulas e caracteres especiais são normalizados antes da comparação.
- Nome igual com marca diferente NÃO vincula.
- Nome parecido mas não forte NÃO vincula.
