# Correção CotaMed — Login obrigatório

Esta correção faz o sistema exigir login antes de acessar as páginas internas.

## Arquivos para substituir/adicionar

components/AuthGuard.tsx
components/AppShell.tsx
app/page.tsx

## Depois rode

npm run build

Se passar, envie para o GitHub:

git add .
git commit -m "Corrige login obrigatorio"
git push

Depois faça redeploy na Vercel.
