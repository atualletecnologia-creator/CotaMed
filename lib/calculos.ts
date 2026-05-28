export function calcularValorComMargem(custo: number, margemPercentual: number) {
  return custo * (1 + margemPercentual / 100);
}

export function calcularValorTotal(valorUnitario: number, quantidade: number) {
  return valorUnitario * quantidade;
}

export function calcularCustoUnitario(custoCaixa: number, quantidadePorCaixa: number) {
  if (!quantidadePorCaixa || quantidadePorCaixa <= 0) return 0;
  return custoCaixa / quantidadePorCaixa;
}

export function calcularCustoCaixa(custoUnitario: number, quantidadePorCaixa: number) {
  if (!quantidadePorCaixa || quantidadePorCaixa <= 0) return 0;
  return custoUnitario * quantidadePorCaixa;
}

export function escolherCustoPorTipo(params: {
  tipoCotacao: "unidade" | "caixa";
  custoUnitario?: number | null;
  custoCaixa?: number | null;
}) {
  if (params.tipoCotacao === "caixa") {
    return params.custoCaixa || 0;
  }

  return params.custoUnitario || 0;
}
