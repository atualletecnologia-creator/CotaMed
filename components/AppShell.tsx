"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
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
  const router = useRouter();
  const pathname = usePathname();

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthGuard>
      <div className="app-shell">
        <aside className="app-sidebar">
          <div>
            <div className="app-brand">
              <Image
                src="/brand/cotamed-logo.svg"
                alt="CotaMed"
                width={190}
                height={50}
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
                    className={ativo ? "app-nav-item active" : "app-nav-item"}
                  >
                    <span className="app-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}

              <button onClick={sair} className="app-nav-item app-nav-button">
                <span className="app-nav-icon">↪</span>
                <span>Sair</span>
              </button>
            </nav>
          </div>

          <div className="app-sidebar-footer">
            <span>Atualle Tecnologia</span>
            <small>© 2026</small>
          </div>
        </aside>

        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
