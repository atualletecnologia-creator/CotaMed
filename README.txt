Substitua:
app/banco-precos/page.tsx

Correção:
- Vínculo automático com registro ANVISA ficou mais rígido.
- Se a planilha trouxer número de registro, só vincula se for exatamente igual.
- Se a planilha não trouxer registro, só vincula quando marca for igual e descrição/apresentação forem muito compatíveis.
- Caso contrário, o produto fica sem PDF para você vincular manualmente.
