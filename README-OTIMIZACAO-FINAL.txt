CotaMed - otimização final aplicada

Arquivos principais ajustados:
- app/licitacoes/page.tsx
  - Corrigido tipo de preço automático sem erro de build.
  - "Automático por item" ativo.
  - Detecção segura de CAIXA apenas com C/100, CX, CAIXA, PACOTE, PCT, CARTELA.
  - Evita transformar 100MG, 100ML ou 100 COMP em caixa.
  - Escolhe menor custo apenas entre matches confiáveis.

- app/banco-precos/page.tsx
  - Vínculo em massa no formato correto: escolher 1 registro e aplicar a vários produtos.
  - Botão selecionar filtrados.
  - Mantém lógica de vínculo manual.

Depois de extrair dentro de E:\Flutter\cotamed:
git status
git add .
git commit -m "Otimização final banco precos e licitacoes"
git push origin main
