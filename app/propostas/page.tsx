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

function dataSimples(timestamp?: number) {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("pt-BR");
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

  if (!centavos) return textoReais;

  return `${textoReais} e ${inteiroExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`;
}



function paginarItensProposta(itens: ItemProposta[]) {
  const paginas: ItemProposta[][] = [];
  let paginaAtual: ItemProposta[] = [];
  let pesoAtual = 0;
  const pesoMaximo = 112;

  for (const item of itens) {
    const descricao = limparTexto(item.descricao);
    const linhasEstimadas = Math.max(1, Math.ceil(descricao.length / 52));
    const pesoItem = 13 + linhasEstimadas * 8;

    if (paginaAtual.length > 0 && (paginaAtual.length >= 6 || pesoAtual + pesoItem > pesoMaximo)) {
      paginas.push(paginaAtual);
      paginaAtual = [];
      pesoAtual = 0;
    }

    paginaAtual.push(item);
    pesoAtual += pesoItem;
  }

  if (paginaAtual.length || paginas.length === 0) paginas.push(paginaAtual);
  return paginas;
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
  const [modalidade, setModalidade] = useState("PREGÃO ELETRÔNICO");
  const [numeroPregao, setNumeroPregao] = useState("");
  const [processo, setProcesso] = useState("");
  const [abertura, setAbertura] = useState("");
  const [dataProposta, setDataProposta] = useState(hoje);
  const [validade, setValidade] = useState("60");
  const [condicoesPagamento, setCondicoesPagamento] = useState("Conforme o edital");
  const [erro, setErro] = useState("");

  useEffect(() => {
    atualizarCotacoes();
  }, []);

  function atualizarCotacoes() {
    const lista = carregarCotacoesLocais();
    setCotacoes(lista);
    setCotacaoId((atual) => atual || lista[0]?.id || "");

    if (!lista.length) {
      setErro("Nenhuma cotação salva neste computador. Na aba Licitações, clique em Salvar cotação.");
    } else {
      setErro("");
    }
  }

  const cotacaoSelecionada = cotacoes.find((c) => c.id === cotacaoId) || null;

  const itensProposta = useMemo(() => {
    return (cotacaoSelecionada?.itens || []).filter((i) => !i.excluido && Number(i.valor_total || 0) > 0);
  }, [cotacaoSelecionada]);

  const valorGlobal = useMemo(() => {
    return itensProposta.reduce((total, item) => total + Number(item.valor_total || 0), 0);
  }, [itensProposta]);

  const paginasItens = useMemo(() => paginarItensProposta(itensProposta), [itensProposta]);
  const totalPaginasProposta = 3 + paginasItens.length;

  const descricaoPregao = `${modalidade} ${numeroPregao}`.trim();

  function limparCotacoesSalvas() {
    if (!window.confirm("Apagar todas as cotações salvas neste computador?")) return;

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
            <p>Selecione uma cotação salva neste computador e gere o PDF da proposta.</p>
          </div>

          <div className="proposta-toolbar-actions">
            <button type="button" className="btn-clean btn-clean-secondary" onClick={atualizarCotacoes}>Atualizar cotações</button>
            <button type="button" className="btn-clean btn-clean-secondary" onClick={limparCotacoesSalvas}>Limpar salvas</button>
            <button type="button" className="btn-clean btn-clean-primary" onClick={gerarPdfParaAssinar}>Baixar PDF para assinar</button>
          </div>
        </div>

        <section className="clean-card p-6 no-print">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl">Dados da proposta</h2>
              <p className="text-sm text-slate-500 mt-1">Os dados ficam somente neste computador/navegador.</p>
            </div>
          </div>

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

            <div>
              <label>Município / UF</label>
              <input className="input mt-2" placeholder="Ex.: CATALÃO-GO" value={municipio} onChange={(e) => setMunicipio(e.target.value.toUpperCase())} />
            </div>

            <div>
              <label>Órgão</label>
              <input className="input mt-2" value={orgao} onChange={(e) => setOrgao(e.target.value.toUpperCase())} />
            </div>

            <div>
              <label>Modalidade</label>
              <select className="input mt-2" value={modalidade} onChange={(e) => setModalidade(e.target.value.toUpperCase())}>
                <option>PREGÃO ELETRÔNICO</option>
                <option>PREGÃO PRESENCIAL</option>
                <option>DISPENSA ELETRÔNICA</option>
                <option>CONCORRÊNCIA ELETRÔNICA</option>
              </select>
            </div>

            <div>
              <label>Número do pregão</label>
              <input className="input mt-2" placeholder="Ex.: 90053/2026" value={numeroPregao} onChange={(e) => setNumeroPregao(e.target.value.toUpperCase())} />
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
              <label>Validade da proposta</label>
              <input className="input mt-2" placeholder="Ex.: 60" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </div>

            <div>
              <label>Condições de pagamento</label>
              <input className="input mt-2" value={condicoesPagamento} onChange={(e) => setCondicoesPagamento(e.target.value)} />
            </div>

          </div>

          <div className="proposta-assinatura-info">
            <b>Assinatura digital:</b> o CotaMed gera o PDF pronto. Depois assine com certificado digital no Adobe Acrobat, GOV.BR, Serpro ou outro assinador ICP-Brasil.
          </div>

          {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

          <p className="mt-4 text-sm text-slate-600">
            Itens selecionados: <b>{itensProposta.length}</b> • Valor global: <b>{dinheiro(valorGlobal)}</b>
          </p>
        </section>

        <div className="proposta-doc">
          <section className="proposta-page proposta-page-cover">
            <div className="proposta-page-number">1/{totalPaginasProposta}</div>
            <header className="proposta-pdf-header">
              <img className="proposta-logo-oficial" src="/proposta/dom-bosco-logo.png" alt="Dom Bosco Hospitalar" />
              <div className="proposta-empresa">
                <h2>DOM BOSCO HOSPITALAR LTDA</h2>
                <p>ENDEREÇO: RUA 06, QUADRA 06, LOTE 17, MORADA NOBRE</p>
                <p>CIDADE/UF: VALPARAÍSO DE GOIÁS-GO&nbsp;&nbsp; CEP: 72.870-324</p>
                <p>CNPJ: 35.020.039/0001-55&nbsp;&nbsp;&nbsp; I.E.: 10.775.504-1</p>
              </div>
            </header>

            <div className="proposta-meta">VALPARAÍSO DE GOIÁS, {dataPorExtenso(dataProposta)}</div>

            <div className="proposta-dados">
              <p>{orgao} {municipio}</p>
              <p>{descricaoPregao}</p>
              <p>PROCESSO Nº {processo}</p>
              <p>ABERTURA: {abertura ? dataPorExtenso(abertura) : ""}</p>
            </div>

            <h1 className="proposta-titulo">PROPOSTA DE PREÇOS</h1>

            <p className="proposta-intro">
              A empresa <b>DOM BOSCO HOSPITALAR LTDA</b>, inscrita no CNPJ 35.020.039/0001-55, com endereço à
              Rua 06, Quadra 06, Lote 17, Morada Nobre, Valparaíso de Goiás - GO, através de seu representante neste
              ato representado pelo Sr. <b>JOSÉ ADMILSON DE OLIVEIRA</b>, brasileiro, empresário, residente e
              domiciliado à Rua São Benedito, nº 409, Bairro Rosário, Luziânia - GO, CEP 72.812-090, portador da
              Cédula de Identidade nº M6776966 SSP-MG e CPF 750.848.216-68, vem apresentar e submeter à apreciação
              de Vossas Senhorias a Proposta de Preços, conforme especificações contidas, na proposta abaixo.
            </p>

            <section className="proposta-contato">
              <h3>INFORMAÇÕES DE CONTATO</h3>
              <div className="proposta-contato-grid">
                <span><b>Telefone:</b> (61) 3205-9003</span>
                <span><b>E-mail:</b> empenhosdb@gmail.com</span>
                <span className="span-2"><b>Representante Legal:</b> JOSÉ ADMILSON DE OLIVEIRA</span>
                <span><b>RG:</b> M6776966 SSP-MG</span>
                <span><b>CPF:</b> 750.848.216-68</span>
                <span className="span-2"><b>Celular:</b> (61) 99880-6200</span>
              </div>
              <h3>DADOS BANCÁRIOS</h3>
              <div className="proposta-contato-grid proposta-banco-grid">
                <span><b>Banco:</b> Sicoob</span>
                <span><b>Número:</b> 756</span>
                <span><b>Agência:</b> 5004</span>
                <span><b>Conta Corrente:</b> 1035861-7</span>
              </div>
            </section>

            <footer className="proposta-footer">E-MAIL: DOMBOSCOVAL@GMAIL.COM&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;TELEFONE: (61) 3205-9003</footer>
          </section>

          {paginasItens.map((itensPagina, paginaIndex) => {
            const ultimaPaginaTabela = paginaIndex === paginasItens.length - 1;
            const numeroPagina = paginaIndex + 2;
            const deslocamento = paginasItens
              .slice(0, paginaIndex)
              .reduce((total, pagina) => total + pagina.length, 0);

            return (
              <section className="proposta-page proposta-page-table" key={`tabela-${paginaIndex}`}>
                <div className="proposta-page-number">{numeroPagina}/{totalPaginasProposta}</div>
                <header className="proposta-pdf-header proposta-pdf-header-small">
                  <img className="proposta-logo-oficial" src="/proposta/dom-bosco-logo.png" alt="Dom Bosco Hospitalar" />
                  <div className="proposta-empresa">
                    <h2>DOM BOSCO HOSPITALAR LTDA</h2>
                    <p>ENDEREÇO: RUA 06, QUADRA 06, LOTE 17, MORADA NOBRE</p>
                    <p>CIDADE/UF: VALPARAÍSO DE GOIÁS-GO&nbsp;&nbsp; CEP: 72.870-324</p>
                    <p>CNPJ: 35.020.039/0001-55&nbsp;&nbsp;&nbsp; I.E.: 10.775.504-1</p>
                  </div>
                </header>

                <h1 className="proposta-titulo proposta-titulo-tabela">
                  PROPOSTA DE PREÇOS{paginasItens.length > 1 ? ` — ${paginaIndex + 1}/${paginasItens.length}` : ""}
                </h1>

                <div className="proposta-table-wrap">
                  <table className="proposta-table">
                    <colgroup>
                      <col className="col-item" />
                      <col className="col-descricao" />
                      <col className="col-und" />
                      <col className="col-qtd" />
                      <col className="col-registro" />
                      <col className="col-marca" />
                      <col className="col-unitario" />
                      <col className="col-total" />
                    </colgroup>
                    <thead>
                      <tr><th>ITEM</th><th>DESCRIÇÃO</th><th>UND</th><th>QTD</th><th>REGISTRO</th><th>MARCA</th><th>VL UNIT</th><th>VL TOTAL</th></tr>
                    </thead>
                    <tbody>
                      {itensPagina.map((item, index) => {
                        const indiceGlobal = deslocamento + index;
                        return (
                          <tr key={`${item.numero_item}-${indiceGlobal}`}>
                            <td>{item.numero_item || indiceGlobal + 1}</td>
                            <td className="descricao">{limparTexto(item.descricao)}</td>
                            <td>{limparTexto(item.unidade)}</td>
                            <td>{Number(item.quantidade || 0)}</td>
                            <td>{limparTexto(item.registro_anvisa) || "ISENTO"}</td>
                            <td>{limparTexto(item.marca) || "-"}</td>
                            <td>{dinheiro(item.valor_unitario)}</td>
                            <td>{dinheiro(item.valor_total)}</td>
                          </tr>
                        );
                      })}
                      {ultimaPaginaTabela && (
                        <>
                          <tr className="total-row"><td colSpan={7}>VALOR TOTAL DA PROPOSTA</td><td>{dinheiro(valorGlobal)}</td></tr>
                          <tr className="extenso-row"><td colSpan={8}>{numeroParaExtenso(valorGlobal)}</td></tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                <footer className="proposta-footer">E-MAIL: DOMBOSCOVAL@GMAIL.COM&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;TELEFONE: (61) 3205-9003</footer>
              </section>
            );
          })}

          {[0, 1].map((paginaDeclaracao) => {
            const numeroPagina = paginasItens.length + 2 + paginaDeclaracao;
            const declaracoes = paginaDeclaracao === 0
              ? [
                  <>Declaramos que nos preços propostos estão inclusos todos os custos e despesas, inclusive custos diretos e indiretos, tributos, taxas, materiais, serviços, encargos sociais e trabalhistas, seguros, transportes, fretes, embalagens, lucro e quaisquer outros necessários ao cumprimento integral do objeto do edital e de seus anexos.</>,
                  <>Declaramos que a presente proposta tem validade de {validade} dias, contados da data de abertura da licitação.</>,
                  <>Declaramos que os produtos ofertados atendem integralmente às especificações técnicas, quantidades, unidades, registros e demais exigências previstas no edital.</>,
                  <>Declaramos que conhecemos e aceitamos, sem ressalvas, todas as condições, obrigações e regras estabelecidas no edital e em seus anexos.</>,
                  <>Declaramos que os dados bancários informados pertencem à empresa proponente e estão corretos para fins de pagamento.</>,
                ]
              : [
                  <>Declaramos que as condições de pagamento propostas são: {condicoesPagamento}.</>,
                  <>Declaramos, sob as penas da lei, que não existem fatos impeditivos para nossa habilitação e contratação com a Administração Pública.</>,
                  <>Declaramos que não empregamos menor de 18 anos em trabalho noturno, perigoso ou insalubre, nem menor de 16 anos, salvo na condição de aprendiz a partir dos 14 anos.</>,
                  <>Declaramos que esta proposta foi elaborada de forma independente e que seu conteúdo não foi, no todo ou em parte, informado, discutido ou recebido de qualquer outro participante.</>,
                  <>Declaramos que manteremos todas as condições de habilitação e qualificação exigidas durante a vigência da contratação.</>,
                ];

            return (
              <section className="proposta-page proposta-page-declaracoes" key={`declaracoes-${paginaDeclaracao}`}>
                <div className="proposta-page-number">{numeroPagina}/{totalPaginasProposta}</div>
                <header className="proposta-pdf-header proposta-pdf-header-small">
                  <img className="proposta-logo-oficial" src="/proposta/dom-bosco-logo.png" alt="Dom Bosco Hospitalar" />
                  <div className="proposta-empresa">
                    <h2>DOM BOSCO HOSPITALAR LTDA</h2>
                    <p>ENDEREÇO: RUA 06, QUADRA 06, LOTE 17, MORADA NOBRE</p>
                    <p>CIDADE/UF: VALPARAÍSO DE GOIÁS-GO&nbsp;&nbsp; CEP: 72.870-324</p>
                    <p>CNPJ: 35.020.039/0001-55&nbsp;&nbsp;&nbsp; I.E.: 10.775.504-1</p>
                  </div>
                </header>

                <h1 className="proposta-titulo proposta-titulo-declaracoes">
                  DECLARAÇÕES{paginaDeclaracao === 1 ? " — CONTINUAÇÃO" : ""}
                </h1>

                <div className="proposta-declaracoes">
                  {declaracoes.map((declaracao, index) => <p key={index}>• {declaracao}</p>)}
                </div>

                {paginaDeclaracao === 1 && (
                  <div className="proposta-assinatura">
                    <div></div>
                    <strong>JOSÉ ADMILSON DE OLIVEIRA</strong>
                    <span>REPRESENTANTE LEGAL</span>
                  </div>
                )}

                <footer className="proposta-footer">E-MAIL: DOMBOSCOVAL@GMAIL.COM&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;TELEFONE: (61) 3205-9003</footer>
              </section>
            );
          })}
        </div>

        <section className="clean-card p-6 no-print">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl">Cotações salvas neste computador</h2>
              <p className="text-sm text-slate-500 mt-1">As cotações ficam no localStorage deste navegador e não ocupam espaço no banco de dados.</p>
            </div>

            <button type="button" className="btn-clean btn-clean-secondary" onClick={atualizarCotacoes}>Atualizar lista</button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-3">Nome</th>
                  <th className="py-3">Data</th>
                  <th className="py-3">Itens</th>
                  <th className="py-3">Valor</th>
                </tr>
              </thead>
              <tbody>
                {cotacoes.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-3 font-semibold">{c.nome}</td>
                    <td className="py-3">{dataSimples(c.salvo_em)}</td>
                    <td className="py-3">{c.quantidade_itens || c.itens.length}</td>
                    <td className="py-3">{dinheiro(c.total)}</td>
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
