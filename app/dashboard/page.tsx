"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type Produto = {
  id: string;
  descricao?: string | null;
  data_atualizacao_custo?: string | null;
  vencimento_registro?: string | null;
  pdf_url?: string | null;
};

type RegistroAnvisa = {
  id: string;
  pdf_path?: string | null;
  vencimento_registro?: string | null;
};

function parseData(data?: string | null) {
  if (!data) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(data)) {
    const d = new Date(data);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (br) {
    const d = new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diasDesde(data?: string | null) {
  const d = parseData(data);

  if (!d) return null;

  const hoje = new Date();

  return Math.floor(
    (hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function estaVencido(data?: string | null) {
  const d = parseData(data);

  if (!d) return false;

  const hoje = new Date();

  d.setHours(0, 0, 0, 0);
  hoje.setHours(0, 0, 0, 0);

  return d < hoje;
}

function CardResumo({
  titulo,
  valor,
  detalhe,
}: {
  titulo: string;
  valor: string | number;
  detalhe: string;
}) {
  return (
    <div className="card p-6">
      <p className="text-slate-500">{titulo}</p>
      <h2 className="text-4xl font-bold mt-4">{valor}</h2>
      <p className="text-slate-500 mt-2">{detalhe}</p>
    </div>
  );
}

export default function Dashboard() {
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [precosDesatualizados, setPrecosDesatualizados] = useState(0);
  const [registrosVencidos, setRegistrosVencidos] = useState(0);
  const [pdfsDisponiveis, setPdfsDisponiveis] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarDashboard();
  }, []);

  async function carregarDashboard() {
    setCarregando(true);
    setErro("");

    try {
      const { supabase } = await import("@/lib/supabase");

      const [produtosResp, registrosResp] = await Promise.all([
        supabase
          .from("produtos")
          .select("id,descricao,data_atualizacao_custo,vencimento_registro,pdf_url"),
        supabase
          .from("registros_anvisa")
          .select("id,pdf_path,vencimento_registro"),
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

      const produtos = (produtosResp.data || []) as Produto[];
      const registros = (registrosResp.data || []) as RegistroAnvisa[];

      setTotalProdutos(produtos.length);

      setPrecosDesatualizados(
        produtos.filter((p) => {
          const dias = diasDesde(p.data_atualizacao_custo);
          return dias !== null && dias > 30;
        }).length
      );

      const vencidosProdutos = produtos.filter((p) =>
        estaVencido(p.vencimento_registro)
      ).length;

      const vencidosRegistros = registros.filter((r) =>
        estaVencido(r.vencimento_registro)
      ).length;

      setRegistrosVencidos(Math.max(vencidosProdutos, vencidosRegistros));

      const pdfsProdutos = produtos.filter((p) => !!p.pdf_url).length;
      const pdfsRegistros = registros.filter((r) => !!r.pdf_path).length;

      setPdfsDisponiveis(Math.max(pdfsProdutos, pdfsRegistros));
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar o dashboard.");
    }

    setCarregando(false);
  }

  const valorCarregando = carregando ? "..." : "";

  return (
    <AppShell>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-slate-500">Bem-vindo ao CotaMed</p>
        </div>

        <button
          onClick={carregarDashboard}
          className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50"
          disabled={carregando}
        >
          {carregando ? "Atualizando..." : "Atualizar dados"}
        </button>
      </div>

      {erro && (
        <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {erro}
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-4 mt-6">
        <CardResumo
          titulo="Itens no banco"
          valor={carregando ? valorCarregando : totalProdutos}
          detalhe="produtos cadastrados"
        />

        <CardResumo
          titulo="Preços desatualizados"
          valor={carregando ? valorCarregando : precosDesatualizados}
          detalhe="mais de 30 dias"
        />

        <CardResumo
          titulo="Registros vencidos"
          valor={carregando ? valorCarregando : registrosVencidos}
          detalhe="ANVISA"
        />

        <CardResumo
          titulo="PDFs disponíveis"
          valor={carregando ? valorCarregando : pdfsDisponiveis}
          detalhe="registros salvos"
        />
      </div>

      <section className="grid md:grid-cols-2 gap-5 mt-6">
        <div className="card p-6">
          <h2 className="font-bold text-xl">Nova cotação</h2>
          <p className="text-slate-500 mt-1">
            Importe uma planilha da licitação, escolha a margem e gere a planilha final.
          </p>

          <Link href="/licitacoes" className="btn-primary inline-block mt-5">
            Ir para Licitações
          </Link>
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-xl">Consulta rápida</h2>
          <p className="text-slate-500 mt-1">
            Pesquise o preço de um item por unidade ou por caixa.
          </p>

          <Link href="/consulta-rapida" className="btn-primary inline-block mt-5">
            Consultar item
          </Link>
        </div>
      </section>

      <section className="card p-6 mt-6">
        <h2 className="font-bold text-xl">Relatórios importantes</h2>
        <p className="text-slate-500 mt-1">
          O CotaMed mantém apenas os relatórios essenciais para controle.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-5">
          <Link href="/relatorios" className="border rounded-2xl p-5 hover:bg-blue-50 transition">
            <h3 className="font-bold text-red-700">Produtos desatualizados</h3>
            <p className="text-sm text-slate-500 mt-1">
              Produtos com custo sem atualização há mais de 30 dias.
            </p>
          </Link>

          <Link href="/relatorios" className="border rounded-2xl p-5 hover:bg-blue-50 transition">
            <h3 className="font-bold text-red-700">Registros ANVISA vencidos</h3>
            <p className="text-sm text-slate-500 mt-1">
              Produtos com vencimento do registro ANVISA expirado.
            </p>
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
