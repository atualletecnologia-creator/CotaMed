export function limparExtensaoPdf(nome: string) {
  return nome.replace(/\.pdf$/i, "");
}

export function normalizarTexto(texto: string) {
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
  return [
    normalizarTexto(params.item),
    normalizarTexto(params.apresentacao),
    normalizarTexto(params.marca),
    `venc-${params.vencimento}`,
    `reg-${normalizarTexto(params.registro)}`
  ].join("_") + ".pdf";
}

export function extrairDadosDoNomeArquivo(nomeArquivo: string) {
  const nome = limparExtensaoPdf(nomeArquivo);
  const partes = nome.split("_").filter(Boolean);

  let vencimento = "";
  let registro = "";

  const indiceVencimento = partes.findIndex((p) => p.startsWith("venc-"));
  const indiceRegistro = partes.findIndex((p) => p.startsWith("reg-"));

  if (indiceVencimento >= 0) {
    vencimento = partes[indiceVencimento].replace("venc-", "");
  }

  if (indiceRegistro >= 0) {
    registro = partes[indiceRegistro].replace("reg-", "");
  }

  const limiteDados = Math.min(
    indiceVencimento >= 0 ? indiceVencimento : partes.length,
    indiceRegistro >= 0 ? indiceRegistro : partes.length
  );

  const dadosPrincipais = partes.slice(0, limiteDados);

  return {
    item: dadosPrincipais[0] || "",
    apresentacao: dadosPrincipais[1] || "",
    marca: dadosPrincipais[2] || "",
    vencimento_registro: vencimento,
    registro_anvisa: registro
  };
}
