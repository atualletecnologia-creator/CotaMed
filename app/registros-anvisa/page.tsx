"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { abrirPdfRegistro } from "@/lib/storagePdf";

type Registro = {
  id: string;
  user_id?: string | null;
  item: string | null;
  apresentacao: string | null;
  marca: string | null;
  registro_anvisa: string | null;
  vencimento_registro: string | null;
  pdf_path: string | null;
  nome_arquivo?: string | null;
  created_at?: string | null;
};

function textoBusca(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function limparNomeArquivo(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function parseNomeArquivo(fileName: string) {
  const semExtensao = fileName.replace(/\.pdf$/i, "");
  const partes = semExtensao.split("_").map((p) => p.trim()).filter(Boolean);

  return {
    item: partes[0] || "",
    apresentacao: partes[1] || "",
    marca: partes[2] || "",
    vencimento_registro: partes[3] || "",
  };
}

export default function RegistrosAnvisaPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const [item, setItem] = useState("");
  const [apresentacao, setApresentacao] = useState("");
  const [marca, setMarca] = useState("");
  const [registroAnvisa, setRegistroAnvisa] = useState("");
  const [vencimentoRegistro, setVencimentoRegistro] = useState("");

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
          r.vencimento_registro,
        ]
          .filter(Boolean)
          .join(" ")
      ).includes(termo)
    );
  }, [registros, busca]);

  function preencherPorNomeArquivo(file: File | null) {
    if (!file) return;

    const dados = parseNomeArquivo(file.name);

    if (dados.item && !item) setItem(dados.item.replace(/-/g, " "));
    if (dados.apresentacao && !apresentacao) setApresentacao(dados.apresentacao.replace(/-/g, " "));
    if (dados.marca && !marca) setMarca(dados.marca.replace(/-/g, " "));
    if (dados.vencimento_registro && !vencimentoRegistro) {
      setVencimentoRegistro(dados.vencimento_registro);
    }
  }

  async function enviarPdf(file: File | null) {
    try {
      setErro("");
      setMensagem("");

      if (!file) return;

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setErro("Envie apenas arquivo PDF.");
        return;
      }

      setEnviando(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setErro("Usuário não autenticado.");
        return;
      }

      const dadosArquivo = parseNomeArquivo(file.name);

      const itemFinal = (item || dadosArquivo.item || "").trim();
      const apresentacaoFinal = (apresentacao || dadosArquivo.apresentacao || "").trim();
      const marcaFinal = (marca || dadosArquivo.marca || "").trim();
      const vencimentoFinal = (vencimentoRegistro || dadosArquivo.vencimento_registro || "").trim();
      const registroFinal = registroAnvisa.trim();

      if (!itemFinal || !apresentacaoFinal || !marcaFinal || !vencimentoFinal) {
        setErro("Preencha item, apresentação, marca e vencimento do registro.");
        return;
      }

      const nomeSeguro = [
        limparNomeArquivo(itemFinal),
        limparNomeArquivo(apresentacaoFinal),
        limparNomeArquivo(marcaFinal),
        limparNomeArquivo(vencimentoFinal),
      ].join("_");

      const path = `${userData.user.id}/${nomeSeguro}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("registros-anvisa")
        .upload(path, file, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        setErro(uploadError.message);
        return;
      }

      const { error: insertError } = await supabase.from("registros_anvisa").insert({
        user_id: userData.user.id,
        item: itemFinal.toUpperCase(),
        apresentacao: apresentacaoFinal.toUpperCase(),
        marca: marcaFinal.toUpperCase(),
        registro_anvisa: registroFinal || null,
        vencimento_registro: vencimentoFinal,
        nome_arquivo: file.name,
        pdf_path: path,
      });

      if (insertError) {
        setErro(insertError.message);
        return;
      }

      setMensagem("Registro ANVISA enviado com sucesso.");
      setItem("");
      setApresentacao("");
      setMarca("");
      setRegistroAnvisa("");
      setVencimentoRegistro("");

      await carregar();
    } finally {
      setEnviando(false);
    }
  }

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
            Envie PDFs dos registros e vincule automaticamente ao banco de preços.
          </p>
        </div>

        <input
          className="input md:max-w-md"
          placeholder="Buscar item, marca ou registro..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <section className="card p-6 mt-6">
        <h2 className="font-bold text-xl">Enviar PDF do registro</h2>

        <p className="text-sm text-slate-500 mt-1">
          Padrão recomendado do arquivo: item_apresentacao_marca_vencimento_registro.pdf
        </p>

        <div className="grid md:grid-cols-5 gap-4 mt-5">
          <div>
            <label className="text-sm font-medium">Item</label>
            <input
              className="input mt-2"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Ex: Carbonato de Lítio 300mg"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Apresentação</label>
            <input
              className="input mt-2"
              value={apresentacao}
              onChange={(e) => setApresentacao(e.target.value)}
              placeholder="Ex: Comprimido"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Marca</label>
            <input
              className="input mt-2"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Ex: Hipolabor"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Registro ANVISA</label>
            <input
              className="input mt-2"
              value={registroAnvisa}
              onChange={(e) => setRegistroAnvisa(e.target.value)}
              placeholder="Ex: 1134301670044"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Vencimento</label>
            <input
              className="input mt-2"
              type="date"
              value={vencimentoRegistro}
              onChange={(e) => setVencimentoRegistro(e.target.value)}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-[1fr_180px] gap-4 mt-5">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="input"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              preencherPorNomeArquivo(file);
              enviarPdf(file);
            }}
          />

          <button
            type="button"
            className="btn-primary"
            disabled={enviando}
          >
            {enviando ? "Enviando..." : "Selecionar PDF"}
          </button>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4 mt-5 text-sm text-slate-700">
          Os PDFs ficam salvos por empresa no Supabase Storage. Uma empresa não acessa arquivos da outra.
        </div>

        {erro && (
          <p className="text-red-600 text-sm mt-4">{erro}</p>
        )}

        {mensagem && (
          <p className="text-green-700 text-sm mt-4">{mensagem}</p>
        )}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="font-bold text-xl">Registros salvos</h2>
          <p className="text-sm text-slate-500">
            Total encontrado: {filtrados.length}
          </p>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">
            Carregando registros...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-6 text-slate-500">
            Nenhum registro encontrado.
          </div>
        ) : (
          <div className="overflow-hidden">
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
