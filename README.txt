Substitua:
app/banco-precos/page.tsx

Correção:
- O botão de atualizar vínculos agora só atualiza produtos pendentes.
- Produtos que já têm registro_anvisa ou pdf_url serão mantidos e não serão sobrescritos.
- Isso preserva vínculos manuais já corrigidos.
