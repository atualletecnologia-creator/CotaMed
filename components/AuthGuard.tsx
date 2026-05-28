 "use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function verificarLogin() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/login");
        return;
      }

      setCarregando(false);
    }

    verificarLogin();
  }, [router]);

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cotamed-50">
        <p className="text-cotamed-700 font-medium">Verificando login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
