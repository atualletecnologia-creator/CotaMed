"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

type MenuIconName = "dashboard" | "banco" | "licitacoes" | "propostas" | "registros" | "consulta" | "relatorios" | "configuracoes" | "sair";

const menu: { href: string; label: string; icon: MenuIconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/banco-precos", label: "Banco de preços", icon: "banco" },
  { href: "/licitacoes", label: "Licitações", icon: "licitacoes" },
  { href: "/propostas", label: "Propostas", icon: "propostas" },
  { href: "/registros-anvisa", label: "Registros ANVISA", icon: "registros" },
  { href: "/consulta-rapida", label: "Consulta rápida", icon: "consulta" },
  { href: "/relatorios", label: "Relatórios", icon: "relatorios" },
];

function MenuIcon({ name }: { name: MenuIconName }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "dashboard") {
    return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>;
  }

  if (name === "banco") {
    return <svg {...common}><path d="M4 7h16"/><path d="M6 7V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V7"/><rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 11h6"/><path d="M9 15h2"/><path d="M14 15h1"/></svg>;
  }

  if (name === "licitacoes") {
    return <svg {...common}><path d="M14.5 4.5l5 5"/><path d="M12 7l5 5"/><path d="M6.8 9.8l4-4 5.4 5.4-4 4z"/><path d="M11 14l-7 7"/><path d="M3 21h8"/><path d="M16.8 12.8l3.4 3.4"/></svg>;
  }

  if (name === "propostas") {
    return <svg {...common}><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h6"/><path d="M9 9h2"/></svg>;
  }

  if (name === "registros") {
    return <svg {...common}><path d="M12 3l7 4v5c0 4.6-2.8 7.7-7 9-4.2-1.3-7-4.4-7-9V7z"/><path d="M9 12l2 2 4-5"/></svg>;
  }

  if (name === "consulta") {
    return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.4-3.4"/></svg>;
  }

  if (name === "relatorios") {
    return <svg {...common}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/></svg>;
  }

  if (name === "configuracoes") {
    return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .35 2l.05.05-2.1 2.1-.05-.05a1.8 1.8 0 0 0-2-.35 1.8 1.8 0 0 0-1.1 1.65V20h-3v-.1a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-2 .35l-.05.05-2.1-2.1.05-.05a1.8 1.8 0 0 0 .35-2A1.8 1.8 0 0 0 5 13.4H4v-3h1a1.8 1.8 0 0 0 1.65-1.1 1.8 1.8 0 0 0-.35-2l-.05-.05 2.1-2.1.05.05a1.8 1.8 0 0 0 2 .35A1.8 1.8 0 0 0 11.5 4h3a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 2-.35l.05-.05 2.1 2.1-.05.05a1.8 1.8 0 0 0-.35 2A1.8 1.8 0 0 0 21 10.6h1v3h-1A1.8 1.8 0 0 0 19.4 15z"/></svg>;
  }

  return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuFixo, setMenuFixo] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthGuard>
      <div className={menuFixo ? "app-shell sidebar-open sidebar-fixed" : "app-shell"}>
        <aside className="app-sidebar">
          <div>
            <div className="app-brand">
              <button type="button" className="sidebar-toggle" onClick={() => setMenuFixo((v) => !v)} aria-label={menuFixo ? "Recolher menu" : "Fixar menu"}>☰</button>

              <Image src="/brand/cotamed-logo.svg" alt="CotaMed" width={176} height={46} priority className="app-brand-logo" />
            </div>

            <nav className="app-nav">
              {menu.map((item) => {
                const ativo = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} title={item.label} className={ativo ? "app-nav-item active" : "app-nav-item"} onClick={() => { if (window.innerWidth < 1024) setMenuFixo(false); }}>
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

        {menuFixo && <button type="button" className="sidebar-backdrop" onClick={() => setMenuFixo(false)} aria-label="Fechar menu" />}

        <main className="app-main">
          <div className="topbar-mobile">
            <button type="button" className="sidebar-toggle mobile" onClick={() => setMenuFixo(true)}>☰</button>
            <Image src="/brand/cotamed-logo.svg" alt="CotaMed" width={150} height={40} />
          </div>

          <div className="app-content">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
