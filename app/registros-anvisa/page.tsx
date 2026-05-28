"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { extrairDadosDoNomeArquivo, gerarNomePdfRegistro } from "@/lib/arquivoRegistro";

type RegistroFormulario = {
  item: string;
  apresentacao: string;
  marca: string;
  vencimento_registro: string;
  registro_anvisa: string;
  nome_arquivo: string;
  pdf_path?: string;
};

type RegistroSalvo = {
  id: string;
  item: string | null;
  apresentacao: string | null;
  marca: string | null;
  vencimento_registro: string | null;
  registro_anvisa: string | null;
  nome_arquivo: string | null;
  pdf_path: string | null;
  created_at: string | null;
};

export default function RegistrosAnvisa() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [registro, setRegistro] = useState<RegistroFormulario>({
    item: "",
    apresentacao: "",
    marca: "",
    vencimento_registro: "",
    registro_anvisa: "",
    nome_arquivo: ""
  });

  const [registrosSalvos, setRegistrosSalvos] = useState<RegistroSalvo[]>([]);
  const [busca, setBusca] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarRegistros();
  }, []);

  async function carregarRegistros() {
    setCarregando(true);
    setErro("");

    const { data, error } = await supabase
      .from("registros_anvisa")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
      setCarregando(false);
      return;
    }

    setRegistrosSalvos(data || []);
    setCarregando(false);
  }

  const registrosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    if (!termo) return registrosSalvos;

    return registrosSalvos.filter((r) => {
      const texto = [
        r.item,
        r.apresentacao,
        r.marca,
        r.vencimento_registro,
        r.registro_anvisa,
        r.nome_arquivo
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [busca, registrosSalvos]);

  function selecionarArquivo(file: File | null) {
    setErro("");
    setMensagem("");

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErro("Envie somente arquivo PDF.");
      return;
    }

    setArquivo(file);

    const dados = extrairDadosDoNomeArquivo(file.name);

    setRegistro({
      item: dados.item,
      apresentacao: dados.apresentacao,
      marca: dados.marca,
      vencimento_registro: dados.vencimento_registro,
      registro_anvisa: dados.registro_anvisa,
      nome_arquivo: file.name
    });
  }

  async function salvarPdf() {
    try {
      setSalvando(true);
      setErro("");
      setMensagem("");

      if (!arquivo) {
        setErro("Selecione um PDF antes de salvar.");
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setErro("Usuário não autenticado.");
        return;
      }

      const nomeFinal = gerarNomePdfRegistro({
        item: registro.item,
        apresentacao: registro.apresentacao,
        marca: registro.marca,
        vencimento: registro.vencimento_registro,
        registro: registro.registro_anvisa
      });

      const caminho = `${userData.user.id}/${nomeFinal}`;

      const { error: uploadError } = await supabase.storage
        .from("registros-anvisa")
        .upload(caminho, arquivo, {
          upsert: true,
          contentType: "application/pdf"
        });

      if (uploadError) {
        setErro(uploadError.message);
        return;
      }

      const { error: insertError } = await supabase.from("registros_anvisa").insert({
        user_id: userData.user.id,
        item: registro.item,
        apresentacao: registro.apresentacao,
        marca: registro.marca,
        vencimento_registro: registro.vencimento_registro || null,
        registro_anvisa: registro.registro_anvisa,
        nome_arquivo: nomeFinal,
        pdf_path: caminho
      });

      if (insertError) {
        setErro(insertError.message);
        return;
      }

      setMensagem("PDF salvo com sucesso.");
      setArquivo(null);
      setRegistro({
        item: "",
        apresentacao: "",
        marca: "",
        vencimento_registro: "",
        registro_anvisa: "",
        nome_arquivo: ""
      });

      await carregarRegistros();
    } finally {
      setSalvando(false);
    }
  }

  async function abrirPdf(path: string | null) {
    if (!path) {
      setErro("PDF não encontrado.");
      return;
    }

    const { data, error } = await supabase.storage
      .from("registros-anvisa")
      .createSignedUrl(path, 60 * 10);

    if (error) {
      setErro(error.message);
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function excluirRegistro(registro: RegistroSalvo) {
    const confirmar = window.confirm("Deseja excluir este registro e o PDF salvo?");
    if (!confirmar) return;

    setErro("");
    setMensagem("");

    if (registro.pdf_path) {
      const { error: storageError } = await supabase.storage
        .from("registros-anvisa")
        .remove([registro.pdf_path]);

      if (storageError) {
        setErro(storageError.message);
        return;
      }
    }

    const { error } = await supabase
      .from("registros_anvisa")
      .delete()
      .eq("id", registro.id);

    if (error) {
      setErro(error.message);
      return;
    }

    setMensagem("Registro excluído com sucesso.");
    await carregarRegistros();
  }

  function atualizarCampo(campo: keyof RegistroFormulario, valor: string) {
    setRegistro((atual) => ({ ...atual, [campo]: valor }));
  }

  const nomeSugerido = gerarNomePdfRegistro({
    item: registro.item || "item",
    apresentacao: registro.apresentacao || "apresentacao",
    marca: registro.marca || "marca",
    vencimento: registro.vencimento_registro || "aaaa-mm-dd",
    registro: registro.registro_anvisa || "registro"
  });

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Registros ANVISA</h1>
      <p className="text-slate-500">
        Envie PDFs, salve os dados por empresa e consulte todos os registros já cadastrados.
      </p>

      <section className="card p-6 mt-6">
        <h2 className="font-bold text-xl">Enviar PDF do registro</h2>

        <div className="border-2 border-dashed border-blue-200 rounded-2xl p-8 mt-5 bg-blue-50/40">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => selecionarArquivo(e.target.files?.[0] || null)}
            className="block w-full text-sm"
          />

          <p className="text-sm text-slate-500 mt-3">
            Nome recomendado: item_apresentacao_marca_venc-2028-04-15_reg-123456789.pdf
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <div>
            <label className="text-sm font-medium">Item</label>
            <input className="input mt-2" value={registro.item} onChange={(e) => atualizarCampo("item", e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Apresentação</label>
            <input className="input mt-2" value={registro.apresentacao} onChange={(e) => atualizarCampo("apresentacao", e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Marca</label>
            <input className="input mt-2" value={registro.marca} onChange={(e) => atualizarCampo("marca", e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Vencimento do registro</label>
            <input className="input mt-2" placeholder="2028-04-15" value={registro.vencimento_registro} onChange={(e) => atualizarCampo("vencimento_registro", e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Registro ANVISA</label>
            <input className="input mt-2" value={registro.registro_anvisa} onChange={(e) => atualizarCampo("registro_anvisa", e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Nome final do arquivo</label>
            <input className="input mt-2" value={nomeSugerido} readOnly />
          </div>
        </div>

        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}

        <button onClick={salvarPdf} disabled={salvando} className="btn-primary mt-5">
          {salvando ? "Salvando..." : "Salvar PDF"}
        </button>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl">Registros salvos</h2>
              <p className="text-sm text-slate-500">
                Total encontrado: {registrosFiltrados.length}
              </p>
            </div>

            <input
              className="input md:max-w-md"
              placeholder="Buscar por item, marca, registro, apresentação..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando registros...</div>
        ) : registrosFiltrados.length === 0 ? (
          <div className="p-6 text-slate-500">Nenhum registro encontrado.</div>
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
                  <th className="text-left p-4">Arquivo</th>
                  <th className="text-left p-4">Ações</th>
                </tr>
              </thead>

              <tbody>
                {registrosFiltrados.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-4 font-medium">{r.item || "-"}</td>
                    <td className="p-4">{r.apresentacao || "-"}</td>
                    <td className="p-4">{r.marca || "-"}</td>
                    <td className="p-4">{r.registro_anvisa || "-"}</td>
                    <td className="p-4">{r.vencimento_registro || "-"}</td>
                    <td className="p-4 max-w-xs truncate" title={r.nome_arquivo || ""}>
                      {r.nome_arquivo || "-"}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirPdf(r.pdf_path)}
                          className="rounded-lg border border-blue-200 px-3 py-2 text-cotamed-700 hover:bg-blue-50"
                        >
                          Abrir PDF
                        </button>

                        <button
                          onClick={() => excluirRegistro(r)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50"
                        >
                          Excluir
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
