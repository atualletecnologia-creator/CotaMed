export type ProdutoBusca = {
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
  "c": "com",
  "c/": "com",
  "s": "sem",
  "s/": "sem",
  "und": "unidade",
  "unid": "unidade",
  "un": "unidade",
  "cx": "caixa",
  "pct": "pacote",
  "pc": "pacote",
  "desc": "descartavel",
  "descartável": "descartavel",
  "proced": "procedimento",
  "proc": "procedimento",
  "est": "esteril",
  "estéril": "esteril",
  "inj": "injetavel",
  "injetável": "injetavel",
  "amp": "ampola",
  "comp": "comprimido",
  "compr": "comprimido",
  "cap": "capsula",
  "cápsula": "capsula",
  "fr": "frasco",
  "fras": "frasco",
  "sol": "solucao",
  "solução": "solucao",
  "luerlock": "luer lock",
  "luerr": "luer",
  "macrogota": "macrogotas",
  "microgota": "microgotas",
  "jelco": "cateter intravenoso",
  "abocath": "cateter intravenoso",
  "scalp": "dispositivo intravenoso",
  "esparadrapo": "fita hospitalar",
  "luva proc": "luva procedimento",
  "luva procedimento": "luva procedimento",
  "equipo soro": "equipo",
  "equipo macrogotas": "equipo macrogotas",
  "equipo microgotas": "equipo microgotas"
};

const palavrasIgnoradas = new Set([
  "de", "da", "do", "das", "dos", "para", "por", "em", "a", "o", "e",
  "produto", "material", "hospitalar", "uso", "adulto", "infantil"
]);

export function normalizarDescricao(texto: unknown) {
  let normalizado = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:()]/g, " ")
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
    .filter((p) => p.length >= 2 && !palavrasIgnoradas.has(p));
}

function jaccard(a: string[], b: string[]) {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersecao = [...setA].filter((x) => setB.has(x)).length;
  const uniao = new Set([...a, ...b]).size;

  if (!uniao) return 0;

  return intersecao / uniao;
}

function contemDosagem(descricao: string, produto: string) {
  const padrao = /\d+([,.]\d+)?\s*(mg|g|mcg|ml|l|ui|%)?/gi;
  const d1 = descricao.match(padrao)?.map((v) => v.replace(/\s+/g, "").toLowerCase()) || [];
  const d2 = produto.match(padrao)?.map((v) => v.replace(/\s+/g, "").toLowerCase()) || [];

  if (!d1.length) return 0;

  const iguais = d1.filter((v) => d2.includes(v)).length;

  return iguais / d1.length;
}

export function calcularSimilaridade(descricaoLicitacao: string, produto: ProdutoBusca) {
  const descLic = normalizarDescricao(descricaoLicitacao);
  const descProd = normalizarDescricao([
    produto.descricao,
    produto.apresentacao,
    produto.marca
  ].filter(Boolean).join(" "));

  const tokensLic = tokensDescricao(descLic);
  const tokensProd = tokensDescricao(descProd);

  let score = 0;

  if (descProd === descLic) score += 100;
  if (descProd.includes(descLic) || descLic.includes(descProd)) score += 45;

  score += jaccard(tokensLic, tokensProd) * 45;

  tokensLic.forEach((token) => {
    if (tokensProd.includes(token)) score += 3;
    else if (tokensProd.some((p) => p.includes(token) || token.includes(p))) score += 1.5;
  });

  score += contemDosagem(descLic, descProd) * 20;

  return Math.min(Math.round(score), 100);
}

export function encontrarMelhorProduto(descricao: string, produtos: ProdutoBusca[]) {
  const candidatos = produtos
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
    });

  return candidatos[0] || null;
}

export function classificarConfianca(score: number) {
  if (score >= 80) return "alto";
  if (score >= 60) return "medio";
  return "baixo";
}
