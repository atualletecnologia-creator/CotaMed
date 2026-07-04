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

function maiusculo(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

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

function normalizarDataAAAA_MM_DD(valor: string) {
  const texto = String(valor || "").trim();
  if (!texto) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  const br = texto.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const compacto = texto.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compacto) return `${compacto[1]}-${compacto[2]}-${compacto[3]}`;

  return texto;
}

function limparCampo(valor: string) {
  return maiusculo(String(valor || "").replace(/-/g, " ").replace(/\s+/g, " "));
}

function parseNomeArquivo(fileName: string) {
  const semExtensao = fileName.replace(/\.pdf$/i, "");
  const vencMatch = semExtensao.match(/(?:^|_)venc-([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}[-/][0-9]{2}[-/][0-9]{4}|[0-9]{8})(?:_|$)/i);
  const regMatch = semExtensao.match(/(?:^|_)reg-([^_]+)(?:_|$)/i);
  const vencimento_registro = vencMatch ? normalizarDataAAAA_MM_DD(vencMatch[1]) : "";
  const registro_anvisa = regMatch ? maiusculo(regMatch[1]) : "";
  const antesDoVenc = semExtensao.split(/_venc-/i)[0] || semExtensao;
  const partes = antesDoVenc.split("_").map((p) => p.trim()).filter(Boolean);

  return {
    item: limparCampo(partes[0] || ""),
    apresentacao: limparCampo(partes[1] || ""),
    marca: limparCampo(partes.slice(2).join(" ") || ""),
    vencimento_registro,
    registro_anvisa,
  };
}

export default function RegistrosAnvisaPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [busca, setBusca] = useState("");
  const [paginaRegistros, setPaginaRegistros] = useState(1);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [progressoMassa, setProgressoMassa] = useState("");
  const [excluindoRegistro, setExcluindoRegistro] = useState("");

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
    return registros.filter((r) => textoBusca([r.item, r.apresentacao, r.marca, r.registro_anvisa, r.vencimento_registro].filter(Boolean).join(" ")).includes(termo));
  }, [registros, busca]);

  const registrosPorPagina = 50;
  const totalPaginasRegistros = Math.max(1, Math.ceil(filtrados.length / registrosPorPagina));
  const registrosPaginados = useMemo(() => {
    const inicio = (paginaRegistros - 1) * registrosPorPagina;
    return filtrados.slice(inicio, inicio + registrosPorPagina);
  }, [filtrados, paginaRegistros]);

  useEffect(() => {
    setPaginaRegistros(1);
  }, [busca, registros.length]);

  function preencherPorNomeArquivo(file: File | null) {
    if (!file) return;
    const dados = parseNomeArquivo(file.name);
    if (dados.item) setItem(dados.item);
    if (dados.apresentacao) setApresentacao(dados.apresentacao);
    if (dados.marca) setMarca(dados.marca);
    if (dados.vencimento_registro) setVencimentoRegistro(dados.vencimento_registro);
    if (dados.registro_anvisa) setRegistroAnvisa(dados.registro_anvisa);
  }

  async function enviarPdfsEmMassa(files: FileList | null) {
    try {
      setErro("");
      setMensagem("");
      setProgressoMassa("");

      if (!files || files.length === 0) return;

      setEnviando(true);

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setErro("Usuário não autenticado.");
        return;
      }

      let enviados = 0;
      let ignorados = 0;
      let erros = 0;

      const lista = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".pdf"));

      if (!lista.length) {
        setErro("Selecione apenas arquivos PDF.");
        return;
      }

      for (let i = 0; i < lista.length; i++) {
        const file = lista[i];

        setProgressoMassa(`Enviando ${i + 1} de ${lista.length}: ${file.name}`);

        try {
          const dadosArquivo = parseNomeArquivo(file.name);

          const itemFinal = (dadosArquivo.item || "").trim();
          const apresentacaoFinal = (dadosArquivo.apresentacao || "").trim();
          const marcaFinal = (dadosArquivo.marca || "").trim();
          const vencimentoFinal = normalizarDataAAAA_MM_DD((dadosArquivo.vencimento_registro || "").trim());
          const registroFinal = (dadosArquivo.registro_anvisa || "").trim();

          if (!itemFinal || !apresentacaoFinal || !marcaFinal || !vencimentoFinal) {
            ignorados++;
            continue;
          }

          if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoFinal)) {
            ignorados++;
            continue;
          }

          const nomeSeguro = [
            limparNomeArquivo(itemFinal),
            limparNomeArquivo(apresentacaoFinal),
            limparNomeArquivo(marcaFinal),
            `venc-${vencimentoFinal}`,
            registroFinal ? `reg-${limparNomeArquivo(registroFinal)}` : "reg-sem_registro",
          ].join("_");

          const path = `${userData.user.id}/${nomeSeguro}.pdf`;

          const { error: uploadError } = await supabase.storage
            .from("registros-anvisa")
            .upload(path, file, { contentType: "application/pdf", upsert: true });

          if (uploadError) {
            erros++;
            continue;
          }

          const { error: insertError } = await supabase.from("registros_anvisa").upsert({
            user_id: userData.user.id,
            item: itemFinal.toUpperCase(),
            apresentacao: apresentacaoFinal.toUpperCase(),
            marca: marcaFinal.toUpperCase(),
            registro_anvisa: registroFinal ? registroFinal.toUpperCase() : null,
            vencimento_registro: vencimentoFinal,
            nome_arquivo: file.name.toUpperCase(),
            pdf_path: path,
          });

          if (insertError) {
            erros++;
            continue;
          }

          enviados++;
        } catch {
          erros++;
        }
      }

      setMensagem(`${enviados} registros enviados em massa. ${ignorados} ignorados por nome inválido. ${erros} erros.`);
      setProgressoMassa("");
      await carregar();
    } finally {
      setEnviando(false);
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
      const itemFinal = maiusculo(item || dadosArquivo.item || "");
      const apresentacaoFinal = maiusculo(apresentacao || dadosArquivo.apresentacao || "");
      const marcaFinal = maiusculo(marca || dadosArquivo.marca || "");
      const vencimentoFinal = normalizarDataAAAA_MM_DD((vencimentoRegistro || dadosArquivo.vencimento_registro || "").trim());
      const registroFinal = maiusculo(registroAnvisa || dadosArquivo.registro_anvisa || "");

      if (!itemFinal || !apresentacaoFinal || !marcaFinal || !vencimentoFinal) {
        setErro("Preencha item, apresentação, marca e vencimento do registro no formato AAAA-MM-DD.");
        return;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoFinal)) {
        setErro("O vencimento do registro precisa estar no formato AAAA-MM-DD. Exemplo: 2028-04-15.");
        return;
      }

      const nomeSeguro = [
        limparNomeArquivo(itemFinal),
        limparNomeArquivo(apresentacaoFinal),
        limparNomeArquivo(marcaFinal),
        `venc-${vencimentoFinal}`,
        registroFinal ? `reg-${limparNomeArquivo(registroFinal)}` : "reg-sem_registro",
      ].join("_");

      const path = `${userData.user.id}/${nomeSeguro}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("registros-anvisa")
        .upload(path, file, { contentType: "application/pdf", upsert: true });

      if (uploadError) {
        setErro(uploadError.message);
        return;
      }

      const { error: insertError } = await supabase.from("registros_anvisa").insert({
        user_id: userData.user.id,
        item: itemFinal,
        apresentacao: apresentacaoFinal,
        marca: marcaFinal,
        registro_anvisa: registroFinal || null,
        vencimento_registro: vencimentoFinal,
        nome_arquivo: maiusculo(file.name),
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

  async function excluirRegistro(registro: Registro) {
    try {
      setErro("");
      setMensagem("");
      const confirmar = window.confirm(`Excluir o registro ${registro.item || ""}?`);
      if (!confirmar) return;

      setExcluindoRegistro(registro.id);

      if (registro.pdf_path) {
        await supabase.storage.from("registros-anvisa").remove([registro.pdf_path]);
      }

      const { error } = await supabase.from("registros_anvisa").delete().eq("id", registro.id);
      if (error) {
        setErro(error.message);
        return;
      }

      if (registro.pdf_path) {
        await supabase
          .from("produtos")
          .update({ registro_anvisa: null, vencimento_registro: null, pdf_url: null })
          .eq("pdf_url", registro.pdf_path);
      }

      setMensagem("Registro excluído com sucesso.");
      await carregar();
    } finally {
      setExcluindoRegistro("");
    }
  }

  return (
    <AppShell>
      <div className="flex min-w-0 flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Registros ANVISA</h1>
          <p className="text-slate-500">Envie PDFs dos registros e vincule automaticamente ao banco de preços.</p>
        </div>

        <input className="input md:max-w-md" placeholder="Buscar registro" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <section className="clean-card p-6 mt-6 registros-upload-card">
        <h2 className="font-bold text-xl">Enviar PDF do registro</h2>
        <p className="text-sm text-slate-500 mt-1">Padrão do arquivo: item_apresentacao_marca_venc-2028-04-15_reg-123456789.pdf</p>

        <div className="registros-massa-card">
          <h3 className="font-semibold text-slate-800">Enviar vários PDFs de uma vez</h3>
          <p className="text-sm text-slate-600 mt-1">
            Selecione vários PDFs. O sistema vai ler os dados pelo nome do arquivo.
          </p>

          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="input mt-4"
            disabled={enviando}
            onChange={(e) => enviarPdfsEmMassa(e.target.files)}
          />

          {progressoMassa && (
            <p className="text-sm text-cotamed-700 mt-3">{progressoMassa}</p>
          )}
        </div>


        <div className="registros-form-grid">
          <div className="registros-field"><label>Item</label><input className="input mt-2" value={item} onChange={(e) => setItem(maiusculo(e.target.value))} placeholder="EX: CARBONATO DE LÍTIO 300MG" /></div>
          <div className="registros-field"><label>Apresentação</label><input className="input mt-2" value={apresentacao} onChange={(e) => setApresentacao(maiusculo(e.target.value))} placeholder="EX: COMPRIMIDO" /></div>
          <div className="registros-field"><label>Marca</label><input className="input mt-2" value={marca} onChange={(e) => setMarca(maiusculo(e.target.value))} placeholder="EX: HIPOLABOR" /></div>
          <div className="registros-field"><label>Registro ANVISA</label><input className="input mt-2" type="text" inputMode="text" value={registroAnvisa} onChange={(e) => setRegistroAnvisa(maiusculo(e.target.value))} placeholder="EX: 123456789 OU MS123ABC" /></div>
          <div className="registros-field"><label>Vencimento</label><input className="input mt-2" type="text" value={vencimentoRegistro} onChange={(e) => setVencimentoRegistro(normalizarDataAAAA_MM_DD(e.target.value))} placeholder="AAAA-MM-DD" /></div>
        </div>

        <div className="registros-upload-row mt-5">
          <input type="file" accept="application/pdf,.pdf" className="input" onChange={(e) => { const file = e.target.files?.[0] || null; preencherPorNomeArquivo(file); enviarPdf(file); }} />
          <button type="button" className="btn-primary" disabled={enviando}>{enviando ? "Enviando..." : "Enviar PDF"}</button>
        </div>

        <div className="registros-help">O sistema identifica automaticamente <b>venc-AAAA-MM-DD</b> e <b>reg-Registro</b> pelo nome do arquivo.</div>

        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      <section className="clean-card mt-6 overflow-hidden max-w-full registros-table-card">
        <div className="p-6 border-b">
          <h2 className="font-bold text-xl">Registros salvos</h2>
          <p className="text-sm text-slate-500">Total: {filtrados.length} • exibindo 50 por página</p>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando registros...</div>
        ) : filtrados.length === 0 ? (
          <div className="p-6 text-slate-500">Nenhum registro encontrado.</div>
        ) : (
          <div className="registros-table-wrap">
            <div className="registros-pagination registros-pagination-top">
              <span>Página {Math.min(paginaRegistros, totalPaginasRegistros)} de {totalPaginasRegistros}</span>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 disabled:opacity-50"
                  disabled={paginaRegistros <= 1}
                  onClick={() => setPaginaRegistros((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>

                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 disabled:opacity-50"
                  disabled={paginaRegistros >= totalPaginasRegistros}
                  onClick={() => setPaginaRegistros((p) => Math.min(totalPaginasRegistros, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>


            <table className="registros-table clean-table w-full">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-4">Item</th>
                  <th className="text-left p-4">Apresentação</th>
                  <th className="text-left p-4">Marca</th>
                  <th className="text-left p-4">Registro</th>
                  <th className="text-left p-4">Vencimento</th>
                  <th className="text-left p-4">PDF</th>
                  <th className="text-left p-4">Ação</th>
                </tr>
              </thead>

              <tbody>
                {registrosPaginados.map((registro) => (
                  <tr key={registro.id} className="border-t">
                    <td className="p-4 font-medium">{registro.item || "-"}</td>
                    <td className="p-4">{registro.apresentacao || "-"}</td>
                    <td className="p-4">{registro.marca || "-"}</td>
                    <td className="p-4">{registro.registro_anvisa || "-"}</td>
                    <td className="p-4">{registro.vencimento_registro || "-"}</td>
                    <td className="p-4">{registro.pdf_path ? <button onClick={() => abrir(registro.pdf_path)} className="text-cotamed-700 underline">Abrir PDF</button> : <span className="text-red-600">Sem PDF</span>}</td>
                    <td className="p-4"><button disabled={excluindoRegistro === registro.id} onClick={() => excluirRegistro(registro)} className="rounded-lg border px-3 py-2 text-red-700 hover:bg-red-50 disabled:opacity-60">{excluindoRegistro === registro.id ? "Excluindo..." : "Excluir"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="registros-pagination">
              <span>Página {Math.min(paginaRegistros, totalPaginasRegistros)} de {totalPaginasRegistros}</span>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 disabled:opacity-50"
                  disabled={paginaRegistros <= 1}
                  onClick={() => setPaginaRegistros((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>

                <button
                  type="button"
                  className="rounded-xl border px-4 py-2 disabled:opacity-50"
                  disabled={paginaRegistros >= totalPaginasRegistros}
                  onClick={() => setPaginaRegistros((p) => Math.min(totalPaginasRegistros, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
