"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
      password: senha,
    });

    setCarregando(false);

    if (error) {
      setErro(error.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Image
          src="/brand/cotamed-logo.svg"
          alt="CotaMed"
          width={210}
          height={54}
          priority
          className="login-logo"
        />

        <div className="mb-7 text-center">
          <h1 className="text-2xl font-bold">Entrar no CotaMed</h1>
          <p className="text-sm text-slate-500 mt-2">Acesse sua empresa para continuar.</p>
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
          Ainda não tem conta? <Link href="/cadastro" className="text-cotamed-700 font-semibold">Criar cadastro</Link>
        </p>
      </section>
    </main>
  );
}
