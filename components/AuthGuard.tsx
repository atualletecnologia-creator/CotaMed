"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter, usePathname } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function verificarLogin() {
      const rotasPublicas = ["/login", "/cadastro"];

      if (rotasPublicas.includes(pathname)) {
        setCarregando(false);
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setCarregando(false);
    }

    verificarLogin();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const rotasPublicas = ["/login", "/cadastro"];

      if (!session && !rotasPublicas.includes(pathname)) {
        router.replace("/login");
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-cotamed-700 font-medium">Verificando login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
