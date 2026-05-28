import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-cotamed-50 to-white flex items-center justify-center p-6">
      <section className="max-w-5xl w-full grid md:grid-cols-2 gap-8 items-center">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-14 w-14 rounded-2xl bg-cotamed-600 text-white flex items-center justify-center font-bold text-2xl">C+</div>
            <div>
              <h1 className="text-4xl font-bold text-cotamed-900">CotaMed</h1>
              <p className="text-cotamed-700">Cotação inteligente, resultados precisos</p>
            </div>
          </div>

          <h2 className="text-5xl font-bold text-slate-900 leading-tight">
            Automatize cotações de licitações médicas.
          </h2>

          <p className="mt-5 text-lg text-slate-600">
            Banco de preços, margem de lucro, registros ANVISA, PDFs e planilhas finais em poucos cliques.
          </p>

          <Link href="/dashboard" className="btn-primary inline-block mt-8">
            Entrar no sistema
          </Link>
        </div>

        <div className="card p-6">
          <h3 className="font-bold text-xl mb-4">Fluxo do CotaMed</h3>
          <div className="space-y-3 text-slate-700">
            <p>1. Importe seu banco de preços.</p>
            <p>2. Envie a planilha da licitação.</p>
            <p>3. Escolha a margem de lucro.</p>
            <p>4. Gere a planilha preenchida.</p>
            <p>5. Baixe o ZIP com os registros ANVISA.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
