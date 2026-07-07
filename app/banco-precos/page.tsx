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

function normalizarParaMatchForte(valor: unknown) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\/\\|,.;:()[\]{}_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palavrasFortes(valor: unknown) {
  const ignorar = new Set([
    "de", "da", "do", "das", "dos", "para", "por", "com", "sem",
    "sulfato", "cloridrato", "sodico", "sodica", "base", "solucao", "solução",
    "caixa", "cx", "unidade", "un", "und", "unid", "comprimido", "comprimidos",
    "capsula", "capsulas", "ampola", "ampolas", "ml", "mg", "g"
  ]);

  return normalizarParaMatchForte(valor)
    .split(" ")
    .map((p) => p.trim())
    .filter((p) => p.length > 1)
    .filter((p) => !ignorar.has(p));
}

function marcaIgualExata(produto: Partial<Produto>, registro: RegistroAnvisa) {
  const marcaProduto = textoBusca(produto.marca);
  const marcaRegistro = textoBusca(registro.marca);

  if (!marcaProduto || !marcaRegistro) return false;

  return marcaProduto === marcaRegistro;
}

function nomeBateComSeguranca(produto: Partial<Produto>, registro: RegistroAnvisa) {
  const pProduto = palavrasFortes(produto.descricao);
  const pRegistro = palavrasFortes(registro.item);

  if (!pProduto.length || !pRegistro.length) return false;

  let iguais = 0;

  pProduto.forEach((p) => {
    if (pRegistro.includes(p)) iguais++;
  });

  const percentualProduto = iguais / pProduto.length;
  const percentualRegistro = iguais / pRegistro.length;

  return percentualProduto >= 0.80 && percentualRegistro >= 0.70;
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
  const produtoRegistro = textoBusca(produto.registro_anvisa);
  const registroNumero = textoBusca(registro.registro_anvisa);

  // Se tiver número de registro na planilha, só vincula se for exatamente igual.
  if (produtoRegistro) {
    return registroNumero && produtoRegistro === registroNumero ? 100 : 0;
  }

  // Sem número de registro, a marca precisa ser exatamente igual.
  if (!marcaIgualExata(produto, registro)) {
    return 0;
  }

  // Mesmo com marca igual, o nome precisa bater com muita segurança.
  if (!nomeBateComSeguranca(produto, registro)) {
    return 0;
  }

  return 95;
}

function encontrarRegistroAutomatico(produto: Partial<Produto>, registros: RegistroAnvisa[]) {
  const candidatos = registros
    .map((registro) => ({ registro, score: scoreRegistro(produto, registro) }))
    .filter((c) => c.score >= 95)
    .sort((a, b) => b.score - a.score);

  return candidatos[0]?.registro || null;
}

function filtrarRegistrosParaVinculo(registros: RegistroAnvisa[], busca: string) {
  const termo = textoBusca(busca);

  if (!termo) return registros.slice(0, 25);

  return registros
    .filter((registro) =>
      textoBusca([
        registro.item,
        registro.apresentacao,
        registro.marca,
        registro.registro_anvisa,
      ].filter(Boolean).join(" ")).includes(termo)
    )
    .slice(0, 25);
}

async function buscarTodosSupabase<T>(
  tabela: string,
  ordenarPor: string,
  ascendente = true
) {
  const tamanhoLote = 1000;
  let inicio = 0;
  let todos: T[] = [];

  while (true) {
    const fim = inicio + tamanhoLote - 1;

    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .order(ordenarPor, { ascending: ascendente })
      .range(inicio, fim);

    if (error) {
      throw error;
    }

    const lote = (data || []) as T[];
    todos = todos.concat(lote);

    if (lote.length < tamanhoLote) {
      break;
    }

    inicio += tamanhoLote;
  }

  return todos;
}

function labelRegistro(registro: RegistroAnvisa) {
  return [registro.item, registro.apresentacao, registro.marca, registro.registro_anvisa ? `REG ${registro.registro_anvisa}` : "", registro.vencimento_registro ? `VENC ${registro.vencimento_registro}` : ""].filter(Boolean).join(" | ");
}

export default function BancoPrecos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [registros, setRegistros] = useState<RegistroAnvisa[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroPdf, setFiltroPdf] = useState("todos");
  const [filtroMarca, setFiltroMarca] = useState("todas");
  const [paginaProdutos, setPaginaProdutos] = useState(1);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [importando, setImportando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [vinculando, setVinculando] = useState("");
  const [produtoVinculoAberto, setProdutoVinculoAberto] = useState("");
  const [menuProdutoAberto, setMenuProdutoAberto] = useState("");
  const [buscaRegistroVinculo, setBuscaRegistroVinculo] = useState("");
  const [excluindo, setExcluindo] = useState("");
  const [excluindoMassa, setExcluindoMassa] = useState(false);
  const [desvinculando, setDesvinculando] = useState("");
  const [desvinculandoMassa, setDesvinculandoMassa] = useState(false);
  const [atualizandoVinculos, setAtualizandoVinculos] = useState(false);
  const [registroMassaId, setRegistroMassaId] = useState("");
  const [produtosSelecionadosMassa, setProdutosSelecionadosMassa] = useState<Record<string, boolean>>({});
  const [aplicandoMassa, setAplicandoMassa] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [produtoNovo, setProdutoNovo] = useState<Produto | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  function atualizarCampoEdicao(campo: keyof Produto, valor: string) {
    setProdutoEditando((atual) => {
      if (!atual) return atual;

      if (campo === "quantidade_por_caixa" || campo === "custo_unitario" || campo === "custo_caixa") {
        return {
          ...atual,
          [campo]: valor === "" ? null : Number(String(valor).replace(",", ".")),
        };
      }

      return {
        ...atual,
        [campo]: valor.toUpperCase(),
      };
    });
  }

  function abrirCadastroManual() {
    setErro("");
    setMensagem("");
    setProdutoNovo({
      descricao: "",
      apresentacao: "",
      marca: "",
      registro_anvisa: "",
      vencimento_registro: "",
      unidade: "UNIDADE",
      quantidade_por_caixa: null,
      custo_unitario: null,
      custo_caixa: null,
      origem_preco: "MANUAL",
    });
  }

  function atualizarCampoNovo(campo: keyof Produto, valor: string) {
    setProdutoNovo((atual) => {
      if (!atual) return atual;

      if (campo === "quantidade_por_caixa" || campo === "custo_unitario" || campo === "custo_caixa") {
        return {
          ...atual,
          [campo]: valor === "" ? null : Number(String(valor).replace(",", ".")),
        };
      }

      return {
        ...atual,
        [campo]: valor.toUpperCase(),
      };
    });
  }

  async function salvarProdutoManual() {
    if (!produtoNovo) return;

    const descricao = String(produtoNovo.descricao || "").trim().toUpperCase();

    if (!descricao) {
      setErro("Informe a descrição do produto.");
      return;
    }

    setSalvandoNovo(true);
    setErro("");
    setMensagem("");

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        setErro("Usuário não autenticado.");
        return;
      }

      const registroVinculado = localizarRegistro(registros, {
        descricao,
        apresentacao: produtoNovo.apresentacao || "",
        marca: produtoNovo.marca || "",
        registro: produtoNovo.registro_anvisa || "",
      });

      const payload = {
        user_id: userData.user.id,
        descricao,
        apresentacao: maiusculo(produtoNovo.apresentacao || ""),
        marca: maiusculo(produtoNovo.marca || ""),
        registro_anvisa: maiusculo(registroVinculado?.registro_anvisa || produtoNovo.registro_anvisa || ""),
        vencimento_registro: registroVinculado?.vencimento_registro || produtoNovo.vencimento_registro || null,
        unidade: maiusculo(produtoNovo.unidade || "UNIDADE"),
        quantidade_por_caixa: produtoNovo.quantidade_por_caixa || null,
        custo_unitario: produtoNovo.custo_unitario || null,
        custo_caixa: produtoNovo.custo_caixa || null,
        data_atualizacao_custo: new Date().toISOString().slice(0, 10),
        origem_preco: maiusculo(produtoNovo.origem_preco || "MANUAL"),
        pdf_url: registroVinculado?.pdf_path ? publicUrl(registroVinculado.pdf_path) : null,
      };

      const error = await salvarProdutoImportadoSemDuplicar(payload);

      if (error) {
        setErro(error.message || "Erro ao cadastrar produto.");
        return;
      }

      setProdutoNovo(null);
      setMensagem("Produto cadastrado manualmente com sucesso.");
      await carregarDados();
    } finally {
      setSalvandoNovo(false);
    }
  }

  async function carregarDados() {
    setCarregando(true);
    setErro("");

    try {
      const [produtosTodos, registrosTodos] = await Promise.all([
        buscarTodosSupabase<Produto>("produtos", "descricao", true),
        buscarTodosSupabase<RegistroAnvisa>("registros_anvisa", "item", true),
      ]);

      setProdutos(produtosTodos);
      setRegistros(registrosTodos);
    } catch (e: any) {
      setErro(e.message || "Erro ao carregar dados.");
    } finally {
      setCarregando(false);
    }
  }

  const marcasDisponiveis = useMemo(() => {
    return Array.from(new Set(produtos.map((p) => String(p.marca || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const termo = textoBusca(busca);
    let lista = !termo
      ? produtos
      : produtos.filter((p) => textoBusca([p.descricao, p.apresentacao, p.marca, p.registro_anvisa, p.unidade, p.origem_preco].filter(Boolean).join(" ")).includes(termo));

    if (filtroPdf === "com_pdf") lista = lista.filter((p) => !!p.pdf_url);
    if (filtroPdf === "sem_pdf") lista = lista.filter((p) => !p.pdf_url);
    if (filtroMarca !== "todas") lista = lista.filter((p) => String(p.marca || "").trim() === filtroMarca);

    return [...lista].sort((a, b) => String(a.descricao || "").localeCompare(String(b.descricao || ""), "pt-BR"));
  }, [produtos, busca, filtroPdf, filtroMarca]);

  const produtosPorPagina = 30;

  const totalPaginasProdutos = Math.max(1, Math.ceil(produtosFiltrados.length / produtosPorPagina));

  const produtosPaginados = useMemo(() => {
    const paginaSegura = Math.min(Math.max(paginaProdutos, 1), totalPaginasProdutos);
    const inicio = (paginaSegura - 1) * produtosPorPagina;

    return produtosFiltrados.slice(inicio, inicio + produtosPorPagina);
  }, [produtosFiltrados, paginaProdutos, totalPaginasProdutos]);

  useEffect(() => {
    setPaginaProdutos(1);
  }, [busca, filtroPdf, filtroMarca, produtos.length]);

  const resumoPdf = useMemo(() => ({
    todos: produtos.length,
    comPdf: produtos.filter((p) => !!p.pdf_url).length,
    semPdf: produtos.filter((p) => !p.pdf_url).length,
  }), [produtos]);

  const totalSelecionadosMassa = useMemo(() => {
    return Object.values(produtosSelecionadosMassa).filter(Boolean).length;
  }, [produtosSelecionadosMassa]);

  async function salvarProdutoImportadoSemDuplicar(payload: any, idPlanilha?: string) {
    if (idPlanilha) {
      const { error } = await supabase
        .from("produtos")
        .update(payload)
        .eq("id", idPlanilha);

      return error;
    }

    const descricaoBusca = String(payload.descricao || "").trim().toUpperCase();
    const marcaBusca = String(payload.marca || "").trim().toUpperCase();

    // Sem ID, usa descrição + marca como chave para atualizar e não duplicar.
    if (descricaoBusca && marcaBusca) {
      const { data: existente, error: erroBusca } = await supabase
        .from("produtos")
        .select("id")
        .eq("descricao", descricaoBusca)
        .eq("marca", marcaBusca)
        .limit(1);

      if (erroBusca) return erroBusca;

      if (existente && existente.length > 0) {
        const { error } = await supabase
          .from("produtos")
          .update(payload)
          .eq("id", existente[0].id);

        return error;
      }
    }

    const { error } = await supabase
      .from("produtos")
      .insert(payload);

    return error;
  }

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

  async function desvincularRegistrosEmMassa() {
    try {
      setErro("");
      setMensagem("");

      const produtoIds = Object.entries(produtosSelecionadosMassa)
        .filter(([, marcado]) => marcado)
        .map(([produtoId]) => produtoId);

      if (!produtoIds.length) {
        setErro("Selecione pelo menos um produto para desvincular.");
        return;
      }

      const confirmar = window.confirm(
        `Desvincular registro/PDF de ${produtoIds.length} produtos selecionados?`
      );

      if (!confirmar) return;

      setDesvinculandoMassa(true);

      const { error } = await supabase
        .from("produtos")
        .update({
          registro_anvisa: null,
          vencimento_registro: null,
          pdf_url: null,
        })
        .in("id", produtoIds);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem(`${produtoIds.length} produtos desvinculados com sucesso.`);
      setProdutosSelecionadosMassa({});

      await carregarDados();
    } finally {
      setDesvinculandoMassa(false);
    }
  }

  async function desvincularRegistroProduto(produto: Produto) {
    try {
      setErro("");
      setMensagem("");

      if (!produto.id) return;

      const confirmar = window.confirm(`Desvincular registro/PDF de ${produto.descricao || "produto"}?`);

      if (!confirmar) return;

      setDesvinculando(produto.id);

      const { error } = await supabase
        .from("produtos")
        .update({
          registro_anvisa: null,
          vencimento_registro: null,
          pdf_url: null,
        })
        .eq("id", produto.id);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem("Registro/PDF desvinculado com sucesso.");
      await carregarDados();
    } finally {
      setDesvinculando("");
    }
  }

  function baixarPlanilhaProdutosCadastrados() {
    const dados = produtosFiltrados.map((produto) => ({
      id: produto.id || "",
      descricao: produto.descricao || "",
      apresentacao: produto.apresentacao || "",
      marca: produto.marca || "",
      registro_anvisa: produto.registro_anvisa || "",
      vencimento_registro: produto.vencimento_registro || "",
      unidade: produto.unidade || "",
      quantidade_por_caixa: produto.quantidade_por_caixa || "",
      custo_unitario: produto.custo_unitario || "",
      custo_caixa: produto.custo_caixa || "",
      origem_preco: produto.origem_preco || "",
      pdf_url: produto.pdf_url || "",
    }));

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Banco de Preços");
    XLSX.writeFile(wb, `banco-precos-cotamed-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function atualizarProdutosPorPlanilha(file: File | null) {
    try {
      setErro("");
      setMensagem("");

      if (!file) return;

      setImportando(true);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const primeiraAba = workbook.SheetNames[0];
      const sheet = workbook.Sheets[primeiraAba];
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const atualizacoes = linhas
        .map((linha) => {
          const normalizada: Record<string, unknown> = {};

          Object.entries(linha).forEach(([chave, valor]) => {
            normalizada[normalizarCabecalho(chave)] = valor;
          });

          return normalizada;
        })
        .filter((linha) => String(linha.id || "").trim());

      if (!atualizacoes.length) {
        setErro("Nenhum produto com ID encontrado. Baixe a planilha cadastrada pelo sistema, edite mantendo a coluna ID e envie novamente.");
        return;
      }

      let atualizados = 0;
      let erros = 0;

      for (const linha of atualizacoes) {
        const id = String(linha.id || "").trim();

        const payload = {
          descricao: maiusculo(linha.descricao),
          item: maiusculo(linha.descricao),
          apresentacao: maiusculo(linha.apresentacao) || null,
          marca: maiusculo(linha.marca) || null,
          registro_anvisa: maiusculo(linha.registro_anvisa) || null,
          vencimento_registro: String(linha.vencimento_registro || "").trim() || null,
          unidade: maiusculo(linha.unidade) || null,
          quantidade_por_caixa: numero(linha.quantidade_por_caixa),
          custo_unitario: numero(linha.custo_unitario),
          custo_caixa: numero(linha.custo_caixa),
          origem_preco: maiusculo(linha.origem_preco) || "ATUALIZAÇÃO EM MASSA",
          data_atualizacao_custo: new Date().toISOString(),
          pdf_url: String(linha.pdf_url || "").trim() || null,
        };

        const { error } = await supabase
          .from("produtos")
          .update(payload)
          .eq("id", id);

        if (error) {
          erros++;
        } else {
          atualizados++;
        }
      }

      setMensagem(`${atualizados} produtos atualizados pela planilha. ${erros} erros.`);
      await carregarDados();
    } finally {
      setImportando(false);
    }
  }

  async function salvarEdicaoProduto() {
    try {
      setErro("");
      setMensagem("");

      if (!produtoEditando?.id) return;

      setSalvandoEdicao(true);

      const payload = {
        descricao: maiusculo(produtoEditando.descricao),
        item: maiusculo(produtoEditando.descricao),
        apresentacao: maiusculo(produtoEditando.apresentacao) || null,
        marca: maiusculo(produtoEditando.marca) || null,
        registro_anvisa: maiusculo(produtoEditando.registro_anvisa) || null,
        vencimento_registro: produtoEditando.vencimento_registro || null,
        unidade: maiusculo(produtoEditando.unidade) || null,
        quantidade_por_caixa: produtoEditando.quantidade_por_caixa || null,
        custo_unitario: produtoEditando.custo_unitario || null,
        custo_caixa: produtoEditando.custo_caixa || null,
        origem_preco: maiusculo(produtoEditando.origem_preco) || "EDIÇÃO MANUAL",
        data_atualizacao_custo: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("produtos")
        .update(payload)
        .eq("id", produtoEditando.id);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem("Produto atualizado com sucesso.");
      setProdutoEditando(null);
      await carregarDados();
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirProdutosEmMassa() {
    try {
      setErro("");
      setMensagem("");

      const produtoIds = Object.entries(produtosSelecionadosMassa)
        .filter(([, marcado]) => marcado)
        .map(([produtoId]) => produtoId);

      if (!produtoIds.length) {
        setErro("Selecione pelo menos um produto para excluir.");
        return;
      }

      const confirmar = window.confirm(
        `Excluir definitivamente ${produtoIds.length} produtos selecionados do Banco de Preços?`
      );

      if (!confirmar) return;

      setExcluindoMassa(true);

      const { error } = await supabase
        .from("produtos")
        .delete()
        .in("id", produtoIds);

      if (error) {
        setErro(error.message);
        return;
      }

      setMensagem(`${produtoIds.length} produtos excluídos com sucesso.`);
      setProdutosSelecionadosMassa({});

      await carregarDados();
    } finally {
      setExcluindoMassa(false);
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
      <div className="flex min-w-0 flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Banco de Preços</h1>
          <p className="text-slate-500">Gerencie produtos, custos e registros ANVISA.</p>
        </div>

        <div className="flex min-w-0 flex-col md:flex-row gap-3">
          <button
            type="button"
            disabled={atualizandoVinculos || carregando}
            onClick={atualizarTodosVinculos}
            className="btn-clean btn-clean-secondary disabled:opacity-60"
          >
            {atualizandoVinculos ? "Atualizando..." : "Atualizar vínculos"}
          </button>

          <a href="/modelos/modelo-banco-precos-cotamed.xlsx" download className="btn-clean btn-clean-primary text-center">
            Modelo
          </a>
        </div>
      </div>

      <section className="clean-card p-6 mt-6">
        <h2 className="font-bold text-xl">Importação</h2>

        <div className="banco-manual-actions mt-5">
          <button type="button" className="btn-clean btn-clean-primary" onClick={abrirCadastroManual}>
            Cadastrar produto manualmente
          </button>
        </div>

        <div className="import-row mt-5">
          <input type="file" accept=".xlsx,.xls" className="input" onChange={(e) => importarPlanilha(e.target.files?.[0] || null)} />
          <button className="btn-clean btn-clean-secondary" disabled={importando} onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}>{importando ? "Importando..." : "Importar arquivo"}</button>
        </div>

        <div className="mt-5 rounded-2xl border bg-blue-50 p-4">
          <h3 className="font-semibold">Atualização em massa</h3>
          <p className="text-sm text-slate-600 mt-1">
            Exporte, edite e envie novamente.
          </p>

          <div className="grid min-w-0 md:grid-cols-[220px_1fr] gap-3 mt-4">
            <button
              type="button"
              className="rounded-xl border border-blue-200 px-4 py-2 text-cotamed-700 hover:bg-white"
              onClick={baixarPlanilhaProdutosCadastrados}
            >
              Exportar
            </button>

            <input
              type="file"
              accept=".xlsx,.xls"
              className="input"
              disabled={importando}
              onChange={(e) => atualizarProdutosPorPlanilha(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Use planilhas .xlsx ou .xls para importar ou atualizar produtos.</div>

        {erro && <p className="text-red-600 text-sm mt-4">{erro}</p>}
        {mensagem && <p className="text-green-700 text-sm mt-4">{mensagem}</p>}
      </section>

      <section className="banco-metric-grid">
        <div className="banco-metric-card">
          <div className="banco-metric-icon banco-metric-blue">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
          </div>
          <div><p>Produtos</p><h3>{resumoPdf.todos}</h3><span>Total de produtos cadastrados</span></div>
        </div>

        <div className="banco-metric-card">
          <div className="banco-metric-icon banco-metric-green">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-5"/></svg>
          </div>
          <div><p>Com PDF</p><h3 className="text-green-700">{resumoPdf.comPdf}</h3><span>Produtos com arquivo PDF</span></div>
        </div>

        <div className="banco-metric-card">
          <div className="banco-metric-icon banco-metric-red">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 13l5 5"/><path d="M15 13l-5 5"/></svg>
          </div>
          <div><p>Sem PDF</p><h3 className="text-red-700">{resumoPdf.semPdf}</h3><span>Produtos sem arquivo PDF</span></div>
        </div>
      </section>

      <section className="clean-card mt-6 overflow-hidden max-w-full">
        <div className="banco-control-panel">
          <div className="banco-actions-row">
            <button type="button" disabled={aplicandoMassa || produtosFiltrados.length === 0} onClick={selecionarTodosFiltradosMassa} className="banco-action-button banco-action-select">
              <span className="banco-action-icon">□</span>Selecionar todos
            </button>

            <button type="button" disabled={excluindoMassa || totalSelecionadosMassa === 0} onClick={excluirProdutosEmMassa} className="banco-action-button banco-action-danger">
              <span className="banco-action-icon">🗑</span>Excluir ({totalSelecionadosMassa})
            </button>

            <button type="button" disabled={desvinculandoMassa || totalSelecionadosMassa === 0} onClick={desvincularRegistrosEmMassa} className="banco-action-button banco-action-link">
              <span className="banco-action-icon">🔗</span>Desvincular ({totalSelecionadosMassa})
            </button>

            <button type="button" disabled={(excluindoMassa || desvinculandoMassa) || totalSelecionadosMassa === 0} onClick={limparSelecaoMassa} className="banco-action-button banco-action-link">
              <span className="banco-action-icon">🧹</span>Limpar
            </button>
          </div>

          <div className="banco-filter-grid">
            <div className="banco-filter-field banco-filter-search">
              <label>Buscar produto</label>
              <input className="input" placeholder="Digite a descrição do produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>

            <div className="banco-filter-field">
              <label>Possui PDF</label>
              <select className="input" value={filtroPdf} onChange={(e) => setFiltroPdf(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="com_pdf">Com PDF</option>
                <option value="sem_pdf">Sem PDF</option>
              </select>
            </div>

            <div className="banco-filter-field">
              <label>Marca</label>
              <select className="input" value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}>
                <option value="todas">Todas as marcas</option>
                {marcasDisponiveis.map((marca) => <option key={marca} value={marca}>{marca}</option>)}
              </select>
            </div>
          </div>

          <div className="banco-vinculo-row">
            <label>Vincular registro</label>
            <select className="input" value={registroMassaId} onChange={(e) => setRegistroMassaId(e.target.value)} disabled={aplicandoMassa}>
              <option value="">Escolha o registro</option>
              {registros.map((r) => (<option key={r.id} value={r.id}>{labelRegistro(r)}</option>))}
            </select>
            <button type="button" disabled={aplicandoMassa || !registroMassaId || totalSelecionadosMassa === 0} onClick={aplicarRegistroEmMassa} className="btn-clean btn-clean-primary banco-aplicar-button">Aplicar ({totalSelecionadosMassa})</button>
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
                Página <b>{Math.min(paginaProdutos, totalPaginasProdutos)}</b> de <b>{totalPaginasProdutos}</b>
              </span>

              <div className="flex min-w-0 gap-2">
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

          <div className="banco-table-wrap">
            <table className="banco-table clean-table w-full max-w-full text-xs">
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
                  <th className="text-left p-3">Opções</th>
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
                    <td className="p-3">{p.pdf_url ? <button onClick={() => abrirPdf(p.pdf_url)} className="text-cotamed-700 underline">Abrir PDF</button> : <span className="text-red-600">Sem PDF</span>}</td>
                    <td className="p-3">{p.quantidade_por_caixa || "-"}</td>
                    <td className="p-3">{p.custo_unitario ? dinheiro(p.custo_unitario) : "-"}</td>
                    <td className="p-3">{p.custo_caixa ? dinheiro(p.custo_caixa) : "-"}</td>
                    <td className="p-3">
                      <div className="table-actions-menu">
                        <button
                          type="button"
                          className="table-actions-button"
                          onClick={() => setMenuProdutoAberto(menuProdutoAberto === p.id ? "" : String(p.id || ""))}
                        >
                          Opções
                        </button>

                        {menuProdutoAberto === p.id && (
                          <div className="table-actions-panel">
                            <button
                              type="button"
                              onClick={() => {
                                setProdutoEditando({ ...p });
                                setMenuProdutoAberto("");
                              }}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              disabled={desvinculando === p.id}
                              onClick={() => {
                                desvincularRegistroProduto(p);
                                setMenuProdutoAberto("");
                              }}
                            >
                              Desvincular registro
                            </button>

                            <button
                              type="button"
                              disabled={vinculando === p.id}
                              onClick={() => {
                                setProdutoVinculoAberto(produtoVinculoAberto === p.id ? "" : String(p.id || ""));
                                setBuscaRegistroVinculo("");
                                setMenuProdutoAberto("");
                              }}
                            >
                              Vincular manual
                            </button>

                            <button
                              type="button"
                              disabled={vinculando === p.id}
                              onClick={() => {
                                tentarVincularAutomaticamente(p);
                                setMenuProdutoAberto("");
                              }}
                            >
                              Tentar automático
                            </button>

                            <button
                              type="button"
                              disabled={excluindo === p.id}
                              onClick={() => {
                                excluirProduto(p);
                                setMenuProdutoAberto("");
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>

                      {produtoVinculoAberto === p.id && (
                        <div className="registro-picker-wide">
                          <div className="registro-picker-header">
                            <div>
                              <strong>Vincular registro ANVISA</strong>
                              <span>Escolha o registro correto para este produto.</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setProdutoVinculoAberto("");
                                setBuscaRegistroVinculo("");
                              }}
                              aria-label="Fechar"
                            >
                              ×
                            </button>
                          </div>

                          <input
                            className="input registro-picker-search"
                            placeholder="Buscar por descrição, apresentação, marca ou registro..."
                            value={buscaRegistroVinculo}
                            onChange={(e) => setBuscaRegistroVinculo(e.target.value)}
                            autoFocus
                          />

                          <div className="registro-picker-table-head">
                            <span>Descrição</span>
                            <span>Apresentação</span>
                            <span>Marca</span>
                            <span>Registro</span>
                            <span>Vencimento</span>
                            <span>PDF</span>
                          </div>

                          <div className="registro-picker-list">
                            {filtrarRegistrosParaVinculo(registros, buscaRegistroVinculo).slice(0, 80).map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => {
                                  vincularRegistroManual(p, r.id);
                                  setProdutoVinculoAberto("");
                                  setBuscaRegistroVinculo("");
                                }}
                                className="registro-picker-item"
                                title={labelRegistro(r)}
                              >
                                <span>{r.item || "-"}</span>
                                <span>{r.apresentacao || "-"}</span>
                                <span>{r.marca || "-"}</span>
                                <span>{r.registro_anvisa || "-"}</span>
                                <span>{r.vencimento_registro || "-"}</span>
                                <span className={r.pdf_path ? "text-green-700 font-bold" : "text-red-600 font-bold"}>
                                  {r.pdf_path ? "Com PDF" : "Sem PDF"}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
      {produtoNovo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Cadastrar produto manualmente</h2>
                <p className="text-sm text-slate-500">Preencha os dados do produto. Os textos serão gravados em maiúsculo.</p>
              </div>

              <button
                type="button"
                className="rounded-lg border px-3 py-2"
                onClick={() => setProdutoNovo(null)}
              >
                Fechar
              </button>
            </div>

            <div className="grid min-w-0 md:grid-cols-3 gap-4 mt-5">
              <div className="md:col-span-2"><label className="text-sm font-medium">Descrição *</label><input className="input mt-2" value={produtoNovo.descricao || ""} onChange={(e) => atualizarCampoNovo("descricao", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Apresentação</label><input className="input mt-2" value={produtoNovo.apresentacao || ""} onChange={(e) => atualizarCampoNovo("apresentacao", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Marca</label><input className="input mt-2" value={produtoNovo.marca || ""} onChange={(e) => atualizarCampoNovo("marca", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Registro ANVISA</label><input className="input mt-2" value={produtoNovo.registro_anvisa || ""} onChange={(e) => atualizarCampoNovo("registro_anvisa", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Vencimento Registro</label><input className="input mt-2" placeholder="AAAA-MM-DD" value={produtoNovo.vencimento_registro || ""} onChange={(e) => atualizarCampoNovo("vencimento_registro", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Unidade</label><input className="input mt-2" value={produtoNovo.unidade || ""} onChange={(e) => atualizarCampoNovo("unidade", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Qtd por caixa</label><input className="input mt-2" type="number" value={produtoNovo.quantidade_por_caixa || ""} onChange={(e) => atualizarCampoNovo("quantidade_por_caixa", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Custo unitário</label><input className="input mt-2" type="number" step="0.01" value={produtoNovo.custo_unitario || ""} onChange={(e) => atualizarCampoNovo("custo_unitario", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Custo caixa</label><input className="input mt-2" type="number" step="0.01" value={produtoNovo.custo_caixa || ""} onChange={(e) => atualizarCampoNovo("custo_caixa", e.target.value)} /></div>
              <div className="md:col-span-3"><label className="text-sm font-medium">Origem do preço</label><input className="input mt-2" value={produtoNovo.origem_preco || ""} onChange={(e) => atualizarCampoNovo("origem_preco", e.target.value)} /></div>
            </div>

            <div className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-slate-600">
              Se o registro ANVISA ou marca bater com algum registro salvo, o sistema vincula o PDF automaticamente.
            </div>

            <div className="flex min-w-0 justify-end gap-3 mt-6">
              <button type="button" className="rounded-xl border px-4 py-2" onClick={() => setProdutoNovo(null)}>Cancelar</button>
              <button type="button" className="btn-clean btn-clean-primary" disabled={salvandoNovo} onClick={salvarProdutoManual}>
                {salvandoNovo ? "Salvando..." : "Cadastrar produto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {produtoEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Editar produto cadastrado</h2>
                <p className="text-sm text-slate-500">Altere os campos e salve. Os textos serão gravados em maiúsculo.</p>
              </div>

              <button
                type="button"
                className="rounded-lg border px-3 py-2"
                onClick={() => setProdutoEditando(null)}
              >
                Fechar
              </button>
            </div>

            <div className="grid min-w-0 md:grid-cols-3 gap-4 mt-5">
              <div><label className="text-sm font-medium">Descrição</label><input className="input mt-2" value={produtoEditando.descricao || ""} onChange={(e) => atualizarCampoEdicao("descricao", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Apresentação</label><input className="input mt-2" value={produtoEditando.apresentacao || ""} onChange={(e) => atualizarCampoEdicao("apresentacao", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Marca</label><input className="input mt-2" value={produtoEditando.marca || ""} onChange={(e) => atualizarCampoEdicao("marca", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Registro ANVISA</label><input className="input mt-2" value={produtoEditando.registro_anvisa || ""} onChange={(e) => atualizarCampoEdicao("registro_anvisa", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Vencimento Registro</label><input className="input mt-2" placeholder="AAAA-MM-DD" value={produtoEditando.vencimento_registro || ""} onChange={(e) => atualizarCampoEdicao("vencimento_registro", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Unidade</label><input className="input mt-2" value={produtoEditando.unidade || ""} onChange={(e) => atualizarCampoEdicao("unidade", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Qtd por caixa</label><input className="input mt-2" type="number" value={produtoEditando.quantidade_por_caixa || ""} onChange={(e) => atualizarCampoEdicao("quantidade_por_caixa", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Custo unitário</label><input className="input mt-2" type="number" step="0.01" value={produtoEditando.custo_unitario || ""} onChange={(e) => atualizarCampoEdicao("custo_unitario", e.target.value)} /></div>
              <div><label className="text-sm font-medium">Custo caixa</label><input className="input mt-2" type="number" step="0.01" value={produtoEditando.custo_caixa || ""} onChange={(e) => atualizarCampoEdicao("custo_caixa", e.target.value)} /></div>
              <div className="md:col-span-3"><label className="text-sm font-medium">Origem do preço</label><input className="input mt-2" value={produtoEditando.origem_preco || ""} onChange={(e) => atualizarCampoEdicao("origem_preco", e.target.value)} /></div>
            </div>

            <div className="flex min-w-0 justify-end gap-3 mt-6">
              <button type="button" className="rounded-xl border px-4 py-2" onClick={() => setProdutoEditando(null)}>Cancelar</button>
              <button type="button" className="btn-clean btn-clean-primary" disabled={salvandoEdicao} onClick={salvarEdicaoProduto}>
                {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  );
}
