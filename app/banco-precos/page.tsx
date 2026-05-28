"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { abrirPdfRegistro } from "@/lib/storagePdf";

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
  data_atualizacao_custo?: string | null;
  origem_preco?: string | null;
  pdf_url?: string | null;
};

type RegistroAnvisa = {
  id: string;
  item: string | null;
  apresentacao: string | null;
  marca: string | null;
  vencimento_registro: string | null;
  registro_anvisa: string | null;
  nome_arquivo: string | null;
  pdf_path: string | null;
};

const colunasModelo = [
  "descricao",
  "apresentacao",
  "marca",
  "unidade",
  "quantidade_por_caixa",
  "custo_unitario",
  "custo_caixa"
];

function normalizarCabecalho(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function textoBusca(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function numero(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return valor;

  const texto = String(valor)
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function dinheiro(valor?: number | null) {
  if (valor === null || valor === undefined) return "-";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function encontrarRegistroAutomatico(produto: Partial<Produto>, registros: RegistroAnvisa[]) {
  const produtoDescricao = textoBusca(produto.descricao);
  const produtoApresentacao = textoBusca(produto.apresentacao);
  const produtoMarca = textoBusca(produto.marca);
  const produtoRegistro = textoBusca(produto.registro_anvisa);

  if (produtoRegistro) {
    const porRegistro = registros.find((r) => textoBusca(r.registro_anvisa) === produtoRegistro);
    if (porRegistro) return porRegistro;
  }

  return registros.find((r) => {
    const descricaoRegistro = textoBusca(r.item);
    const marcaIgual = textoBusca(r.marca) === produtoMarca;
    const apresentacaoIgual = textoBusca(r.apresentacao) === produtoApresentacao;
    const descricaoIgual =
      descricaoRegistro === produtoDescricao ||
      produtoDescricao.includes(descricaoRegistro) ||
      descricaoRegistro.includes(produtoDescricao);

    return descricaoIgual && marcaIgual && apresentacaoIgual;
  }) || null;
}

export default function BancoPrecos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [importando, setImportando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    setErro("");

    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .order("descricao", { ascending: true });

    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }

    setProdutos(data || []);
    setCarregando(false);
  }

  const produtosFiltrados = useMemo(() => {
    const termo = textoBusca(busca);

    const lista = !termo
      ? produtos
      : produtos.filter((p) =>
          textoBusca([
            p.descricao,
            p.apresentacao,
            p.marca,
            p.registro_anvisa,
            p.unidade,
            p.origem_preco
          ].filter(Boolean).join(" ")).includes(termo)
        );

    return [...lista].sort((a, b) =>
      String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR")
    );
  }, [produtos, busca]);

  async function importarPlanilha(file: File | null) {
    try {
      setErro("");
      setMensagem("");

      if (!file) return;

      setImportando(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setErro("Usuário não autenticado.");
        return;
      }

      const { data: registrosAtualizados, error: registrosError } = await supabase
        .from("registros_anvisa")
        .select("*")
        .order("created_at", { ascending: false });

      if (registrosError) {
        setErro(registrosError.message);
        return;
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const primeiraAba = workbook.SheetNames[0];
      const sheet = workbook.Sheets[primeiraAba];

      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: ""
      });

      const linhasOrdenadas = linhas
        .map((linha) => {
          const normalizada: Record<string, unknown> = {};
          Object.entries(linha).forEach(([chave, valor]) => {
            normalizada[normalizarCabecalho(chave)] = valor;
          });
          return normalizada;
        })
        .filter((linha) => String(linha.descricao || "").trim())
        .sort((a, b) =>
          String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR")
        );

      if (!linhasOrdenadas.length) {
        setErro("Nenhum produto válido encontrado. Verifique se existe a coluna descricao.");
        return;
      }

      let vinculados = 0;
      let semRegistro = 0;

      const produtosParaSalvar = linhasOrdenadas.map((normalizada) => {
        const descricao = String(normalizada.descricao || "").trim();

        const quantidadePorCaixa = numero(normalizada.quantidade_por_caixa);
        let custoUnitario = numero(normalizada.custo_unitario);
        let custoCaixa = numero(normalizada.custo_caixa);

        if ((!custoUnitario || custoUnitario <= 0) && custoCaixa && quantidadePorCaixa) {
          custoUnitario = custoCaixa / quantidadePorCaixa;
        }

        if ((!custoCaixa || custoCaixa <= 0) && custoUnitario && quantidadePorCaixa) {
          custoCaixa = custoUnitario * quantidadePorCaixa;
        }

        const produtoBase: Partial<Produto> = {
          descricao,
          apresentacao: String(normalizada.apresentacao || "").trim() || null,
          marca: String(normalizada.marca || "").trim() || null,
          registro_anvisa: String(normalizada.registro_anvisa || "").trim() || null
        };

        const registroEncontrado = encontrarRegistroAutomatico(produtoBase, registrosAtualizados || []);

        if (registroEncontrado) vinculados++;
        else semRegistro++;

        return {
          user_id: userData.user.id,
          item: descricao,
          descricao,
          apresentacao: produtoBase.apresentacao,
          marca: produtoBase.marca,
          registro_anvisa: registroEncontrado?.registro_anvisa || produtoBase.registro_anvisa || null,
          vencimento_registro: registroEncontrado?.vencimento_registro || null,
          pdf_url: registroEncontrado?.pdf_path || null,
          unidade: String(normalizada.unidade || "").trim() || null,
          quantidade_por_caixa: quantidadePorCaixa,
          custo_unitario: custoUnitario,
          custo_caixa: custoCaixa,
          data_atualizacao_custo: new Date().toISOString(),
          origem_preco: file.name
        };
      });

      const { error } = await supabase.from("produtos").insert(produtosParaSalvar);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem(`${produtosParaSalvar.length} produtos importados. ${vinculados} vinculados ao registro ANVISA. ${semRegistro} sem registro encontrado.`);
      await carregarDados();
    } finally {
      setImportando(false);
    }
  }

  async function abrirPdf(path?: string | null) {
    try {
      await abrirPdfRegistro(path);
    } catch (e: any) {
      setErro(e.message || "Não foi possível abrir o PDF.");
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Banco de Preços</h1>
          <p className="text-slate-500">
            Banco sem numeração de item. O sistema usa apenas nome/descrição para cotar.
          </p>
        </div>

        <a href="/modelos/modelo-banco-precos-cotamed.xlsx" download className="btn-primary text-center">
          Baixar planilha modelo
        </a>
      </div>

      <section className="card p-6 mt-6">
        <h2 className="font-bold text-xl">Importar planilha de preços</h2>

        <div className="grid md:grid-cols-[1fr_180px] gap-4 mt-5">
          <input
            type="file"
            accept=".xlsx,.xls"
            className="input"
            onChange={(e) => importarPlanilha(e.target.files?.[0] || null)}
          />

          <button
            className="btn-primary"
            disabled={importando}
            onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
          >
            {importando ? "Importando..." : "Selecionar arquivo"}
          </button>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4 mt-5 text-sm text-slate-700">
          <b>Colunas da planilha:</b>
          <br />
          {colunasModelo.join(", ")}
          <br /><br />
          <b>Preenchimento automático:</b> data_atualizacao_custo, origem_preco, registro_anvisa, vencimento_registro e PDF ANVISA.
        </div>

        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl">Produtos cadastrados</h2>
              <p className="text-sm text-slate-500">
                Total encontrado: {produtosFiltrados.length}
              </p>
            </div>

            <input
              className="input md:max-w-md"
              placeholder="Buscar por descrição, marca, registro, apresentação..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando produtos...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="p-6 text-slate-500">Nenhum produto encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-4">Descrição</th>
                  <th className="text-left p-4">Apresentação</th>
                  <th className="text-left p-4">Marca</th>
                  <th className="text-left p-4">Registro ANVISA</th>
                  <th className="text-left p-4">Vencimento</th>
                  <th className="text-left p-4">PDF</th>
                  <th className="text-left p-4">Qtd/Caixa</th>
                  <th className="text-left p-4">Custo Unit.</th>
                  <th className="text-left p-4">Custo Caixa</th>
                </tr>
              </thead>

              <tbody>
                {produtosFiltrados.map((p, index) => (
                  <tr key={p.id || index} className="border-t">
                    <td className="p-4 font-medium">{p.descricao || "-"}</td>
                    <td className="p-4">{p.apresentacao || "-"}</td>
                    <td className="p-4">{p.marca || "-"}</td>
                    <td className="p-4">{p.registro_anvisa || "Não vinculado"}</td>
                    <td className="p-4">{p.vencimento_registro || "-"}</td>
                    <td className="p-4">
                      {p.pdf_url ? (
                        <button onClick={() => abrirPdf(p.pdf_url)} className="text-cotamed-700 underline">
                          Abrir PDF
                        </button>
                      ) : (
                        <span className="text-red-600">Sem PDF</span>
                      )}
                    </td>
                    <td className="p-4">{p.quantidade_por_caixa || "-"}</td>
                    <td className="p-4">{dinheiro(p.custo_unitario)}</td>
                    <td className="p-4">{dinheiro(p.custo_caixa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
