export type ProdutoBusca = {
  id?: string;
  descricao?: string | null;
  apresentacao?: string | null;
  marca?: string | null;
  registro_anvisa?: string | null;
  custo_unitario?: number | null;
  custo_caixa?: number | null;
  quantidade_por_caixa?: number | null;
  pdf_url?: string | null;
  vencimento_registro?: string | null;
};

const sinonimos: Record<string, string> = {
  "inj": "injetavel",
  "injetável": "injetavel",
  "sol inj": "solucao injetavel",
  "solução injetável": "solucao injetavel",
  "solucao injetavel": "solucao injetavel",
  "amp": "ampola",
  "ampola": "ampola",
  "comp": "comprimido",
  "compr": "comprimido",
  "cap": "capsula",
  "cápsula": "capsula",
  "fr": "frasco",
  "fras": "frasco",
  "sol": "solucao",
  "solução": "solucao",
  "cx": "caixa",
  "und": "unidade",
  "unid": "unidade",
  "un": "unidade",
};

const palavrasIgnoradas = new Set([
  "de", "da", "do", "das", "dos", "para", "por", "em", "a", "o", "e",
  "produto", "material", "hospitalar", "uso", "adulto", "infantil", "item",
  "sulfato", "cloridrato", "sodico", "sódico", "dissodico", "dissódico",
  "base", "solucao", "solução", "frasco", "ampola", "ml", "mg"
]);

export function normalizarDescricao(texto: unknown) {
  let normalizado = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:()]/g, " ")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim();

  Object.entries(sinonimos).forEach(([de, para]) => {
    const chave = de
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    normalizado = normalizado.replace(new RegExp(`\\b${chave}\\b`, "g"), para);
  });

  return normalizado.replace(/\s+/g, " ").trim();
}

export function tokensDescricao(texto: unknown) {
  return normalizarDescricao(texto)
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !palavrasIgnoradas.has(p))
    .filter((p) => !/^\d+$/.test(p));
}

function extrairDosagens(texto: string) {
  const normalizado = normalizarDescricao(texto);
  const matches = normalizado.match(/\d+([,.]\d+)?\s*(mg|g|mcg|ml|l|ui|%)/g) || [];

  return matches.map((v) =>
    v.replace(/\s+/g, "").replace(",", ".").toLowerCase()
  );
}

function temDoseCompativel(descricao: string, produto: string) {
  const d1 = extrairDosagens(descricao);
  const d2 = extrairDosagens(produto);

  if (!d1.length || !d2.length) return true;

  return d1.some((doseLic) =>
    d2.some((doseProd) =>
      doseLic === doseProd ||
      doseLic.includes(doseProd) ||
      doseProd.includes(doseLic)
    )
  );
}

function primeiroTokenForte(texto: string) {
  return tokensDescricao(texto)
    .filter((t) => !["injetavel", "comprimido", "capsula", "unidade", "caixa"].includes(t))[0] || "";
}

function jaccard(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);

  let intersecao = 0;

  setA.forEach((x) => {
    if (setB.has(x)) intersecao++;
  });

  const uniao = new Set(a.concat(b)).size;
  if (!uniao) return 0;

  return intersecao / uniao;
}

export function calcularSimilaridade(descricaoLicitacao: string, produto: ProdutoBusca) {
  const descLic = normalizarDescricao(descricaoLicitacao);
  const descProd = normalizarDescricao([
    produto.descricao,
    produto.apresentacao
  ].filter(Boolean).join(" "));

  const tokensLic = tokensDescricao(descLic);
  const tokensProd = tokensDescricao(descProd);

  if (!tokensLic.length || !tokensProd.length) return 0;

  const ativoLic = primeiroTokenForte(descLic);
  const ativoProd = primeiroTokenForte(descProd);

  if (!ativoLic || !ativoProd) return 0;

  const mesmoAtivo =
    ativoLic === ativoProd ||
    ativoLic.includes(ativoProd) ||
    ativoProd.includes(ativoLic);

  if (!mesmoAtivo) return 0;

  if (!temDoseCompativel(descLic, descProd)) return 0;

  let score = 0;

  if (descProd === descLic) score += 100;
  if (descProd.includes(descLic) || descLic.includes(descProd)) score += 30;

  score += jaccard(tokensLic, tokensProd) * 45;

  tokensLic.forEach((token) => {
    if (tokensProd.includes(token)) score += 6;
    else if (tokensProd.some((p) => p.includes(token) || token.includes(p))) score += 2;
  });

  if (mesmoAtivo) score += 25;

  if (tokensLic.includes("injetavel") && tokensProd.includes("injetavel")) score += 10;
  if (tokensLic.includes("comprimido") && tokensProd.includes("comprimido")) score += 10;
  if (tokensLic.includes("frasco") && tokensProd.includes("frasco")) score += 7;
  if (tokensLic.includes("ampola") && tokensProd.includes("ampola")) score += 7;

  return Math.min(Math.round(score), 100);
}

export function encontrarCandidatos(descricao: string, produtos: ProdutoBusca[], limite = 25) {
  return produtos
    .map((produto) => ({
      produto,
      score: calcularSimilaridade(descricao, produto)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const custoA = a.produto.custo_unitario || a.produto.custo_caixa || 999999999;
      const custoB = b.produto.custo_unitario || b.produto.custo_caixa || 999999999;

      return custoA - custoB;
    })
    .slice(0, limite);
}

export function encontrarMelhorProduto(descricao: string, produtos: ProdutoBusca[]) {
  const melhor = encontrarCandidatos(descricao, produtos, 1)[0];

  if (!melhor) return null;

  if (melhor.score < 70) return null;

  return melhor;
}

export function classificarConfianca(score: number) {
  if (score >= 85) return "alto";
  if (score >= 75) return "medio";
  return "baixo";
}
