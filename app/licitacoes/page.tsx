"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { encontrarMelhorProduto, classificarConfianca, encontrarCandidatos } from "@/lib/buscaInteligente";
import { baixarBlobPdfRegistro } from "@/lib/storagePdf";

type TipoPreco = "unitario" | "caixa";

type Produto = {
  id?: string;
  descricao?: string | null;
  apresentacao?: string | null;
  marca?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
  custo_unitario?: number | null;
  custo_caixa?: number | null;
  quantidade_por_caixa?: number | null;
  pdf_url?: string | null;
};

type ItemLicitacao = {
  numero_item: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  produto_id?: string | null;
  marca?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
  custo_usado?: number | null;
  quantidade_por_caixa?: number | null;
  tipo_preco?: TipoPreco;
  valor_unitario?: number | null;
  valor_total?: number | null;
  pdf_url?: string | null;
  status: string;
  confianca?: number;
  origem_match?: string;
  excluido?: boolean;
};

function maiusculo(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

function normalizarCabecalho(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

function numero(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = String(valor)
    .replace("R$", "")
    .replace(/\s/g, "")
    .trim();

  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function dinheiro(valor?: number | null) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function nomeSeguro(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function pegarDescricao(linha: Record<string, unknown>) {
  return maiusculo(
    linha.descricao_dos_produtos ||
      linha.descricao ||
      linha.descrição ||
      linha.produto ||
      linha.medicamento ||
      linha.objeto ||
      ""
  );
}

function pegarMarcaSolicitada(linha: Record<string, unknown>) {
  return maiusculo(
    linha.marca ||
      linha.marca_referencia ||
      linha.marca_solicitada ||
      linha.fabricante ||
      ""
  );
}

function pegarRegistroSolicitado(linha: Record<string, unknown>) {
  return String(
    linha.registro_anvisa ||
      linha.registro ||
      linha.anvisa ||
      ""
  ).replace(/\D/g, "").trim();
}

function pegarValorPorCabecalho(
  linha: Record<string, unknown>,
  exatos: string[],
  parciais: string[] = []
) {
  for (const chave of exatos) {
    const valor = linha[chave];

    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  for (const [chave, valor] of Object.entries(linha)) {
    if (valor === undefined || valor === null || String(valor).trim() === "") continue;

    const chaveNormalizada = normalizarCabecalho(chave);
    const partes = chaveNormalizada.split("_").filter(Boolean);

    const bateParcial = parciais.some((parcial) => {
      if (partes.includes(parcial)) return true;
      if (chaveNormalizada === parcial) return true;
      if (chaveNormalizada.startsWith(`${parcial}_`)) return true;
      if (chaveNormalizada.endsWith(`_${parcial}`)) return true;
      return false;
    });

    if (bateParcial) return valor;
  }

  return "";
}

function pegarQuantidade(linha: Record<string, unknown>) {
  const valor = pegarValorPorCabecalho(
    linha,
    [
      "quantidade",
      "quant",
      "qtd",
      "qtde",
      "qde",
      "qtdade",
      "qtd_total",
      "quantidade_total",
      "qtd_item",
      "qtde_item",
      "qtd_solicitada",
      "quantidade_solicitada",
      "qtd_licitada",
      "quantidade_licitada",
      "qtd_estimada",
      "quantidade_estimada",
      "qt",
    ],
    ["qtd", "qtde", "quant", "quantidade", "qde", "qt"]
  );

  const quantidade = numero(valor);
  return quantidade > 0 ? quantidade : 1;
}

function pegarUnidade(linha: Record<string, unknown>) {
  const valor = pegarValorPorCabecalho(
    linha,
    [
      "unidade",
      "unid",
      "un",
      "und",
      "unidade_medida",
      "unid_medida",
      "un_medida",
      "und_medida",
      "u_m",
      "um",
      "medida",
    ],
    ["unidade", "unid", "und", "medida"]
  );

  const unidade = maiusculo(valor);
  return unidade || "UNIDADE";
}


function statusClasse(status: string) {
  if (status === "Encontrado") return "bg-green-100 text-green-700";
  if (status === "Manual") return "bg-blue-100 text-blue-700";
  if (status === "Conferir") return "bg-yellow-100 text-yellow-800";
  if (status === "Excluído") return "bg-slate-200 text-slate-700";
  return "bg-red-100 text-red-700";
}

function itemPodeCotar(item: ItemLicitacao) {
  if (item.excluido) return false;

  const statusCotavel =
    item.status === "Encontrado" ||
    item.status === "Manual" ||
    item.status === "Conferir" ||
    item.status === "Conferir match";

  const temCotacao = !!item.produto_id && !!item.custo_usado && !!item.valor_unitario;

  return statusCotavel || temCotacao;
}

function labelProduto(produto: Produto) {
  return [
    produto.descricao,
    produto.apresentacao,
    produto.marca,
    produto.registro_anvisa ? `REG ${produto.registro_anvisa}` : "",
    produto.custo_unitario ? `UNIT ${dinheiro(produto.custo_unitario)}` : "",
    produto.custo_caixa ? `CX ${dinheiro(produto.custo_caixa)}` : "",
  ].filter(Boolean).join(" | ");
}

function custoPorTipo(produto: Produto, tipoPreco: TipoPreco) {
  if (tipoPreco === "caixa") return produto.custo_caixa || produto.custo_unitario || 0;
  return produto.custo_unitario || produto.custo_caixa || 0;
}

function detectarTipoPrecoAutomatico(descricao: string, unidade: string): TipoPreco {
  const descOriginal = maiusculo(descricao);
  const unid = maiusculo(unidade);

  const indicaCaixaNaDescricao =
    /\bC\s*\/\s*\d+\b/.test(descOriginal) ||
    /\bC\/\d+\b/.test(descOriginal) ||
    /\bCX\s*\d+\b/.test(descOriginal) ||
    /\bCAIXA\b/.test(descOriginal) ||
    /\bEMBALAGEM\b/.test(descOriginal) ||
    /\bPACOTE\b/.test(descOriginal) ||
    /\bPCT\b/.test(descOriginal) ||
    /\bCARTELA\b/.test(descOriginal);

  const indicaCaixaNaUnidade = /\b(CX|CAIXA|PCT|PACOTE|EMBALAGEM|CARTELA)\b/.test(unid);

  if (indicaCaixaNaDescricao || indicaCaixaNaUnidade) return "caixa";

  return "unitario";
}

function resolverTipoPrecoPadrao(tipoPadrao: TipoPreco | "auto", descricao: string, unidade: string): TipoPreco {
  if (tipoPadrao === "auto") return detectarTipoPrecoAutomatico(descricao, unidade);
  return tipoPadrao;
}

function montarItemCotado(params: {
  index: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  produto: Produto | null;
  margem: number;
  confianca?: number;
  origemMatch?: string;
  tipoPreco: TipoPreco;
}) {
  const { index, descricao, quantidade, unidade, produto, margem, confianca, origemMatch, tipoPreco } = params;

  if (!produto) {
    return {
      numero_item: String(index + 1).padStart(3, "0"),
      descricao,
      quantidade,
      unidade,
      status: "Não encontrado",
      confianca: 0,
      origem_match: "sem_match",
      tipo_preco: tipoPreco,
      excluido: false,
    };
  }

  const score = confianca || 0;
  const custo = custoPorTipo(produto, tipoPreco);
  const valorUnitario = custo > 0 ? custo * (1 + margem / 100) : null;
  const valorTotal = valorUnitario ? valorUnitario * quantidade : null;
  const nivel = classificarConfianca(score);

  let status = "Não encontrado";

  if (custo > 0) {
    status = nivel === "alto" ? "Encontrado" : "Conferir";
  }

  return {
    numero_item: String(index + 1).padStart(3, "0"),
    descricao,
    quantidade,
    unidade,
    produto_id: produto.id || null,
    marca: produto.marca,
    registro_anvisa: produto.registro_anvisa,
    vencimento_registro: produto.vencimento_registro,
    custo_usado: custo || null,
    quantidade_por_caixa: produto.quantidade_por_caixa || null,
    tipo_preco: tipoPreco,
    valor_unitario: valorUnitario,
    valor_total: valorTotal,
    pdf_url: produto.pdf_url,
    confianca: score,
    origem_match: origemMatch || "busca_local",
    status,
    excluido: false,
  };
}

function normalizarBuscaProduto(valor: unknown) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\|,.;:()[\]{}_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chaveProdutoSemMarca(produto: Produto) {
  return normalizarBuscaProduto([
    produto.descricao,
    produto.apresentacao,
  ].filter(Boolean).join(" | "));
}

function produtosBuscaManualMenorCusto(
  produtos: Produto[],
  descricaoBusca: string,
  tipoPreco: TipoPreco
) {
  const termo = normalizarBuscaProduto(descricaoBusca);

  const candidatos = produtos
    .filter((produto) => {
      const texto = normalizarBuscaProduto([
        produto.descricao,
        produto.apresentacao,
        produto.marca,
        produto.registro_anvisa,
      ].filter(Boolean).join(" "));

      return !termo || texto.includes(termo) || termo.includes(normalizarBuscaProduto(produto.descricao));
    });

  const melhorPorProduto = new Map<string, Produto>();

  candidatos.forEach((produto) => {
    const chave = chaveProdutoSemMarca(produto) || String(produto.id || "");
    const atual = melhorPorProduto.get(chave);

    if (!atual) {
      melhorPorProduto.set(chave, produto);
      return;
    }

    const custoAtual = custoPorTipo(atual, tipoPreco) || Number.MAX_SAFE_INTEGER;
    const custoNovo = custoPorTipo(produto, tipoPreco) || Number.MAX_SAFE_INTEGER;

    if (custoNovo < custoAtual) {
      melhorPorProduto.set(chave, produto);
    }
  });

  return Array.from(melhorPorProduto.values())
    .sort((a, b) => {
      const custoA = custoPorTipo(a, tipoPreco) || Number.MAX_SAFE_INTEGER;
      const custoB = custoPorTipo(b, tipoPreco) || Number.MAX_SAFE_INTEGER;

      if (custoA !== custoB) return custoA - custoB;

      return String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR");
    })
    .slice(0, 30);
}

async function buscarTodosProdutosLicitacao() {
  const tamanhoLote = 1000;
  let inicio = 0;
  let todos: Produto[] = [];

  while (true) {
    const fim = inicio + tamanhoLote - 1;

    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .order("descricao", { ascending: true })
      .range(inicio, fim);

    if (error) throw error;

    const lote = (data || []) as Produto[];
    todos = todos.concat(lote);

    if (lote.length < tamanhoLote) break;

    inicio += tamanhoLote;
  }

  return todos;
}

function normalizarBuscaManual(valor: unknown) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\|,.;:()[\]{}_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textoProdutoManual(produto: Produto) {
  return normalizarBuscaManual([
    produto.descricao,
    produto.apresentacao,
    produto.marca,
    produto.registro_anvisa,
  ].filter(Boolean).join(" "));
}

function combinaBuscaManual(produto: Produto, busca: string) {
  const termo = normalizarBuscaManual(busca);
  if (!termo) return true;

  const texto = textoProdutoManual(produto);
  if (texto.includes(termo)) return true;

  const palavras = termo.split(" ").filter((p) => p.length > 1);
  if (!palavras.length) return true;

  let bateu = 0;
  palavras.forEach((palavra) => {
    if (texto.includes(palavra)) bateu++;
  });

  return bateu / palavras.length >= 0.6;
}

function chaveProdutoManual(produto: Produto) {
  return normalizarBuscaManual([produto.descricao, produto.apresentacao].filter(Boolean).join(" | ")) || String(produto.id || "");
}


const CHAVE_APRENDIZADO_COTAMED = "cotamed_aprendizado_licitacoes_v1";

type AprendizadoBusca = {
  descricao_normalizada: string;
  palavras: string[];
  produto_id: string;
  produto_descricao?: string | null;
  produto_marca?: string | null;
  usos: number;
  atualizado_em: string;
};

function normalizarAprendizado(valor: unknown) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\|,.;:()[\]{}_-]+/g, " ")
    .replace(/\b(SULFATO|CLORIDRATO|SODICO|SODICA|BASE|SOLUCAO|SOLUÇÃO|INJETAVEL|INJETÁVEL|ORAL|USO|ADULTO|PEDIATRICO|PEDIÁTRICO)\b/g, " ")
    .replace(/\b(COMP|COMPR|COMPRIMIDO|COMPRIMIDOS)\b/g, " COMPRIMIDO ")
    .replace(/\b(CAPS|CAPSULA|CÁPSULA|CAPSULAS|CÁPSULAS)\b/g, " CAPSULA ")
    .replace(/\b(AMP|AMPOLA|AMPOLAS)\b/g, " AMPOLA ")
    .replace(/\b(CX|CAIXA|C\/|C)\s*(\d+)\b/g, " CAIXA $2 ")
    .replace(/\s+/g, " ")
    .trim();
}

function palavrasAprendizado(valor: unknown) {
  const ignorar = new Set([
    "DE", "DA", "DO", "DAS", "DOS", "PARA", "POR", "COM", "SEM",
    "ML", "MG", "G", "MCG", "UN", "UND", "UNIDADE", "CAIXA", "CX"
  ]);

  return normalizarAprendizado(valor)
    .split(" ")
    .map((p) => p.trim())
    .filter((p) => p.length > 1)
    .filter((p) => !ignorar.has(p));
}

function carregarAprendizadosBusca(): AprendizadoBusca[] {
  if (typeof window === "undefined") return [];

  try {
    const bruto = window.localStorage.getItem(CHAVE_APRENDIZADO_COTAMED);
    if (!bruto) return [];

    const dados = JSON.parse(bruto);
    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

function salvarAprendizadosBusca(aprendizados: AprendizadoBusca[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      CHAVE_APRENDIZADO_COTAMED,
      JSON.stringify(aprendizados.slice(0, 800))
    );
  } catch {
    // Se o navegador bloquear localStorage, apenas ignora.
  }
}

function gravarAprendizadoBusca(descricaoLicitacao: string, produto: Produto) {
  if (!produto.id || !descricaoLicitacao) return;

  const descricaoNormalizada = normalizarAprendizado(descricaoLicitacao);
  const palavras = palavrasAprendizado(descricaoLicitacao);

  if (!descricaoNormalizada || !palavras.length) return;

  const aprendizados = carregarAprendizadosBusca();
  const existente = aprendizados.find(
    (a) => a.descricao_normalizada === descricaoNormalizada && a.produto_id === produto.id
  );

  if (existente) {
    existente.usos += 1;
    existente.atualizado_em = new Date().toISOString();
  } else {
    aprendizados.unshift({
      descricao_normalizada: descricaoNormalizada,
      palavras,
      produto_id: produto.id,
      produto_descricao: produto.descricao,
      produto_marca: produto.marca,
      usos: 1,
      atualizado_em: new Date().toISOString(),
    });
  }

  salvarAprendizadosBusca(
    aprendizados.sort((a, b) => {
      if (b.usos !== a.usos) return b.usos - a.usos;
      return String(b.atualizado_em).localeCompare(String(a.atualizado_em));
    })
  );
}

function buscarProdutoPorAprendizado(descricao: string, produtos: Produto[]) {
  const aprendizados = carregarAprendizadosBusca();
  if (!aprendizados.length) return null;

  const palavrasDescricao = palavrasAprendizado(descricao);
  if (!palavrasDescricao.length) return null;

  const candidatos = aprendizados
    .map((aprendizado) => {
      const produto = produtos.find((p) => p.id === aprendizado.produto_id);
      if (!produto) return null;

      let iguais = 0;

      aprendizado.palavras.forEach((palavra) => {
        if (palavrasDescricao.includes(palavra)) iguais++;
      });

      const scorePalavras = aprendizado.palavras.length
        ? iguais / aprendizado.palavras.length
        : 0;

      const scoreDescricao = palavrasDescricao.length
        ? iguais / palavrasDescricao.length
        : 0;

      const score = Math.round(((scorePalavras * 0.65) + (scoreDescricao * 0.35)) * 100) + Math.min(aprendizado.usos, 10);

      return { produto, score };
    })
    .filter(Boolean) as { produto: Produto; score: number }[];

  const melhor = candidatos
    .filter((c) => c.score >= 72)
    .sort((a, b) => b.score - a.score)[0];

  return melhor || null;
}

function normalizarUnidadesBusca(valor: unknown) {
  return normalizarAprendizado(valor)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\bMICROGRAMAS?\b/g, "MCG")
    .replace(/\bMILIGRAMAS?\b/g, "MG")
    .replace(/\bGRAMAS?\b/g, "G")
    .replace(/\bMILILITROS?\b/g, "ML")
    .replace(/\bLITROS?\b/g, "L")
    .replace(/\bUNIDADES? INTERNACIONAIS?\b/g, "UI")
    .replace(/\bGA\b/g, "G")
    .replace(/\s+/g, " ")
    .trim();
}

type EquivalenciaFarmaceutica = {
  concentracoesMgPorMl: number[];
  dosesTotaisMg: number[];
  volumesMl: number[];
  possuiRelacaoMassaVolume: boolean;
};

type AtributosBusca = {
  texto: string;
  tokens: string[];
  tokensFortes: string[];
  medidas: Record<string, string[]>;
  apresentacoes: string[];
  caracteristicas: string[];
  farmaceutico: EquivalenciaFarmaceutica;
};


function quaseIgual(a: number, b: number, toleranciaRelativa = 0.015) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const escala = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= escala * toleranciaRelativa;
}

function massaParaMg(valor: number, unidade: string) {
  if (unidade === "MCG") return valor / 1000;
  if (unidade === "G") return valor * 1000;
  if (unidade === "KG") return valor * 1000000;
  return valor;
}

function volumeParaMl(valor: number, unidade: string) {
  return unidade === "L" ? valor * 1000 : valor;
}

function valoresUnicos(valores: number[]) {
  const saida: number[] = [];
  valores.forEach((valor) => {
    if (Number.isFinite(valor) && valor > 0 && !saida.some((existente) => quaseIgual(existente, valor, 0.000001))) {
      saida.push(Number(valor.toFixed(6)));
    }
  });
  return saida;
}

/**
 * Converte apresentações farmacêuticas diferentes para bases comparáveis.
 * Exemplos reconhecidos:
 * - 25 mg/mL + ampola 3 mL = 75 mg/3 mL
 * - 75 mg/3 mL = 25 mg/mL
 * - 1 g = 1000 mg
 *
 * Também mantém uma equivalência controlada para a grafia abreviada comum
 * "25 mg/3 mL" quando o cadastro correspondente informa 75 mg/3 mL.
 * Essa flexibilização só é usada junto com a validação do princípio ativo.
 */
function extrairEquivalenciaFarmaceutica(valor: unknown): EquivalenciaFarmaceutica {
  const bruto = String(valor || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\bMICROGRAMAS?\b/g, "MCG")
    .replace(/\bMILIGRAMAS?\b/g, "MG")
    .replace(/\bGRAMAS?\b/g, "G")
    .replace(/\bMILILITROS?\b/g, "ML")
    .replace(/\bLITROS?\b/g, "L")
    .replace(/\s+/g, " ")
    .trim();

  const concentracoes: number[] = [];
  const totais: number[] = [];
  const volumes: number[] = [];
  let possuiRelacao = false;

  const relacao = /(\d+(?:\.\d+)?)\s*(MCG|MG|G|KG)\s*\/\s*(?:(\d+(?:\.\d+)?)\s*)?(ML|L)\b/g;
  let match: RegExpExecArray | null;
  while ((match = relacao.exec(bruto))) {
    possuiRelacao = true;
    const massaMg = massaParaMg(Number(match[1]), match[2]);
    const volumeMl = volumeParaMl(Number(match[3] || "1"), match[4]);
    if (volumeMl > 0) {
      concentracoes.push(massaMg / volumeMl);
      totais.push(massaMg);
      volumes.push(volumeMl);

      // Alguns editais escrevem "25 mg/3 mL" querendo indicar 25 mg por mL
      // em ampola de 3 mL. Mantemos também esse candidato calculado (25 x 3 = 75),
      // mas ele nunca é usado isoladamente: nome do fármaco e apresentação ainda
      // precisam ser compatíveis.
      if (volumeMl > 1) totais.push(massaMg * volumeMl);
    }
  }

  const massaSolta = /(\d+(?:\.\d+)?)\s*(MCG|MG|G|KG)\b/g;
  while ((match = massaSolta.exec(bruto))) {
    const antes = bruto.slice(Math.max(0, match.index - 2), match.index);
    if (antes.includes("/")) continue;
    totais.push(massaParaMg(Number(match[1]), match[2]));
  }

  const volumeSolto = /(\d+(?:\.\d+)?)\s*(ML|L)\b/g;
  while ((match = volumeSolto.exec(bruto))) {
    const antes = bruto.slice(Math.max(0, match.index - 2), match.index);
    if (antes.includes("/")) continue;
    volumes.push(volumeParaMl(Number(match[1]), match[2]));
  }

  const volumesUnicos = valoresUnicos(volumes);
  const concentracoesUnicas = valoresUnicos(concentracoes);
  const totaisUnicos = valoresUnicos(totais);

  // Se existe concentração explícita por 1 mL e um volume de apresentação,
  // calcula também a quantidade total da ampola/frasco.
  concentracoesUnicas.forEach((concentracao) => {
    volumesUnicos.forEach((volume) => totaisUnicos.push(Number((concentracao * volume).toFixed(6))));
  });

  return {
    concentracoesMgPorMl: valoresUnicos(concentracoesUnicas),
    dosesTotaisMg: valoresUnicos(totaisUnicos),
    volumesMl: volumesUnicos,
    possuiRelacaoMassaVolume: possuiRelacao,
  };
}

function avaliarEquivalenciaFarmaceutica(item: EquivalenciaFarmaceutica, produto: EquivalenciaFarmaceutica) {
  const ambosFarmaceuticos = item.possuiRelacaoMassaVolume || produto.possuiRelacaoMassaVolume;
  if (!ambosFarmaceuticos) return { comparado: false, compativel: true, pontos: 0, motivo: "" };

  const volumeComparavel = item.volumesMl.length && produto.volumesMl.length;
  const volumeIgual = !volumeComparavel || item.volumesMl.some((a) => produto.volumesMl.some((b) => quaseIgual(a, b)));

  const concentracaoIgual = item.concentracoesMgPorMl.some((a) =>
    produto.concentracoesMgPorMl.some((b) => quaseIgual(a, b))
  );
  const totalIgual = item.dosesTotaisMg.some((a) =>
    produto.dosesTotaisMg.some((b) => quaseIgual(a, b))
  );

  if ((concentracaoIgual || totalIgual) && volumeIgual) {
    return {
      comparado: true,
      compativel: true,
      pontos: concentracaoIgual && totalIgual ? 26 : 22,
      motivo: concentracaoIgual ? "concentração farmacêutica equivalente" : "dose total equivalente",
    };
  }

  // Se os dois lados têm dados farmacêuticos suficientes e nenhum cálculo bate,
  // bloqueia para evitar trocar dosagem.
  const itemTemDose = item.concentracoesMgPorMl.length || item.dosesTotaisMg.length;
  const produtoTemDose = produto.concentracoesMgPorMl.length || produto.dosesTotaisMg.length;
  if (itemTemDose && produtoTemDose) {
    return { comparado: true, compativel: false, pontos: 0, motivo: "concentração/dose farmacêutica incompatível" };
  }

  return { comparado: false, compativel: true, pontos: 0, motivo: "" };
}

const PALAVRAS_FRACAS_BUSCA = new Set([
  "DE", "DA", "DO", "DAS", "DOS", "PARA", "POR", "COM", "SEM", "EM", "E", "A", "O",
  "MATERIAL", "PRODUTO", "HOSPITALAR", "DESCARTAVEL", "ESTERIL", "ATOXICO", "APIROGENICO",
  "USO", "UNICO", "INDIVIDUAL", "EMBALAGEM", "CONTENDO", "CONFORME", "NORMA", "REGISTRO",
  "ANVISA", "FABRICANTE", "MARCA", "QUALIDADE", "PRIMEIRA", "PROCEDENCIA", "NACIONAL",
  "IMPORTADO", "ADULTO", "PEDIATRICO", "TAMANHO", "TIPO", "MODELO"
]);

const APRESENTACOES_EQUIVALENTES: Record<string, string> = {
  "COMP": "COMPRIMIDO", "COMPR": "COMPRIMIDO", "COMPRIMIDOS": "COMPRIMIDO",
  "CAPS": "CAPSULA", "CAPSULAS": "CAPSULA",
  "AMP": "AMPOLA", "AMPOLAS": "AMPOLA",
  "FR": "FRASCO", "FRASCOS": "FRASCO",
  "CX": "CAIXA", "PCT": "PACOTE", "UND": "UNIDADE", "UN": "UNIDADE",
  "LL": "LUERLOCK", "LUER": "LUER", "LOCK": "LOCK",
};

function tokenCanonicoBusca(token: string) {
  return APRESENTACOES_EQUIVALENTES[token] || token;
}

function extrairAtributosBusca(valor: unknown): AtributosBusca {
  const texto = normalizarUnidadesBusca(valor)
    .replace(/\bLUER\s+LOCK\b/g, "LUERLOCK")
    .replace(/\bLUER\s+SLIP\b/g, "LUERSLIP")
    .replace(/\bC\s*\/\s*(\d+)\b/g, "CAIXA $1")
    .replace(/\bCX\s*(\d+)\b/g, "CAIXA $1")
    .replace(/\s+/g, " ")
    .trim();

  const brutos = texto.split(" ").map(tokenCanonicoBusca).filter(Boolean);
  const tokens = Array.from(new Set(brutos.filter((t) => t.length > 1 && !PALAVRAS_FRACAS_BUSCA.has(t))));

  const genericos = new Set([
    "COMPRIMIDO", "CAPSULA", "AMPOLA", "FRASCO", "CAIXA", "PACOTE", "UNIDADE", "INJETAVEL",
    "SOLUCAO", "SUSPENSAO", "CREME", "POMADA", "GEL", "SPRAY", "SERINGA", "CATETER", "LUVA",
    "AGULHA", "EQUIPO", "CURATIVO", "BOLSA"
  ]);

  const tokensFortes = tokens.filter((t) => !genericos.has(t) && !/^\d/.test(t) && !/^(MG|MCG|G|KG|ML|L|UI|MM|CM|FR|G)$/.test(t));

  const medidas: Record<string, string[]> = {};
  const regex = /\b(\d+(?:\.\d+)?)\s*(MCG|MG|KG|ML|L|UI|%|MM|CM|FR|G)\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto))) {
    const valorNumero = Number(match[1]);
    const unidade = match[2];
    let categoria = unidade;
    let valorNormalizado = valorNumero;

    if (unidade === "MCG") { categoria = "MASSA_MG"; valorNormalizado = valorNumero / 1000; }
    else if (unidade === "MG") { categoria = "MASSA_MG"; }
    else if (unidade === "G") { categoria = "MASSA_MG"; valorNormalizado = valorNumero * 1000; }
    else if (unidade === "KG") { categoria = "MASSA_MG"; valorNormalizado = valorNumero * 1000000; }
    else if (unidade === "ML") { categoria = "VOLUME_ML"; }
    else if (unidade === "L") { categoria = "VOLUME_ML"; valorNormalizado = valorNumero * 1000; }
    else if (unidade === "MM") { categoria = "COMPRIMENTO_MM"; }
    else if (unidade === "CM") { categoria = "COMPRIMENTO_MM"; valorNormalizado = valorNumero * 10; }

    const chave = String(Number(valorNormalizado.toFixed(6)));
    medidas[categoria] = Array.from(new Set([...(medidas[categoria] || []), chave]));
  }

  const termosApresentacao = [
    "COMPRIMIDO", "CAPSULA", "AMPOLA", "FRASCO", "SERINGA", "CATETER", "LUVA", "AGULHA",
    "EQUIPO", "CAIXA", "PACOTE", "SACHE", "BOLSA", "CREME", "POMADA", "SOLUCAO",
    "SUSPENSAO", "INJETAVEL", "GEL", "SPRAY"
  ];
  const apresentacoes = termosApresentacao.filter((termo) => tokens.includes(termo));

  const caracteristicas = ["LUERLOCK", "LUERSLIP", "MACROGOTAS", "MICROGOTAS", "TRIFACETADA", "HIPODERMICA", "CIRURGICA", "PROCEDIMENTO"]
    .filter((termo) => texto.includes(termo));

  const farmaceutico = extrairEquivalenciaFarmaceutica(valor);
  return { texto, tokens, tokensFortes, medidas, apresentacoes, caracteristicas, farmaceutico };
}

function similaridadeDice(a: string, b: string) {
  const x = a.replace(/\s+/g, " ").trim();
  const y = b.replace(/\s+/g, " ").trim();
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;

  const bigramas = (texto: string) => {
    const mapa = new Map<string, number>();
    for (let i = 0; i < texto.length - 1; i++) {
      const b = texto.slice(i, i + 2);
      mapa.set(b, (mapa.get(b) || 0) + 1);
    }
    return mapa;
  };

  const bx = bigramas(x);
  const by = bigramas(y);
  let intersecao = 0;
  bx.forEach((qtd, chave) => { intersecao += Math.min(qtd, by.get(chave) || 0); });
  return (2 * intersecao) / Math.max(1, (x.length - 1) + (y.length - 1));
}

function tokensCompativeis(a: string, b: string) {
  if (a === b) return true;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return true;
  return similaridadeDice(a, b) >= 0.82;
}

function contarCorrespondencias(origem: string[], destino: string[]) {
  return origem.filter((token) => destino.some((outro) => tokensCompativeis(token, outro))).length;
}

function avaliarMedidas(item: AtributosBusca, produto: AtributosBusca) {
  const equivalenciaFarmaceutica = avaliarEquivalenciaFarmaceutica(item.farmaceutico, produto.farmaceutico);
  if (equivalenciaFarmaceutica.comparado) {
    if (!equivalenciaFarmaceutica.compativel) {
      return { bloqueado: true, pontos: 0, motivo: equivalenciaFarmaceutica.motivo };
    }

    // Massa e volume já foram validados pela equivalência farmacêutica. As demais
    // categorias (calibre, comprimento, UI, porcentagem etc.) continuam rígidas.
    let extrasComparados = 0;
    for (const [categoria, valoresItem] of Object.entries(item.medidas)) {
      if (categoria === "MASSA_MG" || categoria === "VOLUME_ML") continue;
      const valoresProduto = produto.medidas[categoria];
      if (!valoresProduto?.length) continue;
      extrasComparados++;
      if (!valoresItem.some((v) => valoresProduto.includes(v))) {
        return { bloqueado: true, pontos: 0, motivo: `medida incompatível (${categoria.toLowerCase()})` };
      }
    }

    return {
      bloqueado: false,
      pontos: equivalenciaFarmaceutica.pontos + Math.min(6, extrasComparados * 3),
      motivo: equivalenciaFarmaceutica.motivo,
    };
  }

  let categoriasComparadas = 0;
  let categoriasIguais = 0;
  for (const [categoria, valoresItem] of Object.entries(item.medidas)) {
    const valoresProduto = produto.medidas[categoria];
    if (!valoresProduto?.length) continue;
    categoriasComparadas++;
    if (valoresItem.some((v) => valoresProduto.includes(v))) categoriasIguais++;
    else return { bloqueado: true, pontos: 0, motivo: `medida incompatível (${categoria.toLowerCase()})` };
  }
  return { bloqueado: false, pontos: categoriasComparadas ? 18 + categoriasIguais * 3 : 0, motivo: "medidas compatíveis" };
}

function compatibilidadeMarca(marcaSolicitada: string, produto: Produto) {
  const solicitada = normalizarAprendizado(marcaSolicitada);
  const cadastrada = normalizarAprendizado(produto.marca);
  if (!solicitada) return { compativel: true, pontos: 0 };
  if (!cadastrada) return { compativel: true, pontos: -4 };
  const igual = solicitada === cadastrada || solicitada.includes(cadastrada) || cadastrada.includes(solicitada) || similaridadeDice(solicitada, cadastrada) >= 0.88;
  return { compativel: igual, pontos: igual ? 12 : 0 };
}

function avaliarProdutoEstrito(
  descricao: string,
  produto: Produto,
  marcaSolicitada = "",
  registroSolicitado = ""
) {
  const item = extrairAtributosBusca(descricao);
  const candidato = extrairAtributosBusca([produto.descricao, produto.apresentacao].filter(Boolean).join(" "));
  const registroProduto = String(produto.registro_anvisa || "").replace(/\D/g, "");

  if (registroSolicitado) {
    if (registroProduto && registroProduto === registroSolicitado) {
      return { score: 100, bloqueado: false, motivo: "registro ANVISA idêntico" };
    }
    if (registroProduto && registroProduto !== registroSolicitado) {
      return { score: 0, bloqueado: true, motivo: "registro ANVISA diferente" };
    }
  }

  const marca = compatibilidadeMarca(marcaSolicitada, produto);
  if (!marca.compativel) return { score: 0, bloqueado: true, motivo: "marca diferente" };

  const medidas = avaliarMedidas(item, candidato);
  if (medidas.bloqueado) return { score: 0, bloqueado: true, motivo: medidas.motivo };

  if (!item.tokens.length || !candidato.tokens.length) {
    return { score: 0, bloqueado: true, motivo: "descrição insuficiente" };
  }

  const comunsItem = contarCorrespondencias(item.tokens, candidato.tokens);
  const comunsCandidato = contarCorrespondencias(candidato.tokens, item.tokens);
  const coberturaItem = comunsItem / Math.max(1, item.tokens.length);
  const coberturaCandidato = comunsCandidato / Math.max(1, candidato.tokens.length);

  const fortesComuns = contarCorrespondencias(item.tokensFortes, candidato.tokensFortes);
  const coberturaFortesItem = item.tokensFortes.length ? fortesComuns / item.tokensFortes.length : 0;
  const coberturaFortesCandidato = candidato.tokensFortes.length ? fortesComuns / candidato.tokensFortes.length : 0;

  const similaridadeTexto = similaridadeDice(item.texto, candidato.texto);

  // Pelo menos uma identidade forte precisa existir. Isso bloqueia produtos sem relação,
  // mas permite variações longas no descritivo do edital.
  if (item.tokensFortes.length && candidato.tokensFortes.length && fortesComuns === 0 && similaridadeTexto < 0.58) {
    return { score: 0, bloqueado: true, motivo: "produto principal diferente" };
  }

  const apresentacoesComuns = item.apresentacoes.some((a) => candidato.apresentacoes.includes(a));
  if (item.apresentacoes.length && candidato.apresentacoes.length && !apresentacoesComuns) {
    const genericos = new Set(["CAIXA", "PACOTE", "UNIDADE", "SOLUCAO", "INJETAVEL"]);
    const especificasItem = item.apresentacoes.filter((a) => !genericos.has(a));
    const especificasProduto = candidato.apresentacoes.filter((a) => !genericos.has(a));
    if (especificasItem.length && especificasProduto.length) {
      return { score: 0, bloqueado: true, motivo: "apresentação diferente" };
    }
  }

  const conflitoCaracteristica = item.caracteristicas.some((carac) =>
    candidato.caracteristicas.length > 0 && !candidato.caracteristicas.includes(carac)
  );
  if (conflitoCaracteristica) return { score: 0, bloqueado: true, motivo: "característica técnica diferente" };

  let score = 0;
  score += Math.round(coberturaItem * 32);
  score += Math.round(coberturaCandidato * 12);
  score += Math.round(coberturaFortesItem * 23);
  score += Math.round(coberturaFortesCandidato * 8);
  score += Math.round(similaridadeTexto * 12);
  score += medidas.pontos;
  score += marca.pontos;
  if (apresentacoesComuns) score += 5;
  if (item.texto === candidato.texto) score = 100;

  // Descrições muito longas do edital não devem derrubar um cadastro resumido.
  if (coberturaFortesItem >= 0.75 && coberturaFortesCandidato >= 0.75 && !medidas.bloqueado) score = Math.max(score, 84);
  if (coberturaFortesItem === 1 && coberturaFortesCandidato === 1 && similaridadeTexto >= 0.55) score = Math.max(score, 88);

  return { score: Math.max(0, Math.min(100, Math.round(score))), bloqueado: false, motivo: "compatível" };
}

function ordenarCandidatosAprimorados(
  descricao: string,
  produtos: Produto[],
  tipoPreco: TipoPreco,
  marcaSolicitada = "",
  registroSolicitado = ""
) {
  const aprendido = buscarProdutoPorAprendizado(descricao, produtos);
  return produtos
    .map((produto) => {
      const avaliacao = avaliarProdutoEstrito(descricao, produto, marcaSolicitada, registroSolicitado);
      const bonusAprendizado = aprendido?.produto?.id === produto.id && !avaliacao.bloqueado ? Math.min(8, 3 + Math.floor((aprendido.score || 0) / 25)) : 0;
      return {
        produto,
        score: Math.min(100, avaliacao.score + bonusAprendizado),
        bloqueado: avaliacao.bloqueado,
        motivo: avaliacao.motivo,
        custo: custoPorTipo(produto, tipoPreco) || Number.MAX_SAFE_INTEGER,
        aprendido: aprendido?.produto?.id === produto.id,
      };
    })
    .filter((c) => !c.bloqueado && c.score >= 48)
    .sort((a, b) => b.score !== a.score ? b.score - a.score : a.custo - b.custo);
}

function encontrarMelhorProdutoAprimorado(
  descricao: string,
  produtos: Produto[],
  tipoPreco: TipoPreco,
  marcaSolicitada = "",
  registroSolicitado = ""
) {
  const avaliados = ordenarCandidatosAprimorados(descricao, produtos, tipoPreco, marcaSolicitada, registroSolicitado);
  const melhor = avaliados[0];
  if (!melhor) return null;

  const segundo = avaliados[1];
  const vantagem = segundo ? melhor.score - segundo.score : 100;

  // 82+ é automático quando há vantagem clara. Entre 72 e 81 o produto é sugerido
  // como "Conferir". Abaixo disso não é preenchido sem ajuda da IA.
  if (melhor.score < 72) return null;
  if (melhor.score < 82 && vantagem < 7 && !melhor.aprendido) return null;

  return {
    produto: melhor.produto,
    score: melhor.score,
    origem: melhor.aprendido ? "aprendizado_validado" : melhor.score >= 82 ? "busca_hibrida" : "busca_hibrida_revisar",
  };
}

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-500">{label}</p>
      <div className="text-[11px] font-medium text-slate-800 break-words">{value}</div>
    </div>
  );
}

function esperarInterface() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}



const CHAVE_RASCUNHO_LICITACAO = "cotamed_rascunho_licitacao_24h";
const CHAVE_COTACOES_SALVAS = "cotamed_cotacoes_salvas_local_v1";
const TEMPO_RASCUNHO_LICITACAO = 24 * 60 * 60 * 1000;

type RascunhoLicitacao = {
  salvo_em: number;
  arquivo_nome: string;
  margem: string;
  tipoPrecoPadrao: TipoPreco | "auto";
  usarIa: boolean;
  itens: ItemLicitacao[];
  buscaManualPorItem: Record<string, string>;
  custoManualTextoPorItem: Record<string, string>;
};

function formatarDataHoraRascunho(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function compactarItemRascunho(item: ItemLicitacao): ItemLicitacao {
  return {
    numero_item: item.numero_item,
    descricao: item.descricao,
    unidade: item.unidade,
    quantidade: item.quantidade,
    produto_id: item.produto_id || "",
    marca: item.marca || "",
    registro_anvisa: item.registro_anvisa || "",
    vencimento_registro: item.vencimento_registro || "",
    custo_usado: item.custo_usado || 0,
    tipo_preco: item.tipo_preco,
    valor_unitario: item.valor_unitario || 0,
    valor_total: item.valor_total || 0,
    pdf_url: item.pdf_url || null,
    status: item.status,
    confianca: item.confianca || 0,
    origem_match: item.origem_match || "",
    excluido: !!item.excluido,
  };
}

function rascunhoValido(rascunho: RascunhoLicitacao | null) {
  if (!rascunho?.salvo_em) return false;
  if (!Array.isArray(rascunho.itens) || rascunho.itens.length === 0) return false;
  return Date.now() - rascunho.salvo_em <= TEMPO_RASCUNHO_LICITACAO;
}

function carregarRascunhoLicitacao(): RascunhoLicitacao | null {
  if (typeof window === "undefined") return null;

  const ler = (storage: Storage) => {
    try {
      const bruto = storage.getItem(CHAVE_RASCUNHO_LICITACAO);
      if (!bruto) return null;
      return JSON.parse(bruto) as RascunhoLicitacao;
    } catch {
      return null;
    }
  };

  const rascunho = ler(window.localStorage) || ler(window.sessionStorage);

  if (!rascunhoValido(rascunho)) {
    window.localStorage.removeItem(CHAVE_RASCUNHO_LICITACAO);
    window.sessionStorage.removeItem(CHAVE_RASCUNHO_LICITACAO);
    return null;
  }

  return rascunho;
}

function salvarRascunhoLicitacao(rascunho: RascunhoLicitacao) {
  if (typeof window === "undefined") return;
  if (!rascunho.itens?.length) return;

  const compacto: RascunhoLicitacao = {
    ...rascunho,
    salvo_em: Date.now(),
    itens: rascunho.itens.map(compactarItemRascunho),
  };

  const texto = JSON.stringify(compacto);

  try {
    window.localStorage.setItem(CHAVE_RASCUNHO_LICITACAO, texto);
  } catch {}

  try {
    window.sessionStorage.setItem(CHAVE_RASCUNHO_LICITACAO, texto);
  } catch {}
}

function apagarRascunhoLicitacao() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHAVE_RASCUNHO_LICITACAO);
  window.sessionStorage.removeItem(CHAVE_RASCUNHO_LICITACAO);
}

export default function Licitacoes() {
  const [margem, setMargem] = useState("30");
  const [tipoPrecoPadrao, setTipoPrecoPadrao] = useState<TipoPreco | "auto">("auto");
  const [usarIa, setUsarIa] = useState(false);
  const [produtosBanco, setProdutosBanco] = useState<Produto[]>([]);
  const [buscaManualPorItem, setBuscaManualPorItem] = useState<Record<string, string>>({});
  const [custoManualTextoPorItem, setCustoManualTextoPorItem] = useState<Record<string, string>>({});
  const [itens, setItens] = useState<ItemLicitacao[]>([]);
  const [filtro, setFiltro] = useState("todos");
  const [paginaItens, setPaginaItens] = useState(1);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [progressoProcessamento, setProgressoProcessamento] = useState("");
  const [arquivoNome, setArquivoNome] = useState("");
  const [rascunhoDisponivel, setRascunhoDisponivel] = useState<RascunhoLicitacao | null>(null);
  const [rascunhoCarregado, setRascunhoCarregado] = useState(false);

  const resumo = useMemo(() => {
    const total = itens.filter(itemPodeCotar).reduce((acc, item) => acc + (item.valor_total || 0), 0);
    return {
      total,
      encontrados: itens.filter((i) => i.status === "Encontrado" && !i.excluido).length,
      manual: itens.filter((i) => i.status === "Manual" && !i.excluido).length,
      conferir: itens.filter((i) => i.status === "Conferir" && !i.excluido).length,
      naoEncontrados: itens.filter((i) => i.status !== "Encontrado" && i.status !== "Manual" && i.status !== "Conferir" && !i.excluido).length,
      excluidos: itens.filter((i) => i.excluido).length,
      pdfs: itens.filter((i) => i.pdf_url && itemPodeCotar(i)).length,
    };
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    if (filtro === "preenchidos") return itens.filter((i) => (i.status === "Encontrado" || i.status === "Manual") && !i.excluido);
    if (filtro === "manual") return itens.filter((i) => i.status === "Manual" && !i.excluido);
    if (filtro === "conferir") return itens.filter((i) => i.status === "Conferir" && !i.excluido);
    if (filtro === "nao_encontrados") return itens.filter((i) => i.status !== "Encontrado" && i.status !== "Manual" && i.status !== "Conferir" && !i.excluido);
    if (filtro === "com_pdf") return itens.filter((i) => !!i.pdf_url && !i.excluido);
    if (filtro === "sem_pdf") return itens.filter((i) => !i.pdf_url && !i.excluido);
    if (filtro === "excluidos") return itens.filter((i) => i.excluido);
    return itens;
  }, [itens, filtro]);

  const itensPorPagina = 50;

  const totalPaginasItens = Math.max(1, Math.ceil(itensFiltrados.length / itensPorPagina));

  const itensPaginados = useMemo(() => {
    const paginaSegura = Math.min(Math.max(paginaItens, 1), totalPaginasItens);
    const inicio = (paginaSegura - 1) * itensPorPagina;

    return itensFiltrados.slice(inicio, inicio + itensPorPagina);
  }, [itensFiltrados, paginaItens, totalPaginasItens]);

  useEffect(() => {
    setPaginaItens(1);
  }, [filtro, itens.length]);

  useEffect(() => {
    const rascunho = carregarRascunhoLicitacao();

    if (rascunho) {
      setRascunhoDisponivel(rascunho);
      setMensagem("Rascunho disponível para continuar neste computador.");
    }

    setRascunhoCarregado(true);
  }, []);

useEffect(() => {
    if (!rascunhoCarregado) return;
    if (!itens.length) return;

    const timer = window.setTimeout(() => {
      const rascunho: RascunhoLicitacao = {
        salvo_em: Date.now(),
        arquivo_nome: arquivoNome || "Licitação em andamento",
        margem,
        tipoPrecoPadrao,
        usarIa,
        itens,
        buscaManualPorItem,
        custoManualTextoPorItem,
      };

      salvarRascunhoLicitacao(rascunho);
      setRascunhoDisponivel(rascunho);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [rascunhoCarregado, arquivoNome, margem, tipoPrecoPadrao, usarIa, itens, buscaManualPorItem, custoManualTextoPorItem]);

useEffect(() => {
    if (!rascunhoCarregado) return;
    if (!itens.length) return;

    const timer = window.setTimeout(() => {
      const rascunho: RascunhoLicitacao = {
        salvo_em: Date.now(),
        arquivo_nome: arquivoNome || "Licitação em andamento",
        margem,
        tipoPrecoPadrao,
        usarIa,
        itens,
        buscaManualPorItem,
        custoManualTextoPorItem,
      };

      salvarRascunhoLicitacao(rascunho);
      setRascunhoDisponivel(rascunho);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [rascunhoCarregado, arquivoNome, margem, tipoPrecoPadrao, usarIa, itens, buscaManualPorItem, custoManualTextoPorItem]);

  const itensParaExportar = useMemo(() => itens.filter(itemPodeCotar), [itens]);

  function alternarExcluir(numeroItem: string) {
    setItens((atuais) => atuais.map((item) => item.numero_item === numeroItem ? { ...item, excluido: !item.excluido } : item));
  }

  function recalcularItem(item: ItemLicitacao, produto: Produto, tipoPreco: TipoPreco, status = "Manual") {
    const margemNumero = numero(margem);
    const custo = custoPorTipo(produto, tipoPreco);
    const valorUnitario = custo > 0 ? custo * (1 + margemNumero / 100) : null;
    const valorTotal = valorUnitario ? valorUnitario * item.quantidade : null;

    return {
      ...item,
      produto_id: produto.id || null,
      marca: produto.marca,
      registro_anvisa: produto.registro_anvisa,
      vencimento_registro: produto.vencimento_registro,
      custo_usado: custo || null,
      quantidade_por_caixa: produto.quantidade_por_caixa || null,
      tipo_preco: tipoPreco,
      valor_unitario: valorUnitario,
      valor_total: valorTotal,
      pdf_url: produto.pdf_url,
      confianca: status === "Manual" ? 100 : item.confianca,
      origem_match: status === "Manual" ? "manual" : item.origem_match,
      status,
      excluido: false,
    };
  }

  function recalcularItemManualLivre(
    item: ItemLicitacao,
    campos: Partial<ItemLicitacao> & { custo_usado?: number | null; tipo_preco?: TipoPreco }
  ) {
    const margemNumero = numero(margem);
    const custo = campos.custo_usado ?? item.custo_usado ?? 0;
    const valorUnitario = custo > 0 ? custo * (1 + margemNumero / 100) : null;
    const valorTotal = valorUnitario ? valorUnitario * item.quantidade : null;

    return {
      ...item,
      ...campos,
      produto_id: null,
      marca: maiusculo(campos.marca ?? item.marca),
      registro_anvisa: maiusculo(campos.registro_anvisa ?? item.registro_anvisa),
      custo_usado: custo || null,
      tipo_preco: campos.tipo_preco || item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade),
      valor_unitario: valorUnitario,
      valor_total: valorTotal,
      pdf_url: campos.pdf_url ?? item.pdf_url ?? null,
      confianca: 100,
      origem_match: "manual_livre",
      status: custo > 0 ? "Manual" : item.status,
      excluido: false,
    };
  }

  function alterarCustoManualLivreTexto(numeroItem: string, valor: string) {
    const valorNormalizado = valor.replace(/[^0-9,\.]/g, "");

    setCustoManualTextoPorItem((atual) => ({
      ...atual,
      [numeroItem]: valorNormalizado,
    }));

    setItens((atuais) =>
      atuais.map((item) => {
        if (item.numero_item !== numeroItem) return item;
        return recalcularItemManualLivre(item, { custo_usado: numero(valorNormalizado) });
      })
    );
  }

  function alterarCampoManualLivre(numeroItem: string, campo: "marca" | "registro_anvisa" | "custo_usado", valor: string) {
    setItens((atuais) =>
      atuais.map((item) => {
        if (item.numero_item !== numeroItem) return item;

        if (campo === "custo_usado") {
          return recalcularItemManualLivre(item, { custo_usado: numero(valor) });
        }

        return recalcularItemManualLivre(item, { [campo]: valor } as Partial<ItemLicitacao>);
      })
    );
  }

  function selecionarProdutoManual(numeroItem: string, produtoId: string) {
    if (!produtoId) return;
    const produto = produtosBanco.find((p) => p.id === produtoId);
    if (!produto) return;

    const itemAtual = itens.find((item) => item.numero_item === numeroItem);
    if (itemAtual) {
      gravarAprendizadoBusca(itemAtual.descricao, produto);
    }

    setCustoManualTextoPorItem((atual) => {
      const novo = { ...atual };
      delete novo[numeroItem];
      return novo;
    });

    setItens((atuais) =>
      atuais.map((item) => item.numero_item === numeroItem ? recalcularItem(item, produto, item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade), "Manual") : item)
    );
  }

  function alterarTipoPrecoItem(numeroItem: string, tipoPreco: TipoPreco) {
    setItens((atuais) =>
      atuais.map((item) => {
        if (item.numero_item !== numeroItem) return item;
        const produto = produtosBanco.find((p) => p.id === item.produto_id);
        if (!produto) return recalcularItemManualLivre(item, { tipo_preco: tipoPreco });
        return recalcularItem(item, produto, tipoPreco, item.status);
      })
    );
  }

  async function buscarComIa(descricao: string, produtos: Produto[], marcaSolicitada = "", registroSolicitado = "") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const candidatosLocais = ordenarCandidatosAprimorados(
      descricao,
      produtos,
      "unitario",
      marcaSolicitada,
      registroSolicitado
    ).slice(0, 10).map((c) => c.produto);

    if (!candidatosLocais.length) {
      clearTimeout(timeout);
      return null;
    }

    try {
      const resp = await fetch("/api/ia/match-produto", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao, produtos: candidatosLocais }),
      });

      clearTimeout(timeout);
      if (!resp.ok) return null;

      const data = await resp.json();
      if (!data.indice || !data.confianca) return null;

      const produto = candidatosLocais[Number(data.indice) - 1];
      if (!produto) return null;

      const avaliacaoEstrita = avaliarProdutoEstrito(descricao, produto, marcaSolicitada, registroSolicitado);
      const confiancaIa = Number(data.confianca) || 0;
      const scoreFinal = Math.round((confiancaIa * 0.35) + (avaliacaoEstrita.score * 0.65));

      // A IA nunca pode contornar as regras objetivas de produto, dose, apresentação ou marca.
      if (avaliacaoEstrita.bloqueado || avaliacaoEstrita.score < 65 || scoreFinal < 74) return null;

      return { produto, score: scoreFinal };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  async function carregarRascunhoSupabase() {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const userId = sessao.session?.user?.id;

      if (!userId) return null;

      const limite = new Date(Date.now() - TEMPO_RASCUNHO_LICITACAO).toISOString();

      const { data, error } = await supabase
        .from("licitacoes_rascunhos")
        .select("conteudo, updated_at")
        .eq("user_id", userId)
        .gte("updated_at", limite)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data?.conteudo) return null;

      const rascunho = data.conteudo as RascunhoLicitacao;
      return rascunhoValido(rascunho) ? rascunho : null;
    } catch {
      return null;
    }
  }

  async function salvarRascunhoSupabase(rascunho: RascunhoLicitacao) {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const userId = sessao.session?.user?.id;

      if (!userId) return;

      const compacto: RascunhoLicitacao = {
        ...rascunho,
        salvo_em: Date.now(),
        itens: rascunho.itens.map(compactarItemRascunho),
      };

      await supabase
        .from("licitacoes_rascunhos")
        .upsert(
          {
            user_id: userId,
            conteudo: compacto,
            arquivo_nome: compacto.arquivo_nome,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    } catch {
      // Se a tabela ainda não existir, o rascunho continua salvo no navegador.
    }
  }

  async function apagarRascunhoSupabase() {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const userId = sessao.session?.user?.id;

      if (!userId) return;

      await supabase.from("licitacoes_rascunhos").delete().eq("user_id", userId);
    } catch {
      // Ignora se a tabela ainda não existir.
    }
  }

  function continuarRascunhoLicitacao() {
    const rascunho = carregarRascunhoLicitacao();

    if (!rascunho) {
      setRascunhoDisponivel(null);
      setErro("Nenhum rascunho válido encontrado.");
      return;
    }

    setArquivoNome(rascunho.arquivo_nome || "Licitação em andamento");
    setMargem(rascunho.margem || "30");
    setTipoPrecoPadrao(rascunho.tipoPrecoPadrao || "auto");
    setUsarIa(!!rascunho.usarIa);
    setItens(rascunho.itens || []);
    setBuscaManualPorItem(rascunho.buscaManualPorItem || {});
    setCustoManualTextoPorItem(rascunho.custoManualTextoPorItem || {});
    setFiltro("todos");
    setPaginaItens(1);
    setMensagem("Rascunho restaurado com sucesso.");
  }

  function novaCotacaoLicitacao() {
    const confirmar = itens.length
      ? window.confirm("Começar uma nova cotação? O rascunho atual será apagado.")
      : true;

    if (!confirmar) return;

    apagarRascunhoLicitacao();
    setRascunhoDisponivel(null);
    setArquivoNome("");
    setItens([]);
    setBuscaManualPorItem({});
    setCustoManualTextoPorItem({});
    setFiltro("todos");
    setPaginaItens(1);
    setMensagem("Nova cotação iniciada.");
  }

  async function processarPlanilha(file: File | null) {
    try {
      setErro("");
      setMensagem("");
      setItens([]);
      setRascunhoDisponivel(null);
      setBuscaManualPorItem({});
      setCustoManualTextoPorItem({});
      setFiltro("todos");

      if (!file) return;

      setArquivoNome(file.name);
      setProcessando(true);

      const produtos = await buscarTodosProdutosLicitacao();
      const produtosError = null;

      if (produtosError) {
        setErro(produtosError.message);
        return;
      }

      const produtosValidos = (produtos || []) as Produto[];
      setProdutosBanco(produtosValidos);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const primeiraAba = workbook.SheetNames[0];
      const sheet = workbook.Sheets[primeiraAba];
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      if (!linhas.length) {
        setErro("A planilha está vazia.");
        return;
      }

      const linhasNormalizadas = linhas
        .map((linha) => {
          const normalizada: Record<string, unknown> = {};
          Object.entries(linha).forEach(([chave, valor]) => {
            normalizada[normalizarCabecalho(chave)] = valor;
          });
          return normalizada;
        })
        .filter((linha) => pegarDescricao(linha));

      if (!linhasNormalizadas.length) {
        setErro("Nenhum item válido encontrado. Use a coluna DESCRIÇÃO DOS PRODUTOS ou descricao.");
        return;
      }

      const margemNumero = numero(margem);
      const itensCotados: ItemLicitacao[] = [];

      for (let index = 0; index < linhasNormalizadas.length; index++) {
        if (index % 25 === 0) {
          setProgressoProcessamento(`Processando ${index + 1} de ${linhasNormalizadas.length} itens...`);
          await esperarInterface();
        }

        const linha = linhasNormalizadas[index];
        const descricao = pegarDescricao(linha);
        const quantidade = pegarQuantidade(linha);
        const unidade = pegarUnidade(linha);
        const marcaSolicitada = pegarMarcaSolicitada(linha);
        const registroSolicitado = pegarRegistroSolicitado(linha);

        const tipoPrecoItem = resolverTipoPrecoPadrao(tipoPrecoPadrao, descricao, unidade);
        const melhor = encontrarMelhorProdutoAprimorado(
          descricao,
          produtosValidos,
          tipoPrecoItem,
          marcaSolicitada,
          registroSolicitado
        );
        let produto = melhor?.produto || null;
        let score = melhor?.score || 0;
        let origem = melhor?.origem || "busca_local";

        if (usarIa && score < 84 && produtosValidos.length) {
          const ia = await buscarComIa(descricao, produtosValidos, marcaSolicitada, registroSolicitado);
          if (ia && ia.score > score) {
            produto = ia.produto;
            score = ia.score;
            origem = "ia";
          }
        }

        itensCotados.push(
          montarItemCotado({ index, descricao, quantidade, unidade, produto, margem: margemNumero, confianca: score, origemMatch: origem, tipoPreco: tipoPrecoItem })
        );
      }

      const itensCorrigidos = itensCotados.map((item) => {
        if (item.produto_id && item.custo_usado && item.valor_unitario && item.status === "Não encontrado") {
          return {
            ...item,
            status: "Conferir",
            origem_match: item.origem_match || "busca_local",
          };
        }

        return item;
      });

      setItens(itensCorrigidos);
      setMensagem(`${itensCorrigidos.length} itens processados. A busca híbrida comparou nome principal, medidas, apresentação, marca, registro ANVISA e variações do descritivo. Correspondências duvidosas foram marcadas para conferência em vez de serem descartadas.`);
    } finally {
      setProcessando(false);
      setProgressoProcessamento("");
    }
  }


  function salvarCotacaoNesteComputador() {
    if (!itensParaExportar.length) {
      setErro("Nenhum item cotado para salvar.");
      return;
    }

    const nome = window.prompt("Nome para identificar esta cotação:", arquivoNome || "Cotação sem nome");

    if (!nome) return;

    const cotacao = {
      id: `${Date.now()}`,
      nome,
      arquivo_nome: arquivoNome || nome,
      salvo_em: Date.now(),
      total: itensParaExportar.reduce((acc, item) => acc + Number(item.valor_total || 0), 0),
      quantidade_itens: itensParaExportar.length,
      itens: itensParaExportar,
    };

    try {
      const bruto = window.localStorage.getItem(CHAVE_COTACOES_SALVAS);
      const antigas = bruto ? JSON.parse(bruto) : [];
      const lista = [cotacao, ...antigas].slice(0, 20);
      window.localStorage.setItem(CHAVE_COTACOES_SALVAS, JSON.stringify(lista));
      setMensagem("Cotação salva neste computador para gerar proposta.");
    } catch {
      setErro("Não foi possível salvar a cotação neste computador.");
    }
  }

  function baixarPlanilhaPreenchida() {
    if (!itens.length) {
      setErro("Processe uma planilha antes de baixar.");
      return;
    }

    if (!itensParaExportar.length) {
      setErro("Nenhum item confirmado para exportar.");
      return;
    }

    const dados = itens.map((item) => {
      const cotar = itemPodeCotar(item);
      return {
        ITEM: item.numero_item,
        "DESCRIÇÃO DOS PRODUTOS": item.descricao,
        UNID: item.unidade,
        QUANT: item.quantidade,
        "TIPO PREÇO": cotar ? (item.tipo_preco === "caixa" ? "CAIXA" : "UNITÁRIO") : "",
        REGISTRO: cotar ? item.registro_anvisa || "" : "",
        MARCA: cotar ? item.marca || "" : "",
        "QUANTIDADE POR CAIXA": cotar ? item.quantidade_por_caixa || "" : "",
        CUSTO: cotar ? item.custo_usado || "" : "",
        "VL. UNIT": cotar ? item.valor_unitario || "" : "",
        "VL. TOTAL": cotar ? item.valor_total || "" : "",
        "VENCIMENTO REGISTRO": cotar ? item.vencimento_registro || "" : "",
        CONFIANCA: item.confianca || "",
        "ORIGEM MATCH": item.origem_match || "",
        STATUS: item.excluido ? "Excluído da cotação" : item.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotação");
    XLSX.writeFile(wb, `cotacao-preenchida-cotamed-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function baixarZipRegistros() {
    try {
      setErro("");
      setMensagem("");

      const itensComPdf = itensParaExportar.filter((item) => item.pdf_url);
      if (!itensComPdf.length) {
        setErro("Nenhum PDF de registro ANVISA foi encontrado para os itens confirmados.");
        return;
      }

      const zip = new JSZip();
      for (const item of itensComPdf) {
        const blob = await baixarBlobPdfRegistro(item.pdf_url);
        if (!blob) continue;
        const nomeArquivo = `${item.numero_item}_${nomeSeguro(item.descricao)}_${item.registro_anvisa || "registro"}.pdf`;
        zip.file(nomeArquivo, blob);
      }

      const conteudo = await zip.generateAsync({ type: "blob" });
      saveAs(conteudo, `registros-anvisa-cotamed-${new Date().toISOString().slice(0, 10)}.zip`);
      setMensagem("ZIP dos registros ANVISA gerado com sucesso.");
    } catch {
      setErro("Não foi possível gerar o ZIP dos registros.");
    }
  }

  return (
    <AppShell>
      <div className="flex min-w-0 flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Licitações</h1>
          <p className="text-slate-500">Resultado em lista compacta, com seleção manual e escolha de preço por item.</p>
        </div>

        <div className="flex min-w-0 flex-wrap gap-3">
          <button type="button" className="btn-clean btn-clean-secondary" onClick={novaCotacaoLicitacao}>
            Nova cotação
          </button>

          <a href="/modelos/modelo-licitacao-cotamed.xlsx" download className="btn-primary text-center">
            Baixar modelo da licitação
          </a>
        </div>
      </div>

      {rascunhoDisponivel && (
        <section className="rascunho-licitacao-card">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Última cotação</p>
            <h2>{rascunhoDisponivel.arquivo_nome || "Licitação em andamento"}</h2>
            <p>
              Última alteração: {formatarDataHoraRascunho(rascunhoDisponivel.salvo_em)} • salvo neste computador por 24h
            </p>
          </div>

          <div className="rascunho-licitacao-actions">
            <button type="button" className="btn-clean btn-clean-primary" onClick={continuarRascunhoLicitacao}>
              Continuar
            </button>

            <button type="button" className="btn-clean btn-clean-secondary" onClick={novaCotacaoLicitacao}>
              Nova cotação
            </button>
          </div>
        </section>
      )}

      <section className="clean-card p-6 mt-6">
        <h2 className="font-bold text-xl">Enviar planilha da licitação</h2>

        <div className="licitacao-form-grid">
          <div className="licitacao-field"><label>Margem de lucro (%)</label>
            <input className="input mt-2" value={margem} onChange={(e) => setMargem(e.target.value)} />
          </div>

          <div className="licitacao-field"><label>Tipo de preço padrão</label>
            <select className="input mt-2" value={tipoPrecoPadrao} onChange={(e) => setTipoPrecoPadrao(e.target.value as TipoPreco | "auto")}>
              <option value="auto">Automático por item</option>
              <option value="unitario">Preço unitário</option>
              <option value="caixa">Preço por caixa</option>
            </select>
          </div>

          <div className="licitacao-field"><label>IA gratuita como fallback</label>
            <select className="input mt-2" value={usarIa ? "sim" : "nao"} onChange={(e) => setUsarIa(e.target.value === "sim")}>
              <option value="nao">Não, usar só busca local</option>
              <option value="sim">Sim, usar IA rápida quando não encontrar</option>
            </select>
          </div>

          <div className="licitacao-field"><label>Planilha</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="input mt-2" onChange={(e) => processarPlanilha(e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="licitacao-help">
          O sistema identifica os itens automaticamente. Você pode ajustar cada item depois do processamento.
        </div>

        {arquivoNome && <p className="text-sm text-slate-500 mt-4">Arquivo selecionado: {arquivoNome}</p>}
        {processando && <p className="text-cotamed-700 text-sm mt-4">{progressoProcessamento || "Processando planilha..."}</p>}
        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      {itens.length > 0 && (
        <>
          <section className="grid min-w-0 md:grid-cols-6 gap-4 mt-6">
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Encontrados</p><h3 className="text-xl font-bold text-green-700">{resumo.encontrados}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Manual</p><h3 className="text-xl font-bold text-blue-700">{resumo.manual}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Conferir</p><h3 className="text-xl font-bold text-yellow-700">{resumo.conferir}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Não encontrados</p><h3 className="text-xl font-bold text-red-700">{resumo.naoEncontrados}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Excluídos</p><h3 className="text-xl font-bold text-slate-700">{resumo.excluidos}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Valor confirmado</p><h3 className="text-xl font-bold">{dinheiro(resumo.total)}</h3></div>
          </section>

          <section className="clean-card p-4 mt-6">
            <div className="flex min-w-0 flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Resultado da cotação</h2>
                <p className="text-sm text-slate-500">Exibindo {itensPaginados.length} de {itensFiltrados.length} itens filtrados. Total da licitação: {itens.length}.</p>
              </div>

              <div className="flex min-w-0 flex-col md:flex-row gap-3">
                <select className="input text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="todos">Todos os itens</option>
                  <option value="preenchidos">Preenchidos</option>
                  <option value="manual">Selecionados manualmente</option>
                  <option value="conferir">Conferir</option>
                  <option value="nao_encontrados">Não encontrados</option>
                  <option value="com_pdf">Com PDF</option>
                  <option value="sem_pdf">Sem PDF</option>
                  <option value="excluidos">Excluídos</option>
                </select>

                <button onClick={salvarCotacaoNesteComputador} className="rounded-xl border border-green-200 px-4 py-2 text-green-700 hover:bg-green-50 text-sm">Salvar cotação</button>
                <button onClick={baixarPlanilhaPreenchida} className="btn-primary text-sm">Baixar planilha</button>
                <button onClick={baixarZipRegistros} className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50 text-sm">Baixar ZIP</button>
              </div>
            </div>

            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl bg-blue-50 p-3 text-sm">
              <span>
                Página <b>{Math.min(paginaItens, totalPaginasItens)}</b> de <b>{totalPaginasItens}</b> — mostrando até {itensPorPagina} itens por vez para não travar.
              </span>

              <div className="flex min-w-0 gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 hover:bg-white disabled:opacity-50"
                  disabled={paginaItens <= 1}
                  onClick={() => setPaginaItens((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>

                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 hover:bg-white disabled:opacity-50"
                  disabled={paginaItens >= totalPaginasItens}
                  onClick={() => setPaginaItens((p) => Math.min(totalPaginasItens, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {itensPaginados.map((item) => {
                const cotar = itemPodeCotar(item);
                const statusVisivel = item.excluido ? "Excluído" : item.status;
                const preencher = !item.excluido && (item.status === "Encontrado" || item.status === "Manual" || item.status === "Conferir");

                return (
                  <div key={item.numero_item} className={item.excluido ? "licitacao-item-card opacity-70 bg-slate-50" : "licitacao-item-card"}>
                    <div className="licitacao-status-row">
                      <span className={`licitacao-status-badge ${statusClasse(statusVisivel)}`} title={statusVisivel}>
                        {statusVisivel}
                      </span>
                    </div>

                    <div className="licitacao-item-resumo">
                      <div className="w-12 shrink-0"><Campo label="Item" value={<b>{item.numero_item}</b>} /></div>

                      <div className="min-w-[280px] flex-1 licitacao-descricao-resumo">
                        <Campo label="Descrição" value={item.descricao} />
                      </div>

                      <div className="w-16"><Campo label="Qtd" value={item.quantidade} /></div>
                      <div className="w-16"><Campo label="Unid" value={item.unidade} /></div>

                      <div className="w-24">
                        <p className="text-[10px] text-slate-500">Tipo preço</p>
                        <select className="input text-[11px] h-8 py-1" value={item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade)} onChange={(e) => alterarTipoPrecoItem(item.numero_item, e.target.value as TipoPreco)}>
                          <option value="unitario">Unit.</option>
                          <option value="caixa">Caixa</option>
                        </select>
                      </div>

                      <div className="w-28"><Campo label="Marca" value={preencher ? item.marca || "-" : "-"} /></div>
                      <div className="w-28"><Campo label="Registro" value={preencher ? item.registro_anvisa || "-" : "-"} /></div>
                      <div className="w-20"><Campo label="Custo" value={preencher ? dinheiro(item.custo_usado) : "-"} /></div>
                      <div className="w-20"><Campo label="Vl.Unit" value={preencher ? dinheiro(item.valor_unitario) : "-"} /></div>
                      <div className="w-20"><Campo label="Vl.Total" value={preencher ? dinheiro(item.valor_total) : "-"} /></div>
                      <div className="w-14"><Campo label="Conf." value={`${item.confianca || 0}%`} /></div>



                      <div className="w-12"><Campo label="PDF" value={<span className={item.pdf_url && cotar ? "text-green-700" : "text-red-700"}>{item.pdf_url && cotar ? "Sim" : "Não"}</span>} /></div>

                      <div className="w-16">
                        <p className="text-[10px] text-slate-500">Ação</p>
                        <button onClick={() => alternarExcluir(item.numero_item)} className={item.excluido ? "rounded-md border px-2 py-1 text-[10px] text-green-700 hover:bg-green-50" : "rounded-md border px-2 py-1 text-[10px] text-red-700 hover:bg-red-50"}>
                          {item.excluido ? "Voltar" : "Excluir"}
                        </button>
                      </div>
                    </div>

                    {!item.excluido && (
                      <div className="licitacao-manual-panel">
                        <div className="licitacao-manual-search">
                          <label>Buscar produto</label>
                          <input
                            className="input"
                            placeholder="Digite o nome do produto, descrição ou princípio ativo..."
                            value={buscaManualPorItem[item.numero_item] || ""}
                            onChange={(e) =>
                              setBuscaManualPorItem((atual) => ({
                                ...atual,
                                [item.numero_item]: e.target.value.toUpperCase(),
                              }))
                            }
                          />

                          <select
                            className="input"
                            value={item.produto_id || ""}
                            onChange={(e) => selecionarProdutoManual(item.numero_item, e.target.value)}
                          >
                            <option value="">Menor custo</option>
                            {produtosBuscaManualMenorCusto(
                              produtosBanco,
                              buscaManualPorItem[item.numero_item] || item.descricao,
                              item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade)
                            ).map((p) => (
                              <option key={p.id} value={p.id}>{labelProduto(p)}</option>
                            ))}
                          </select>
                        </div>

                        <div className="licitacao-manual-fields">
                          <div>
                            <label>Marca</label>
                            <input
                              className="input"
                              placeholder="Marca"
                              value={item.marca || ""}
                              onChange={(e) => alterarCampoManualLivre(item.numero_item, "marca", e.target.value)}
                            />
                          </div>

                          <div>
                            <label>Registro</label>
                            <input
                              className="input"
                              placeholder="Registro"
                              value={item.registro_anvisa || ""}
                              onChange={(e) => alterarCampoManualLivre(item.numero_item, "registro_anvisa", e.target.value)}
                            />
                          </div>

                          <div>
                            <label>Custo</label>
                            <input
                              className="input"
                              placeholder="Custo"
                              type="text"
                              inputMode="decimal"
                              value={custoManualTextoPorItem[item.numero_item] ?? ""}
                              onChange={(e) => alterarCustoManualLivreTexto(item.numero_item, e.target.value)}
                            />
                          </div>

                          <div>
                            <label>Vl. Unit.</label>
                            <input className="input" value={item.valor_unitario ? dinheiro(item.valor_unitario) : "-"} readOnly />
                          </div>

                          <div>
                            <label>Vl. Total</label>
                            <input className="input" value={item.valor_total ? dinheiro(item.valor_total) : "-"} readOnly />
                          </div>

                          <div>
                            <label>Confiança</label>
                            <input className="input" value={`${item.confianca || 0}%`} readOnly />
                          </div>
                        </div>

                        <p className="licitacao-manual-help">
                          Se o produto não estiver cadastrado, preencha marca e custo manualmente. O sistema calcula a margem automaticamente.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {itensFiltrados.length === 0 && <div className="mt-6 rounded-2xl bg-blue-50 p-5 text-slate-600">Nenhum item encontrado para este filtro.</div>}
          </section>
        </>
      )}
    </AppShell>
  );
}
