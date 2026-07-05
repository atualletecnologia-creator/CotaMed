"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type MenuIconName = "dashboard" | "banco" | "licitacoes" | "registros" | "consulta" | "relatorios" | "configuracoes" | "sair";

const menu: { href: string; label: string; icon: MenuIconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/banco-precos", label: "Banco de preços", icon: "banco" },
  { href: "/licitacoes", label: "Licitações", icon: "licitacoes" },
  { href: "/registros-anvisa", label: "Registros ANVISA", icon: "registros" },
  { href: "/consulta-rapida", label: "Consulta rápida", icon: "consulta" },
  { href: "/relatorios", label: "Relatórios", icon: "relatorios" },
  { href: "/configuracoes", label: "Configurações", icon: "configuracoes" },
];

function MenuIcon({ name }: { name: MenuIconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return <svg {...common}><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>;
  }

  if (name === "banco") {
    return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8"/><path d="M8 13h3"/><path d="M13 13h3"/><path d="M8 17h8"/></svg>;
  }

  if (name === "licitacoes") {
    return <svg {...common}><path d="M8 3h8l4 4v14H8z"/><path d="M16 3v5h5"/><path d="M4 7h4"/><path d="M4 11h4"/><path d="M4 15h4"/></svg>;
  }

  if (name === "registros") {
    return <svg {...common}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-5"/></svg>;
  }

  if (name === "consulta") {
    return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>;
  }

  if (name === "relatorios") {
    return <svg {...common}><path d="M4 19V5"/><path d="M4 19h16"/><rect x="7" y="11" width="3" height="5"/><rect x="12" y="7" width="3" height="9"/><rect x="17" y="4" width="3" height="12"/></svg>;
  }

  if (name === "configuracoes") {
    return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .35 2l.05.05-2.1 2.1-.05-.05a1.8 1.8 0 0 0-2-.35 1.8 1.8 0 0 0-1.1 1.65V20h-3v-.1A1.8 1.8 0 0 0 10.4 18.25a1.8 1.8 0 0 0-2 .35l-.05.05-2.1-2.1.05-.05a1.8 1.8 0 0 0 .35-2A1.8 1.8 0 0 0 5 13.4H4v-3h1a1.8 1.8 0 0 0 1.65-1.1 1.8 1.8 0 0 0-.35-2l-.05-.05 2.1-2.1.05.05a1.8 1.8 0 0 0 2 .35A1.8 1.8 0 0 0 11.5 4h3a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 2-.35l.05-.05 2.1 2.1-.05.05a1.8 1.8 0 0 0-.35 2A1.8 1.8 0 0 0 21 10.6h1v3h-1A1.8 1.8 0 0 0 19.4 15z"/></svg>;
  }

  return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>;
}

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
              <button type="button" className="sidebar-toggle" onClick={() => setAberto((v) => !v)} aria-label="Abrir menu">☰</button>

              <Image src="/brand/cotamed-logo.svg" alt="CotaMed" width={176} height={46} priority className="app-brand-logo" />
            </div>

            <nav className="app-nav">
              {menu.map((item) => {
                const ativo = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} title={item.label} className={ativo ? "app-nav-item active" : "app-nav-item"} onClick={() => { if (window.innerWidth < 1024) setAberto(false); }}>
                    <span className="app-nav-icon"><MenuIcon name={item.icon} /></span>
                    <span className="app-nav-label">{item.label}</span>
                  </Link>
                );
              })}

              <button onClick={sair} className="app-nav-item app-nav-button" title="Sair">
                <span className="app-nav-icon"><MenuIcon name="sair" /></span>
                <span className="app-nav-label">Sair</span>
              </button>
            </nav>
          </div>

          <div className="app-sidebar-footer"><span>Atualle Tecnologia</span><small>© 2026</small></div>
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
