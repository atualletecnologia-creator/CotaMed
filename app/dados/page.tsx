"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type DadosEmpresa = {
  id?: string;
  nome: string;
  cnpj: string;
  inscricao_estadual: string;
  endereco: string;
  telefone: string;
  email: string;
  logo_base64: string;
};

const vazio: DadosEmpresa = {
  nome: "",
  cnpj: "",
  inscricao_estadual: "",
  endereco: "",
  telefone: "",
  email: "",
  logo_base64: "",
};

function arquivoParaDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DadosPage() {
  const [dados, setDados] = useState<DadosEmpresa>(vazio);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Usuário não autenticado.");

      const { data, error } = await supabase
        .from("dados_empresa_cotacao")
        .select("id,nome,cnpj,inscricao_estadual,endereco,telefone,email,logo_base64")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setDados({
          id: data.id,
          nome: data.nome || "",
          cnpj: data.cnpj || "",
          inscricao_estadual: data.inscricao_estadual || "",
          endereco: data.endereco || "",
          telefone: data.telefone || "",
          email: data.email || "",
          logo_base64: data.logo_base64 || "",
        });
      }
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os dados da empresa.");
    } finally {
      setCarregando(false);
    }
  }

  async function selecionarLogo(file: File | null) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setErro("A logo deve ter no máximo 2 MB.");
      return;
    }
    try {
      const logo = await arquivoParaDataUrl(file);
      setDados((atual) => ({ ...atual, logo_base64: logo }));
    } catch {
      setErro("Não foi possível ler a logo selecionada.");
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setMensagem("");

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Usuário não autenticado.");

      const payload = {
        user_id: auth.user.id,
        nome: dados.nome.trim(),
        cnpj: dados.cnpj.trim(),
        inscricao_estadual: dados.inscricao_estadual.trim(),
        endereco: dados.endereco.trim(),
        telefone: dados.telefone.trim(),
        email: dados.email.trim(),
        logo_base64: dados.logo_base64 || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("dados_empresa_cotacao")
        .upsert(payload, { onConflict: "user_id" })
        .select("id")
        .single();

      if (error) throw error;
      setDados((atual) => ({ ...atual, id: data?.id || atual.id }));
      setMensagem("Dados da empresa salvos com sucesso.");
    } catch (e: any) {
      setErro(e?.message || "Não foi possível salvar os dados da empresa.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <AppShell>
      <section className="clean-page">
        <div className="clean-hero">
          <div>
            <p className="clean-kicker">Configuração comercial</p>
            <h1>Dados da empresa</h1>
            <p>Estas informações e a sua logo serão usadas nos PDFs gerados na aba Cotações.</p>
          </div>
        </div>

        <div className="clean-card p-6 mt-5">
          {carregando ? (
            <p>Carregando...</p>
          ) : (
            <form onSubmit={salvar} className="cotamed-dados-form">
              <div className="cotamed-dados-logo">
                <div className="cotamed-logo-preview">
                  {dados.logo_base64 ? <img src={dados.logo_base64} alt="Logo da empresa" /> : <span>Sem logo</span>}
                </div>
                <div>
                  <label>Logo da empresa</label>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void selecionarLogo(e.target.files?.[0] || null)} />
                  {dados.logo_base64 && <button type="button" className="btn-clean btn-clean-secondary mt-2" onClick={() => setDados((a) => ({ ...a, logo_base64: "" }))}>Remover logo</button>}
                </div>
              </div>

              <div className="cotamed-form-grid">
                <label>Nome / Razão social<input className="input" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} required /></label>
                <label>CNPJ<input className="input" value={dados.cnpj} onChange={(e) => setDados({ ...dados, cnpj: e.target.value })} /></label>
                <label>Inscrição Estadual<input className="input" value={dados.inscricao_estadual} onChange={(e) => setDados({ ...dados, inscricao_estadual: e.target.value })} /></label>
                <label>Telefone<input className="input" value={dados.telefone} onChange={(e) => setDados({ ...dados, telefone: e.target.value })} /></label>
                <label className="span-2">Endereço<input className="input" value={dados.endereco} onChange={(e) => setDados({ ...dados, endereco: e.target.value })} /></label>
                <label className="span-2">E-mail<input className="input" type="email" value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} /></label>
              </div>

              {erro && <div className="form-error mt-4">{erro}</div>}
              {mensagem && <div className="form-success mt-4">{mensagem}</div>}

              <div className="flex justify-end mt-5">
                <button className="btn-clean btn-clean-primary" disabled={salvando}>{salvando ? "Salvando..." : "Salvar dados"}</button>
              </div>
            </form>
          )}
        </div>
      </section>
    </AppShell>
  );
}
