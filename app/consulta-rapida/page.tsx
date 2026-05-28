"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type Produto = {
  id?: string;
  item?: string | null;
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

function textoBusca(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function dinheiro(valor?: number | null) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-";

  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function numero(valor: string) {
  const n = Number(
    String(valor || "0")
      .replace("%", "")
      .replace(",", ".")
      .trim()
  );

  return Number.isFinite(n) ? n : 0;
}

function calcularComMargem(custo: number | null | undefined, margem: number) {
  if (!custo || custo <= 0) return null;
  return custo * (1 + margem / 100);
}

function diasDesde(data?: string | null) {
  if (!data) return null;

  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return null;

  const hoje = new Date();
  const diff = hoje.getTime() - d.getTime();

  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function statusAtualizacao(data?: string | null) {
  const dias = diasDesde(data);

  if (dias === null) {
    return {
      texto: "Sem data",
      classe: "bg-red-100 text-red-700"
    };
  }

  if (dias <= 30) {
    return {
      texto: `Atualizado há ${dias} dias`,
      classe: "bg-green-100 text-green-700"
    };
  }

  if (dias <= 90) {
    return {
      texto: `Atenção: ${dias} dias`,
      classe: "bg-yellow-100 text-yellow-800"
    };
  }

  return {
    texto: `Desatualizado: ${dias} dias`,
    classe: "bg-red-100 text-red-700"
  };
}

function statusRegistro(data?: string | null) {
  if (!data) {
    return {
      texto: "Sem vencimento",
      classe: "bg-yellow-100 text-yellow-800"
    };
  }

  const venc = new Date(data);
  const hoje = new Date();

  if (Number.isNaN(venc.getTime())) {
    return {
      texto: "Data inválida",
      classe: "bg-red-100 text-red-700"
    };
  }

  if (venc < hoje) {
    return {
      texto: "Registro vencido",
      classe: "bg-red-100 text-red-700"
    };
  }

  return {
    texto: "Registro válido",
    classe: "bg-green-100 text-green-700"
  };
}

export default function ConsultaRapida() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [margem, setMargem] = useState("30");
  const [tipoPreco, setTipoPreco] = useState<"unidade" | "caixa" | "ambos">("ambos");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarProdutos();
  }, []);

  async function carregarProdutos() {
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

  const resultados = useMemo(() => {
    const termo = textoBusca(busca);

    const lista = termo
      ? produtos.filter((p) => {
          const texto = textoBusca(
            [
              p.item,
              p.descricao,
              p.apresentacao,
              p.marca,
              p.registro_anvisa,
              p.unidade,
              p.origem_preco
            ]
              .filter(Boolean)
              .join(" ")
          );

          return texto.includes(termo);
        })
      : produtos;

    return [...lista].sort((a, b) => {
      const custoA = a.custo_unitario || a.custo_caixa || 999999999;
      const custoB = b.custo_unitario || b.custo_caixa || 999999999;

      if (custoA !== custoB) return custoA - custoB;

      return String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR");
    });
  }, [busca, produtos]);

  async function abrirPdf(path?: string | null) {
    setErro("");

    if (!path) {
      setErro("Este produto ainda não possui PDF ANVISA vinculado.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("registros-anvisa")
      .createSignedUrl(path, 60 * 10);

    if (error || !data?.signedUrl) {
      setErro(error?.message || "Não foi possível abrir o PDF.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  const margemNumero = numero(margem);

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Consulta Rápida</h1>
      <p className="text-slate-500">
        Pesquise qualquer produto do banco de preços, consulte custo, margem e registro ANVISA.
      </p>

      <section className="card p-6 mt-6">
        <div className="grid md:grid-cols-[1fr_160px_180px_120px] gap-3">
          <input
            className="input"
            placeholder="Buscar por descrição, marca, registro ou apresentação..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <input
            className="input"
            placeholder="Margem %"
            value={margem}
            onChange={(e) => setMargem(e.target.value)}
          />

          <select
            className="input"
            value={tipoPreco}
            onChange={(e) => setTipoPreco(e.target.value as "unidade" | "caixa" | "ambos")}
          >
            <option value="ambos">Mostrar ambos</option>
            <option value="unidade">Preço unitário</option>
            <option value="caixa">Preço por caixa</option>
          </select>

          <button onClick={carregarProdutos} className="btn-primary">
            Atualizar
          </button>
        </div>

        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="font-bold text-xl">Resultados</h2>
          <p className="text-sm text-slate-500">
            {carregando ? "Carregando..." : `${resultados.length} produto(s) encontrado(s)`}
          </p>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando produtos...</div>
        ) : resultados.length === 0 ? (
          <div className="p-6 text-slate-500">
            Nenhum produto encontrado. Verifique se o Banco de Preços já foi importado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-4">Descrição</th>
                  <th className="text-left p-4">Apresentação</th>
                  <th className="text-left p-4">Marca</th>
                  <th className="text-left p-4">Registro</th>
                  <th className="text-left p-4">Venc. Registro</th>
                  <th className="text-left p-4">Qtd/Caixa</th>
                  {(tipoPreco === "ambos" || tipoPreco === "unidade") && (
                    <>
                      <th className="text-left p-4">Custo Unit.</th>
                      <th className="text-left p-4">Unit. + Margem</th>
                    </>
                  )}
                  {(tipoPreco === "ambos" || tipoPreco === "caixa") && (
                    <>
                      <th className="text-left p-4">Custo Caixa</th>
                      <th className="text-left p-4">Caixa + Margem</th>
                    </>
                  )}
                  <th className="text-left p-4">Atualização</th>
                  <th className="text-left p-4">ANVISA</th>
                  <th className="text-left p-4">PDF</th>
                </tr>
              </thead>

              <tbody>
                {resultados.map((p, index) => {
                  const atualizacao = statusAtualizacao(p.data_atualizacao_custo);
                  const registro = statusRegistro(p.vencimento_registro);

                  return (
                    <tr key={p.id || index} className="border-t">
                      <td className="p-4 font-medium">{p.descricao || "-"}</td>
                      <td className="p-4">{p.apresentacao || "-"}</td>
                      <td className="p-4">{p.marca || "-"}</td>
                      <td className="p-4">{p.registro_anvisa || "-"}</td>
                      <td className="p-4">{p.vencimento_registro || "-"}</td>
                      <td className="p-4">{p.quantidade_por_caixa || "-"}</td>

                      {(tipoPreco === "ambos" || tipoPreco === "unidade") && (
                        <>
                          <td className="p-4">{dinheiro(p.custo_unitario)}</td>
                          <td className="p-4 font-medium">{dinheiro(calcularComMargem(p.custo_unitario, margemNumero))}</td>
                        </>
                      )}

                      {(tipoPreco === "ambos" || tipoPreco === "caixa") && (
                        <>
                          <td className="p-4">{dinheiro(p.custo_caixa)}</td>
                          <td className="p-4 font-medium">{dinheiro(calcularComMargem(p.custo_caixa, margemNumero))}</td>
                        </>
                      )}

                      <td className="p-4">
                        <span className={`rounded-full px-3 py-1 ${atualizacao.classe}`}>
                          {atualizacao.texto}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className={`rounded-full px-3 py-1 ${registro.classe}`}>
                          {registro.texto}
                        </span>
                      </td>

                      <td className="p-4">
                        {p.pdf_url ? (
                          <button
                            onClick={() => abrirPdf(p.pdf_url)}
                            className="text-cotamed-700 underline"
                          >
                            Abrir PDF
                          </button>
                        ) : (
                          <span className="text-red-600">Sem PDF</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
