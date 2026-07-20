"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { AppShell } from "@/components/AppShell";

const CHAVE_DOCS_EMPRESA = "cotamed_documentos_empresa_local_v1";
const CHAVE_BIBLIOTECA_DOCS = "cotamed_biblioteca_documentos_v1";

type DocumentoEmpresa = {
  id: string;
  nome: string;
  categoria: string;
  palavras: string;
  arquivoNome: string;
  tipo: string;
  base64: string;
};

type RegraDocumento = {
  id: string;
  documento: string;
  categoria: string;
  palavrasChave: string[];
  termosEquivalentes: string[];
  termosDispensa: string[];
  obrigatoriedade: "Obrigatório" | "Condicional" | "Facultativo";
  ordem: number;
  observacoes: string;
};

type ResultadoOrganizacao = {
  solicitados: {
    categoria: string;
    documentos: DocumentoEmpresa[];
  }[];
  naoSolicitados: DocumentoEmpresa[];
  naoEncontrados: string[];
  dispensas: string[];
};

type SugestaoAprendizado = {
  id: string;
  trecho: string;
  regraId: string;
  tipo: "palavra" | "equivalente" | "dispensa";
  aprovado: boolean;
};

const CATEGORIAS = [
  "01 - Habilitação Jurídica",
  "02 - Regularidade Fiscal e Trabalhista",
  "03 - Qualificação Econômico-Financeira",
  "04 - Qualificação Técnica",
  "05 - Declarações",
  "06 - Documentos do Representante",
  "07 - Outros Documentos Solicitados",
];

const BIBLIOTECA_PADRAO: RegraDocumento[] = [
  {
    id: "contrato-social",
    documento: "Contrato Social / Ato Constitutivo",
    categoria: "01 - Habilitação Jurídica",
    ordem: 1,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["contrato social", "ato constitutivo", "estatuto social", "estatuto", "sociedade empresária", "sociedade empresaria", "alteração contratual", "alteracao contratual", "consolidação contratual", "consolidacao contratual", "junta comercial", "registro empresarial", "administradores", "documento comprobatório de seus administradores"],
    termosEquivalentes: ["constituição da empresa", "documento constitutivo", "contrato consolidado", "última alteração contratual", "ultima alteracao contratual"],
    termosDispensa: [],
    observacoes: "Exige ato constitutivo, estatuto ou contrato social em vigor, registrado na Junta Comercial.",
  },
  {
    id: "cnpj",
    documento: "Cartão CNPJ",
    categoria: "02 - Regularidade Fiscal e Trabalhista",
    ordem: 2,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["cnpj", "cadastro nacional de pessoas jurídicas", "cadastro nacional de pessoas juridicas", "comprovante de inscrição", "comprovante de inscricao", "situação cadastral", "situacao cadastral", "cartão cnpj", "cartao cnpj"],
    termosEquivalentes: ["prova de inscrição no cnpj", "prova de inscricao no cnpj", "cadastro nacional"],
    termosDispensa: [],
    observacoes: "Prova de inscrição no Cadastro Nacional de Pessoas Jurídicas.",
  },
  {
    id: "inscricao-estadual-municipal",
    documento: "Inscrição Estadual / Municipal",
    categoria: "02 - Regularidade Fiscal e Trabalhista",
    ordem: 3,
    obrigatoriedade: "Condicional",
    palavrasChave: ["inscrição estadual", "inscricao estadual", "inscrição municipal", "inscricao municipal", "cadastro de contribuintes", "cadastro estadual", "cadastro municipal", "contribuintes estadual", "contribuintes municipal", "sefaz", "iss", "icms"],
    termosEquivalentes: ["prova de inscrição no cadastro de contribuintes", "prova de inscricao no cadastro de contribuintes"],
    termosDispensa: ["se houver", "quando houver", "caso possua", "quando aplicável", "quando aplicavel"],
    observacoes: "Exigível quando houver cadastro relativo ao domicílio ou sede e compatível com o ramo de atividade.",
  },
  {
    id: "certidao-federal",
    documento: "Certidão Federal / Receita Federal e Dívida Ativa",
    categoria: "02 - Regularidade Fiscal e Trabalhista",
    ordem: 4,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["certidão conjunta", "certidao conjunta", "tributos federais", "dívida ativa da união", "divida ativa da uniao", "receita federal", "pgfn", "rfb", "fazenda federal", "regularidade federal", "cnd federal", "certidão federal", "certidao federal", "certidão conjunta de débitos", "certidao conjunta de debitos"],
    termosEquivalentes: ["certidão receita federal", "certidao receita federal", "débitos relativos a tributos federais", "debitos relativos a tributos federais"],
    termosDispensa: [],
    observacoes: "Certidão Conjunta de Débitos relativos a Tributos Federais e à Dívida Ativa da União.",
  },
  {
    id: "fgts",
    documento: "Certidão FGTS / CRF",
    categoria: "02 - Regularidade Fiscal e Trabalhista",
    ordem: 5,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["fgts", "crf", "certificado de regularidade", "certificado de regularidade do fgts", "fundo de garantia", "caixa econômica federal", "caixa economica federal", "regularidade do fgts", "regularidade perante o fgts"],
    termosEquivalentes: ["prova de regularidade com o fgts", "certidão fgts", "certidao fgts"],
    termosDispensa: [],
    observacoes: "Prova de regularidade com o Fundo de Garantia do Tempo de Serviço.",
  },
  {
    id: "cndt",
    documento: "Certidão Trabalhista / CNDT",
    categoria: "02 - Regularidade Fiscal e Trabalhista",
    ordem: 6,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["cndt", "certidão trabalhista", "certidao trabalhista", "justiça do trabalho", "justica do trabalho", "débitos trabalhistas", "debitos trabalhistas", "certidão negativa de débitos trabalhistas", "certidao negativa de debitos trabalhistas", "certidão positiva com efeito de negativa", "certidao positiva com efeito de negativa", "clt", "consolidação das leis do trabalho", "consolidacao das leis do trabalho"],
    termosEquivalentes: ["inexistência de débitos trabalhistas", "inexistencia de debitos trabalhistas"],
    termosDispensa: [],
    observacoes: "Certidão negativa ou positiva com efeito de negativa de débitos trabalhistas.",
  },
  {
    id: "certidao-estadual",
    documento: "Certidão Estadual",
    categoria: "02 - Regularidade Fiscal e Trabalhista",
    ordem: 7,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["certidão estadual", "certidao estadual", "fazenda estadual", "regularidade estadual", "tributos estaduais", "débitos estaduais", "debitos estaduais", "sefaz"],
    termosEquivalentes: ["prova de regularidade com a fazenda estadual"],
    termosDispensa: ["quando couber", "se houver inscrição estadual", "quando aplicável", "quando aplicavel"],
    observacoes: "Regularidade com a Fazenda Estadual do domicílio ou sede.",
  },
  {
    id: "certidao-municipal",
    documento: "Certidão Municipal",
    categoria: "02 - Regularidade Fiscal e Trabalhista",
    ordem: 8,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["certidão municipal", "certidao municipal", "fazenda municipal", "regularidade municipal", "tributos municipais", "débitos municipais", "debitos municipais", "prefeitura"],
    termosEquivalentes: ["prova de regularidade com a fazenda municipal"],
    termosDispensa: ["quando couber", "se houver inscrição municipal", "quando aplicável", "quando aplicavel"],
    observacoes: "Regularidade com a Fazenda Municipal do domicílio ou sede.",
  },
  {
    id: "atestado-capacidade",
    documento: "Atestado de Capacidade Técnica",
    categoria: "04 - Qualificação Técnica",
    ordem: 9,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["atestado de capacidade técnica", "atestado de capacidade tecnica", "atestados", "capacidade técnica", "capacidade tecnica", "comprovação de aptidão", "comprovacao de aptidao", "fornecimento de bens", "características quantidades e prazos", "caracteristicas quantidades e prazos", "pessoa jurídica de direito público", "pessoa juridica de direito publico", "pessoa jurídica de direito privado", "pessoa juridica de direito privado"],
    termosEquivalentes: ["qualificação técnica", "qualificacao tecnica", "comprovar aptidão"],
    termosDispensa: [],
    observacoes: "Atestados compatíveis com o objeto ou item pertinente.",
  },
  {
    id: "afe-anvisa",
    documento: "AFE ANVISA",
    categoria: "04 - Qualificação Técnica",
    ordem: 10,
    obrigatoriedade: "Condicional",
    palavrasChave: ["afe", "autorização de funcionamento", "autorizacao de funcionamento", "autorização de funcionamento da empresa", "autorizacao de funcionamento da empresa", "anvisa", "agência nacional de vigilância sanitária", "agencia nacional de vigilancia sanitaria", "ministério da saúde", "ministerio da saude", "autorização sanitária", "autorizacao sanitaria"],
    termosEquivalentes: ["afe comum", "afe matriz", "afe filial"],
    termosDispensa: ["legalmente dispensadas", "dispensadas da autorização", "dispensadas da autorizacao", "declaração formal equivalente", "declaracao formal equivalente", "documento probatório", "documento probatorio", "dispensa da afe"],
    observacoes: "Exigível para empresas que por disposição legal devem possuir AFE. Pode aceitar declaração/documento de dispensa.",
  },
  {
    id: "alvara-sanitario",
    documento: "Licença / Alvará Sanitário",
    categoria: "04 - Qualificação Técnica",
    ordem: 11,
    obrigatoriedade: "Condicional",
    palavrasChave: ["licença sanitária", "licenca sanitaria", "alvará sanitário", "alvara sanitario", "licença de funcionamento", "licenca de funcionamento", "alvará de funcionamento", "alvara de funcionamento", "vigilância sanitária", "vigilancia sanitaria", "vigilância sanitária estadual", "vigilancia sanitaria estadual", "vigilância sanitária municipal", "vigilancia sanitaria municipal"],
    termosEquivalentes: ["lf", "licença ou alvará", "licenca ou alvara"],
    termosDispensa: ["legalmente dispensadas", "dispensadas da licença", "dispensadas da licenca", "declaração formal equivalente", "declaracao formal equivalente", "dispensa de alvará", "dispensa de alvara"],
    observacoes: "Exigível para empresas sujeitas à Vigilância Sanitária; pode aceitar declaração de dispensa.",
  },
  {
    id: "crf-farmaceutico",
    documento: "Regularidade do Farmacêutico / CRF",
    categoria: "04 - Qualificação Técnica",
    ordem: 12,
    obrigatoriedade: "Condicional",
    palavrasChave: ["farmacêutico responsável", "farmaceutico responsavel", "conselho regional de farmácia", "conselho regional de farmacia", "crf", "responsável técnico", "responsavel tecnico", "rt", "resolução 577", "resolucao 577", "conselho federal de farmácia", "conselho federal de farmacia"],
    termosEquivalentes: ["regularidade do farmacêutico", "regularidade do farmaceutico"],
    termosDispensa: ["quando aplicável", "quando aplicavel", "quando couber"],
    observacoes: "Comprovação da regularidade do farmacêutico responsável junto ao CRF.",
  },
  {
    id: "falencia",
    documento: "Certidão de Falência",
    categoria: "03 - Qualificação Econômico-Financeira",
    ordem: 13,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["falência", "falencia", "recuperação judicial", "recuperacao judicial", "concordata", "certidão negativa de falência", "certidao negativa de falencia", "distribuidor da sede", "distribuidor judicial", "certidão de falência e concordata", "certidao de falencia e concordata"],
    termosEquivalentes: ["certidão do distribuidor", "certidao do distribuidor"],
    termosDispensa: [],
    observacoes: "Certidão negativa de falência expedida pelo distribuidor da sede da pessoa jurídica.",
  },
  {
    id: "balanco",
    documento: "Balanço Patrimonial e Demonstrações Contábeis",
    categoria: "03 - Qualificação Econômico-Financeira",
    ordem: 14,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["balanço patrimonial", "balanco patrimonial", "demonstração de resultado", "demonstracao de resultado", "dre", "demonstrações contábeis", "demonstracoes contabeis", "exercícios sociais", "exercicios sociais", "livro diário", "livro diario", "sped contábil", "sped contabil", "ecd", "boa situação financeira", "boa situacao financeira"],
    termosEquivalentes: ["demonstrações financeiras", "demonstracoes financeiras", "último exercício", "ultimo exercicio"],
    termosDispensa: ["constituída há menos de 2 anos", "constituida ha menos de 2 anos", "limitar-se-á ao último exercício", "limitar-se-a ao ultimo exercicio"],
    observacoes: "Balanço patrimonial e demonstrações dos últimos exercícios exigíveis.",
  },
  {
    id: "indices",
    documento: "Índices Econômicos / Financeiros",
    categoria: "03 - Qualificação Econômico-Financeira",
    ordem: 15,
    obrigatoriedade: "Obrigatório",
    palavrasChave: ["ilg", "isg", "ilc", "liquidez geral", "solvência geral", "solvencia geral", "liquidez corrente", "índices contábeis", "indices contabeis", "índices financeiros", "indices financeiros", "boa situação econômico-financeira", "boa situacao economico-financeira"],
    termosEquivalentes: ["resultado maior que um", "maiores ou iguais a um"],
    termosDispensa: [],
    observacoes: "Parâmetros de liquidez geral, solvência geral e liquidez corrente.",
  },
];

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function sanitizarNome(nome: string) {
  return nome.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ParaBlob(dataUrl: string, tipo: string) {
  const base64 = dataUrl.split(",")[1] || "";
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo || "application/pdf" });
}

function textoRegra(regra: RegraDocumento) {
  return normalizar([
    regra.documento,
    regra.categoria,
    regra.palavrasChave.join(" "),
    regra.termosEquivalentes.join(" "),
  ].join(" "));
}

function documentoCombina(doc: DocumentoEmpresa, regra: RegraDocumento) {
  const textoDoc = normalizar(`${doc.nome} ${doc.categoria} ${doc.palavras} ${doc.arquivoNome}`);
  const termos = [regra.documento, ...regra.palavrasChave, ...regra.termosEquivalentes].map(normalizar);
  return termos.some((termo) => textoDoc.includes(termo) || termo.includes(textoDoc));
}

function regraSolicitada(regra: RegraDocumento, textoEdital: string) {
  const termos = [regra.documento, ...regra.palavrasChave, ...regra.termosEquivalentes].map(normalizar);
  return termos.some((termo) => textoEdital.includes(termo));
}

function regraTemDispensa(regra: RegraDocumento, textoEdital: string) {
  return regra.termosDispensa.some((termo) => textoEdital.includes(normalizar(termo)));
}


function limparTrecho(trecho: string) {
  return trecho
    .replace(/\s+/g, " ")
    .replace(/^[-•\da-zA-Z). ]+/, "")
    .trim();
}

function quebrarTrechosEdital(texto: string) {
  return texto
    .split(/\n|;/)
    .map(limparTrecho)
    .filter((linha) => linha.length > 24)
    .slice(0, 80);
}

function pontuarRegraPorTrecho(regra: RegraDocumento, trecho: string) {
  const texto = normalizar(trecho);
  const termos = [
    regra.documento,
    ...regra.palavrasChave,
    ...regra.termosEquivalentes,
  ].map(normalizar);

  return termos.reduce((pontos, termo) => {
    if (!termo) return pontos;
    if (texto.includes(termo)) return pontos + 8;
    const partes = termo.split(" ").filter((p) => p.length > 3);
    return pontos + partes.filter((p) => texto.includes(p)).length;
  }, 0);
}

async function extrairTextoArquivoEdital(file: File) {
  const nome = file.name.toLowerCase();

  if (nome.endsWith(".txt")) {
    return await file.text();
  }

  if (nome.endsWith(".pdf")) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let bruto = "";

    for (let i = 0; i < bytes.length; i++) bruto += String.fromCharCode(bytes[i]);

    const textos = Array.from(bruto.matchAll(/\(([^()] {0,400}|[^()]*)\)\s*Tj/g))
      .map((m) => m[1])
      .join("\n");

    const textosArray = Array.from(bruto.matchAll(/\[(.*?)\]\s*TJ/g))
      .map((m) => m[1].replace(/\((.*?)\)/g, "$1 "))
      .join("\n");

    const limpo = `${textos}\n${textosArray}`
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\n/g, "\n")
      .replace(/\s+/g, " ")
      .trim();

    return limpo;
  }

  return await file.text();
}

function gerarPalavrasAutomaticas(nomeDocumento: string, nomeArquivo: string, categoria: string, biblioteca: RegraDocumento[]) {
  const textoBase = normalizar(`${nomeDocumento} ${nomeArquivo.replace(/\.[^.]+$/, "")} ${categoria}`);

  const regrasRelacionadas = biblioteca
    .map((regra) => ({ regra, pontos: pontuarRegra(textoBase, regra) }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 3);

  const termosArquivo = textoBase
    .split(/[^a-z0-9]+/i)
    .map((termo) => termo.trim())
    .filter((termo) => termo.length >= 3);

  const termosBiblioteca = regrasRelacionadas.flatMap(({ regra }) => [
    regra.documento,
    ...regra.palavrasChave,
    ...regra.termosEquivalentes,
  ]);

  return Array.from(new Set([...termosArquivo, ...termosBiblioteca].map((termo) => normalizar(termo)).filter(Boolean)))
    .slice(0, 40)
    .join(", ");
}

export default function DocumentacaoEditalPage() {
  const [documentos, setDocumentos] = useState<DocumentoEmpresa[]>([]);
  const [biblioteca, setBiblioteca] = useState<RegraDocumento[]>(BIBLIOTECA_PADRAO);
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [nome, setNome] = useState("");
  const [editalTexto, setEditalTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoOrganizacao | null>(null);
  const [aba, setAba] = useState<"organizar" | "biblioteca">("organizar");
  const [regraEditando, setRegraEditando] = useState<RegraDocumento | null>(null);
  const [sugestoesAprendizado, setSugestoesAprendizado] = useState<SugestaoAprendizado[]>([]);
  const [arquivoEditalNome, setArquivoEditalNome] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    try {
      const brutoDocs = window.localStorage.getItem(CHAVE_DOCS_EMPRESA);
      const brutoBiblioteca = window.localStorage.getItem(CHAVE_BIBLIOTECA_DOCS);
      if (brutoDocs) setDocumentos(JSON.parse(brutoDocs));
      if (brutoBiblioteca) setBiblioteca(JSON.parse(brutoBiblioteca));
    } catch {
      setErro("Não foi possível carregar dados salvos neste computador.");
    }
  }, []);

  function salvarDocumentos(lista: DocumentoEmpresa[]) {
    setDocumentos(lista);
    window.localStorage.setItem(CHAVE_DOCS_EMPRESA, JSON.stringify(lista));
  }

  function salvarBiblioteca(lista: RegraDocumento[]) {
    const ordenada = [...lista].sort((a, b) => a.ordem - b.ordem);
    setBiblioteca(ordenada);
    window.localStorage.setItem(CHAVE_BIBLIOTECA_DOCS, JSON.stringify(ordenada));
  }

  async function cadastrarDocumento(file: File | null) {
    setErro("");
    setMensagem("");
    if (!file) return;
    if (!nome.trim()) {
      setErro("Informe o nome do documento.");
      return;
    }
    const base64 = await arquivoParaBase64(file);
    const palavrasAutomaticas = gerarPalavrasAutomaticas(nome.trim(), file.name, categoria, biblioteca);
    const doc: DocumentoEmpresa = {
      id: `${Date.now()}`,
      nome: nome.trim(),
      categoria,
      palavras: palavrasAutomaticas,
      arquivoNome: file.name,
      tipo: file.type || "application/pdf",
      base64,
    };
    salvarDocumentos([doc, ...documentos]);
    setNome("");
    setMensagem("Documento cadastrado. As palavras-chave foram identificadas automaticamente.");
  }

  function excluirDocumento(id: string) {
    salvarDocumentos(documentos.filter((d) => d.id !== id));
  }

  function novaRegra() {
    setRegraEditando({
      id: `${Date.now()}`,
      documento: "",
      categoria: CATEGORIAS[0],
      palavrasChave: [],
      termosEquivalentes: [],
      termosDispensa: [],
      obrigatoriedade: "Obrigatório",
      ordem: biblioteca.length + 1,
      observacoes: "",
    });
  }

  function salvarRegra() {
    if (!regraEditando?.documento.trim()) {
      setErro("Informe o nome do documento da regra.");
      return;
    }
    const existe = biblioteca.some((r) => r.id === regraEditando.id);
    salvarBiblioteca(existe ? biblioteca.map((r) => (r.id === regraEditando.id ? regraEditando : r)) : [...biblioteca, regraEditando]);
    setRegraEditando(null);
    setMensagem("Biblioteca atualizada.");
  }

  function excluirRegra(id: string) {
    salvarBiblioteca(biblioteca.filter((r) => r.id !== id));
  }

  function restaurarBibliotecaPadrao() {
    if (!window.confirm("Restaurar a biblioteca padrão? As alterações locais serão substituídas.")) return;
    salvarBiblioteca(BIBLIOTECA_PADRAO);
    setMensagem("Biblioteca padrão restaurada.");
  }

  async function carregarArquivoEdital(file: File | null) {
    setErro("");
    setMensagem("");

    if (!file) return;

    try {
      const texto = await extrairTextoArquivoEdital(file);
      setArquivoEditalNome(file.name);

      if (!texto || texto.length < 80) {
        setErro("Não consegui extrair texto suficiente desse arquivo. Se for PDF escaneado, cole o trecho do edital no campo de texto.");
        return;
      }

      setEditalTexto(texto);
      setMensagem("Texto do edital carregado. Confira o conteúdo e clique em Analisar edital.");
    } catch {
      setErro("Não foi possível ler esse arquivo. Se for PDF escaneado, cole o texto do edital manualmente.");
    }
  }

  function gerarSugestoesAprendizado() {
    setErro("");
    setMensagem("");

    if (!editalTexto.trim()) {
      setErro("Cole ou carregue o texto do edital antes de aprender.");
      return;
    }

    const trechos = quebrarTrechosEdital(editalTexto);
    const novas: SugestaoAprendizado[] = [];

    trechos.forEach((trecho, index) => {
      const texto = normalizar(trecho);
      const jaReconhecido = biblioteca.some((regra) => regraSolicitada(regra, texto));

      if (jaReconhecido) return;

      const melhor = biblioteca
        .map((regra) => ({ regra, pontos: pontuarRegraPorTrecho(regra, trecho) }))
        .sort((a, b) => b.pontos - a.pontos)[0];

      if (!melhor || melhor.pontos < 2) return;

      novas.push({
        id: `${Date.now()}-${index}`,
        trecho,
        regraId: melhor.regra.id,
        tipo: "equivalente",
        aprovado: true,
      });
    });

    setSugestoesAprendizado(novas);

    if (!novas.length) {
      setMensagem("Não encontrei novos termos para sugerir. A biblioteca já reconheceu os principais trechos.");
    } else {
      setMensagem(`${novas.length} sugestão(ões) de aprendizado encontrada(s). Confira antes de salvar.`);
    }
  }

  function atualizarSugestao(id: string, patch: Partial<SugestaoAprendizado>) {
    setSugestoesAprendizado((atuais) => atuais.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function salvarAprendizado() {
    const aprovadas = sugestoesAprendizado.filter((s) => s.aprovado);

    if (!aprovadas.length) {
      setErro("Nenhuma sugestão aprovada para salvar.");
      return;
    }

    const atualizada = biblioteca.map((regra) => {
      const minhas = aprovadas.filter((s) => s.regraId === regra.id);
      if (!minhas.length) return regra;

      const palavrasChave = new Set(regra.palavrasChave);
      const termosEquivalentes = new Set(regra.termosEquivalentes);
      const termosDispensa = new Set(regra.termosDispensa);

      minhas.forEach((s) => {
        const trecho = limparTrecho(s.trecho);
        if (s.tipo === "palavra") palavrasChave.add(trecho);
        if (s.tipo === "equivalente") termosEquivalentes.add(trecho);
        if (s.tipo === "dispensa") termosDispensa.add(trecho);
      });

      return {
        ...regra,
        palavrasChave: Array.from(palavrasChave),
        termosEquivalentes: Array.from(termosEquivalentes),
        termosDispensa: Array.from(termosDispensa),
      };
    });

    salvarBiblioteca(atualizada);
    setSugestoesAprendizado([]);
    setMensagem(`${aprovadas.length} termo(s) aprendido(s) e salvo(s) na Biblioteca Inteligente.`);
  }

  function listaParaTexto(lista: string[]) {
    return lista.join("\n");
  }

  function textoParaLista(texto: string) {
    return texto.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  function analisarEdital() {
    setErro("");
    setMensagem("");

    if (!documentos.length) {
      setErro("Cadastre os documentos da empresa antes de organizar.");
      return;
    }
    if (!editalTexto.trim()) {
      setErro("Cole o trecho do edital com a documentação exigida.");
      return;
    }

    const texto = normalizar(editalTexto);
    const usados = new Set<string>();
    const naoEncontrados: string[] = [];
    const dispensas: string[] = [];
    const porCategoria = new Map<string, DocumentoEmpresa[]>();

    biblioteca.forEach((regra) => {
      if (!regraSolicitada(regra, texto)) return;

      if (regraTemDispensa(regra, texto)) {
        dispensas.push(`${regra.documento} (${regra.obrigatoriedade})`);
      }

      const doc = documentos.find((d) => !usados.has(d.id) && documentoCombina(d, regra));

      if (doc) {
        usados.add(doc.id);
        const atual = porCategoria.get(regra.categoria) || [];
        atual.push(doc);
        porCategoria.set(regra.categoria, atual);
      } else if (regra.obrigatoriedade !== "Facultativo") {
        naoEncontrados.push(regra.documento);
      }
    });

    const solicitados = CATEGORIAS
      .map((cat) => ({ categoria: cat, documentos: porCategoria.get(cat) || [] }))
      .filter((grupo) => grupo.documentos.length > 0);

    const naoSolicitados = documentos.filter((d) => !usados.has(d.id));

    setResultado({ solicitados, naoSolicitados, naoEncontrados, dispensas });
    setMensagem("Edital analisado com a Biblioteca Inteligente. Confira antes de baixar.");
  }

  async function baixarZip() {
    if (!resultado) {
      setErro("Analise o edital antes de baixar.");
      return;
    }

    const zip = new JSZip();

    resultado.solicitados.forEach((grupo) => {
      const pasta = zip.folder(grupo.categoria);
      grupo.documentos.forEach((doc, index) => {
        const ext = doc.arquivoNome.includes(".") ? doc.arquivoNome.split(".").pop() : "pdf";
        pasta?.file(`${String(index + 1).padStart(2, "0")} - ${sanitizarNome(doc.nome)}.${ext}`, base64ParaBlob(doc.base64, doc.tipo));
      });
    });

    const pastaExtras = zip.folder("99 - Documentos não solicitados");
    resultado.naoSolicitados.forEach((doc, index) => {
      const ext = doc.arquivoNome.includes(".") ? doc.arquivoNome.split(".").pop() : "pdf";
      pastaExtras?.file(`${String(index + 1).padStart(2, "0")} - ${sanitizarNome(doc.nome)}.${ext}`, base64ParaBlob(doc.base64, doc.tipo));
    });

    const relatorio = [
      "RELATÓRIO DE CONFERÊNCIA - COTAMED",
      "",
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      "",
      "DOCUMENTOS ORGANIZADOS:",
      ...resultado.solicitados.flatMap((grupo) => ["", grupo.categoria, ...grupo.documentos.map((doc) => `✔ ${doc.nome} (${doc.arquivoNome})`)]),
      "",
      "DOCUMENTOS SOLICITADOS MAS NÃO ENCONTRADOS:",
      ...(resultado.naoEncontrados.length ? resultado.naoEncontrados.map((n) => `⚠ ${n}`) : ["Nenhum item obrigatório pendente identificado."]),
      "",
      "TERMOS CONDICIONAIS / DISPENSAS IDENTIFICADAS:",
      ...(resultado.dispensas.length ? resultado.dispensas.map((d) => `ℹ ${d}`) : ["Nenhuma dispensa identificada."]),
      "",
      "DOCUMENTOS NÃO SOLICITADOS INCLUÍDOS NA PASTA 99:",
      ...(resultado.naoSolicitados.length ? resultado.naoSolicitados.map((doc) => `• ${doc.nome} (${doc.arquivoNome})`) : ["Nenhum documento extra."]),
      "",
      "Observação: confira manualmente antes do envio. A análise é uma pré-organização de segurança.",
    ].join("\n");

    zip.file("RELATORIO-DE-CONFERENCIA.txt", relatorio);

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `DOCUMENTACAO-EDITAL-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  const resumo = useMemo(() => ({
    total: documentos.length,
    regras: biblioteca.length,
    encontrados: resultado?.solicitados.reduce((acc, grupo) => acc + grupo.documentos.length, 0) || 0,
    naoEncontrados: resultado?.naoEncontrados.length || 0,
    extras: resultado?.naoSolicitados.length || 0,
  }), [documentos, biblioteca, resultado]);

  return (
    <AppShell>
      <section className="documentacao-page documentacao-page-pro">
        <div className="documentacao-hero">
          <div>
            <p className="clean-kicker">Documentação do edital</p>
            <h1>Organize os documentos com biblioteca inteligente</h1>
            <p>Cadastre os documentos da empresa e gere um ZIP com a ordem do edital e uma pasta de documentos não solicitados.</p>
          </div>
          <button type="button" className="btn-clean btn-clean-primary" onClick={baixarZip} disabled={!resultado}>Baixar ZIP</button>
        </div>

        <div className="documentacao-tabs">
          <button className={aba === "organizar" ? "active" : ""} onClick={() => setAba("organizar")}>Organizar documentação</button>
          <button className={aba === "biblioteca" ? "active" : ""} onClick={() => setAba("biblioteca")}>Biblioteca inteligente</button>
        </div>

        <section className="documentacao-metric-grid">
          <div className="documentacao-metric-card"><span>Documentos cadastrados</span><strong>{resumo.total}</strong></div>
          <div className="documentacao-metric-card"><span>Regras da biblioteca</span><strong>{resumo.regras}</strong></div>
          <div className="documentacao-metric-card"><span>Identificados</span><strong>{resumo.encontrados}</strong></div>
          <div className="documentacao-metric-card"><span>Não encontrados</span><strong>{resumo.naoEncontrados}</strong></div>
        </section>

        {aba === "organizar" && (
          <>
            <section className="documentacao-grid">
              <div className="documentacao-card">
                <h2>Cadastrar documentos da empresa</h2>
                <p className="text-sm mt-1">Os arquivos ficam salvos somente neste computador/navegador.</p>

                <div className="documentacao-form-grid mt-5">
                  <div>
                    <label>Nome do documento</label>
                    <input className="input mt-2" placeholder="Ex.: Contrato Social" value={nome} onChange={(e) => setNome(e.target.value)} />
                  </div>
                  <div>
                    <label>Categoria</label>
                    <select className="input mt-2" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                      {CATEGORIAS.map((cat) => <option key={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Arquivo PDF/documento</label>
                    <input className="input mt-2" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => cadastrarDocumento(e.target.files?.[0] || null)} />
                  </div>
                </div>

                {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
                {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
              </div>

              <div className="documentacao-card">
                <h2>Analisar documentação exigida</h2>
                <p className="text-sm mt-1">Carregue o edital ou cole o trecho que fala sobre habilitação/documentos.</p>

                <div className="documentacao-upload-edital mt-5">
                  <label>Upload do edital (.pdf ou .txt)</label>
                  <input className="input mt-2" type="file" accept=".pdf,.txt" onChange={(e) => carregarArquivoEdital(e.target.files?.[0] || null)} />
                  {arquivoEditalNome && <span>Arquivo carregado: {arquivoEditalNome}</span>}
                </div>

                <textarea className="documentacao-textarea mt-5" value={editalTexto} onChange={(e) => setEditalTexto(e.target.value)} placeholder="Cole aqui o texto do edital..." />
                <div className="flex min-w-0 justify-end gap-2 mt-4">
                  <button type="button" className="btn-clean btn-clean-secondary" onClick={gerarSugestoesAprendizado}>Aprender com este edital</button>
                  <button type="button" className="btn-clean btn-clean-primary" onClick={analisarEdital}>Analisar edital</button>
                </div>
              </div>
            </section>


            {sugestoesAprendizado.length > 0 && (
              <section className="documentacao-card">
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div>
                    <h2>Aprendizado do edital</h2>
                    <p className="text-sm mt-1">Confira as expressões novas antes de salvar na biblioteca.</p>
                  </div>
                  <button type="button" className="btn-clean btn-clean-primary" onClick={salvarAprendizado}>Salvar aprendizado</button>
                </div>

                <div className="aprendizado-lista mt-5">
                  {sugestoesAprendizado.map((s) => (
                    <div key={s.id} className="aprendizado-card">
                      <label className="aprendizado-check">
                        <input type="checkbox" checked={s.aprovado} onChange={(e) => atualizarSugestao(s.id, { aprovado: e.target.checked })} />
                        Aprovar
                      </label>

                      <div className="aprendizado-trecho">{s.trecho}</div>

                      <div>
                        <label>Documento</label>
                        <select className="input mt-2" value={s.regraId} onChange={(e) => atualizarSugestao(s.id, { regraId: e.target.value })}>
                          {biblioteca.map((regra) => <option key={regra.id} value={regra.id}>{regra.documento}</option>)}
                        </select>
                      </div>

                      <div>
                        <label>Salvar como</label>
                        <select className="input mt-2" value={s.tipo} onChange={(e) => atualizarSugestao(s.id, { tipo: e.target.value as SugestaoAprendizado["tipo"] })}>
                          <option value="equivalente">Termo equivalente</option>
                          <option value="palavra">Palavra-chave</option>
                          <option value="dispensa">Termo de dispensa</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {resultado && (
              <section className="documentacao-card">
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div>
                    <h2>Resultado da organização</h2>
                    <p className="text-sm mt-1">Confira os documentos antes de baixar o ZIP.</p>
                  </div>
                  <button type="button" className="btn-clean btn-clean-primary" onClick={baixarZip}>Baixar ZIP mesmo assim</button>
                </div>

                <div className="documentacao-result-grid mt-6">
                  <div>
                    <h3 className="font-bold text-green-700">Documentos identificados</h3>
                    <div className="mt-3 grid gap-3">
                      {resultado.solicitados.length ? resultado.solicitados.map((grupo) => (
                        <div key={grupo.categoria} className="documentacao-result-card">
                          <strong>{grupo.categoria}</strong>
                          {grupo.documentos.map((doc) => <span key={doc.id}>✔ {doc.nome}</span>)}
                        </div>
                      )) : <p className="text-sm text-slate-500">Nenhum documento identificado automaticamente.</p>}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-red-700">Solicitados não encontrados</h3>
                    <div className="mt-3 grid gap-2">
                      {resultado.naoEncontrados.length ? resultado.naoEncontrados.map((n) => <span key={n} className="documentacao-alert">⚠ {n}</span>) : <span className="text-sm text-slate-500">Nenhum pendente identificado.</span>}
                    </div>
                    <h3 className="font-bold text-amber-700 mt-5">Condições/dispensas</h3>
                    <div className="mt-3 grid gap-2">
                      {resultado.dispensas.length ? resultado.dispensas.map((n) => <span key={n} className="documentacao-warning">ℹ {n}</span>) : <span className="text-sm text-slate-500">Nenhuma dispensa detectada.</span>}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-blue-700">Documentos não solicitados</h3>
                    <div className="mt-3 grid gap-2">
                      {resultado.naoSolicitados.length ? resultado.naoSolicitados.map((doc) => <span key={doc.id} className="documentacao-extra">• {doc.nome}</span>) : <span className="text-sm text-slate-500">Nenhum extra.</span>}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="documentacao-card">
              <h2>Documentos cadastrados</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th className="py-3">Documento</th><th className="py-3">Categoria</th><th className="py-3">Arquivo</th><th className="py-3">Ação</th></tr></thead>
                  <tbody>
                    {documentos.map((doc) => (
                      <tr key={doc.id} className="border-b">
                        <td className="py-3 font-semibold">{doc.nome}</td>
                        <td className="py-3">{doc.categoria}</td>
                        <td className="py-3">{doc.arquivoNome}</td>
                        <td className="py-3"><button type="button" className="text-red-600 font-bold" onClick={() => excluirDocumento(doc.id)}>Excluir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {aba === "biblioteca" && (
          <section className="documentacao-card">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div>
                <h2>Biblioteca Inteligente de Documentos</h2>
                <p className="text-sm mt-1">Gerencie palavras-chave, sinônimos, termos equivalentes e regras de dispensa.</p>
              </div>
              <div className="flex min-w-0 gap-2">
                <button type="button" className="btn-clean btn-clean-secondary" onClick={restaurarBibliotecaPadrao}>Restaurar padrão</button>
                <button type="button" className="btn-clean btn-clean-primary" onClick={novaRegra}>Nova regra</button>
              </div>
            </div>

            {regraEditando && (
              <div className="biblioteca-editor mt-6">
                <div><label>Documento</label><input className="input mt-2" value={regraEditando.documento} onChange={(e) => setRegraEditando({ ...regraEditando, documento: e.target.value })} /></div>
                <div><label>Categoria</label><select className="input mt-2" value={regraEditando.categoria} onChange={(e) => setRegraEditando({ ...regraEditando, categoria: e.target.value })}>{CATEGORIAS.map((cat) => <option key={cat}>{cat}</option>)}</select></div>
                <div><label>Obrigatoriedade</label><select className="input mt-2" value={regraEditando.obrigatoriedade} onChange={(e) => setRegraEditando({ ...regraEditando, obrigatoriedade: e.target.value as RegraDocumento["obrigatoriedade"] })}><option>Obrigatório</option><option>Condicional</option><option>Facultativo</option></select></div>
                <div><label>Ordem</label><input className="input mt-2" type="number" value={regraEditando.ordem} onChange={(e) => setRegraEditando({ ...regraEditando, ordem: Number(e.target.value || 0) })} /></div>
                <div className="span-2"><label>Palavras-chave (uma por linha ou separadas por vírgula)</label><textarea className="documentacao-textarea small" value={listaParaTexto(regraEditando.palavrasChave)} onChange={(e) => setRegraEditando({ ...regraEditando, palavrasChave: textoParaLista(e.target.value) })} /></div>
                <div className="span-2"><label>Termos equivalentes</label><textarea className="documentacao-textarea small" value={listaParaTexto(regraEditando.termosEquivalentes)} onChange={(e) => setRegraEditando({ ...regraEditando, termosEquivalentes: textoParaLista(e.target.value) })} /></div>
                <div className="span-2"><label>Termos de dispensa/condição</label><textarea className="documentacao-textarea small" value={listaParaTexto(regraEditando.termosDispensa)} onChange={(e) => setRegraEditando({ ...regraEditando, termosDispensa: textoParaLista(e.target.value) })} /></div>
                <div className="span-2"><label>Observações</label><textarea className="documentacao-textarea small" value={regraEditando.observacoes} onChange={(e) => setRegraEditando({ ...regraEditando, observacoes: e.target.value })} /></div>
                <div className="span-2 flex justify-end gap-2">
                  <button type="button" className="btn-clean btn-clean-secondary" onClick={() => setRegraEditando(null)}>Cancelar</button>
                  <button type="button" className="btn-clean btn-clean-primary" onClick={salvarRegra}>Salvar regra</button>
                </div>
              </div>
            )}

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th>Ordem</th><th>Documento</th><th>Categoria</th><th>Obrigatoriedade</th><th>Palavras</th><th>Ação</th></tr></thead>
                <tbody>
                  {biblioteca.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td>{r.ordem}</td>
                      <td className="font-bold">{r.documento}</td>
                      <td>{r.categoria}</td>
                      <td>{r.obrigatoriedade}</td>
                      <td>{r.palavrasChave.length}</td>
                      <td className="whitespace-nowrap">
                        <button type="button" className="text-blue-700 font-bold mr-3" onClick={() => setRegraEditando(r)}>Editar</button>
                        <button type="button" className="text-red-600 font-bold" onClick={() => excluirRegra(r.id)}>Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>
    </AppShell>
  );
}
