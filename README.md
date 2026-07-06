# CotaMed

Sistema web para cotação automática de licitações médicas, banco de preços, consulta rápida de itens e controle de PDFs de registros ANVISA.

## Funcionalidades iniciais

- Dashboard
- Banco de preços
- Importação por planilha
- Consulta rápida de item
- Nova cotação com margem de lucro
- Organização de PDFs por item/apresentação/marca/vencimento
- Estrutura inicial para Supabase

## Como rodar

```bash
npm install
npm run dev
```

Acesse:

```text
http://localhost:3000
```

## Configurar Supabase

Crie o arquivo `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=SUA_URL_DO_SUPABASE
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

Depois rode o SQL em:

```text
supabase/schema.sql
```

## Nome sugerido para PDFs

```text
item_apresentacao_marca_vencimento_registro.pdf
```

Exemplo:

```text
dipirona_500mg_comprimido_medley_venc-2028-04-15_reg-123456789.pdf
```

## Planilha do banco de preços

Colunas recomendadas:

```text
item, descricao, apresentacao, marca, registro_anvisa, vencimento_registro, unidade, custo
```

## Planilha da licitação

Colunas recomendadas:

```text
numero_item, descricao, quantidade, unidade
```

O sistema irá buscar o menor custo compatível no banco de preços e calcular:

```text
valor_unitario = custo + margem
valor_total = valor_unitario * quantidade
```
