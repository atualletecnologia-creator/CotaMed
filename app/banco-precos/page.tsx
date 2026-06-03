"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import { abrirPdfRegistro } from "@/lib/storagePdf";

type Produto = {
  id?: string;
  descricao?: string | null;
  apresentacao?: string | null;
  marca?: string | null;
  registro_anvisa?: string | null;
  vencimento_registro?: string | null;
  unidade?: string | null;
  quantidade_por_caixa?: number | null;
  custo_unitario?: number | null;
  custo_caixa?: number | null;
  data_atualizacao_custo?: string | null;
  origem_preco?: string | null;
  pdf_url?: string | null;
};

type RegistroAnvisa = {
  id: string;
  item: string | null;
  apresentacao: string | null;
  marca: string | null;
  registro_anvisa: string | null;
  vencimento_registro: string | null;
  pdf_path: string | null;
};

const colunasModelo = ["descricao", "apresentacao", "marca", "unidade", "quantidade_por_caixa", "custo_unitario", "custo_caixa"];

function maiusculo(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

function normalizarCabecalho(valor: unknown) {
  return String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

function normalizarTexto(valor: unknown) {
  return String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function textoBusca(valor: unknown) {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, "");
}

function tokens(valor: unknown) {
  return normalizarTexto(valor)
    .split(" ")
    .filter((p) => p.length > 1)
    .filter((p) => !["de", "da", "do", "das", "dos", "para", "por", "com", "sem", "sulfato", "cloridrato", "sodico", "base", "solucao", "solução"].includes(p));
}

function numero(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return valor;
  const texto = String(valor).replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function dinheiro(valor?: number | null) {
  if (valor === null || valor === undefined) return "-";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function scoreRegistro(produto: Partial<Produto>, registro: RegistroAnvisa) {
  let score = 0;
  const produtoRegistro = textoBusca(produto.registro_anvisa);
  const registroNumero = textoBusca(registro.registro_anvisa);
  if (produtoRegistro && registroNumero && produtoRegistro === registroNumero) score += 100;

  const descProduto = normalizarTexto(produto.descricao);
  const descRegistro = normalizarTexto(registro.item);
  const marcaProduto = textoBusca(produto.marca);
  const marcaRegistro = textoBusca(registro.marca);
  const apresentacaoProduto = textoBusca(produto.apresentacao);
  const apresentacaoRegistro = textoBusca(registro.apresentacao);

  if (marcaProduto && marcaRegistro && marcaProduto === marcaRegistro) score += 25;
  if (apresentacaoProduto && apresentacaoRegistro && apresentacaoProduto === apresentacaoRegistro) score += 20;

  if (descProduto && descRegistro) {
    if (descProduto === descRegistro) score += 50;
    if (descProduto.includes(descRegistro) || descRegistro.includes(descProduto)) score += 30;
    const tProduto = tokens(descProduto);
    const tRegistro = tokens(descRegistro);
    let iguais = 0;
    tProduto.forEach((t) => {
      if (tRegistro.includes(t) || tRegistro.some((r) => r.includes(t) || t.includes(r))) iguais++;
    });
    if (tProduto.length) score += Math.round((iguais / tProduto.length) * 40);
  }

  return score;
}

function encontrarRegistroAutomatico(produto: Partial<Produto>, registros: RegistroAnvisa[]) {
  const candidatos = registros
    .map((registro) => ({ registro, score: scoreRegistro(produto, registro) }))
    .filter((c) => c.score >= 45)
    .sort((a, b) => b.score - a.score);
  return candidatos[0]?.registro || null;
}

function filtrarRegistrosParaVinculo(registros: RegistroAnvisa[], busca: string) {
  const termo = textoBusca(busca);

  if (!termo) return registros.slice(0, 25);

  return registros
    .filter((r) => textoBusca([r.item, r.apresentacao, r.marca, r.registro_anvisa].filter(Boolean).join(" ")).includes(termo))
    .slice(0, 25);
}

function labelRegistro(registro: RegistroAnvisa) {
  return [registro.item, registro.apresentacao, registro.marca, registro.registro_anvisa ? `REG ${registro.registro_anvisa}` : "", registro.vencimento_registro ? `VENC ${registro.vencimento_registro}` : ""].filter(Boolean).join(" | ");
}

export default function BancoPrecos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [registros, setRegistros] = useState<RegistroAnvisa[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroPdf, setFiltroPdf] = useState("todos");
  const [paginaProdutos, setPaginaProdutos] = useState(1);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [importando, setImportando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [vinculando, setVinculando] = useState("");
  const [produtoVinculoAberto, setProdutoVinculoAberto] = useState("");
  const [buscaRegistroVinculo, setBuscaRegistroVinculo] = useState("");
  const [excluindo, setExcluindo] = useState("");
  const [atualizandoVinculos, setAtualizandoVinculos] = useState(false);
  const [registroMassaId, setRegistroMassaId] = useState("");
  const [produtosSelecionadosMassa, setProdutosSelecionadosMassa] = useState<Record<string, boolean>>({});
  const [aplicandoMassa, setAplicandoMassa] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    setErro("");

    const [produtosResp, registrosResp] = await Promise.all([
      supabase.from("produtos").select("*").order("descricao", { ascending: true }),
      supabase.from("registros_anvisa").select("*").order("item", { ascending: true }),
    ]);

    if (produtosResp.error) {
      setErro(produtosResp.error.message);
      setCarregando(false);
      return;
    }

    if (registrosResp.error) {
      setErro(registrosResp.error.message);
      setCarregando(false);
      return;
    }

    setProdutos(produtosResp.data || []);
    setRegistros(registrosResp.data || []);
    setCarregando(false);
  }

  const produtosFiltrados = useMemo(() => {
    const termo = textoBusca(busca);
    let lista = !termo
      ? produtos
      : produtos.filter((p) => textoBusca([p.descricao, p.apresentacao, p.marca, p.registro_anvisa, p.unidade, p.origem_preco].filter(Boolean).join(" ")).includes(termo));

    if (filtroPdf === "com_pdf") lista = lista.filter((p) => !!p.pdf_url);
    if (filtroPdf === "sem_pdf") lista = lista.filter((p) => !p.pdf_url);

    return [...lista].sort((a, b) => String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR"));
  }, [produtos, busca, filtroPdf]);

  const produtosPorPagina = 30;

  const totalPaginasProdutos = Math.max(1, Math.ceil(produtosFiltrados.length / produtosPorPagina));

  const produtosPaginados = useMemo(() => {
    const paginaSegura = Math.min(Math.max(paginaProdutos, 1), totalPaginasProdutos);
    const inicio = (paginaSegura - 1) * produtosPorPagina;

    return produtosFiltrados.slice(inicio, inicio + produtosPorPagina);
  }, [produtosFiltrados, paginaProdutos, totalPaginasProdutos]);

  useEffect(() => {
    setPaginaProdutos(1);
  }, [busca, filtroPdf, produtos.length]);

  const resumoPdf = useMemo(() => ({
    todos: produtos.length,
    comPdf: produtos.filter((p) => !!p.pdf_url).length,
    semPdf: produtos.filter((p) => !p.pdf_url).length,
  }), [produtos]);

  const totalSelecionadosMassa = useMemo(() => {
    return Object.values(produtosSelecionadosMassa).filter(Boolean).length;
  }, [produtosSelecionadosMassa]);

  async function importarPlanilha(file: File | null) {
    try {
      setErro("");
      setMensagem("");
      if (!file) return;

      setImportando(true);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setErro("Usuário não autenticado.");
        return;
      }

      const { data: registrosAtualizados, error: registrosError } = await supabase.from("registros_anvisa").select("*").order("created_at", { ascending: false });
      if (registrosError) {
        setErro(registrosError.message);
        return;
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const primeiraAba = workbook.SheetNames[0];
      const sheet = workbook.Sheets[primeiraAba];
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const linhasOrdenadas = linhas
        .map((linha) => {
          const normalizada: Record<string, unknown> = {};
          Object.entries(linha).forEach(([chave, valor]) => {
            normalizada[normalizarCabecalho(chave)] = valor;
          });
          return normalizada;
        })
        .filter((linha) => String(linha.descricao || "").trim())
        .sort((a, b) => String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR"));

      if (!linhasOrdenadas.length) {
        setErro("Nenhum produto válido encontrado. Verifique se existe a coluna descricao.");
        return;
      }

      let vinculados = 0;
      let semRegistro = 0;

      const produtosParaSalvar = linhasOrdenadas.map((normalizada) => {
        const descricao = maiusculo(normalizada.descricao);
        const quantidadePorCaixa = numero(normalizada.quantidade_por_caixa);
        let custoUnitario = numero(normalizada.custo_unitario);
        let custoCaixa = numero(normalizada.custo_caixa);

        if ((!custoUnitario || custoUnitario <= 0) && custoCaixa && quantidadePorCaixa) custoUnitario = custoCaixa / quantidadePorCaixa;
        if ((!custoCaixa || custoCaixa <= 0) && custoUnitario && quantidadePorCaixa) custoCaixa = custoUnitario * quantidadePorCaixa;

        const produtoBase: Partial<Produto> = {
          descricao,
          apresentacao: maiusculo(normalizada.apresentacao) || null,
          marca: maiusculo(normalizada.marca) || null,
          registro_anvisa: maiusculo(normalizada.registro_anvisa) || null,
        };

        const registroEncontrado = encontrarRegistroAutomatico(produtoBase, registrosAtualizados || []);
        if (registroEncontrado) vinculados++;
        else semRegistro++;

        return {
          user_id: userData.user.id,
          item: descricao,
          descricao,
          apresentacao: produtoBase.apresentacao,
          marca: produtoBase.marca,
          registro_anvisa: registroEncontrado?.registro_anvisa ? maiusculo(registroEncontrado.registro_anvisa) : produtoBase.registro_anvisa || null,
          vencimento_registro: registroEncontrado?.vencimento_registro || null,
          pdf_url: registroEncontrado?.pdf_path || null,
          unidade: maiusculo(normalizada.unidade) || null,
          quantidade_por_caixa: quantidadePorCaixa,
          custo_unitario: custoUnitario,
          custo_caixa: custoCaixa,
          data_atualizacao_custo: new Date().toISOString(),
          origem_preco: maiusculo(file.name),
        };
      });

      const { error } = await supabase.from("produtos").insert(produtosParaSalvar);
      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem(`${produtosParaSalvar.length} produtos importados. ${vinculados} vinculados automaticamente ao registro ANVISA. ${semRegistro} sem vínculo automático.`);
      await carregarDados();
    } finally {
      setImportando(false);
    }
  }

  async function vincularRegistroManual(produto: Produto, registroId: string) {
    try {
      setErro("");
      setMensagem("");
      if (!produto.id || !registroId) return;

      const registro = registros.find((r) => r.id === registroId);
      if (!registro) {
        setErro("Registro ANVISA não encontrado.");
        return;
      }

      setVinculando(produto.id);

      const { error } = await supabase.from("produtos").update({
        registro_anvisa: registro.registro_anvisa ? maiusculo(registro.registro_anvisa) : null,
        vencimento_registro: registro.vencimento_registro,
        pdf_url: registro.pdf_path,
      }).eq("id", produto.id);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem("Registro vinculado ao produto com sucesso.");
      await carregarDados();
    } finally {
      setVinculando("");
    }
  }

  async function tentarVincularAutomaticamente(produto: Produto) {
    const registro = encontrarRegistroAutomatico(produto, registros);
    if (!registro) {
      setErro("Nenhum registro compatível encontrado automaticamente. Selecione manualmente na lista.");
      return;
    }
    await vincularRegistroManual(produto, registro.id);
  }

  function alternarProdutoMassa(produtoId: string | undefined, marcado: boolean) {
    if (!produtoId) return;

    setProdutosSelecionadosMassa((atual) => ({
      ...atual,
      [produtoId]: marcado,
    }));
  }

  function selecionarTodosFiltradosMassa() {
    const novos: Record<string, boolean> = {};

    produtosPaginados.forEach((produto) => {
      if (produto.id) novos[produto.id] = true;
    });

    setProdutosSelecionadosMassa(novos);
    setMensagem(`${Object.keys(novos).length} produtos da página atual selecionados para vínculo em massa.`);
  }

  function limparSelecaoMassa() {
    setProdutosSelecionadosMassa({});
    setRegistroMassaId("");
    setMensagem("Seleção de vínculo em massa limpa.");
  }

  async function aplicarRegistroEmMassa() {
    try {
      setErro("");
      setMensagem("");

      const produtoIds = Object.entries(produtosSelecionadosMassa)
        .filter(([, marcado]) => marcado)
        .map(([produtoId]) => produtoId);

      if (!registroMassaId) {
        setErro("Selecione o registro ANVISA que será aplicado em massa.");
        return;
      }

      if (!produtoIds.length) {
        setErro("Selecione pelo menos um produto para receber o registro.");
        return;
      }

      const registro = registros.find((r) => r.id === registroMassaId);

      if (!registro) {
        setErro("Registro ANVISA não encontrado.");
        return;
      }

      const confirmar = window.confirm(
        `Vincular o registro ${registro.registro_anvisa || ""} a ${produtoIds.length} produtos selecionados?`
      );

      if (!confirmar) return;

      setAplicandoMassa(true);

      const { error } = await supabase
        .from("produtos")
        .update({
          registro_anvisa: registro.registro_anvisa ? maiusculo(registro.registro_anvisa) : null,
          vencimento_registro: registro.vencimento_registro,
          pdf_url: registro.pdf_path,
        })
        .in("id", produtoIds);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem(`${produtoIds.length} produtos vinculados ao registro selecionado.`);
      setProdutosSelecionadosMassa({});
      setRegistroMassaId("");

      await carregarDados();
    } finally {
      setAplicandoMassa(false);
    }
  }

  async function atualizarTodosVinculos() {
    try {
      setErro("");
      setMensagem("");

      const confirmar = window.confirm(
        "Atualizar vínculos somente dos produtos que ainda estão sem registro/PDF? Produtos já vinculados serão mantidos."
      );

      if (!confirmar) return;

      setAtualizandoVinculos(true);

      let vinculados = 0;
      let semVinculoSeguro = 0;
      let mantidos = 0;
      let erros = 0;

      for (const produto of produtos) {
        if (!produto.id) continue;

        if (produto.registro_anvisa || produto.pdf_url) {
          mantidos++;
          continue;
        }

        const registro = encontrarRegistroAutomatico(produto, registros);

        if (!registro) {
          semVinculoSeguro++;
          continue;
        }

        const { error } = await supabase
          .from("produtos")
          .update({
            registro_anvisa: registro.registro_anvisa ? maiusculo(registro.registro_anvisa) : null,
            vencimento_registro: registro.vencimento_registro,
            pdf_url: registro.pdf_path,
          })
          .eq("id", produto.id);

        if (error) {
          erros++;
          continue;
        }

        vinculados++;
      }

      setMensagem(
        `Vínculos atualizados. ${vinculados} novos vínculos aplicados. ${mantidos} produtos já vinculados foram mantidos. ${semVinculoSeguro} ficaram sem vínculo seguro. ${erros} erros.`
      );

      await carregarDados();
    } finally {
      setAtualizandoVinculos(false);
    }
  }

  async function excluirProduto(produto: Produto) {
    try {
      setErro("");
      setMensagem("");
      if (!produto.id) return;

      const confirmar = window.confirm(`Excluir o produto ${produto.descricao || ""}?`);
      if (!confirmar) return;

      setExcluindo(produto.id);
      const { error } = await supabase.from("produtos").delete().eq("id", produto.id);
      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem("Produto excluído com sucesso.");
      await carregarDados();
    } finally {
      setExcluindo("");
    }
  }

  async function abrirPdf(path?: string | null) {
    try {
      await abrirPdfRegistro(path);
    } catch (e: any) {
      setErro(e.message || "Não foi possível abrir o PDF.");
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Banco de Preços</h1>
          <p className="text-slate-500">Banco de produtos com vínculo automático ou manual dos registros ANVISA.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <button
            type="button"
            disabled={atualizandoVinculos || carregando}
            onClick={atualizarTodosVinculos}
            className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-50 disabled:opacity-60"
          >
            {atualizandoVinculos ? "Atualizando..." : "Atualizar vínculos pendentes"}
          </button>

          <a href="/modelos/modelo-banco-precos-cotamed.xlsx" download className="btn-primary text-center">
            Baixar planilha modelo
          </a>
        </div>
      </div>

      <section className="card p-6 mt-6">
        <h2 className="font-bold text-xl">Importar planilha de preços</h2>

        <div className="grid md:grid-cols-[1fr_180px] gap-4 mt-5">
          <input type="file" accept=".xlsx,.xls" className="input" onChange={(e) => importarPlanilha(e.target.files?.[0] || null)} />
          <button className="btn-primary" disabled={importando} onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}>{importando ? "Importando..." : "Selecionar arquivo"}</button>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4 mt-5 text-sm text-slate-700"><b>Colunas da planilha:</b><br />{colunasModelo.join(", ")}<br /><br />Tudo que for cadastrado fica em <b>letra maiúscula</b>. Para vincular muitos produtos manualmente, escolha um registro no bloco <b>Vincular um registro a vários produtos</b>, marque os produtos na tabela e clique em <b>Aplicar</b>.</div>

        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      <section className="grid md:grid-cols-3 gap-4 mt-6">
        <div className="card p-5"><p className="text-sm text-slate-500">Total de produtos</p><h3 className="text-2xl font-bold">{resumoPdf.todos}</h3></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Com PDF</p><h3 className="text-2xl font-bold text-green-700">{resumoPdf.comPdf}</h3></div>
        <div className="card p-5"><p className="text-sm text-slate-500">Sem PDF</p><h3 className="text-2xl font-bold text-red-700">{resumoPdf.semPdf}</h3></div>
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h2 className="font-bold text-xl">Produtos cadastrados</h2>
              <p className="text-sm text-slate-500">Total filtrado: {produtosFiltrados.length} — exibindo {produtosPaginados.length} por página</p>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <select className="input md:w-48" value={filtroPdf} onChange={(e) => setFiltroPdf(e.target.value)}>
                <option value="todos">Todos os produtos</option>
                <option value="com_pdf">Somente com PDF</option>
                <option value="sem_pdf">Somente sem PDF</option>
              </select>
              <input className="input md:w-96 uppercase" placeholder="Buscar por descrição, marca, registro, apresentação..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>

            <div className="rounded-2xl border bg-blue-50 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Vincular um registro a vários produtos
              </p>

              <div className="grid md:grid-cols-[1fr_160px_160px_160px] gap-3">
                <select
                  className="input text-sm"
                  value={registroMassaId}
                  onChange={(e) => setRegistroMassaId(e.target.value)}
                  disabled={aplicandoMassa}
                >
                  <option value="">Escolha o registro ANVISA...</option>
                  {registros.map((r) => (
                    <option key={r.id} value={r.id}>{labelRegistro(r)}</option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={aplicandoMassa || produtosFiltrados.length === 0}
                  onClick={selecionarTodosFiltradosMassa}
                  className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-blue-100 disabled:opacity-60"
                >
                  Selecionar página
                </button>

                <button
                  type="button"
                  disabled={aplicandoMassa || !registroMassaId || totalSelecionadosMassa === 0}
                  onClick={aplicarRegistroEmMassa}
                  className="rounded-xl bg-cotamed-700 px-4 py-2 text-white hover:bg-cotamed-800 disabled:opacity-60"
                >
                  {aplicandoMassa ? "Aplicando..." : `Aplicar (${totalSelecionadosMassa})`}
                </button>

                <button
                  type="button"
                  disabled={aplicandoMassa || (!registroMassaId && totalSelecionadosMassa === 0)}
                  onClick={limparSelecaoMassa}
                  className="rounded-xl border px-4 py-2 text-slate-700 hover:bg-white disabled:opacity-60"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="p-6 text-slate-500">Carregando produtos...</div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="p-6 text-slate-500">Nenhum produto encontrado.</div>
        ) : (
          <>
            <div className="m-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-2xl bg-blue-50 p-3 text-sm">
              <span>
                Página <b>{Math.min(paginaProdutos, totalPaginasProdutos)}</b> de <b>{totalPaginasProdutos}</b> — mostrando até {produtosPorPagina} produtos por vez para não travar.
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 hover:bg-white disabled:opacity-50"
                  disabled={paginaProdutos <= 1}
                  onClick={() => setPaginaProdutos((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>

                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 hover:bg-white disabled:opacity-50"
                  disabled={paginaProdutos >= totalPaginasProdutos}
                  onClick={() => setPaginaProdutos((p) => Math.min(totalPaginasProdutos, p + 1))}
                >
                  Próxima
                </button>
              </div>
            </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-blue-50 text-slate-600">
                <tr>
                  <th className="text-left p-3">Sel.</th>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-left p-3">Apresentação</th>
                  <th className="text-left p-3">Marca</th>
                  <th className="text-left p-3">Registro ANVISA</th>
                  <th className="text-left p-3">Vencimento</th>
                  <th className="text-left p-3">PDF</th>
                  <th className="text-left p-3">Qtd/Caixa</th>
                  <th className="text-left p-3">Custo Unit.</th>
                  <th className="text-left p-3">Custo Caixa</th>
                  <th className="text-left p-3 min-w-[260px]">Vincular registro</th>
                  <th className="text-left p-3">Excluir</th>
                </tr>
              </thead>

              <tbody>
                {produtosPaginados.map((p, index) => (
                  <tr key={p.id || index} className="border-t align-top">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        disabled={!p.id || aplicandoMassa}
                        checked={p.id ? !!produtosSelecionadosMassa[p.id] : false}
                        onChange={(e) => alternarProdutoMassa(p.id, e.target.checked)}
                      />
                    </td>
                    <td className="p-3 font-medium">{p.descricao || "-"}</td>
                    <td className="p-3">{p.apresentacao || "-"}</td>
                    <td className="p-3">{p.marca || "-"}</td>
                    <td className="p-3">{p.registro_anvisa || "Não vinculado"}</td>
                    <td className="p-3">{p.vencimento_registro || "-"}</td>
                    <td className="p-3">{p.pdf_url ? <button onClick={() => abrirPdf(p.pdf_url)} className="text-cotamed-700 underline">Abrir PDF</button> : <span className="text-red-600 font-medium">Sem PDF</span>}</td>
                    <td className="p-3">{p.quantidade_por_caixa || "-"}</td>
                    <td className="p-3">{dinheiro(p.custo_unitario)}</td>
                    <td className="p-3">{dinheiro(p.custo_caixa)}</td>
                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-blue-200 px-3 py-2 text-cotamed-700 hover:bg-blue-50 disabled:opacity-60"
                          disabled={vinculando === p.id}
                          onClick={() => {
                            setProdutoVinculoAberto(produtoVinculoAberto === p.id ? "" : String(p.id || ""));
                            setBuscaRegistroVinculo("");
                          }}
                        >
                          {produtoVinculoAberto === p.id ? "Fechar vínculos" : "Vincular manual"}
                        </button>

                        <button className="rounded-lg border border-blue-200 px-3 py-2 text-cotamed-700 hover:bg-blue-50 disabled:opacity-60" disabled={vinculando === p.id} onClick={() => tentarVincularAutomaticamente(p)}>{vinculando === p.id ? "Vinculando..." : "Tentar automático"}</button>

                        {produtoVinculoAberto === p.id && (
                          <div className="rounded-xl border bg-blue-50 p-3">
                            <input
                              className="input text-xs"
                              placeholder="Buscar registro..."
                              value={buscaRegistroVinculo}
                              onChange={(e) => setBuscaRegistroVinculo(e.target.value)}
                              autoFocus
                            />

                            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                              {filtrarRegistrosParaVinculo(registros, buscaRegistroVinculo).map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => {
                                    vincularRegistroManual(p, r.id);
                                    setProdutoVinculoAberto("");
                                    setBuscaRegistroVinculo("");
                                  }}
                                  className="block w-full rounded-lg bg-white px-3 py-2 text-left text-[11px] hover:bg-blue-100"
                                >
                                  {labelRegistro(r)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3"><button disabled={excluindo === p.id} onClick={() => excluirProduto(p)} className="rounded-lg border px-3 py-2 text-red-700 hover:bg-red-50 disabled:opacity-60">{excluindo === p.id ? "Excluindo..." : "Excluir"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
