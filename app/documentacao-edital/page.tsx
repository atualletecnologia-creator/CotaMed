"use client";

import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { AppShell } from "@/components/AppShell";

const CHAVE_DOCS_EMPRESA = "cotamed_documentos_empresa_local_v1";

type DocumentoEmpresa = {
  id: string;
  nome: string;
  categoria: string;
  palavras: string;
  arquivoNome: string;
  tipo: string;
  base64: string;
};

type ResultadoOrganizacao = {
  solicitados: {
    categoria: string;
    documentos: DocumentoEmpresa[];
  }[];
  naoSolicitados: DocumentoEmpresa[];
  naoEncontrados: string[];
};

const CATEGORIAS = [
  "01 - Habilitação Jurídica",
  "02 - Regularidade Fiscal",
  "03 - Qualificação Econômico-Financeira",
  "04 - Qualificação Técnica",
  "05 - Declarações",
  "06 - Documentos do Representante",
  "07 - Outros Documentos Solicitados",
];

const REGRAS = [
  { nome: "Contrato Social", categoria: "01 - Habilitação Jurídica", termos: ["contrato social", "alteração contratual", "ato constitutivo", "estatuto social"] },
  { nome: "Cartão CNPJ", categoria: "01 - Habilitação Jurídica", termos: ["cartão cnpj", "comprovante de inscrição", "cnpj"] },
  { nome: "Inscrição Estadual", categoria: "01 - Habilitação Jurídica", termos: ["inscrição estadual", "cadastro estadual"] },
  { nome: "Certidão Federal", categoria: "02 - Regularidade Fiscal", termos: ["certidão federal", "receita federal", "dívida ativa da união", "regularidade federal"] },
  { nome: "Certidão FGTS", categoria: "02 - Regularidade Fiscal", termos: ["fgts", "crf", "certificado de regularidade do fgts"] },
  { nome: "Certidão Trabalhista", categoria: "02 - Regularidade Fiscal", termos: ["trabalhista", "cndt", "débitos trabalhistas"] },
  { nome: "Certidão Estadual", categoria: "02 - Regularidade Fiscal", termos: ["certidão estadual", "fazenda estadual", "regularidade estadual"] },
  { nome: "Certidão Municipal", categoria: "02 - Regularidade Fiscal", termos: ["certidão municipal", "fazenda municipal", "regularidade municipal"] },
  { nome: "Balanço Patrimonial", categoria: "03 - Qualificação Econômico-Financeira", termos: ["balanço patrimonial", "demonstrações contábeis", "índices contábeis"] },
  { nome: "Certidão de Falência", categoria: "03 - Qualificação Econômico-Financeira", termos: ["falência", "concordata", "recuperação judicial"] },
  { nome: "Atestado de Capacidade Técnica", categoria: "04 - Qualificação Técnica", termos: ["atestado de capacidade técnica", "atestados de capacidade", "qualificação técnica"] },
  { nome: "Alvará Sanitário", categoria: "04 - Qualificação Técnica", termos: ["alvará sanitário", "licença sanitária", "vigilância sanitária"] },
  { nome: "Autorização ANVISA", categoria: "04 - Qualificação Técnica", termos: ["autorização de funcionamento", "afe", "anvisa"] },
  { nome: "Declaração de Menor", categoria: "05 - Declarações", termos: ["menor de idade", "art. 7", "trabalho infantil"] },
  { nome: "Declaração de Inexistência de Fato Impeditivo", categoria: "05 - Declarações", termos: ["fato impeditivo", "declaração de inexistência"] },
  { nome: "Declaração ME/EPP", categoria: "05 - Declarações", termos: ["microempresa", "empresa de pequeno porte", "me/epp"] },
  { nome: "RG e CPF do Representante", categoria: "06 - Documentos do Representante", termos: ["rg", "cpf", "documento do representante", "identidade"] },
  { nome: "Procuração", categoria: "06 - Documentos do Representante", termos: ["procuração", "representante legal", "poderes"] },
];

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sanitizarNome(nome: string) {
  return nome
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
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

function documentoCombina(doc: DocumentoEmpresa, regra: { nome: string; termos: string[] }) {
  const textoDoc = normalizar(`${doc.nome} ${doc.categoria} ${doc.palavras} ${doc.arquivoNome}`);
  return regra.termos.some((termo) => textoDoc.includes(normalizar(termo))) || textoDoc.includes(normalizar(regra.nome));
}

export default function DocumentacaoEditalPage() {
  const [documentos, setDocumentos] = useState<DocumentoEmpresa[]>([]);
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [nome, setNome] = useState("");
  const [palavras, setPalavras] = useState("");
  const [editalTexto, setEditalTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoOrganizacao | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE_DOCS_EMPRESA);
      if (bruto) setDocumentos(JSON.parse(bruto));
    } catch {
      setErro("Não foi possível carregar documentos salvos neste computador.");
    }
  }, []);

  function salvarLista(lista: DocumentoEmpresa[]) {
    setDocumentos(lista);
    window.localStorage.setItem(CHAVE_DOCS_EMPRESA, JSON.stringify(lista));
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

    const doc: DocumentoEmpresa = {
      id: `${Date.now()}`,
      nome: nome.trim(),
      categoria,
      palavras: palavras.trim(),
      arquivoNome: file.name,
      tipo: file.type || "application/pdf",
      base64,
    };

    salvarLista([doc, ...documentos]);
    setNome("");
    setPalavras("");
    setMensagem("Documento cadastrado neste computador.");
  }

  function excluirDocumento(id: string) {
    salvarLista(documentos.filter((d) => d.id !== id));
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
    const porCategoria = new Map<string, DocumentoEmpresa[]>();

    REGRAS.forEach((regra) => {
      const solicitado = regra.termos.some((termo) => texto.includes(normalizar(termo))) || texto.includes(normalizar(regra.nome));
      if (!solicitado) return;

      const doc = documentos.find((d) => !usados.has(d.id) && documentoCombina(d, regra));

      if (doc) {
        usados.add(doc.id);
        const atual = porCategoria.get(regra.categoria) || [];
        atual.push(doc);
        porCategoria.set(regra.categoria, atual);
      } else {
        naoEncontrados.push(regra.nome);
      }
    });

    const solicitados = CATEGORIAS
      .map((cat) => ({ categoria: cat, documentos: porCategoria.get(cat) || [] }))
      .filter((grupo) => grupo.documentos.length > 0);

    const naoSolicitados = documentos.filter((d) => !usados.has(d.id));

    setResultado({ solicitados, naoSolicitados, naoEncontrados });
    setMensagem("Edital analisado. Confira antes de baixar o ZIP.");
  }

  async function baixarZip() {
    if (!resultado) {
      setErro("Analise o edital antes de baixar.");
      return;
    }

    const zip = new JSZip();
    let contadorGlobal = 1;

    resultado.solicitados.forEach((grupo, grupoIndex) => {
      const pasta = zip.folder(grupo.categoria);

      grupo.documentos.forEach((doc, docIndex) => {
        const ext = doc.arquivoNome.includes(".") ? doc.arquivoNome.split(".").pop() : "pdf";
        const nomeArquivo = `${String(docIndex + 1).padStart(2, "0")} - ${sanitizarNome(doc.nome)}.${ext}`;
        pasta?.file(nomeArquivo, base64ParaBlob(doc.base64, doc.tipo));
        contadorGlobal++;
      });
    });

    const pastaExtras = zip.folder("99 - Documentos não solicitados");
    resultado.naoSolicitados.forEach((doc, index) => {
      const ext = doc.arquivoNome.includes(".") ? doc.arquivoNome.split(".").pop() : "pdf";
      const nomeArquivo = `${String(index + 1).padStart(2, "0")} - ${sanitizarNome(doc.nome)}.${ext}`;
      pastaExtras?.file(nomeArquivo, base64ParaBlob(doc.base64, doc.tipo));
    });

    const relatorio = [
      "RELATÓRIO DE CONFERÊNCIA - COTAMED",
      "",
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      "",
      "DOCUMENTOS ORGANIZADOS:",
      ...resultado.solicitados.flatMap((grupo) => [
        "",
        grupo.categoria,
        ...grupo.documentos.map((doc) => `✔ ${doc.nome} (${doc.arquivoNome})`),
      ]),
      "",
      "DOCUMENTOS SOLICITADOS MAS NÃO ENCONTRADOS:",
      ...(resultado.naoEncontrados.length ? resultado.naoEncontrados.map((n) => `⚠ ${n}`) : ["Nenhum item obrigatório pendente identificado pelas regras."]),
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

  const resumo = useMemo(() => {
    return {
      total: documentos.length,
      encontrados: resultado?.solicitados.reduce((acc, grupo) => acc + grupo.documentos.length, 0) || 0,
      naoEncontrados: resultado?.naoEncontrados.length || 0,
      extras: resultado?.naoSolicitados.length || 0,
    };
  }, [documentos, resultado]);

  return (
    <AppShell>
      <section className="documentacao-page documentacao-page-pro">
        <div className="documentacao-hero">
          <div>
            <p className="clean-kicker">Documentação do edital</p>
            <h1>Organize os documentos da empresa na ordem do edital</h1>
            <p>Cadastre os documentos uma vez neste computador, cole o trecho do edital e baixe o ZIP com tudo separado por pastas.</p>
          </div>

          <button type="button" className="btn-clean btn-clean-primary" onClick={baixarZip} disabled={!resultado}>
            Baixar ZIP
          </button>
        </div>

        <section className="documentacao-metric-grid">
          <div className="documentacao-metric-card"><span className="text-sm text-slate-500">Documentos cadastrados</span><strong>{resumo.total}</strong></div>
          <div className="documentacao-metric-card"><span className="text-sm text-slate-500">Identificados</span><strong>{resumo.encontrados}</strong></div>
          <div className="documentacao-metric-card"><span className="text-sm text-slate-500">Não encontrados</span><strong>{resumo.naoEncontrados}</strong></div>
          <div className="documentacao-metric-card"><span className="text-sm text-slate-500">Não solicitados</span><strong>{resumo.extras}</strong></div>
        </section>

        <section className="documentacao-grid">
          <div className="documentacao-card">
            <h2 className="font-bold text-xl">Cadastrar documentos da empresa</h2>
            <p className="text-sm text-slate-500 mt-1">Os arquivos ficam salvos somente neste computador/navegador.</p>

            <div className="documentacao-form-grid mt-5">
              <div>
                <label className="text-sm font-bold">Nome do documento</label>
                <input className="input mt-2" placeholder="Ex.: Contrato Social" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>

              <div>
                <label className="text-sm font-bold">Categoria</label>
                <select className="input mt-2" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  {CATEGORIAS.map((cat) => <option key={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="text-sm font-bold">Palavras-chave</label>
                <input className="input mt-2" placeholder="Ex.: fgts, crf, regularidade" value={palavras} onChange={(e) => setPalavras(e.target.value)} />
              </div>

              <div>
                <label className="text-sm font-bold">Arquivo PDF/documento</label>
                <input className="input mt-2" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => cadastrarDocumento(e.target.files?.[0] || null)} />
              </div>
            </div>

            {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
            {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
          </div>

          <div className="documentacao-card">
            <h2 className="font-bold text-xl">Analisar documentação exigida</h2>
            <p className="text-sm text-slate-500 mt-1">Cole aqui o trecho do edital que fala sobre habilitação/documentos.</p>

            <textarea
              className="documentacao-textarea"
              value={editalTexto}
              onChange={(e) => setEditalTexto(e.target.value)}
              placeholder="Cole aqui o texto do edital..."
            />

            <div className="flex min-w-0 justify-end mt-4">
              <button type="button" className="btn-clean btn-clean-primary" onClick={analisarEdital}>Analisar edital</button>
            </div>
          </div>
        </section>

        {resultado && (
          <section className="clean-card p-6">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Resultado da organização</h2>
                <p className="text-sm text-slate-500 mt-1">Confira os documentos antes de baixar o ZIP.</p>
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
                  {resultado.naoEncontrados.length ? resultado.naoEncontrados.map((n) => (
                    <span key={n} className="documentacao-alert">⚠ {n}</span>
                  )) : <span className="text-sm text-slate-500">Nenhum pendente identificado.</span>}
                </div>
              </div>

              <div>
                <h3 className="font-bold text-blue-700">Documentos não solicitados</h3>
                <div className="mt-3 grid gap-2">
                  {resultado.naoSolicitados.length ? resultado.naoSolicitados.map((doc) => (
                    <span key={doc.id} className="documentacao-extra">• {doc.nome}</span>
                  )) : <span className="text-sm text-slate-500">Nenhum extra.</span>}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="clean-card p-6">
          <h2 className="font-bold text-xl">Documentos cadastrados</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-3">Documento</th>
                  <th className="py-3">Categoria</th>
                  <th className="py-3">Arquivo</th>
                  <th className="py-3">Ação</th>
                </tr>
              </thead>
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
      </section>
    </AppShell>
  );
}
