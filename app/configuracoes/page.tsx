import { AppShell } from "@/components/AppShell";

export default function Configuracoes() {
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Configurações</h1>
      <div className="clean-card p-6 mt-6 max-w-xl">
        <label className="text-sm font-medium">Margem padrão (%)</label>
        <input className="input mt-2" defaultValue="30" />
        <button className="btn-primary mt-4">Salvar</button>
      </div>
    </AppShell>
  );
}
