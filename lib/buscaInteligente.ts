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
  "c": "com", "c/": "com", "s": "sem", "s/": "sem",
  "und": "unidade", "unid": "unidade", "un": "unidade",
  "cx": "caixa", "pct": "pacote", "pc": "pacote",
  "desc": "descartavel", "descartável": "descartavel",
  "proced": "procedimento", "proc": "procedimento",
  "est": "esteril", "estéril": "esteril",
  "inj": "injetavel", "injetável": "injetavel", "injetavel": "injetavel",
  "sol inj": "solucao injetavel", "solução injetável": "solucao injetavel",
  "amp": "ampola", "comp": "comprimido", "compr": "comprimido",
  "cap": "capsula", "cápsula": "capsula", "fr": "frasco", "fras": "frasco",
  "sol": "solucao", "solução": "solucao", "luerlock": "luer lock",
  "macrogota": "macrogotas", "microgota": "microgotas",
  "jelco": "cateter intravenoso", "abocath": "cateter intravenoso",
  "scalp": "dispositivo intravenoso", "luva proc": "luva procedimento",
  "equipo soro": "equipo"
};

const palavrasIgnoradas = new Set([
  "de", "da", "do", "das", "dos", "para", "por", "em", "a", "o", "e",
  "produto", "material", "hospitalar", "uso", "adulto", "infantil", "item",
  "sulfato", "cloridrato", "sodico", "sódico", "dissodico", "dissódico",
  "base", "frasco", "ampola", "solucao", "solução"
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

function jaccard(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersecao = 0;
  setA.forEach((x) => { if (setB.has(x)) intersecao++; });
  const uniao = new Set(a.concat(b)).size;
  return uniao ? intersecao / uniao : 0;
}

function extrairDosagens(texto: string) {
  const matches = normalizarDescricao(texto).match(/\d+([,.]\d+)?\s*(mg|g|mcg|ml|l|ui|%)/g) || [];
  return matches.map((v) => v.replace(/\s+/g, "").replace(",", ".").toLowerCase());
}

function scoreDosagem(descricao: string, produto: string) {
  const d1 = extrairDosagens(descricao);
  const d2 = extrairDosagens(produto);
  if (!d1.length || !d2.length) return 0;
  let pontos = 0;
  d1.forEach((doseLic) => {
    d2.forEach((doseProd) => {
      if (doseLic === doseProd) pontos += 1;
      else if (doseLic.includes(doseProd) || doseProd.includes(doseLic)) pontos += 0.8;
    });
  });
  return Math.min(pontos / d1.length, 1);
}

function principalAtivo(texto: string) {
  return tokensDescricao(texto)
    .filter((t) => !["injetavel", "comprimido", "capsula", "unidade", "caixa"].includes(t))
    .slice(0, 2)
    .join(" ");
}

export function calcularSimilaridade(descricaoLicitacao: string, produto: ProdutoBusca) {
  const descLic = normalizarDescricao(descricaoLicitacao);
  const descProd = normalizarDescricao([produto.descricao, produto.apresentacao, produto.marca].filter(Boolean).join(" "));
  const tokensLic = tokensDescricao(descLic);
  const tokensProd = tokensDescricao(descProd);
  if (!tokensLic.length || !tokensProd.length) return 0;

  let score = 0;
  if (descProd === descLic) score += 100;
  if (descProd.includes(descLic) || descLic.includes(descProd)) score += 30;
  score += jaccard(tokensLic, tokensProd) * 45;
  tokensLic.forEach((token) => {
    if (tokensProd.includes(token)) score += 5;
    else if (tokensProd.some((p) => p.includes(token) || token.includes(p))) score += 2;
  });
  score += scoreDosagem(descLic, descProd) * 25;

  const ativoLic = principalAtivo(descLic);
  const ativoProd = principalAtivo(descProd);
  if (ativoLic && ativoProd) {
    if (ativoLic === ativoProd) score += 20;
    else if (ativoLic.includes(ativoProd) || ativoProd.includes(ativoLic)) score += 15;
  }
  if (tokensLic.includes("injetavel") && tokensProd.includes("injetavel")) score += 10;
  return Math.min(Math.round(score), 100);
}

export function encontrarCandidatos(descricao: string, produtos: ProdutoBusca[], limite = 25) {
  return produtos
    .map((produto) => ({ produto, score: calcularSimilaridade(descricao, produto) }))
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
  if (!melhor || melhor.score < 45) return null;
  return melhor;
}

export function classificarConfianca(score: number) {
  if (score >= 75) return "alto";
  if (score >= 55) return "medio";
  return "baixo";
}
