"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { encontrarMelhorProduto, classificarConfianca } from "@/lib/buscaInteligente";

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
    currency: "BRL"
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
      origem_match: "sem_match"
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
          : "Baixa confiança"
  };
}

export default function Licitacoes() {
  const [margem, setMargem] = useState("30");
  const [usarIa, setUsarIa] = useState(false);
  const [itens, setItens] = useState<ItemLicitacao[]>([]);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [processando, setProcessando] = useState(false);
  const [arquivoNome, setArquivoNome] = useState("");

  const resumo = useMemo(() => {
    const total = itens.reduce((acc, item) => acc + (item.valor_total || 0), 0);

    return {
      total,
      encontrados: itens.filter((i) => i.status === "Encontrado").length,
      conferir: itens.filter((i) => i.status === "Conferir match").length,
      naoEncontrados: itens.filter((i) => i.status !== "Encontrado" && i.status !== "Conferir match").length,
      pdfs: itens.filter((i) => i.pdf_url).length
    };
  }, [itens]);

  async function buscarComIa(descricao: string, produtos: Produto[]) {
    const topProdutos = produtos.slice(0, 25);

    try {
      const resp = await fetch("/api/ia/match-produto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          descricao,
          produtos: topProdutos
        })
      });

      if (!resp.ok) return null;

      const data = await resp.json();

      if (!data.indice || !data.confianca) return null;

      const produto = topProdutos[Number(data.indice) - 1];

      if (!produto) return null;

      return {
        produto,
        score: Number(data.confianca) || 0
      };
    } catch {
      return null;
    }
  }

  async function processarPlanilha(file: File | null) {
    try {
      setErro("");
      setMensagem("");
      setItens([]);

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

      const workbook = XLSX.read(buffer, {
        type: "array"
      });

      const primeiraAba = workbook.SheetNames[0];
      const sheet = workbook.Sheets[primeiraAba];

      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: ""
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
        .filter((linha) =>
          String(
            linha.descricao ||
            linha.descricao_dos_produtos ||
            linha.produto ||
            linha.item ||
            linha.medicamento ||
            linha.objeto ||
            ""
          ).trim()
        );

      if (!linhasNormalizadas.length) {
        setErro("Nenhum item válido encontrado na planilha.");
        return;
      }

      const margemNumero = numero(margem);
      const itensCotados: ItemLicitacao[] = [];

      for (let index = 0; index < linhasNormalizadas.length; index++) {
        const linha = linhasNormalizadas[index];

        const descricao = String(
          linha.descricao ||
          linha.descricao_dos_produtos ||
          linha.produto ||
          linha.item ||
          linha.medicamento ||
          linha.objeto ||
          ""
        ).trim();

        const quantidade =
          numero(
            linha.quantidade ||
            linha.quant ||
            linha.qtd
          ) || 1;

        const unidade = String(
          linha.unidade ||
          linha.unid ||
          linha.und ||
          "unidade"
        ).trim();

        const melhor = encontrarMelhorProduto(descricao, produtos || []);

        let produto = melhor?.produto || null;
        let score = melhor?.score || 0;
        let origem = "busca_local";

        if (usarIa && score < 60 && produtos?.length) {
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
            origemMatch: origem
          })
        );
      }

      setItens(itensCotados);
      setMensagem(`${itensCotados.length} itens processados com busca inteligente.`);
    } finally {
      setProcessando(false);
    }
  }

  function baixarPlanilhaPreenchida() {
    if (!itens.length) {
      setErro("Processe uma planilha antes de baixar.");
      return;
    }

    const dados = itens.map((item) => ({
      ITEM: item.numero_item,
      "DESCRIÇÃO DOS PRODUTOS": item.descricao,
      UNID: item.unidade,
      QUANT: item.quantidade,
      REGISTRO: item.registro_anvisa || "",
      MARCA: item.marca || "",
      CUSTO: item.custo_usado || "",
      "VL. UNIT": item.valor_unitario || "",
      "VL. TOTAL": item.valor_total || "",
      "VENCIMENTO REGISTRO": item.vencimento_registro || "",
      CONFIANCA: item.confianca || "",
      "ORIGEM MATCH": item.origem_match || "",
      STATUS: item.status
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = [
      { wch: 8 }, { wch: 55 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
      { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 },
      { wch: 12 }, { wch: 14 }, { wch: 22 }
    ];

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

      const itensComPdf = itens.filter((item) => item.pdf_url);

      if (!itensComPdf.length) {
        setErro("Nenhum PDF de registro ANVISA foi encontrado para os itens cotados.");
        return;
      }

      const zip = new JSZip();

      for (const item of itensComPdf) {
        if (!item.pdf_url) continue;

        const { data, error } = await supabase.storage
          .from("registros-anvisa")
          .createSignedUrl(item.pdf_url, 60 * 10);

        if (error || !data?.signedUrl) continue;

        const response = await fetch(data.signedUrl);
        const blob = await response.blob();
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
      <div>
        <h1 className="text-3xl font-bold">Licitações</h1>
        <p className="text-slate-500">
          Envie a planilha da licitação. O CotaMed busca itens semelhantes no banco e pode usar IA como fallback.
        </p>
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
              <option value="sim">Sim, usar IA quando não encontrar</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Planilha</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="input mt-2" onChange={(e) => processarPlanilha(e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4 mt-5 text-sm text-slate-700">
          <b>Busca inteligente:</b> compara palavras semelhantes, abreviações, sinônimos, dosagem e apresentação.
          <br />
          <b>Regras:</b> confiança acima de 80 = encontrado; 60 a 79 = conferir; abaixo de 60 = baixa confiança.
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
              <p className="text-sm text-slate-500">Valor total</p>
              <h3 className="text-2xl font-bold">{dinheiro(resumo.total)}</h3>
            </div>
          </section>

          <section className="card p-6 mt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Resultado da cotação</h2>
                <p className="text-sm text-slate-500">Confira os itens com confiança média antes de enviar.</p>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <button onClick={baixarPlanilhaPreenchida} className="btn-primary">Baixar planilha preenchida</button>
                <button onClick={baixarZipRegistros} className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50">Baixar ZIP dos registros</button>
              </div>
            </div>

            <div className="overflow-x-auto mt-6">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 text-slate-600">
                  <tr>
                    <th className="text-left p-4">Item</th>
                    <th className="text-left p-4">Descrição</th>
                    <th className="text-left p-4">Qtd</th>
                    <th className="text-left p-4">Unidade</th>
                    <th className="text-left p-4">Marca</th>
                    <th className="text-left p-4">Registro</th>
                    <th className="text-left p-4">Custo</th>
                    <th className="text-left p-4">Vl. Unit</th>
                    <th className="text-left p-4">Vl. Total</th>
                    <th className="text-left p-4">Confiança</th>
                    <th className="text-left p-4">Origem</th>
                    <th className="text-left p-4">PDF</th>
                    <th className="text-left p-4">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {itens.map((item) => (
                    <tr key={item.numero_item} className="border-t">
                      <td className="p-4 font-medium">{item.numero_item}</td>
                      <td className="p-4">{item.descricao}</td>
                      <td className="p-4">{item.quantidade}</td>
                      <td className="p-4">{item.unidade}</td>
                      <td className="p-4">{item.marca || "-"}</td>
                      <td className="p-4">{item.registro_anvisa || "-"}</td>
                      <td className="p-4">{dinheiro(item.custo_usado)}</td>
                      <td className="p-4">{dinheiro(item.valor_unitario)}</td>
                      <td className="p-4">{dinheiro(item.valor_total)}</td>
                      <td className="p-4">{item.confianca || 0}%</td>
                      <td className="p-4">{item.origem_match || "-"}</td>
                      <td className="p-4">{item.pdf_url ? "Sim" : "Não"}</td>
                      <td className="p-4">
                        <span
                          className={
                            item.status === "Encontrado"
                              ? "rounded-full bg-green-100 text-green-700 px-3 py-1"
                              : item.status === "Conferir match"
                                ? "rounded-full bg-yellow-100 text-yellow-800 px-3 py-1"
                                : "rounded-full bg-red-100 text-red-700 px-3 py-1"
                          }
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
