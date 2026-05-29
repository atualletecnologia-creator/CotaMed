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
  registro_anvisa: string | null;
  vencimento_registro: string | null;
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

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textoBusca(valor: unknown) {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, "");
}

function tokens(valor: unknown) {
  return normalizarTexto(valor)
    .split(" ")
    .filter((p) => p.length > 1)
    .filter((p) => ![
      "de", "da", "do", "das", "dos", "para", "por", "com", "sem",
      "sulfato", "cloridrato", "sodico", "base", "solucao", "solução"
    ].includes(p));
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

function scoreRegistro(produto: Partial<Produto>, registro: RegistroAnvisa) {
  let score = 0;

  const produtoRegistro = textoBusca(produto.registro_anvisa);
  const registroNumero = textoBusca(registro.registro_anvisa);

  if (produtoRegistro && registroNumero && produtoRegistro === registroNumero) {
    score += 100;
  }

  const descProduto = normalizarTexto(produto.descricao);
  const descRegistro = normalizarTexto(registro.item);

  const marcaProduto = textoBusca(produto.marca);
  const marcaRegistro = textoBusca(registro.marca);

  const apresentacaoProduto = textoBusca(produto.apresentacao);
  const apresentacaoRegistro = textoBusca(registro.apresentacao);

  if (marcaProduto && marcaRegistro && marcaProduto === marcaRegistro) score += 25;
  if (apresentacaoProduto && apresentacaoRegistro && apresentacaoProduto === apresentacaoRegistro) score += 20;

  if (descProduto && descRegistro) {
    if (descProduto === descRegistro) score += 50;
    if (descProduto.includes(descRegistro) || descRegistro.includes(descProduto)) score += 30;

    const tProduto = tokens(descProduto);
    const tRegistro = tokens(descRegistro);
    let iguais = 0;

    tProduto.forEach((t) => {
      if (tRegistro.includes(t) || tRegistro.some((r) => r.includes(t) || t.includes(r))) {
        iguais++;
      }
    });

    if (tProduto.length) {
      score += Math.round((iguais / tProduto.length) * 40);
    }
  }

  return score;
}

function encontrarRegistroAutomatico(produto: Partial<Produto>, registros: RegistroAnvisa[]) {
  const candidatos = registros
    .map((registro) => ({
      registro,
      score: scoreRegistro(produto, registro)
    }))
    .filter((c) => c.score >= 45)
    .sort((a, b) => b.score - a.score);

  return candidatos[0]?.registro || null;
}

function labelRegistro(registro: RegistroAnvisa) {
  return [
    registro.item,
    registro.apresentacao,
    registro.marca,
    registro.registro_anvisa ? `REG ${registro.registro_anvisa}` : "",
    registro.vencimento_registro ? `VENC ${registro.vencimento_registro}` : ""
  ].filter(Boolean).join(" | ");
}

export default function BancoPrecos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [registros, setRegistros] = useState<RegistroAnvisa[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroPdf, setFiltroPdf] = useState("todos");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [importando, setImportando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [vinculando, setVinculando] = useState("");

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    setErro("");

    const [produtosResp, registrosResp] = await Promise.all([
      supabase.from("produtos").select("*").order("descricao", { ascending: true }),
      supabase.from("registros_anvisa").select("*").order("item", { ascending: true })
    ]);

    if (produtosResp.error) {
      setErro(produtosResp.error.message);
      setCarregando(false);
      return;
    }

    if (registrosResp.error) {
      setErro(registrosResp.error.message);
      setCarregando(false);
      return;
    }

    setProdutos(produtosResp.data || []);
    setRegistros(registrosResp.data || []);
    setCarregando(false);
  }

  const produtosFiltrados = useMemo(() => {
    const termo = textoBusca(busca);

    let lista = !termo
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

    if (filtroPdf === "com_pdf") {
      lista = lista.filter((p) => !!p.pdf_url);
    }

    if (filtroPdf === "sem_pdf") {
      lista = lista.filter((p) => !p.pdf_url);
    }

    return [...lista].sort((a, b) =>
      String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR")
    );
  }, [produtos, busca, filtroPdf]);

  const resumoPdf = useMemo(() => {
    return {
      todos: produtos.length,
      comPdf: produtos.filter((p) => !!p.pdf_url).length,
      semPdf: produtos.filter((p) => !p.pdf_url).length,
    };
  }, [produtos]);

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

      setMensagem(`${produtosParaSalvar.length} produtos importados. ${vinculados} vinculados automaticamente ao registro ANVISA. ${semRegistro} sem vínculo automático.`);
      await carregarDados();
    } finally {
      setImportando(false);
    }
  }

  async function vincularRegistroManual(produto: Produto, registroId: string) {
    try {
      setErro("");
      setMensagem("");

      if (!produto.id || !registroId) return;

      const registro = registros.find((r) => r.id === registroId);

      if (!registro) {
        setErro("Registro ANVISA não encontrado.");
        return;
      }

      setVinculando(produto.id);

      const { error } = await supabase
        .from("produtos")
        .update({
          registro_anvisa: registro.registro_anvisa,
          vencimento_registro: registro.vencimento_registro,
          pdf_url: registro.pdf_path
        })
        .eq("id", produto.id);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem("Registro vinculado ao produto com sucesso.");
      await carregarDados();
    } finally {
      setVinculando("");
    }
  }

  async function tentarVincularAutomaticamente(produto: Produto) {
    const registro = encontrarRegistroAutomatico(produto, registros);

    if (!registro) {
      setErro("Nenhum registro compatível encontrado automaticamente. Selecione manualmente na lista.");
      return;
    }

    await vincularRegistroManual(produto, registro.id);
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
            Banco de produtos com vínculo automático ou manual dos registros ANVISA.
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
          O sistema tentará vincular automaticamente o registro ANVISA. Se não conseguir, filtre por <b>Sem PDF</b> e selecione manualmente.
        </div>

        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      <section className="grid md:grid-cols-3 gap-4 mt-6">
        <div className="card p-5">
          <p className="text-sm text-slate-500">Total de produtos</p>
          <h3 className="text-2xl font-bold">{resumoPdf.todos}</h3>
        </div>

        <div className="card p-5">
          <p className="text-sm text-slate-500">Com PDF</p>
          <h3 className="text-2xl font-bold text-green-700">{resumoPdf.comPdf}</h3>
        </div>

        <div className="card p-5">
          <p className="text-sm text-slate-500">Sem PDF</p>
          <h3 className="text-2xl font-bold text-red-700">{resumoPdf.semPdf}</h3>
        </div>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl">Produtos cadastrados</h2>
              <p className="text-sm text-slate-500">
                Total encontrado: {produtosFiltrados.length}
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <select
                className="input md:w-48"
                value={filtroPdf}
                onChange={(e) => setFiltroPdf(e.target.value)}
              >
                <option value="todos">Todos os produtos</option>
                <option value="com_pdf">Somente com PDF</option>
                <option value="sem_pdf">Somente sem PDF</option>
              </select>

              <input
                className="input md:w-96"
                placeholder="Buscar por descrição, marca, registro, apresentação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando produtos...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="p-6 text-slate-500">Nenhum produto encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-left p-3">Apresentação</th>
                  <th className="text-left p-3">Marca</th>
                  <th className="text-left p-3">Registro ANVISA</th>
                  <th className="text-left p-3">Vencimento</th>
                  <th className="text-left p-3">PDF</th>
                  <th className="text-left p-3">Qtd/Caixa</th>
                  <th className="text-left p-3">Custo Unit.</th>
                  <th className="text-left p-3">Custo Caixa</th>
                  <th className="text-left p-3 min-w-[260px]">Vincular registro</th>
                </tr>
              </thead>

              <tbody>
                {produtosFiltrados.map((p, index) => (
                  <tr key={p.id || index} className="border-t align-top">
                    <td className="p-3 font-medium">{p.descricao || "-"}</td>
                    <td className="p-3">{p.apresentacao || "-"}</td>
                    <td className="p-3">{p.marca || "-"}</td>
                    <td className="p-3">{p.registro_anvisa || "Não vinculado"}</td>
                    <td className="p-3">{p.vencimento_registro || "-"}</td>
                    <td className="p-3">
                      {p.pdf_url ? (
                        <button onClick={() => abrirPdf(p.pdf_url)} className="text-cotamed-700 underline">
                          Abrir PDF
                        </button>
                      ) : (
                        <span className="text-red-600 font-medium">Sem PDF</span>
                      )}
                    </td>
                    <td className="p-3">{p.quantidade_por_caixa || "-"}</td>
                    <td className="p-3">{dinheiro(p.custo_unitario)}</td>
                    <td className="p-3">{dinheiro(p.custo_caixa)}</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        <select
                          className="input text-xs"
                          disabled={vinculando === p.id}
                          defaultValue=""
                          onChange={(e) => vincularRegistroManual(p, e.target.value)}
                        >
                          <option value="">Selecionar manualmente...</option>
                          {registros.map((r) => (
                            <option key={r.id} value={r.id}>
                              {labelRegistro(r)}
                            </option>
                          ))}
                        </select>

                        <button
                          className="rounded-lg border border-blue-200 px-3 py-2 text-cotamed-700 hover:bg-blue-50 disabled:opacity-60"
                          disabled={vinculando === p.id}
                          onClick={() => tentarVincularAutomaticamente(p)}
                        >
                          {vinculando === p.id ? "Vinculando..." : "Tentar automático"}
                        </button>
                      </div>
                    </td>
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
