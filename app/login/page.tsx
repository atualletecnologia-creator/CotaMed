 "use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setCarregando(true);
    setErro("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha
    });

    setCarregando(false);

    if (error) {
  setErro(error.message);
  return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-cotamed-50 to-white flex items-center justify-center p-6">
      <section className="clean-card p-8 w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-cotamed-600 text-white flex items-center justify-center font-bold text-xl">C+</div>
          <div>
            <h1 className="text-2xl font-bold text-cotamed-900">CotaMed</h1>
            <p className="text-sm text-slate-500">Acesse sua empresa</p>
          </div>
        </div>

        <label className="text-sm font-medium">E-mail</label>
        <input className="input mt-2 mb-4" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="text-sm font-medium">Senha</label>
        <input className="input mt-2 mb-4" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />

        {erro && <p className="text-red-600 text-sm mb-4">{erro}</p>}

        <button onClick={entrar} className="btn-primary w-full" disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </button>

        <p className="text-sm text-slate-500 mt-5 text-center">
          Ainda não tem conta? <Link href="/cadastro" className="text-cotamed-600 font-medium">Cadastrar empresa</Link>
        </p>
      </section>
    </main>
  );
}
