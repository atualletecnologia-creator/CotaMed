"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { encontrarMelhorProduto, classificarConfianca, encontrarCandidatos } from "@/lib/buscaInteligente";
import { baixarBlobPdfRegistro } from "@/lib/storagePdf";

type TipoPreco = "unitario" | "caixa";

type Produto = {
  id?: string;
  descricao?: string | null;
  apresentacao?: string | null;
  marca?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
  custo_unitario?: number | null;
  custo_caixa?: number | null;
  pdf_url?: string | null;
};

type ItemLicitacao = {
  numero_item: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  produto_id?: string | null;
  marca?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
  custo_usado?: number | null;
  tipo_preco?: TipoPreco;
  valor_unitario?: number | null;
  valor_total?: number | null;
  pdf_url?: string | null;
  status: string;
  confianca?: number;
  origem_match?: string;
  excluido?: boolean;
};

function maiusculo(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

function normalizarCabecalho(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

function numero(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;

  let texto = String(valor)
    .replace("R$", "")
    .replace(/\s/g, "")
    .trim();

  if (texto.includes(",")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  }

  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function dinheiro(valor?: number | null) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "-";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function nomeSeguro(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function pegarDescricao(linha: Record<string, unknown>) {
  return maiusculo(
    linha.descricao_dos_produtos ||
      linha.descricao ||
      linha.descrição ||
      linha.produto ||
      linha.medicamento ||
      linha.objeto ||
      ""
  );
}

function pegarValorPorCabecalho(
  linha: Record<string, unknown>,
  exatos: string[],
  parciais: string[] = []
) {
  for (const chave of exatos) {
    const valor = linha[chave];

    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return valor;
    }
  }

  for (const [chave, valor] of Object.entries(linha)) {
    if (valor === undefined || valor === null || String(valor).trim() === "") continue;

    const chaveNormalizada = normalizarCabecalho(chave);
    const partes = chaveNormalizada.split("_").filter(Boolean);

    const bateParcial = parciais.some((parcial) => {
      if (partes.includes(parcial)) return true;
      if (chaveNormalizada === parcial) return true;
      if (chaveNormalizada.startsWith(`${parcial}_`)) return true;
      if (chaveNormalizada.endsWith(`_${parcial}`)) return true;
      return false;
    });

    if (bateParcial) {
      return valor;
    }
  }

  return "";
}

function pegarQuantidade(linha: Record<string, unknown>) {
  const valor = pegarValorPorCabecalho(
    linha,
    [
      "quantidade",
      "quant",
      "qtd",
      "qtde",
      "qde",
      "qtdade",
      "qtd_total",
      "quantidade_total",
      "qtd_item",
      "qtde_item",
      "qtd_solicitada",
      "quantidade_solicitada",
      "qtd_licitada",
      "quantidade_licitada",
      "qtd_estimada",
      "quantidade_estimada",
      "qt",
    ],
    ["qtd", "qtde", "quant", "quantidade", "qde", "qt"]
  );

  const quantidade = pegarQuantidade(linha);
        const unidade = pegarUnidade(linha);

        const tipoPrecoItem = resolverTipoPrecoPadrao(tipoPrecoPadrao, descricao, unidade);
        const melhor = encontrarMelhorProdutoAprimorado(descricao, produtosValidos, tipoPrecoItem);
        let produto = melhor?.produto || null;
        let score = melhor?.score || 0;
        let origem = melhor?.origem || "busca_local";

        if (usarIa && score < 70 && produtosValidos.length) {
          const ia = await buscarComIa(descricao, produtosValidos);
          if (ia && ia.score > score) {
            produto = ia.produto;
            score = ia.score;
            origem = "ia";
          }
        }

        itensCotados.push(
          montarItemCotado({ index, descricao, quantidade, unidade, produto, margem: margemNumero, confianca: score, origemMatch: origem, tipoPreco: tipoPrecoItem })
        );
      }

      const itensCorrigidos = itensCotados.map((item) => {
        if (item.produto_id && item.custo_usado && item.valor_unitario && item.status === "Não encontrado") {
          return {
            ...item,
            status: "Conferir",
            origem_match: item.origem_match || "busca_local",
          };
        }

        return item;
      });

      setItens(itensCorrigidos);
      setMensagem(`${itensCorrigidos.length} itens processados. A busca usa aprendizado das seleções manuais anteriores.`);
    } finally {
      setProcessando(false);
      setProgressoProcessamento("");
    }
  }

  function baixarPlanilhaPreenchida() {
    if (!itens.length) {
      setErro("Processe uma planilha antes de baixar.");
      return;
    }

    if (!itensParaExportar.length) {
      setErro("Nenhum item confirmado para exportar.");
      return;
    }

    const dados = itens.map((item) => {
      const cotar = itemPodeCotar(item);
      return {
        ITEM: item.numero_item,
        "DESCRIÇÃO DOS PRODUTOS": item.descricao,
        UNID: item.unidade,
        QUANT: item.quantidade,
        "TIPO PREÇO": cotar ? (item.tipo_preco === "caixa" ? "CAIXA" : "UNITÁRIO") : "",
        REGISTRO: cotar ? item.registro_anvisa || "" : "",
        MARCA: cotar ? item.marca || "" : "",
        CUSTO: cotar ? item.custo_usado || "" : "",
        "VL. UNIT": cotar ? item.valor_unitario || "" : "",
        "VL. TOTAL": cotar ? item.valor_total || "" : "",
        "VENCIMENTO REGISTRO": cotar ? item.vencimento_registro || "" : "",
        CONFIANCA: item.confianca || "",
        "ORIGEM MATCH": item.origem_match || "",
        STATUS: item.excluido ? "Excluído da cotação" : item.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotação");
    XLSX.writeFile(wb, `cotacao-preenchida-cotamed-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function baixarZipRegistros() {
    try {
      setErro("");
      setMensagem("");

      const itensComPdf = itensParaExportar.filter((item) => item.pdf_url);
      if (!itensComPdf.length) {
        setErro("Nenhum PDF de registro ANVISA foi encontrado para os itens confirmados.");
        return;
      }

      const zip = new JSZip();
      for (const item of itensComPdf) {
        const blob = await baixarBlobPdfRegistro(item.pdf_url);
        if (!blob) continue;
        const nomeArquivo = `${item.numero_item}_${nomeSeguro(item.descricao)}_${item.registro_anvisa || "registro"}.pdf`;
        zip.file(nomeArquivo, blob);
      }

      const conteudo = await zip.generateAsync({ type: "blob" });
      saveAs(conteudo, `registros-anvisa-cotamed-${new Date().toISOString().slice(0, 10)}.zip`);
      setMensagem("ZIP dos registros ANVISA gerado com sucesso.");
    } catch {
      setErro("Não foi possível gerar o ZIP dos registros.");
    }
  }

  return (
    <AppShell>
      <div className="flex min-w-0 flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Licitações</h1>
          <p className="text-slate-500">Resultado em lista compacta, com seleção manual e escolha de preço por item.</p>
        </div>

        <div className="flex min-w-0 flex-wrap gap-3">
          <button type="button" className="btn-clean btn-clean-secondary" onClick={novaCotacaoLicitacao}>
            Nova cotação
          </button>

          <a href="/modelos/modelo-licitacao-cotamed.xlsx" download className="btn-primary text-center">
            Baixar modelo da licitação
          </a>
        </div>
      </div>

      {rascunhoDisponivel && (
        <section className="rascunho-licitacao-card">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Última cotação</p>
            <h2>{rascunhoDisponivel.arquivo_nome || "Licitação em andamento"}</h2>
            <p>
              Última alteração: {formatarDataHoraRascunho(rascunhoDisponivel.salvo_em)} • salvo neste computador por 24h
            </p>
          </div>

          <div className="rascunho-licitacao-actions">
            <button type="button" className="btn-clean btn-clean-primary" onClick={continuarRascunhoLicitacao}>
              Continuar
            </button>

            <button type="button" className="btn-clean btn-clean-secondary" onClick={novaCotacaoLicitacao}>
              Nova cotação
            </button>
          </div>
        </section>
      )}

      <section className="clean-card p-6 mt-6">
        <h2 className="font-bold text-xl">Enviar planilha da licitação</h2>

        <div className="licitacao-form-grid">
          <div className="licitacao-field"><label>Margem de lucro (%)</label>
            <input className="input mt-2" value={margem} onChange={(e) => setMargem(e.target.value)} />
          </div>

          <div className="licitacao-field"><label>Tipo de preço padrão</label>
            <select className="input mt-2" value={tipoPrecoPadrao} onChange={(e) => setTipoPrecoPadrao(e.target.value as TipoPreco | "auto")}>
              <option value="auto">Automático por item</option>
              <option value="unitario">Preço unitário</option>
              <option value="caixa">Preço por caixa</option>
            </select>
          </div>

          <div className="licitacao-field"><label>IA gratuita como fallback</label>
            <select className="input mt-2" value={usarIa ? "sim" : "nao"} onChange={(e) => setUsarIa(e.target.value === "sim")}>
              <option value="nao">Não, usar só busca local</option>
              <option value="sim">Sim, usar IA rápida quando não encontrar</option>
            </select>
          </div>

          <div className="licitacao-field"><label>Planilha</label>
            <input type="file" accept=".xlsx,.xls,.csv" className="input mt-2" onChange={(e) => processarPlanilha(e.target.files?.[0] || null)} />
          </div>
        </div>

        <div className="licitacao-help">
          O sistema identifica os itens automaticamente. Você pode ajustar cada item depois do processamento.
        </div>

        {arquivoNome && <p className="text-sm text-slate-500 mt-4">Arquivo selecionado: {arquivoNome}</p>}
        {processando && <p className="text-cotamed-700 text-sm mt-4">{progressoProcessamento || "Processando planilha..."}</p>}
        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      {itens.length > 0 && (
        <>
          <section className="grid min-w-0 md:grid-cols-6 gap-4 mt-6">
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Encontrados</p><h3 className="text-xl font-bold text-green-700">{resumo.encontrados}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Manual</p><h3 className="text-xl font-bold text-blue-700">{resumo.manual}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Conferir</p><h3 className="text-xl font-bold text-yellow-700">{resumo.conferir}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Não encontrados</p><h3 className="text-xl font-bold text-red-700">{resumo.naoEncontrados}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Excluídos</p><h3 className="text-xl font-bold text-slate-700">{resumo.excluidos}</h3></div>
            <div className="clean-card p-4"><p className="text-xs text-slate-500">Valor confirmado</p><h3 className="text-xl font-bold">{dinheiro(resumo.total)}</h3></div>
          </section>

          <section className="clean-card p-4 mt-6">
            <div className="flex min-w-0 flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Resultado da cotação</h2>
                <p className="text-sm text-slate-500">Exibindo {itensPaginados.length} de {itensFiltrados.length} itens filtrados. Total da licitação: {itens.length}.</p>
              </div>

              <div className="flex min-w-0 flex-col md:flex-row gap-3">
                <select className="input text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                  <option value="todos">Todos os itens</option>
                  <option value="preenchidos">Preenchidos</option>
                  <option value="manual">Selecionados manualmente</option>
                  <option value="conferir">Conferir</option>
                  <option value="nao_encontrados">Não encontrados</option>
                  <option value="com_pdf">Com PDF</option>
                  <option value="sem_pdf">Sem PDF</option>
                  <option value="excluidos">Excluídos</option>
                </select>

                <button onClick={baixarPlanilhaPreenchida} className="btn-primary text-sm">Baixar planilha</button>
                <button onClick={baixarZipRegistros} className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50 text-sm">Baixar ZIP</button>
              </div>
            </div>

            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl bg-blue-50 p-3 text-sm">
              <span>
                Página <b>{Math.min(paginaItens, totalPaginasItens)}</b> de <b>{totalPaginasItens}</b> — mostrando até {itensPorPagina} itens por vez para não travar.
              </span>

              <div className="flex min-w-0 gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 hover:bg-white disabled:opacity-50"
                  disabled={paginaItens <= 1}
                  onClick={() => setPaginaItens((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>

                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 hover:bg-white disabled:opacity-50"
                  disabled={paginaItens >= totalPaginasItens}
                  onClick={() => setPaginaItens((p) => Math.min(totalPaginasItens, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {itensPaginados.map((item) => {
                const cotar = itemPodeCotar(item);
                const statusVisivel = item.excluido ? "Excluído" : item.status;
                const preencher = !item.excluido && (item.status === "Encontrado" || item.status === "Manual" || item.status === "Conferir");

                return (
                  <div key={item.numero_item} className={item.excluido ? "licitacao-item-card opacity-70 bg-slate-50" : "licitacao-item-card"}>
                    <div className="licitacao-status-row">
                      <span className={`licitacao-status-badge ${statusClasse(statusVisivel)}`} title={statusVisivel}>
                        {statusVisivel}
                      </span>
                    </div>

                    <div className="licitacao-item-resumo">
                      <div className="w-12 shrink-0"><Campo label="Item" value={<b>{item.numero_item}</b>} /></div>

                      <div className="min-w-[280px] flex-1 licitacao-descricao-resumo">
                        <Campo label="Descrição" value={item.descricao} />
                      </div>

                      <div className="w-16"><Campo label="Qtd" value={item.quantidade} /></div>
                      <div className="w-16"><Campo label="Unid" value={item.unidade} /></div>

                      <div className="w-24">
                        <p className="text-[10px] text-slate-500">Tipo preço</p>
                        <select className="input text-[11px] h-8 py-1" value={item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade)} onChange={(e) => alterarTipoPrecoItem(item.numero_item, e.target.value as TipoPreco)}>
                          <option value="unitario">Unit.</option>
                          <option value="caixa">Caixa</option>
                        </select>
                      </div>

                      <div className="w-28"><Campo label="Marca" value={preencher ? item.marca || "-" : "-"} /></div>
                      <div className="w-28"><Campo label="Registro" value={preencher ? item.registro_anvisa || "-" : "-"} /></div>
                      <div className="w-20"><Campo label="Custo" value={preencher ? dinheiro(item.custo_usado) : "-"} /></div>
                      <div className="w-20"><Campo label="Vl.Unit" value={preencher ? dinheiro(item.valor_unitario) : "-"} /></div>
                      <div className="w-20"><Campo label="Vl.Total" value={preencher ? dinheiro(item.valor_total) : "-"} /></div>
                      <div className="w-14"><Campo label="Conf." value={`${item.confianca || 0}%`} /></div>



                      <div className="w-12"><Campo label="PDF" value={<span className={item.pdf_url && cotar ? "text-green-700" : "text-red-700"}>{item.pdf_url && cotar ? "Sim" : "Não"}</span>} /></div>

                      <div className="w-16">
                        <p className="text-[10px] text-slate-500">Ação</p>
                        <button onClick={() => alternarExcluir(item.numero_item)} className={item.excluido ? "rounded-md border px-2 py-1 text-[10px] text-green-700 hover:bg-green-50" : "rounded-md border px-2 py-1 text-[10px] text-red-700 hover:bg-red-50"}>
                          {item.excluido ? "Voltar" : "Excluir"}
                        </button>
                      </div>
                    </div>

                    {!item.excluido && (
                      <div className="licitacao-manual-panel">
                        <div className="licitacao-manual-search">
                          <label>Buscar produto</label>
                          <input
                            className="input"
                            placeholder="Digite o nome do produto, descrição ou princípio ativo..."
                            value={buscaManualPorItem[item.numero_item] || ""}
                            onChange={(e) =>
                              setBuscaManualPorItem((atual) => ({
                                ...atual,
                                [item.numero_item]: e.target.value.toUpperCase(),
                              }))
                            }
                          />

                          <select
                            className="input"
                            value={item.produto_id || ""}
                            onChange={(e) => selecionarProdutoManual(item.numero_item, e.target.value)}
                          >
                            <option value="">Menor custo</option>
                            {produtosBuscaManualMenorCusto(
                              produtosBanco,
                              buscaManualPorItem[item.numero_item] || item.descricao,
                              item.tipo_preco || resolverTipoPrecoPadrao(tipoPrecoPadrao, item.descricao, item.unidade)
                            ).map((p) => (
                              <option key={p.id} value={p.id}>{labelProduto(p)}</option>
                            ))}
                          </select>
                        </div>

                        <div className="licitacao-manual-fields">
                          <div>
                            <label>Marca</label>
                            <input
                              className="input"
                              placeholder="Marca"
                              value={item.marca || ""}
                              onChange={(e) => alterarCampoManualLivre(item.numero_item, "marca", e.target.value)}
                            />
                          </div>

                          <div>
                            <label>Registro</label>
                            <input
                              className="input"
                              placeholder="Registro"
                              value={item.registro_anvisa || ""}
                              onChange={(e) => alterarCampoManualLivre(item.numero_item, "registro_anvisa", e.target.value)}
                            />
                          </div>

                          <div>
                            <label>Custo</label>
                            <input
                              className="input"
                              placeholder="Custo"
                              type="text"
                              inputMode="decimal"
                              value={custoManualTextoPorItem[item.numero_item] ?? ""}
                              onChange={(e) => alterarCustoManualLivreTexto(item.numero_item, e.target.value)}
                            />
                          </div>

                          <div>
                            <label>Vl. Unit.</label>
                            <input className="input" value={item.valor_unitario ? dinheiro(item.valor_unitario) : "-"} readOnly />
                          </div>

                          <div>
                            <label>Vl. Total</label>
                            <input className="input" value={item.valor_total ? dinheiro(item.valor_total) : "-"} readOnly />
                          </div>

                          <div>
                            <label>Confiança</label>
                            <input className="input" value={`${item.confianca || 0}%`} readOnly />
                          </div>
                        </div>

                        <p className="licitacao-manual-help">
                          Se o produto não estiver cadastrado, preencha marca e custo manualmente. O sistema calcula a margem automaticamente.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {itensFiltrados.length === 0 && <div className="mt-6 rounded-2xl bg-blue-50 p-5 text-slate-600">Nenhum item encontrado para este filtro.</div>}
          </section>
        </>
      )}
    </AppShell>
  );
}
