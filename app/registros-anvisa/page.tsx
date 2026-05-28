"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { abrirPdfRegistro } from "@/lib/storagePdf";

type Registro = {
  id: string;
  item: string | null;
  apresentacao: string | null;
  marca: string | null;
  registro_anvisa: string | null;
  vencimento_registro: string | null;
  pdf_path: string | null;
};

function textoBusca(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export default function RegistrosAnvisaPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro("");

    const { data, error } = await supabase
      .from("registros_anvisa")
      .select("*")
      .order("item", { ascending: true });

    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }

    setRegistros(data || []);
    setCarregando(false);
  }

  const filtrados = useMemo(() => {
    const termo = textoBusca(busca);

    if (!termo) return registros;

    return registros.filter((r) =>
      textoBusca(
        [
          r.item,
          r.apresentacao,
          r.marca,
          r.registro_anvisa,
        ]
          .filter(Boolean)
          .join(" ")
      ).includes(termo)
    );
  }, [registros, busca]);

  async function abrir(path?: string | null) {
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
          <h1 className="text-3xl font-bold">Registros ANVISA</h1>

          <p className="text-slate-500">
            PDFs vinculados automaticamente aos produtos.
          </p>
        </div>

        <input
          className="input md:max-w-md"
          placeholder="Buscar item, marca ou registro..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {erro && (
        <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
          {erro}
        </div>
      )}

      <section className="card mt-6 overflow-hidden">
        {carregando ? (
          <div className="p-6 text-slate-500">
            Carregando registros...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-6 text-slate-500">
            Nenhum registro encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-4">Item</th>
                  <th className="text-left p-4">Apresentação</th>
                  <th className="text-left p-4">Marca</th>
                  <th className="text-left p-4">Registro</th>
                  <th className="text-left p-4">Vencimento</th>
                  <th className="text-left p-4">PDF</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((registro) => (
                  <tr key={registro.id} className="border-t">
                    <td className="p-4 font-medium">
                      {registro.item || "-"}
                    </td>

                    <td className="p-4">
                      {registro.apresentacao || "-"}
                    </td>

                    <td className="p-4">
                      {registro.marca || "-"}
                    </td>

                    <td className="p-4">
                      {registro.registro_anvisa || "-"}
                    </td>

                    <td className="p-4">
                      {registro.vencimento_registro || "-"}
                    </td>

                    <td className="p-4">
                      {registro.pdf_path ? (
                        <button
                          onClick={() => abrir(registro.pdf_path)}
                          className="text-cotamed-700 underline"
                        >
                          Abrir PDF
                        </button>
                      ) : (
                        <span className="text-red-600">
                          Sem PDF
                        </span>
                      )}
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
