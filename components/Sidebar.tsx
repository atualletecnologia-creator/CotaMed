 "use client";

import Link from "next/link";
import { Database, FileSpreadsheet, Search, FileCheck, Settings, Home, LogOut, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/banco-precos", label: "Banco de Preços", icon: Database },
  { href: "/licitacoes", label: "Licitações", icon: FileSpreadsheet },
  { href: "/consulta-rapida", label: "Consulta Rápida", icon: Search },
  { href: "/registros-anvisa", label: "Registros ANVISA", icon: FileCheck },
  { href: "/relatorios", label: "Relatórios de Alertas", icon: AlertTriangle },
  { href: "/configuracoes", label: "Configurações", icon: Settings }
];

export function Sidebar() {
  const router = useRouter();

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="w-72 min-h-screen bg-gradient-to-b from-cotamed-900 to-cotamed-600 text-white p-5">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-11 w-11 rounded-2xl bg-white text-cotamed-700 flex items-center justify-center font-bold">C+</div>
        <div>
          <h1 className="font-bold text-xl">CotaMed</h1>
          <p className="text-xs text-blue-100">Gestão de cotações</p>
        </div>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/10 transition">
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button onClick={sair} className="mt-8 flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/10 transition w-full">
        <LogOut size={18} />
        Sair
      </button>
    </aside>
  );
}
