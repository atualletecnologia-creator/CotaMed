Registros ANVISA em massa

Arquivo alterado:
app/registros-anvisa/page.tsx

Novo recurso:
- Enviar vários PDFs de registros ANVISA de uma vez.
- O sistema lê os dados pelo padrão do nome:
  item_apresentacao_marca_venc-2028-04-15_reg-123456789.pdf
- Arquivos com nome inválido são ignorados.
- Os dados são salvos em maiúsculo.
