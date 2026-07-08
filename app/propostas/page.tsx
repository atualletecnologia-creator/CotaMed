"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";

const CHAVE_RASCUNHO_LICITACAO = "cotamed_rascunho_licitacao_24h";

type ItemProposta = {
  numero_item?: string;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
  registro_anvisa?: string | null;
  marca?: string | null;
  valor_unitario?: number | null;
  valor_total?: number | null;
  excluido?: boolean;
};

type RascunhoLicitacao = {
  arquivo_nome?: string;
  itens?: ItemProposta[];
};

function dinheiro(valor?: number | null) {
  const numero = Number(valor || 0);
  return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataPorExtenso(dataIso: string) {
  const data = dataIso ? new Date(`${dataIso}T12:00:00`) : new Date();
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).toUpperCase();
}

function limparTexto(valor: unknown) {
  return String(valor || "").trim();
}

function numeroParaExtenso(valor: number) {
  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const especiais = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function ate999(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";

    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    const partes: string[] = [];

    if (c) partes.push(centenas[c]);

    const resto = n % 100;

    if (resto >= 10 && resto <= 19) {
      partes.push(especiais[resto - 10]);
    } else {
      if (d) partes.push(dezenas[d]);
      if (u) partes.push(unidades[u]);
    }

    return partes.filter(Boolean).join(" e ");
  }

  function inteiroExtenso(n: number): string {
    if (n === 0) return "zero";

    const milhoes = Math.floor(n / 1_000_000);
    const milhares = Math.floor((n % 1_000_000) / 1_000);
    const resto = n % 1_000;

    const partes: string[] = [];

    if (milhoes) {
      partes.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
    }

    if (milhares) {
      partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
    }

    if (resto) {
      partes.push(ate999(resto));
    }

    if (partes.length <= 1) return partes[0] || "zero";

    const ultimo = partes.pop();
    return `${partes.join(", ")} e ${ultimo}`;
  }

  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);

  const textoReais = `${inteiroExtenso(reais)} ${reais === 1 ? "real" : "reais"}`;

  if (!centavos) return textoReais;

  return `${textoReais} e ${inteiroExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
}

export default function PropostasPage() {
  const hoje = new Date().toISOString().slice(0, 10);

  const [municipio, setMunicipio] = useState("");
  const [orgao, setOrgao] = useState("PREFEITURA MUNICIPAL");
  const [pregao, setPregao] = useState("");
  const [processo, setProcesso] = useState("");
  const [abertura, setAbertura] = useState("");
  const [dataProposta, setDataProposta] = useState(hoje);
  const [validade, setValidade] = useState("90 (noventa) dias");
  const [itens, setItens] = useState<ItemProposta[]>([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarCotacao();
  }, []);

  function carregarCotacao() {
    try {
      const bruto = window.localStorage.getItem(CHAVE_RASCUNHO_LICITACAO);

      if (!bruto) {
        setErro("Nenhuma cotação em andamento encontrada neste computador. Gere a proposta depois de cotar uma licitação.");
        return;
      }

      const rascunho = JSON.parse(bruto) as RascunhoLicitacao;
      const itensValidos = (rascunho.itens || []).filter((item) => !item.excluido);

      if (!itensValidos.length) {
        setErro("A cotação encontrada não possui itens válidos.");
        return;
      }

      setItens(itensValidos);
      setErro("");
    } catch {
      setErro("Não foi possível carregar a cotação salva neste computador.");
    }
  }

  const itensProposta = useMemo(() => {
    return itens.filter((item) => Number(item.valor_total || 0) > 0);
  }, [itens]);

  const valorGlobal = useMemo(() => {
    return itensProposta.reduce((total, item) => total + Number(item.valor_total || 0), 0);
  }, [itensProposta]);

  function imprimirProposta() {
    if (!itensProposta.length) {
      setErro("Nenhum item cotado com valor foi encontrado para gerar a proposta.");
      return;
    }

    window.print();
  }

  return (
    <AppShell>
      <section className="proposta-screen">
        <div className="proposta-toolbar no-print">
          <div>
            <h1>Gerador de Propostas</h1>
            <p>Preencha os dados da licitação e gere a proposta em PDF.</p>
          </div>

          <div className="proposta-toolbar-actions">
            <button type="button" className="btn-clean btn-clean-secondary" onClick={carregarCotacao}>
              Atualizar itens
            </button>

            <button type="button" className="btn-clean btn-clean-primary" onClick={imprimirProposta}>
              Gerar PDF
            </button>
          </div>
        </div>

        <section className="clean-card p-6 no-print">
          <h2 className="font-bold text-xl">Dados da licitação</h2>

          <div className="proposta-form-grid mt-5">
            <div>
              <label>Município / UF</label>
              <input className="input mt-2" placeholder="Ex.: CATALÃO-GO" value={municipio} onChange={(e) => setMunicipio(e.target.value.toUpperCase())} />
            </div>

            <div>
              <label>Órgão</label>
              <input className="input mt-2" placeholder="Ex.: PREFEITURA MUNICIPAL DE CATALÃO-GO" value={orgao} onChange={(e) => setOrgao(e.target.value.toUpperCase())} />
            </div>

            <div>
              <label>Pregão</label>
              <input className="input mt-2" placeholder="Ex.: PREGÃO ELETRÔNICO 90053/2026" value={pregao} onChange={(e) => setPregao(e.target.value.toUpperCase())} />
            </div>

            <div>
              <label>Processo</label>
              <input className="input mt-2" placeholder="Ex.: 2026019456" value={processo} onChange={(e) => setProcesso(e.target.value.toUpperCase())} />
            </div>

            <div>
              <label>Abertura</label>
              <input className="input mt-2" type="date" value={abertura} onChange={(e) => setAbertura(e.target.value)} />
            </div>

            <div>
              <label>Data da proposta</label>
              <input className="input mt-2" type="date" value={dataProposta} onChange={(e) => setDataProposta(e.target.value)} />
            </div>

            <div>
              <label>Validade</label>
              <input className="input mt-2" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </div>
          </div>

          {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}
          <p className="mt-4 text-sm text-slate-600">
            Itens carregados: <b>{itensProposta.length}</b> • Valor global: <b>{dinheiro(valorGlobal)}</b>
          </p>
        </section>

        <div className="proposta-paper">
          <header className="proposta-pdf-header">
            <div className="proposta-logo-box">
              <img src="/brand/cotamed-icon.svg" alt="Logo" />
            </div>

            <div>
              <h2>DOM BOSCO HOSPITALAR LTDA</h2>
              <p>ENDEREÇO: RUA 06, QUADRA 06, LOTE 17, MORADA NOBRE</p>
              <p>CIDADE/UF: VALPARAÍSO DE GOIÁS-GO CEP: 72.870-324</p>
              <p>CNPJ: 35.020.039/0001-55 &nbsp;&nbsp; I.E.: 10.775.504-1</p>
            </div>
          </header>

          <div className="proposta-meta">
            <p>VALPARAÍSO DE GOIÁS, {dataPorExtenso(dataProposta)}</p>
          </div>

          <div className="proposta-dados">
            <p>{orgao} {municipio && !orgao.includes(municipio) ? `DE ${municipio}` : ""}</p>
            <p>{pregao}</p>
            <p>PROCESSO Nº {processo}</p>
            <p>ABERTURA: {abertura ? dataPorExtenso(abertura) : ""}</p>
          </div>

          <h1 className="proposta-titulo">PROPOSTA DE PREÇOS</h1>

          <p className="proposta-intro">
            A empresa <b>DOM BOSCO HOSPITALAR LTDA</b>, inscrita no CNPJ 35.020.039/0001-55, com endereço à
            Rua 06, Quadra 06, Lote 17, Morada Nobre, Valparaíso de Goiás - GO, através de seu representante neste
            ato representado pelo Sr. <b>JOSÉ ADMILSON DE OLIVEIRA</b>, brasileiro, empresário, portador da
            Cédula de Identidade nº M6776966 SSP-MG e CPF 750.848.216-68, vem apresentar e submeter à apreciação
            de Vossas Senhorias a Proposta de Preços, conforme especificações abaixo.
          </p>

          <table className="proposta-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Descrição</th>
                <th>Qtd</th>
                <th>Unid</th>
                <th>Registro</th>
                <th>Marca</th>
                <th>Vl Unit</th>
                <th>Vl Total</th>
              </tr>
            </thead>

            <tbody>
              {itensProposta.map((item, index) => (
                <tr key={`${item.numero_item}-${index}`}>
                  <td>{item.numero_item || index + 1}</td>
                  <td className="descricao">{limparTexto(item.descricao)}</td>
                  <td>{Number(item.quantidade || 0)}</td>
                  <td>{limparTexto(item.unidade)}</td>
                  <td>{limparTexto(item.registro_anvisa) || "ISENTO"}</td>
                  <td>{limparTexto(item.marca) || "-"}</td>
                  <td>{dinheiro(item.valor_unitario)}</td>
                  <td>{dinheiro(item.valor_total)}</td>
                </tr>
              ))}

              <tr className="total-row">
                <td colSpan={7}>TOTAL</td>
                <td>{dinheiro(valorGlobal)}</td>
              </tr>

              <tr className="extenso-row">
                <td colSpan={8}>{numeroParaExtenso(valorGlobal)}</td>
              </tr>
            </tbody>
          </table>

          <div className="proposta-declaracoes">
            <p>• DECLARO, sob as penas da lei, em especial o art. 299 do Código Penal Brasileiro, que todas as declarações abaixo são verdadeiras;</p>
            <p>• Validade da proposta: {validade}, a contar da data de sua apresentação;</p>
            <p>• DECLARO que a proposta apresentada foi elaborada de maneira independente pela empresa DOM BOSCO HOSPITALAR LTDA, e o conteúdo da proposta não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial, por qualquer meio ou por qualquer pessoa;</p>
            <p>• DECLARO que não tentei, por qualquer meio ou por qualquer pessoa, influir na decisão de qualquer outro participante potencial ou de fato quanto a participar ou não da referida licitação;</p>
            <p>• DECLARO que o conteúdo da proposta apresentada não será, no todo ou em parte, direta ou indiretamente, comunicado ou discutido com qualquer outro participante potencial ou de fato antes da adjudicação do objeto da referida licitação;</p>
            <p>• DECLARO que estou plenamente ciente do teor e da extensão desta declaração e que detém plenos poderes e informações para firmá-la;</p>
            <p>• DECLARO que nos preços acima propostos estão incluídas todas as despesas diretas e indiretas, inclusive tributos e/ou impostos, encargos sociais e trabalhistas incidentes, taxa de administração, previsão de lucro, seguro, frete e outros necessários ao cumprimento integral dos objetos da aquisição;</p>
            <p>• Declaramos que estamos de pleno acordo com todas as obrigações e responsabilidades, bem como todas as condições estabelecidas no Edital e seus Anexos;</p>
            <p>• DECLARO que caso nos seja adjudicado o objeto da licitação, comprometemo-nos a entregar os produtos no prazo e condições estipuladas no Termo de Referência deste Edital;</p>
            <p>• DECLARO conhecer os termos do instrumento convocatório que rege a presente licitação;</p>
            <p>• Condições de pagamento: Conforme o edital;</p>
            <p>• Local, horário e prazo de entrega dos produtos: Conforme o edital.</p>
          </div>

          <div className="proposta-assinatura">
            <div></div>
            <strong>DOM BOSCO HOSPITALAR LTDA</strong>
            <span>CNPJ: 35.020.039/0001-55</span>
            <span>JOSÉ ADMILSON DE OLIVEIRA</span>
            <span>SÓCIO-PROPRIETÁRIO</span>
            <span>CPF: 750.848.216-68</span>
            <span>RG: M6776966 SSP/MG</span>
          </div>

          <footer className="proposta-footer">
            E-MAIL: DOMBOSCOVAL@GMAIL.COM &nbsp;&nbsp; | &nbsp;&nbsp; TELEFONE: (61) 3205-9003
          </footer>
        </div>
      </section>
    </AppShell>
  );
}
