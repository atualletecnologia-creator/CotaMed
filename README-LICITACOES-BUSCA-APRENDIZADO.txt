Licitações - busca aprimorada com aprendizado

Arquivo alterado:
app/licitacoes/page.tsx

Melhorias:
- Busca automática mais forte por palavras-chave.
- Ignora acentos, barras, vírgulas e termos genéricos.
- Quando o usuário seleciona um produto manualmente, o sistema memoriza no navegador.
- Na próxima licitação, tenta usar esse aprendizado antes da busca normal.
- Se encontrar com custo, já cota automaticamente; se a confiança for menor, fica como Conferir.
Observação:
- O aprendizado fica salvo no navegador/dispositivo do usuário via localStorage.
