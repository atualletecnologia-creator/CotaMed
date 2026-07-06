"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type Produto = {
  id: string;
  descricao?: string | null;
  marca?: string | null;
  custo_unitario?: number | null;
  custo_caixa?: number | null;
  data_atualizacao_custo?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
};

function dinheiro(valor?: number | null) {
  if (valor === null || valor === undefined) return "-";

  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function diasDesde(data?: string | null) {
  if (!data) return 9999;

  const d = new Date(data);
  const hoje = new Date();

  return Math.floor(
    (hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export default function Relatorios() {
  const [produtosDesatualizados, setProdutosDesatualizados] = useState<Produto[]>([]);
  const [registrosVencidos, setRegistrosVencidos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);

    const { data: produtos } = await supabase
      .from("produtos")
      .select("*")
      .order("descricao", { ascending: true });

    const lista = produtos || [];

    const desatualizados = lista.filter((p) => {
      const dias = diasDesde(p.data_atualizacao_custo);
      return dias > 30;
    });

    const vencidos = lista.filter((p) => {
      if (!p.vencimento_registro) return false;

      const venc = new Date(p.vencimento_registro);
      const hoje = new Date();

      return venc < hoje;
    });

    setProdutosDesatualizados(desatualizados);
    setRegistrosVencidos(vencidos);

    setCarregando(false);
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Relatórios</h1>

      <p className="text-slate-500">
        Relatórios reais do banco de preços do usuário logado.
      </p>

      <section className="clean-card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="font-bold text-red-700 text-2xl">
            Produtos com custo desatualizado há mais de 30 dias
          </h2>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando...</div>
        ) : produtosDesatualizados.length === 0 ? (
          <div className="p-6 text-green-700">
            Nenhum produto desatualizado encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="clean-table w-full text-sm">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-4">Produto</th>
                  <th className="text-left p-4">Marca</th>
                  <th className="text-left p-4">Custo Unit.</th>
                  <th className="text-left p-4">Custo Caixa</th>
                  <th className="text-left p-4">Última atualização</th>
                  <th className="text-left p-4">Dias</th>
                </tr>
              </thead>

              <tbody>
                {produtosDesatualizados.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-4 font-medium">{item.descricao || "-"}</td>
                    <td className="p-4">{item.marca || "-"}</td>
                    <td className="p-4">{dinheiro(item.custo_unitario)}</td>
                    <td className="p-4">{dinheiro(item.custo_caixa)}</td>
                    <td className="p-4">{item.data_atualizacao_custo || "-"}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-yellow-100 text-yellow-800 px-3 py-1">
                        {diasDesde(item.data_atualizacao_custo)} dias
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="clean-card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="font-bold text-red-700 text-2xl">
            Registros ANVISA vencidos
          </h2>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando...</div>
        ) : registrosVencidos.length === 0 ? (
          <div className="p-6 text-green-700">
            Nenhum registro vencido encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="clean-table w-full text-sm">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-4">Produto</th>
                  <th className="text-left p-4">Marca</th>
                  <th className="text-left p-4">Registro ANVISA</th>
                  <th className="text-left p-4">Vencimento</th>
                  <th className="text-left p-4">Status</th>
                </tr>
              </thead>

              <tbody>
                {registrosVencidos.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-4 font-medium">{item.descricao || "-"}</td>
                    <td className="p-4">{item.marca || "-"}</td>
                    <td className="p-4">{item.registro_anvisa || "-"}</td>
                    <td className="p-4">{item.vencimento_registro || "-"}</td>
                    <td className="p-4">
                      <span className="rounded-full bg-red-100 text-red-700 px-3 py-1">
                        Vencido
                      </span>
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
