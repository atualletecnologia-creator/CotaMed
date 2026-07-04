export function CardResumo({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="clean-card p-5">
      <p className="text-sm text-slate-500">{titulo}</p>
      <h3 className="text-3xl font-bold text-slate-900 mt-2">{valor}</h3>
      <p className="text-sm text-slate-500 mt-1">{detalhe}</p>
    </div>
  );
}
