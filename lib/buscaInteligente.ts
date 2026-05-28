export function normalizarTexto(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(texto: string) {
  return normalizarTexto(texto)
    .split(" ")
    .filter(Boolean);
}

function jaccard(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);

  let intersecao = 0;

  setA.forEach((x) => {
    if (setB.has(x)) {
      intersecao++;
    }
  });

  const uniao = new Set(a.concat(b)).size;

  if (!uniao) return 0;

  return intersecao / uniao;
}

export function calcularSimilaridade(a: string, b: string) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  return jaccard(tokensA, tokensB);
}
