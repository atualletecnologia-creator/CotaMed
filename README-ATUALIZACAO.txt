Correção Dashboard dados reais

Substitua:

app/dashboard/page.tsx

Agora o dashboard busca no Supabase:
- total de produtos
- preços desatualizados há mais de 30 dias
- registros ANVISA vencidos
- PDFs disponíveis

Depois rode:

npm run dev

e atualize com CTRL + F5.
