export function normalizarNomeArquivo(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function gerarNomePdfRegistro(params: {
  item: string;
  apresentacao: string;
  marca: string;
  vencimento: string;
  registro: string;
}) {
  const item = normalizarNomeArquivo(params.item);
  const apresentacao = normalizarNomeArquivo(params.apresentacao);
  const marca = normalizarNomeArquivo(params.marca);
  const vencimento = params.vencimento;
  const registro = normalizarNomeArquivo(params.registro);

  return `${item}_${apresentacao}_${marca}_venc-${vencimento}_reg-${registro}.pdf`;
}
