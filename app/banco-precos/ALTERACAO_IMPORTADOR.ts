// ALTERAR IMPORTAÇÃO DA PLANILHA

// ANTES:
const item = String(normalizada.item || "").trim();

// AGORA:
const item = String(index + 1);

// ALTERAR O MAP:

const produtosParaSalvar = linhas
  .map((linha, index) => {

// REMOVER validação da coluna item

// ANTES:
if (!item) return null;

// REMOVER COMPLETAMENTE
