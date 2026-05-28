# Atualização CotaMed — Sem numeração no Banco de Preços e modelo de licitação

## O que foi corrigido

- Banco de Preços não mostra mais a coluna item.
- Banco de Preços salva `item = descricao` para não depender de número.
- Licitações não usam mais o campo ITEM para buscar produto.
- Busca da cotação usa somente descrição/nome, apresentação e marca.
- Abertura de PDF foi melhorada para funcionar com:
  - caminho do Supabase Storage
  - URL completa
  - caminho com ou sem `registros-anvisa/`
- Aba Licitações agora possui botão para baixar modelo de planilha.

## Arquivos para substituir/adicionar

```text
app/banco-precos/page.tsx
app/licitacoes/page.tsx
lib/buscaInteligente.ts
lib/storagePdf.ts
public/modelos/modelo-licitacao-cotamed.xlsx
supabase/migration_remover_item_numerico.sql
```

## Rodar no Supabase

Opcional, mas recomendado:

```sql
supabase/migration_remover_item_numerico.sql
```

Esse SQL troca itens numéricos antigos pela descrição do produto.

## Depois

```powershell
git add .
git commit -m "Remove numeracao do banco e melhora modelo de licitacao"
git push
```
