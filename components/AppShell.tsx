"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

const menu = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/banco-precos", label: "Banco de Preços", icon: "💰" },
  { href: "/licitacoes", label: "Licitações", icon: "📄" },
  { href: "/consulta-rapida", label: "Consulta Rápida", icon: "🔎" },
  { href: "/registros-anvisa", label: "Registros ANVISA", icon: "🧾" },
  { href: "/relatorios", label: "Relatórios", icon: "⚠️" },
  { href: "/configuracoes", label: "Configurações", icon: "⚙️" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthGuard>
      <div className={aberto ? "app-shell sidebar-open" : "app-shell"}>
        <aside className="app-sidebar">
          <div>
            <div className="app-brand">
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => setAberto((v) => !v)}
                aria-label="Abrir menu"
              >
                ☰
              </button>

              <Image
                src="/brand/cotamed-logo.svg"
                alt="CotaMed"
                width={176}
                height={46}
                priority
                className="app-brand-logo"
              />
            </div>

            <nav className="app-nav">
              {menu.map((item) => {
                const ativo = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={ativo ? "app-nav-item active" : "app-nav-item"}
                    onClick={() => {
                      if (window.innerWidth < 1024) setAberto(false);
                    }}
                  >
                    <span className="app-nav-icon">{item.icon}</span>
                    <span className="app-nav-label">{item.label}</span>
                  </Link>
                );
              })}

              <button onClick={sair} className="app-nav-item app-nav-button" title="Sair">
                <span className="app-nav-icon">↪</span>
                <span className="app-nav-label">Sair</span>
              </button>
            </nav>
          </div>

          <div className="app-sidebar-footer">
            <span>Atualle Tecnologia</span>
            <small>© 2026</small>
          </div>
        </aside>

        {aberto && <button type="button" className="sidebar-backdrop" onClick={() => setAberto(false)} aria-label="Fechar menu" />}

        <main className="app-main">
          <div className="topbar-mobile">
            <button type="button" className="sidebar-toggle mobile" onClick={() => setAberto(true)}>☰</button>
            <Image src="/brand/cotamed-logo.svg" alt="CotaMed" width={150} height={40} />
          </div>

          <div className="app-content">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
