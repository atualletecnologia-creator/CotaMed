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
      <section className="login-hero">
        <Image
          src="/brand/cotamed-logo-white.svg"
          alt="CotaMed"
          width={230}
          height={60}
          priority
        />

        <h1>Cotação inteligente para sua empresa.</h1>
        <p>
          Gerencie produtos, registros ANVISA e cotações com uma interface simples,
          rápida e profissional.
        </p>
      </section>

      <section className="login-form-wrap">
        <div className="login-card">
          <Image
            src="/brand/cotamed-logo.svg"
            alt="CotaMed"
            width={205}
            height={54}
            priority
            className="login-logo"
          />

          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold">Bem-vindo de volta</h1>
            <p className="text-sm text-slate-500 mt-2">Entre para acessar sua conta.</p>
          </div>

          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="input"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            className="input"
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />

          {erro && <p className="text-red-600 text-sm mb-4">{erro}</p>}

          <button onClick={entrar} className="btn-primary" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          <p className="text-sm text-slate-500 mt-5 text-center">
            Ainda não tem conta? <Link href="/cadastro" className="text-cotamed-700 font-semibold">Criar cadastro</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
