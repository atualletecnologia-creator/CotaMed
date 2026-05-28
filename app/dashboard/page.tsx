"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CardResumo } from "@/components/CardResumo";
import { supabase } from "@/lib/supabase";

type Produto = {
  id: string;
  data_atualizacao_custo?: string | null;
  vencimento_registro?: string | null;
  pdf_url?: string | null;
};

function diasDesde(data?: string | null) {
  if (!data) return 9999;

  const d = new Date(data);
  const hoje = new Date();

  if (Number.isNaN(d.getTime())) return 9999;

  return Math.floor(
    (hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function registroVencido(data?: string | null) {
  if (!data) return false;

  const venc = new Date(data);
  const hoje = new Date();

  if (Number.isNaN(venc.getTime())) return false;

  return venc < hoje;
}

export default function Dashboard() {
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [precosDesatualizados, setPrecosDesatualizados] = useState(0);
  const [registrosVencidos, setRegistrosVencidos] = useState(0);
  const [pdfsDisponiveis, setPdfsDisponiveis] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    setErro("");

    const { data, error } = await supabase
      .from("produtos")
      .select("id,data_atualizacao_custo,vencimento_registro,pdf_url");

    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }

    const produtos = (data || []) as Produto[];

    setTotalProdutos(produtos.length);

    setPrecosDesatualizados(
      produtos.filter((p) => diasDesde(p.data_atualizacao_custo) > 30).length
    );

    setRegistrosVencidos(
      produtos.filter((p) => registroVencido(p.vencimento_registro)).length
    );

    setPdfsDisponiveis(
      produtos.filter((p) => !!p.pdf_url).length
    );

    setCarregando(false);
  }

  const textoCarregando = carregando ? "..." : "";

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Bem-vindo ao CotaMed</p>
        </div>

        <button
          onClick={carregarDados}
          className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50"
        >
          Atualizar
        </button>
      </div>

      {erro && (
        <div className="mt-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">
          {erro}
        </div>
      )}

      <div className="grid md:grid-cols-4 gap-4 mt-6">
        <CardResumo
          titulo="Itens no banco"
          valor={carregando ? textoCarregando : String(totalProdutos)}
          detalhe="produtos cadastrados"
        />

        <CardResumo
          titulo="Preços desatualizados"
          valor={carregando ? textoCarregando : String(precosDesatualizados)}
          detalhe="mais de 30 dias"
        />

        <CardResumo
          titulo="Registros vencidos"
          valor={carregando ? textoCarregando : String(registrosVencidos)}
          detalhe="ANVISA"
        />

        <CardResumo
          titulo="PDFs disponíveis"
          valor={carregando ? textoCarregando : String(pdfsDisponiveis)}
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
