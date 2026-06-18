"use client";

import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-100">
        <aside className="w-64 bg-gradient-to-b from-[#052c73] to-[#0b57d0] text-white flex flex-col justify-between min-h-screen">
          <div>
            <div className="px-6 py-8 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center text-2xl font-bold">
                  C+
                </div>

                <div>
                  <h1 className="text-3xl font-bold leading-none">CotaMed</h1>
                  <p className="text-sm text-blue-100 mt-1">
                    Gestão de cotações
                  </p>
                </div>
              </div>
            </div>

            <nav className="px-4 py-6 space-y-2">
              <Link href="/dashboard" className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <span>📊</span>
                Dashboard
              </Link>

              <Link href="/banco-precos" className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <span>💰</span>
                Banco de Preços
              </Link>

              <Link href="/licitacoes" className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <span>📄</span>
                Licitações
              </Link>

              <Link href="/consulta-rapida" className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <span>🔎</span>
                Consulta Rápida
              </Link>

              <Link href="/registros-anvisa" className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <span>🧾</span>
                Registros ANVISA
              </Link>

              <Link href="/relatorios" className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <span>⚠️</span>
                Relatórios de Alertas
              </Link>

              <Link href="/configuracoes" className="flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition">
                <span>⚙️</span>
                Configurações
              </Link>

              <button
                onClick={sair}
                className="w-full text-left flex items-center gap-3 rounded-xl px-4 py-3 hover:bg-white/10 transition"
              >
                <span>🚪</span>
                Sair
              </button>
            </nav>
          </div>

          <div className="px-5 py-6 border-t border-white/10 bg-black/10">
            <p className="text-xs text-blue-100 leading-5">
              © 2026 Todos os direitos reservados
            </p>

            <p className="text-sm font-semibold mt-1 text-white">
              Atualle Tecnologia
            </p>
          </div>
        </aside>

        <main className="min-w-0 max-w-full overflow-x-hidden flex-1 p-6">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
