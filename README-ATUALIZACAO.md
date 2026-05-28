# Atualização CotaMed — Busca inteligente e IA

Esta atualização melhora a cotação quando a descrição da licitação não vem igual ao Banco de Preços.

## O que foi adicionado

- Busca por similaridade local
- Dicionário de sinônimos e abreviações hospitalares
- Pontuação de confiança
- Status:
  - Encontrado
  - Conferir match
  - Baixa confiança
- Fallback opcional com IA gratuita via OpenRouter

## Arquivos para adicionar/substituir

```text
lib/buscaInteligente.ts
app/api/ia/match-produto/route.ts
app/licitacoes/page.tsx
```

## Instalar dependências

Normalmente você já tem estas dependências, mas confirme:

```bash
npm install xlsx jszip file-saver
npm install -D @types/file-saver
```

## Configurar IA gratuita via OpenRouter

No arquivo `.env.local`, adicione:

```env
OPENROUTER_API_KEY=SUA_CHAVE_DO_OPENROUTER
OPENROUTER_MODEL=openai/gpt-oss-20b:free
```

Depois reinicie:

```bash
npm run dev
```

## Importante

A IA é opcional. O sistema funciona sem ela usando a busca local.

Na tela Licitações, deixe:

```text
Usar IA gratuita como fallback: Não
```

Se quiser testar IA, mude para:

```text
Sim
```
