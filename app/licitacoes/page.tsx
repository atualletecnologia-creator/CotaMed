"use client";

import { useMemo, useState } from "react";
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
  const texto = String(valor).replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
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

function statusClasse(status: string) {
  if (status === "Encontrado") return "bg-green-100 text-green-700";
  if (status === "Manual") return "bg-blue-100 text-blue-700";
  if (status === "Conferir match") return "bg-yellow-100 text-yellow-800";
  if (status === "Excluído") return "bg-slate-200 text-slate-700";
  return "bg-red-100 text-red-700";
}

function itemPodeCotar(item: ItemLicitacao) {
  return !item.excluido && (item.status === "Encontrado" || item.status === "Manual" || item.status === "Conferir match");
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
  const unidOriginal = maiusculo(unidade);

  const desc = descOriginal
    .replace(/[()\[\].,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const unid = unidOriginal
    .replace(/[()\[\].,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Regra mais segura:
  // Só considera CAIXA quando houver indicação clara de embalagem.
  // Isso evita que item unitário com "100MG", "100ML" ou "100 COMP" vire caixa por engano.
  const indicaCaixaNaDescricao =
    /\bC\s*\/\s*\d+\b/.test(descOriginal) ||      // C/100
    /\bC\/\d+\b/.test(descOriginal) ||            // C/100 sem espaço
    /\bCX\s*\d+\b/.test(desc) ||                  // CX 100
    /\bCAIXA\s*(COM\s*)?\d+\b/.test(desc) ||      // CAIXA 100 / CAIXA COM 100
    /\bEMBALAGEM\s*(COM\s*)?\d+\b/.test(desc) ||  // EMBALAGEM COM 100
    /\bPACOTE\s*(COM\s*)?\d+\b/.test(desc) ||     // PACOTE COM 100
    /\bPCT\s*\d+\b/.test(desc) ||                 // PCT 100
    /\bCARTELA\s*(COM\s*)?\d+\b/.test(desc);      // CARTELA COM 10

  const indicaCaixaNaUnidade =
    /\b(CX|CAIXA|PCT|PACOTE|EMBALAGEM|CARTELA)\b/.test(unid);

  if (indicaCaixaNaDescricao || indicaCaixaNaUnidade) return "caixa";

  const indicaUnidadeNaUnidade =
    /\b(UN|UND|UNID|UNIDADE|AMP|AMPOLA|FR|FRASCO|COMP|COMPRIMIDO|CAP|CAPSULA|ML|L)\b/.test(unid);

  if (indicaUnidadeNaUnidade) return "unitario";

  return "unitario";
}

function resolverTipoPrecoPadrao(tipoPadrao: TipoPreco | "auto", descricao: string, unidade: string): TipoPreco {
  if (tipoPadrao === "auto") return detectarTipoPrecoAutomatico(descricao, unidade);
  return tipoPadrao;
}

function explicarTipoPreco(descricao: string, unidade: string, tipoPreco: TipoPreco) {
  const automatico = detectarTipoPrecoAutomatico(descricao, unidade);

  if (automatico === tipoPreco) {
    return tipoPreco === "caixa" ? "AUTO: CAIXA" : "AUTO: UNITÁRIO";
  }

  return tipoPreco === "caixa" ? "MANUAL: CAIXA" : "MANUAL: UNITÁRIO";
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
      status: "Produto não encontrado",
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

  let status = "Produto não encontrado";
  if (nivel === "alto" && custo > 0) status = "Encontrado";
  else if (nivel === "medio" && custo > 0) status = "Conferir match";

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

function encontrarProdutoMenorCusto(
  descricao: string,
  produtos: Produto[],
  tipoPreco: TipoPreco
) {
  const candidatosOrdenados = encontrarCandidatos(descricao, produtos, 80);

  if (!candidatosOrdenados.length) return null;

  const maiorScore = candidatosOrdenados[0].score;

  // Só compara menor custo entre produtos realmente próximos do melhor match.
  // Isso evita pegar uma marca barata de outro item parecido, mas errado.
  const candidatosConfiaveis = candidatosOrdenados
    .filter((candidato) => candidato.score >= 50)
    .filter((candidato) => candidato.score >= maiorScore - 12)
    .map((candidato) => ({
      ...candidato,
      custo: custoPorTipo(candidato.produto, tipoPreco),
    }))
    .filter((candidato) => candidato.custo > 0)
    .sort((a, b) => {
      if (a.custo !== b.custo) return a.custo - b.custo;
      return b.score - a.score;
    });

  return candidatosConfiaveis[0] || candidatosOrdenados[0] || null;
}


function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-500">{label}</p>
      <div className="text-[11px] font-medium text-slate-800 break-words">{value}</div>
    </div>
  );
}

export default function Licitacoes() {
  const [margem, setMargem] = useState("30");
  const [tipoPrecoPadrao, setTipoPrecoPadrao] = useState<TipoPreco | "auto">("auto");
  const [usarIa, setUsarIa] = useState(false);
  const [produtosBanco, setProdutosBanco] = useState<Produto[]>([]);
  const [itens, setItens] = useState<ItemLicitacao[]>([]);
  const [filtro, setFiltro] = useState("todos");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [arquivoNome, setArquivoNome] = useState("");

  const resumo = useMemo(() => {
    const total = itens.filter(itemPodeCotar).reduce((acc, item) => acc + (item.valor_total || 0), 0);
    return {
      total,
      encontrados: itens.filter((i) => i.status === "Encontrado" && !i.excluido).length,
      manual: itens.filter((i) => i.status === "Manual" && !i.excluido).length,
      conferir: itens.filter((i) => i.status === "Conferir match" && !i.excluido).length,
      naoEncontrados: itens.filter((i) => i.status !== "Encontrado" && i.status !== "Manual" && i.status !== "Conferir match" && !i.excluido).length,
      excluidos: itens.filter((i) => i.excluido).length,
      pdfs: itens.filter((i) => i.pdf_url && itemPodeCotar(i)).length,
    };
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    if (filtro === "preenchidos") return itens.filter((i) => (i.status === "Encontrado" || i.status === "Manual") && !i.excluido);
    if (filtro === "manual") return itens.filter((i) => i.status === "Manual" && !i.excluido);
    if (filtro === "conferir") return itens.filter((i) => i.status === "Conferir match" && !i.excluido);
    if (filtro === "nao_encontrados") return itens.filter((i) => i.status !== "Encontrado" && i.status !== "Manual" && i.status !== "Conferir match" && !i.excluido);
    if (filtro === "com_pdf") return itens.filter((i) => !!i.pdf_url && !i.excluido);
    if (filtro === "sem_pdf") return itens.filter((i) => !i.pdf_url && !i.excluido);
    if (filtro === "excluidos") return itens.filter((i) => i.excluido);
    return itens;
  }, [itens, filtro]);

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

  function selecionarProdutoManual(numeroItem: string, produtoId: string) {
    if (!produtoId) return;
    const produto = produtosBanco.find((p) => p.id === produtoId);
    if (!produto) return;

    setItens((atuais) =>
      atuais.map((item) => item.numero_item === numeroItem ? recalcularItem(item, produto, item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade), "Manual") : item)
    );
  }

  function alterarTipoPrecoItem(numeroItem: string, tipoPreco: TipoPreco) {
    setItens((atuais) =>
      atuais.map((item) => {
        if (item.numero_item !== numeroItem) return item;
        const produto = produtosBanco.find((p) => p.id === item.produto_id);
        if (!produto) return { ...item, tipo_preco: tipoPreco };
        return recalcularItem(item, produto, tipoPreco, item.status);
      })
    );
  }

  async function buscarComIa(descricao: string, produtos: Produto[]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const candidatosLocais = encontrarCandidatos(descricao, produtos, 6).map((c) => c.produto);

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

      return { produto, score: Number(data.confianca) || 0 };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  async function processarPlanilha(file: File | null) {
    try {
      setErro("");
      setMensagem("");
      setItens([]);
      setFiltro("todos");

      if (!file) return;

      setArquivoNome(file.name);
      setProcessando(true);

      const { data: produtos, error: produtosError } = await supabase.from("produtos").select("*").order("descricao", { ascending: true });

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
        const linha = linhasNormalizadas[index];
        const descricao = pegarDescricao(linha);
        const quantidade = numero(linha.quantidade || linha.quant || linha.qtd) || 1;
        const unidade = maiusculo(linha.unidade || linha.unid || linha.und || "UNIDADE");

        const melhor = encontrarMelhorProduto(descricao, produtosValidos);
        let produto = melhor?.produto || null;
        let score = melhor?.score || 0;
        let origem = "busca_local";

        if (usarIa && score < 70 && produtosValidos.length) {
          const ia = await buscarComIa(descricao, produtosValidos);
          if (ia && ia.score > score) {
            produto = ia.produto;
            score = ia.score;
            origem = "ia";
          }
        }

        itensCotados.push(
          montarItemCotado({ index, descricao, quantidade, unidade, produto, margem: margemNumero, confianca: score, origemMatch: origem, tipoPreco: tipoPrecoPadrao })
        );
      }

      setItens(itensCotados);
      setMensagem(`${itensCotados.length} itens processados. Você pode escolher UNITÁRIO ou CAIXA por item.`);
    } finally {
      setProcessando(false);
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Licitações</h1>
          <p className="text-slate-500">Resultado em lista compacta, com seleção manual e escolha de preço por item.</p>
        </div>

        <a href="/modelos/modelo-licitacao-cotamed.xlsx" download className="btn-primary text-center">
          Baixar modelo da licitação
        </a>
      </div>

      <section className="card p-6 mt-6">
        <h2 className="font-bold text-xl">Enviar planilha da licitação</h2>

        <div className="grid md:grid-cols-4 gap-4 mt-5">
          <div>
            <label className="text-sm font-medium">Margem de lucro (%)</label>
            <input className="input mt-2" value={margem} onChange={(e) => setMargem(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Tipo de preço padrão</label>
            <select className="input mt-2" value={tipoPrecoPadrao} onChange={(e) => setTipoPrecoPadrao(e.target.value as TipoPreco | "auto")}>
              <option value="auto">Automático por item</option>
              <option value="unitario">Forçar preço unitário</option>
              <option value="caixa">Forçar preço por caixa</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Usar IA gratuita como fallback</label>
            <select className="input mt-2" value={usarIa ? "sim" : "nao"} onChange={(e) => setUsarIa(e.target.value === "sim")}>
              <option value="nao">Não, usar só busca local</option>
              <option value="sim">Sim, usar IA rápida quando não encontrar</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Planilha</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="input mt-2" onChange={(e) => processarPlanilha(e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4 mt-5 text-sm text-slate-700">
          O sistema identifica <b>CAIXA</b> somente quando houver indicação clara de embalagem, como <b>C/100</b>, <b>CX</b> ou <b>CAIXA</b>. Para itens unitários, mantém <b>UNITÁRIO</b>. Quando houver várias marcas do mesmo item, escolhe a de menor custo entre matches confiáveis.
        </div>

        {arquivoNome && <p className="text-sm text-slate-500 mt-4">Arquivo selecionado: {arquivoNome}</p>}
        {processando && <p className="text-cotamed-700 text-sm mt-4">Processando planilha...</p>}
        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      {itens.length > 0 && (
        <>
          <section className="grid md:grid-cols-6 gap-4 mt-6">
            <div className="card p-4"><p className="text-xs text-slate-500">Encontrados</p><h3 className="text-xl font-bold text-green-700">{resumo.encontrados}</h3></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Manual</p><h3 className="text-xl font-bold text-blue-700">{resumo.manual}</h3></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Conferir</p><h3 className="text-xl font-bold text-yellow-700">{resumo.conferir}</h3></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Não encontrados</p><h3 className="text-xl font-bold text-red-700">{resumo.naoEncontrados}</h3></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Excluídos</p><h3 className="text-xl font-bold text-slate-700">{resumo.excluidos}</h3></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Valor confirmado</p><h3 className="text-xl font-bold">{dinheiro(resumo.total)}</h3></div>
          </section>

          <section className="card p-4 mt-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Resultado da cotação</h2>
                <p className="text-sm text-slate-500">Exibindo {itensFiltrados.length} de {itens.length} itens.</p>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <select className="input text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="todos">Todos os itens</option>
                  <option value="preenchidos">Preenchidos</option>
                  <option value="manual">Selecionados manualmente</option>
                  <option value="conferir">Conferir match</option>
                  <option value="nao_encontrados">Não encontrados</option>
                  <option value="com_pdf">Com PDF</option>
                  <option value="sem_pdf">Sem PDF</option>
                  <option value="excluidos">Excluídos</option>
                </select>

                <button onClick={baixarPlanilhaPreenchida} className="btn-primary text-sm">Baixar planilha</button>
                <button onClick={baixarZipRegistros} className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50 text-sm">Baixar ZIP</button>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {itensFiltrados.map((item) => {
                const cotar = itemPodeCotar(item);
                const statusVisivel = item.excluido ? "Excluído" : item.status;
                const preencher = !item.excluido && (item.status === "Encontrado" || item.status === "Manual" || item.status === "Conferir match");

                return (
                  <div key={item.numero_item} className={item.excluido ? "rounded-xl border bg-slate-50 opacity-70 p-3" : "rounded-xl border bg-white p-3"}>
                    <div className="flex flex-wrap gap-3 text-[11px] leading-4">
                      <div className="w-12 shrink-0"><Campo label="Item" value={<b>{item.numero_item}</b>} /></div>

                      <div className="min-w-[260px] flex-1">
                        <Campo label="Descrição" value={item.descricao} />
                        <select className="input mt-2 text-[11px] h-8 py-1" value={item.produto_id || ""} onChange={(e) => selecionarProdutoManual(item.numero_item, e.target.value)}>
                          <option value="">Selecionar produto manualmente...</option>
                          {produtosBanco.map((p) => (<option key={p.id} value={p.id}>{labelProduto(p)}</option>))}
                        </select>
                      </div>

                      <div className="w-16"><Campo label="Qtd" value={item.quantidade} /></div>
                      <div className="w-16"><Campo label="Unid" value={item.unidade} /></div>

                      <div className="w-28">
                        <p className="text-[10px] text-slate-500">Tipo preço</p>
                        <select className="input text-[11px] h-8 py-1" value={item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade)} onChange={(e) => alterarTipoPrecoItem(item.numero_item, e.target.value as TipoPreco)}>
                          <option value="unitario">Unit.</option>
                          <option value="caixa">Caixa</option>
                        </select>
                        <p className="mt-1 text-[9px] text-slate-500">
                          {explicarTipoPreco(item.descricao, item.unidade, item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade))}
                        </p>
                      </div>

                      <div className="w-28"><Campo label="Marca" value={preencher ? item.marca || "-" : "-"} /></div>
                      <div className="w-28"><Campo label="Registro" value={preencher ? item.registro_anvisa || "-" : "-"} /></div>
                      <div className="w-20"><Campo label="Custo" value={preencher ? dinheiro(item.custo_usado) : "-"} /></div>
                      <div className="w-20"><Campo label="Vl.Unit" value={preencher ? dinheiro(item.valor_unitario) : "-"} /></div>
                      <div className="w-20"><Campo label="Vl.Total" value={preencher ? dinheiro(item.valor_total) : "-"} /></div>
                      <div className="w-14"><Campo label="Conf." value={`${item.confianca || 0}%`} /></div>

                      <div className="w-24">
                        <p className="text-[10px] text-slate-500">Status</p>
                        <span className={`inline-block rounded-full px-2 py-1 text-[10px] ${statusClasse(statusVisivel)}`}>{statusVisivel}</span>
                      </div>

                      <div className="w-12"><Campo label="PDF" value={<span className={item.pdf_url && cotar ? "text-green-700" : "text-red-700"}>{item.pdf_url && cotar ? "Sim" : "Não"}</span>} /></div>

                      <div className="w-16">
                        <p className="text-[10px] text-slate-500">Ação</p>
                        <button onClick={() => alternarExcluir(item.numero_item)} className={item.excluido ? "rounded-md border px-2 py-1 text-[10px] text-green-700 hover:bg-green-50" : "rounded-md border px-2 py-1 text-[10px] text-red-700 hover:bg-red-50"}>
                          {item.excluido ? "Voltar" : "Excluir"}
                        </button>
                      </div>
                    </div>
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
