"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";

const CHAVE_RASCUNHO_LICITACAO = "cotamed_rascunho_licitacao_24h";
const CHAVE_COTACOES_SALVAS = "cotamed_cotacoes_salvas_local_v1";

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

type CotacaoLocal = {
  id: string;
  nome: string;
  arquivo_nome?: string;
  salvo_em: number;
  total?: number;
  quantidade_itens?: number;
  itens: ItemProposta[];
};

type RascunhoLicitacao = {
  arquivo_nome?: string;
  salvo_em?: number;
  itens?: ItemProposta[];
};

function dinheiro(valor?: number | null) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataPorExtenso(dataIso: string) {
  const data = dataIso ? new Date(`${dataIso}T12:00:00`) : new Date();
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
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
    if (resto >= 10 && resto <= 19) partes.push(especiais[resto - 10]);
    else {
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
    if (milhoes) partes.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
    if (milhares) partes.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
    if (resto) partes.push(ate999(resto));
    if (partes.length <= 1) return partes[0] || "zero";
    const ultimo = partes.pop();
    return `${partes.join(", ")} e ${ultimo}`;
  }

  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);
  const textoReais = `${inteiroExtenso(reais)} ${reais === 1 ? "real" : "reais"}`;
  return centavos ? `${textoReais} e ${inteiroExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}` : textoReais;
}

function carregarCotacoesLocais(): CotacaoLocal[] {
  if (typeof window === "undefined") return [];
  const lista: CotacaoLocal[] = [];

  try {
    const bruto = window.localStorage.getItem(CHAVE_COTACOES_SALVAS);
    if (bruto) lista.push(...JSON.parse(bruto));
  } catch {}

  try {
    const rascunhoBruto = window.localStorage.getItem(CHAVE_RASCUNHO_LICITACAO);
    if (rascunhoBruto) {
      const rascunho = JSON.parse(rascunhoBruto) as RascunhoLicitacao;
      const itens = (rascunho.itens || []).filter((i) => !i.excluido && Number(i.valor_total || 0) > 0);
      if (itens.length) {
        lista.unshift({
          id: "rascunho_atual",
          nome: `Cotação em andamento - ${rascunho.arquivo_nome || "sem nome"}`,
          arquivo_nome: rascunho.arquivo_nome,
          salvo_em: rascunho.salvo_em || Date.now(),
          total: itens.reduce((t, i) => t + Number(i.valor_total || 0), 0),
          quantidade_itens: itens.length,
          itens,
        });
      }
    }
  } catch {}

  const vistos = new Set<string>();
  return lista.filter((c) => {
    if (!c?.id || vistos.has(c.id)) return false;
    vistos.add(c.id);
    return Array.isArray(c.itens) && c.itens.length > 0;
  });
}

export default function PropostasPage() {
  const hoje = new Date().toISOString().slice(0, 10);
  const [cotacoes, setCotacoes] = useState<CotacaoLocal[]>([]);
  const [cotacaoId, setCotacaoId] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [orgao, setOrgao] = useState("PREFEITURA MUNICIPAL");
  const [pregao, setPregao] = useState("");
  const [processo, setProcesso] = useState("");
  const [abertura, setAbertura] = useState("");
  const [dataProposta, setDataProposta] = useState(hoje);
  const [validade, setValidade] = useState("60");
  const [erro, setErro] = useState("");

  useEffect(() => {
    atualizarCotacoes();
  }, []);

  function atualizarCotacoes() {
    const lista = carregarCotacoesLocais();
    setCotacoes(lista);
    setCotacaoId((atual) => atual || lista[0]?.id || "");
    if (!lista.length) setErro("Nenhuma cotação salva neste computador. Na aba Licitações, clique em Salvar cotação.");
    else setErro("");
  }

  const cotacaoSelecionada = cotacoes.find((c) => c.id === cotacaoId) || null;
  const itensProposta = useMemo(() => (cotacaoSelecionada?.itens || []).filter((i) => !i.excluido && Number(i.valor_total || 0) > 0), [cotacaoSelecionada]);
  const valorGlobal = useMemo(() => itensProposta.reduce((total, item) => total + Number(item.valor_total || 0), 0), [itensProposta]);

  function limparCotacoesSalvas() {
    if (!window.confirm("Apagar cotações salvas neste computador?")) return;
    window.localStorage.removeItem(CHAVE_COTACOES_SALVAS);
    atualizarCotacoes();
  }

  function gerarPdfParaAssinar() {
    if (!itensProposta.length) {
      setErro("Selecione uma cotação com itens válidos.");
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
            <p>Gere o PDF da proposta para assinar com certificado digital.</p>
          </div>
          <div className="proposta-toolbar-actions">
            <button type="button" className="btn-clean btn-clean-secondary" onClick={atualizarCotacoes}>Atualizar cotações</button>
            <button type="button" className="btn-clean btn-clean-secondary" onClick={limparCotacoesSalvas}>Limpar salvas</button>
            <button type="button" className="btn-clean btn-clean-primary" onClick={gerarPdfParaAssinar}>Baixar PDF para assinar</button>
          </div>
        </div>

        <section className="clean-card p-6 no-print">
          <h2 className="font-bold text-xl">Dados da proposta</h2>

          <div className="proposta-form-grid mt-5">
            <div className="proposta-field-wide">
              <label>Cotação salva neste computador</label>
              <select className="input mt-2" value={cotacaoId} onChange={(e) => setCotacaoId(e.target.value)}>
                {cotacoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} • {c.quantidade_itens || c.itens.length} itens • {dinheiro(c.total)}
                  </option>
                ))}
              </select>
            </div>
            <div><label>Município / UF</label><input className="input mt-2" placeholder="Ex.: VALPARAÍSO DE GOIÁS GO" value={municipio} onChange={(e) => setMunicipio(e.target.value.toUpperCase())} /></div>
            <div><label>Órgão</label><input className="input mt-2" value={orgao} onChange={(e) => setOrgao(e.target.value.toUpperCase())} /></div>
            <div><label>Pregão</label><input className="input mt-2" placeholder="Ex.: PREGÃO ELETRÔNICO 01" value={pregao} onChange={(e) => setPregao(e.target.value.toUpperCase())} /></div>
            <div><label>Processo</label><input className="input mt-2" placeholder="Ex.: 12345" value={processo} onChange={(e) => setProcesso(e.target.value.toUpperCase())} /></div>
            <div><label>Abertura</label><input className="input mt-2" type="date" value={abertura} onChange={(e) => setAbertura(e.target.value)} /></div>
            <div><label>Data da proposta</label><input className="input mt-2" type="date" value={dataProposta} onChange={(e) => setDataProposta(e.target.value)} /></div>
            <div><label>Validade da proposta</label><input className="input mt-2" placeholder="Ex.: 60" value={validade} onChange={(e) => setValidade(e.target.value)} /></div>
          </div>

          <div className="proposta-assinatura-info">
            <b>Assinatura digital:</b> o CotaMed gera o PDF pronto. Depois assine com certificado digital no Adobe Acrobat, GOV.BR, Serpro ou outro assinador ICP-Brasil.
          </div>

          {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}
          <p className="mt-4 text-sm text-slate-600">Itens: <b>{itensProposta.length}</b> • Valor global: <b>{dinheiro(valorGlobal)}</b></p>
        </section>

        <div className="proposta-paper">
          <header className="proposta-pdf-header">
            <div className="proposta-logo-box"><img src="/brand/cotamed-icon.svg" alt="Logo" /></div>
            <div>
              <h2>DOM BOSCO HOSPITALAR LTDA</h2>
              <p>ENDEREÇO: RUA 06, QUADRA 06, LOTE 17, MORADA NOBRE</p>
              <p>CIDADE/UF: VALPARAÍSO DE GOIÁS-GO CEP: 72.870-324</p>
              <p>CNPJ: 35.020.039/0001-55 &nbsp;&nbsp; I.E.: 10.775.504-1</p>
            </div>
          </header>

          <div className="proposta-meta"><p>VALPARAÍSO DE GOIÁS, {dataPorExtenso(dataProposta)}</p></div>

          <div className="proposta-dados">
            <p>{orgao} {municipio}</p>
            <p>{pregao}</p>
            <p>PROCESSO Nº {processo}</p>
            <p>ABERTURA: {abertura ? dataPorExtenso(abertura) : ""}</p>
          </div>

          <h1 className="proposta-titulo">PROPOSTA DE PREÇOS</h1>

          <p className="proposta-intro">
            A empresa <b>DOM BOSCO HOSPITALAR LTDA</b>, inscrita no CNPJ 35.020.039/0001-55, com endereço à Rua 06, Quadra 06, Lote 17, Morada Nobre, Valparaíso de Goiás - GO, através de seu representante neste ato representado pelo Sr. <b>JOSÉ ADMILSON DE OLIVEIRA</b>, brasileiro, empresário, portador da Cédula de Identidade nº M6776966 SSP-MG e CPF 750.848.216-68, vem apresentar e submeter à apreciação de Vossas Senhorias a Proposta de Preços, conforme especificações abaixo.
          </p>

          <table className="proposta-table">
            <thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Unid</th><th>Registro</th><th>Marca</th><th>Vl Unit</th><th>Vl Total</th></tr></thead>
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
              <tr className="total-row"><td colSpan={7}>TOTAL</td><td>{dinheiro(valorGlobal)}</td></tr>
              <tr className="extenso-row"><td colSpan={8}>{numeroParaExtenso(valorGlobal)}</td></tr>
            </tbody>
          </table>

          <section className="proposta-bancarios">
            <h3>DADOS BANCÁRIOS</h3>
            <div><b>Banco:</b> Sicoob &nbsp;&nbsp; <b>Número:</b> 756</div>
            <div><b>Agência:</b> 5004 &nbsp;&nbsp; <b>Conta Corrente:</b> 1035861-7</div>
          </section>

          <div className="proposta-declaracoes">
            <p>• DECLARO, sob as penas da lei, em especial o art. 299 do Código Penal Brasileiro, que todas as declarações abaixo são verdadeiras;</p>
            <p>• Validade da proposta: {validade} dias, a contar da data de sua apresentação;</p>
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

          <footer className="proposta-footer">E-MAIL: DOMBOSCOVAL@GMAIL.COM &nbsp;&nbsp; | &nbsp;&nbsp; TELEFONE: (61) 3205-9003</footer>
        </div>
      </section>
    </AppShell>
  );
}
