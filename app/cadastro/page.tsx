 "use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function Cadastro() {
  const [empresa, setEmpresa] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function cadastrar() {
    setMensagem("");
    setErro("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          empresa_nome: empresa.trim().toUpperCase()
        }
      }
    });

    if (error) {
      setErro("Não foi possível cadastrar. Confira os dados.");
      return;
    }

    if (data.user) {
      await supabase.from("empresas").insert({
        user_id: data.user.id,
        nome: empresa.trim().toUpperCase(),
        email
      });
    }

    setMensagem("Cadastro criado. Agora faça login.");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-cotamed-50 to-white flex items-center justify-center p-6">
      <section className="clean-card p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-cotamed-900">Cadastrar empresa</h1>
        <p className="text-sm text-slate-500 mb-6">Cada empresa acessa somente seus próprios arquivos.</p>

        <label className="text-sm font-medium">Nome da empresa</label>
        <input className="input mt-2 mb-4" value={empresa} onChange={(e) => setEmpresa(e.target.value.toUpperCase())} />

        <label className="text-sm font-medium">E-mail</label>
        <input className="input mt-2 mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="text-sm font-medium">Senha</label>
        <input className="input mt-2 mb-4" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />

        {erro && <p className="text-red-600 text-sm mb-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mb-4">{mensagem}</p>}

        <button onClick={cadastrar} className="btn-primary w-full">Cadastrar</button>

        <p className="text-sm text-slate-500 mt-5 text-center">
          Já tem conta? <Link href="/login" className="text-cotamed-600 font-medium">Entrar</Link>
        </p>
      </section>
    </main>
  );
}
