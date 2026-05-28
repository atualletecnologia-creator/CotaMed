"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  encontrarMelhorProduto,
  classificarConfianca,
  encontrarCandidatos,
} from "@/lib/buscaInteligente";
import { baixarBlobPdfRegistro } from "@/lib/storagePdf";

type Produto = {
  id?: string;
  descricao?: string | null;
  apresentacao?: string | null;
  marca?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
  unidade?: string | null;
  quantidade_por_caixa?: number | null;
  custo_unitario?: number | null;
  custo_caixa?: number | null;
  pdf_url?: string | null;
};

type ItemLicitacao = {
  numero_item: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
  custo_usado?: number | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  pdf_url?: string | null;
  status: string;
  confianca?: number;
  origem_match?: string;
};

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

  const texto = String(valor)
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function dinheiro(valor?: number | null) {
  if (valor === null || valor === undefined) return "-";

  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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
  return String(
    linha.descricao_dos_produtos ||
      linha.descricao ||
      linha.descrição ||
      linha.produto ||
      linha.medicamento ||
      linha.objeto ||
      ""
  ).trim();
}

function statusClasse(status: string) {
  if (status === "Encontrado") return "bg-green-100 text-green-700";
  if (status === "Conferir match") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-700";
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
}) {
  const { index, descricao, quantidade, unidade, produto, margem, confianca, origemMatch } = params;

  if (!produto) {
    return {
      numero_item: String(index + 1).padStart(3, "0"),
      descricao,
      quantidade,
      unidade,
      status: "Produto não encontrado",
      confianca: 0,
      origem_match: "sem_match",
    };
  }

  const custo = produto.custo_unitario || produto.custo_caixa || 0;
  const valorUnitario = custo * (1 + margem / 100);
  const valorTotal = valorUnitario * quantidade;
  const nivel = classificarConfianca(confianca || 0);

  return {
    numero_item: String(index + 1).padStart(3, "0"),
    descricao,
    quantidade,
    unidade,
    marca: produto.marca,
    registro_anvisa: produto.registro_anvisa,
    vencimento_registro: produto.vencimento_registro,
    custo_usado: custo,
    valor_unitario: valorUnitario,
    valor_total: valorTotal,
    pdf_url: produto.pdf_url,
    confianca: confianca || 0,
    origem_match: origemMatch || "busca_local",
    status:
      nivel === "alto"
        ? "Encontrado"
        : nivel === "medio"
          ? "Conferir match"
          : "Baixa confiança",
  };
}

export default function Licitacoes() {
  const [margem, setMargem] = useState("30");
  const [usarIa, setUsarIa] = useState(false);
  const [incluirConferir, setIncluirConferir] = useState(false);
  const [itens, setItens] = useState<ItemLicitacao[]>([]);
  const [filtro, setFiltro] = useState("todos");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [arquivoNome, setArquivoNome] = useState("");

  const resumo = useMemo(() => {
    const total = itens
      .filter((item) => item.status === "Encontrado" || (incluirConferir && item.status === "Conferir match"))
      .reduce((acc, item) => acc + (item.valor_total || 0), 0);

    return {
      total,
      encontrados: itens.filter((i) => i.status === "Encontrado").length,
      conferir: itens.filter((i) => i.status === "Conferir match").length,
      naoEncontrados: itens.filter(
        (i) => i.status !== "Encontrado" && i.status !== "Conferir match"
      ).length,
      pdfs: itens.filter((i) => i.pdf_url).length,
    };
  }, [itens, incluirConferir]);

  const itensFiltrados = useMemo(() => {
    if (filtro === "preenchidos") return itens.filter((i) => i.status === "Encontrado");
    if (filtro === "conferir") return itens.filter((i) => i.status === "Conferir match");
    if (filtro === "nao_encontrados") {
      return itens.filter((i) => i.status !== "Encontrado" && i.status !== "Conferir match");
    }
    if (filtro === "com_pdf") return itens.filter((i) => !!i.pdf_url);
    if (filtro === "sem_pdf") return itens.filter((i) => !i.pdf_url);
    return itens;
  }, [itens, filtro]);

  const itensParaExportar = useMemo(() => {
    return itens.filter((item) => {
      if (item.status === "Encontrado") return true;
      if (item.status === "Conferir match" && incluirConferir) return true;
      return false;
    });
  }, [itens, incluirConferir]);

  async function buscarComIa(descricao: string, produtos: Produto[]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const candidatosLocais = encontrarCandidatos(descricao, produtos, 8).map(
      (c) => c.produto
    );

    if (!candidatosLocais.length) {
      clearTimeout(timeout);
      return null;
    }

    try {
      const resp = await fetch("/api/ia/match-produto", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          descricao,
          produtos: candidatosLocais,
        }),
      });

      clearTimeout(timeout);

      if (!resp.ok) return null;

      const data = await resp.json();

      if (!data.indice || !data.confianca) return null;

      const produto = candidatosLocais[Number(data.indice) - 1];

      if (!produto) return null;

      return {
        produto,
        score: Number(data.confianca) || 0,
      };
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

      const { data: produtos, error: produtosError } = await supabase
        .from("produtos")
        .select("*")
        .order("descricao", { ascending: true });

      if (produtosError) {
        setErro(produtosError.message);
        return;
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const primeiraAba = workbook.SheetNames[0];
      const sheet = workbook.Sheets[primeiraAba];

      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

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
        const unidade = String(linha.unidade || linha.unid || linha.und || "unidade").trim();

        const melhor = encontrarMelhorProduto(descricao, produtos || []);

        let produto = melhor?.produto || null;
        let score = melhor?.score || 0;
        let origem = "busca_local";

        if (usarIa && score < 55 && produtos?.length) {
          const ia = await buscarComIa(descricao, produtos || []);

          if (ia && ia.score > score) {
            produto = ia.produto;
            score = ia.score;
            origem = "ia";
          }
        }

        itensCotados.push(
          montarItemCotado({
            index,
            descricao,
            quantidade,
            unidade,
            produto,
            margem: margemNumero,
            confianca: score,
            origemMatch: origem,
          })
        );
      }

      setItens(itensCotados);
      setMensagem(
        `${itensCotados.length} itens processados. Por padrão, itens em "Conferir match" não entram na planilha final.`
      );
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
      setErro("Nenhum item confirmado para exportar. Verifique o filtro ou marque para incluir itens em Conferir match.");
      return;
    }

    const dados = itens.map((item) => {
      const podeCotar = item.status === "Encontrado" || (item.status === "Conferir match" && incluirConferir);

      return {
        ITEM: item.numero_item,
        "DESCRIÇÃO DOS PRODUTOS": item.descricao,
        UNID: item.unidade,
        QUANT: item.quantidade,
        REGISTRO: podeCotar ? item.registro_anvisa || "" : "",
        MARCA: podeCotar ? item.marca || "" : "",
        CUSTO: podeCotar ? item.custo_usado || "" : "",
        "VL. UNIT": podeCotar ? item.valor_unitario || "" : "",
        "VL. TOTAL": podeCotar ? item.valor_total || "" : "",
        "VENCIMENTO REGISTRO": podeCotar ? item.vencimento_registro || "" : "",
        CONFIANCA: item.confianca || "",
        "ORIGEM MATCH": item.origem_match || "",
        STATUS: item.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotação");

    XLSX.writeFile(
      wb,
      `cotacao-preenchida-cotamed-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
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

      saveAs(
        conteudo,
        `registros-anvisa-cotamed-${new Date().toISOString().slice(0, 10)}.zip`
      );

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
          <p className="text-slate-500">
            Envie a planilha da licitação. A busca local reconhece abreviações, dosagens e apresentações.
          </p>
        </div>

        <a href="/modelos/modelo-licitacao-cotamed.xlsx" download className="btn-primary text-center">
          Baixar modelo da licitação
        </a>
      </div>

      <section className="card p-6 mt-6">
        <h2 className="font-bold text-xl">Enviar planilha da licitação</h2>

        <div className="grid md:grid-cols-3 gap-4 mt-5">
          <div>
            <label className="text-sm font-medium">Margem de lucro (%)</label>
            <input className="input mt-2" value={margem} onChange={(e) => setMargem(e.target.value)} />
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

        <label className="mt-5 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={incluirConferir}
            onChange={(e) => setIncluirConferir(e.target.checked)}
          />
          Incluir itens em “Conferir match” na planilha final e no ZIP dos registros
        </label>

        <div className="bg-blue-50 rounded-2xl p-4 mt-5 text-sm text-slate-700">
          <b>Importante:</b> itens em “Conferir match” não são cotados por padrão. Marque a opção acima somente se quiser incluir esses itens na planilha final.
          <br />
          A IA rápida possui timeout de 7 segundos para não travar a tela.
        </div>

        {arquivoNome && <p className="text-sm text-slate-500 mt-4">Arquivo selecionado: {arquivoNome}</p>}
        {processando && <p className="text-cotamed-700 text-sm mt-4">Processando planilha...</p>}
        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      {itens.length > 0 && (
        <>
          <section className="grid md:grid-cols-5 gap-4 mt-6">
            <div className="card p-5">
              <p className="text-sm text-slate-500">Encontrados</p>
              <h3 className="text-2xl font-bold text-green-700">{resumo.encontrados}</h3>
            </div>

            <div className="card p-5">
              <p className="text-sm text-slate-500">Conferir</p>
              <h3 className="text-2xl font-bold text-yellow-700">{resumo.conferir}</h3>
            </div>

            <div className="card p-5">
              <p className="text-sm text-slate-500">Não encontrados</p>
              <h3 className="text-2xl font-bold text-red-700">{resumo.naoEncontrados}</h3>
            </div>

            <div className="card p-5">
              <p className="text-sm text-slate-500">PDFs</p>
              <h3 className="text-2xl font-bold text-cotamed-700">{resumo.pdfs}</h3>
            </div>

            <div className="card p-5">
              <p className="text-sm text-slate-500">Valor total confirmado</p>
              <h3 className="text-2xl font-bold">{dinheiro(resumo.total)}</h3>
            </div>
          </section>

          <section className="card p-6 mt-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Resultado da cotação</h2>
                <p className="text-sm text-slate-500">
                  Exibindo {itensFiltrados.length} de {itens.length} itens.
                </p>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <select className="input" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="todos">Todos os itens</option>
                  <option value="preenchidos">Somente preenchidos</option>
                  <option value="conferir">Somente conferir</option>
                  <option value="nao_encontrados">Não encontrados / baixa confiança</option>
                  <option value="com_pdf">Com PDF</option>
                  <option value="sem_pdf">Sem PDF</option>
                </select>

                <button onClick={baixarPlanilhaPreenchida} className="btn-primary">
                  Baixar planilha preenchida
                </button>

                <button onClick={baixarZipRegistros} className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50">
                  Baixar ZIP dos registros
                </button>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-blue-50 text-slate-600">
                  <tr>
                    <th className="w-16 text-left p-3">Item</th>
                    <th className="text-left p-3">Descrição</th>
                    <th className="w-20 text-left p-3">Qtd</th>
                    <th className="w-24 text-left p-3">Unid</th>
                    <th className="w-32 text-left p-3">Marca</th>
                    <th className="w-36 text-left p-3">Registro</th>
                    <th className="w-28 text-left p-3">Custo</th>
                    <th className="w-28 text-left p-3">Vl. Unit</th>
                    <th className="w-28 text-left p-3">Vl. Total</th>
                    <th className="w-24 text-left p-3">Conf.</th>
                    <th className="w-32 text-left p-3">Status</th>
                    <th className="w-20 text-left p-3">PDF</th>
                  </tr>
                </thead>

                <tbody>
                  {itensFiltrados.map((item) => {
                    const cotar = item.status === "Encontrado" || (item.status === "Conferir match" && incluirConferir);

                    return (
                      <tr key={item.numero_item} className="border-t align-top">
                        <td className="p-3 font-medium">{item.numero_item}</td>
                        <td className="p-3 break-words">{item.descricao}</td>
                        <td className="p-3">{item.quantidade}</td>
                        <td className="p-3 break-words">{item.unidade}</td>
                        <td className="p-3 break-words">{cotar ? item.marca || "-" : "-"}</td>
                        <td className="p-3 break-words">{cotar ? item.registro_anvisa || "-" : "-"}</td>
                        <td className="p-3">{cotar ? dinheiro(item.custo_usado) : "-"}</td>
                        <td className="p-3">{cotar ? dinheiro(item.valor_unitario) : "-"}</td>
                        <td className="p-3">{cotar ? dinheiro(item.valor_total) : "-"}</td>
                        <td className="p-3">{item.confianca || 0}%</td>
                        <td className="p-3">
                          <span className={`inline-block rounded-full px-3 py-1 text-xs ${statusClasse(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={item.pdf_url && cotar ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                            {item.pdf_url && cotar ? "Sim" : "Não"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {itensFiltrados.length === 0 && (
              <div className="mt-6 rounded-2xl bg-blue-50 p-5 text-slate-600">
                Nenhum item encontrado para este filtro.
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
