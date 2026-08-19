"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type Cliente = {
  id: string;
  nome: string;
  cnpj: string | null;
  inscricao_estadual: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
};

type Produto = {
  id: string;
  descricao: string | null;
  apresentacao: string | null;
  marca: string | null;
  unidade: string | null;
  quantidade_por_caixa: number | null;
  custo_unitario: number | null;
  custo_caixa: number | null;
  registro_anvisa: string | null;
};

type DadosEmpresa = {
  nome: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  logo_base64: string | null;
};

type TipoPreco = "unidade" | "caixa";

type ItemCotacao = {
  chave: string;
  produto: Produto;
  tipo_preco: TipoPreco;
  quantidade: number;
  margem: number;
};

const clienteVazio = {
  nome: "",
  cnpj: "",
  inscricao_estadual: "",
  endereco: "",
  telefone: "",
  email: "",
};

function numero(valor: unknown) {
  const n = Number(valor || 0);
  return Number.isFinite(n) ? n : 0;
}

function arredondar4(valor: number) {
  return Math.round((valor + Number.EPSILON) * 10000) / 10000;
}

function moeda4(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function moeda2(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function custoBase(item: ItemCotacao) {
  const p = item.produto;
  if (item.tipo_preco === "caixa") {
    if (numero(p.custo_caixa) > 0) return numero(p.custo_caixa);
    if (numero(p.custo_unitario) > 0 && numero(p.quantidade_por_caixa) > 0) return arredondar4(numero(p.custo_unitario) * numero(p.quantidade_por_caixa));
    return 0;
  }
  if (numero(p.custo_unitario) > 0) return numero(p.custo_unitario);
  if (numero(p.custo_caixa) > 0 && numero(p.quantidade_por_caixa) > 0) return arredondar4(numero(p.custo_caixa) / numero(p.quantidade_por_caixa));
  return 0;
}

function precoVenda(item: ItemCotacao) {
  return arredondar4(custoBase(item) * (1 + numero(item.margem) / 100));
}

function totalItem(item: ItemCotacao) {
  return arredondar4(precoVenda(item) * numero(item.quantidade));
}

export default function CotacoesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);
  const [novoCliente, setNovoCliente] = useState(clienteVazio);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [dadosEmpresa, setDadosEmpresa] = useState<DadosEmpresa | null>(null);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [itens, setItens] = useState<ItemCotacao[]>([]);
  const [margemPadrao, setMargemPadrao] = useState(20);
  const [tipoPadrao, setTipoPadrao] = useState<TipoPreco>("unidade");
  const [prazoEntrega, setPrazoEntrega] = useState("");
  const [validadeProposta, setValidadeProposta] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    void carregarBase();
  }, []);

  useEffect(() => {
    const termo = busca.trim();
    if (!termo) {
      setResultados([]);
      setBuscando(false);
      return;
    }

    const timer = window.setTimeout(() => void pesquisarProdutos(termo), 300);
    return () => window.clearTimeout(timer);
  }, [busca]);

  async function carregarBase() {
    setErro("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Usuário não autenticado.");

      const [clientesResp, dadosResp] = await Promise.all([
        supabase.from("clientes_cotacao").select("id,nome,cnpj,inscricao_estadual,endereco,telefone,email").order("nome"),
        supabase.from("dados_empresa_cotacao").select("nome,cnpj,inscricao_estadual,endereco,telefone,email,logo_base64").eq("user_id", auth.user.id).maybeSingle(),
      ]);

      if (clientesResp.error) throw clientesResp.error;
      if (dadosResp.error) throw dadosResp.error;
      setClientes((clientesResp.data || []) as Cliente[]);
      setDadosEmpresa((dadosResp.data || null) as DadosEmpresa | null);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar a tela de cotações. Execute o SQL de instalação se esta for a primeira utilização.");
    }
  }

  async function pesquisarProdutos(termo: string) {
    const termoLimpo = termo.trim();
    if (!termoLimpo) {
      setResultados([]);
      return;
    }

    setBuscando(true);
    try {
      let query = supabase
        .from("produtos")
        .select("id,descricao,apresentacao,marca,unidade,quantidade_por_caixa,custo_unitario,custo_caixa,registro_anvisa")
        .order("descricao")
        .limit(40);

      const limpo = termoLimpo.replace(/[,%()]/g, " ").replace(/\s+/g, " ");
      if (limpo) {
        query = query.or(`descricao.ilike.%${limpo}%,marca.ilike.%${limpo}%,apresentacao.ilike.%${limpo}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setResultados((data || []) as Produto[]);
    } catch (e: any) {
      setErro(e?.message || "Erro ao buscar produtos.");
    } finally {
      setBuscando(false);
    }
  }

  async function cadastrarCliente(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoCliente(true);
    setErro("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Usuário não autenticado.");
      const { data, error } = await supabase
        .from("clientes_cotacao")
        .insert({ user_id: auth.user.id, ...novoCliente, updated_at: new Date().toISOString() })
        .select("id,nome,cnpj,inscricao_estadual,endereco,telefone,email")
        .single();
      if (error) throw error;
      const cadastrado = data as Cliente;
      setClientes((atuais) => [...atuais, cadastrado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setClienteId(cadastrado.id);
      setNovoCliente(clienteVazio);
      setNovoClienteAberto(false);
      setMensagem("Cliente cadastrado e selecionado.");
    } catch (e: any) {
      setErro(e?.message || "Não foi possível cadastrar o cliente.");
    } finally {
      setSalvandoCliente(false);
    }
  }

  function adicionarProduto(produto: Produto) {
    if (itens.some((i) => i.produto.id === produto.id)) {
      setMensagem("Este produto já foi adicionado à cotação.");
      return;
    }
    setItens((atuais) => [...atuais, {
      chave: `${produto.id}-${Date.now()}`,
      produto,
      tipo_preco: tipoPadrao,
      quantidade: 1,
      margem: margemPadrao,
    }]);
    setBusca("");
    setResultados([]);
  }

  function atualizarItem(chave: string, patch: Partial<ItemCotacao>) {
    setItens((atuais) => atuais.map((item) => item.chave === chave ? { ...item, ...patch } : item));
  }

  const cliente = useMemo(() => clientes.find((c) => c.id === clienteId) || null, [clientes, clienteId]);
  const total = useMemo(() => arredondar4(itens.reduce((soma, item) => soma + totalItem(item), 0)), [itens]);

  function gerarPdf() {
    setErro("");
    if (!dadosEmpresa?.nome) {
      setErro("Cadastre os dados da sua empresa na aba Dados antes de gerar o PDF.");
      return;
    }
    if (!cliente) {
      setErro("Selecione um cliente.");
      return;
    }
    if (!itens.length) {
      setErro("Adicione pelo menos um produto à cotação.");
      return;
    }
    window.print();
  }

  return (
    <AppShell>
      <section className="clean-page cotacoes-screen">
        <div className="clean-hero">
          <div>
            <p className="clean-kicker">Comercial</p>
            <h1>Cotações</h1>
            <p>Monte uma cotação a partir dos produtos cadastrados no Banco de Preços e gere o PDF para o cliente.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dados" className="btn-clean btn-clean-secondary">Dados da empresa</Link>
            <button type="button" className="btn-clean btn-clean-primary" onClick={gerarPdf}>Gerar PDF</button>
          </div>
        </div>

        {erro && <div className="form-error mt-4">{erro}</div>}
        {mensagem && <div className="form-success mt-4">{mensagem}</div>}

        <div className="cotacoes-grid mt-5">
          <div className="clean-card p-5">
            <div className="cotacao-section-title"><div><span>1</span><div><strong>Cliente</strong><small>Selecione ou cadastre um novo cliente</small></div></div></div>
            <div className="flex gap-2 mt-4">
              <select className="input flex-1" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Selecione o cliente...</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.cnpj ? ` — ${c.cnpj}` : ""}</option>)}
              </select>
              <button type="button" className="btn-clean btn-clean-secondary" onClick={() => setNovoClienteAberto(true)}>+ Adicionar novo</button>
            </div>
            {cliente && <div className="cliente-resumo mt-4"><strong>{cliente.nome}</strong><span>{cliente.cnpj || "CNPJ não informado"}</span><span>{cliente.endereco || "Endereço não informado"}</span><span>{[cliente.telefone, cliente.email].filter(Boolean).join(" • ")}</span></div>}
          </div>

          <div className="clean-card p-5">
            <div className="cotacao-section-title"><div><span>2</span><div><strong>Condições padrão</strong><small>Aplicadas aos novos itens adicionados</small></div></div></div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <label>Margem de lucro (%)<input className="input mt-2" type="number" step="0.01" min="0" value={margemPadrao} onChange={(e) => setMargemPadrao(numero(e.target.value))} /></label>
              <label>Cotar por<select className="input mt-2" value={tipoPadrao} onChange={(e) => setTipoPadrao(e.target.value as TipoPreco)}><option value="unidade">Unidade</option><option value="caixa">Caixa</option></select></label>
              <label>Prazo de entrega<input className="input mt-2" placeholder="Ex.: 5 dias úteis" value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} /></label>
              <label>Validade da proposta<input className="input mt-2" placeholder="Ex.: 30 dias" value={validadeProposta} onChange={(e) => setValidadeProposta(e.target.value)} /></label>
            </div>
          </div>
        </div>

        <div className="clean-card p-5 mt-5">
          <div className="cotacao-section-title"><div><span>3</span><div><strong>Adicionar produtos</strong><small>Pesquise somente entre os produtos já cadastrados no CotaMed</small></div></div></div>
          <div className="cotacao-search mt-4">
            <input className="input" placeholder="Digite o nome, marca ou apresentação do produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            <span>{buscando ? "Buscando..." : busca.trim() ? `${resultados.length} resultado(s)` : "Digite para pesquisar"}</span>
          </div>

          {busca.trim() && (
            <div className="cotacao-produtos-resultados mt-3">
              {!buscando && resultados.length === 0 && <div className="cotacao-vazio">Nenhum produto encontrado para esta pesquisa.</div>}
              {resultados.map((produto) => (
                <button type="button" key={produto.id} className="cotacao-produto-card" onClick={() => adicionarProduto(produto)}>
                  <div><strong>{produto.descricao || "Sem descrição"}</strong><span>{[produto.apresentacao, produto.marca].filter(Boolean).join(" • ") || "Sem apresentação/marca"}</span></div>
                  <div className="cotacao-produto-precos"><span>UN {moeda4(custoBase({ chave: "", produto, tipo_preco: "unidade", quantidade: 1, margem: 0 }))}</span><span>CX {moeda4(custoBase({ chave: "", produto, tipo_preco: "caixa", quantidade: 1, margem: 0 }))}</span></div>
                  <b>Adicionar</b>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="clean-card p-5 mt-5">
          <div className="cotacao-section-title"><div><span>4</span><div><strong>Itens da cotação</strong><small>Ajuste quantidade, margem e unidade de venda item a item</small></div></div><b className="cotacao-total-top">Total: {moeda2(total)}</b></div>
          <div className="overflow-x-auto mt-4">
            <table className="cotacao-itens-table">
              <thead><tr><th>Produto</th><th>Marca</th><th>Cotar por</th><th>Qtd.</th><th>Margem %</th><th>Custo</th><th>Venda</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {itens.length === 0 && <tr><td colSpan={9} className="cotacao-vazio">Nenhum item adicionado.</td></tr>}
                {itens.map((item) => (
                  <tr key={item.chave}>
                    <td><strong>{item.produto.descricao}</strong><small>{item.produto.apresentacao || ""}{item.produto.quantidade_por_caixa ? ` • ${item.produto.quantidade_por_caixa} por caixa` : ""}</small></td>
                    <td>{item.produto.marca || "-"}</td>
                    <td><select className="input compact" value={item.tipo_preco} onChange={(e) => atualizarItem(item.chave, { tipo_preco: e.target.value as TipoPreco })}><option value="unidade">Unidade</option><option value="caixa">Caixa</option></select></td>
                    <td><input className="input compact number" type="number" min="0.0001" step="0.0001" value={item.quantidade} onChange={(e) => atualizarItem(item.chave, { quantidade: numero(e.target.value) })} /></td>
                    <td><input className="input compact number" type="number" min="0" step="0.01" value={item.margem} onChange={(e) => atualizarItem(item.chave, { margem: numero(e.target.value) })} /></td>
                    <td>{moeda4(custoBase(item))}</td>
                    <td><strong>{moeda4(precoVenda(item))}</strong></td>
                    <td><strong>{moeda4(totalItem(item))}</strong></td>
                    <td><button type="button" className="cotacao-remove" onClick={() => setItens((a) => a.filter((i) => i.chave !== item.chave))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cotacao-final-actions"><strong>Total da cotação: {moeda2(total)}</strong><button type="button" className="btn-clean btn-clean-primary" onClick={gerarPdf}>Gerar / baixar PDF</button></div>
        </div>
      </section>

      {novoClienteAberto && (
        <div className="cotacao-modal-backdrop" onMouseDown={() => setNovoClienteAberto(false)}>
          <form className="cotacao-modal" onSubmit={cadastrarCliente} onMouseDown={(e) => e.stopPropagation()}>
            <div className="cotacao-modal-head"><div><h2>Novo cliente</h2><p>Cadastre os dados para usar nas próximas cotações.</p></div><button type="button" onClick={() => setNovoClienteAberto(false)}>×</button></div>
            <div className="cotamed-form-grid mt-4">
              <label>Nome / Razão social<input className="input" required value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} /></label>
              <label>CNPJ<input className="input" value={novoCliente.cnpj} onChange={(e) => setNovoCliente({ ...novoCliente, cnpj: e.target.value })} /></label>
              <label>Inscrição Estadual<input className="input" value={novoCliente.inscricao_estadual} onChange={(e) => setNovoCliente({ ...novoCliente, inscricao_estadual: e.target.value })} /></label>
              <label>Telefone<input className="input" value={novoCliente.telefone} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} /></label>
              <label className="span-2">Endereço<input className="input" value={novoCliente.endereco} onChange={(e) => setNovoCliente({ ...novoCliente, endereco: e.target.value })} /></label>
              <label className="span-2">E-mail<input className="input" type="email" value={novoCliente.email} onChange={(e) => setNovoCliente({ ...novoCliente, email: e.target.value })} /></label>
            </div>
            <div className="flex justify-end gap-2 mt-5"><button type="button" className="btn-clean btn-clean-secondary" onClick={() => setNovoClienteAberto(false)}>Cancelar</button><button className="btn-clean btn-clean-primary" disabled={salvandoCliente}>{salvandoCliente ? "Salvando..." : "Cadastrar cliente"}</button></div>
          </form>
        </div>
      )}

      <div className="cotacao-print-root">
        <div className="cotacao-pdf-header">
          <div className="cotacao-pdf-logo">{dadosEmpresa?.logo_base64 ? <img src={dadosEmpresa.logo_base64} alt="Logo" /> : <strong>{dadosEmpresa?.nome || "CotaMed"}</strong>}</div>
          <div className="cotacao-pdf-company"><h1>{dadosEmpresa?.nome || "Dados da empresa não cadastrados"}</h1><p>{dadosEmpresa?.cnpj ? `CNPJ: ${dadosEmpresa.cnpj}` : ""}{dadosEmpresa?.inscricao_estadual ? ` • IE: ${dadosEmpresa.inscricao_estadual}` : ""}</p><p>{dadosEmpresa?.endereco || ""}</p><p>{[dadosEmpresa?.telefone, dadosEmpresa?.email].filter(Boolean).join(" • ")}</p></div>
        </div>
        <div className="cotacao-pdf-title"><h2>COTAÇÃO COMERCIAL</h2><span>{new Date().toLocaleDateString("pt-BR")}</span></div>
        <div className="cotacao-pdf-cliente"><strong>CLIENTE</strong><h3>{cliente?.nome || "-"}</h3><p>{cliente?.cnpj ? `CNPJ: ${cliente.cnpj}` : ""}{cliente?.inscricao_estadual ? ` • IE: ${cliente.inscricao_estadual}` : ""}</p><p>{cliente?.endereco || ""}</p><p>{[cliente?.telefone, cliente?.email].filter(Boolean).join(" • ")}</p></div>
        {(prazoEntrega || validadeProposta) && (
          <div className="cotacao-pdf-condicoes">
            {prazoEntrega && <div><strong>Prazo de entrega:</strong><span>{prazoEntrega}</span></div>}
            {validadeProposta && <div><strong>Validade da proposta:</strong><span>{validadeProposta}</span></div>}
          </div>
        )}
        <table className="cotacao-pdf-table">
          <thead><tr><th>Item</th><th>Descrição</th><th>Marca</th><th>Qtd.</th><th>Tipo</th><th>Qtd./Cx</th><th>Valor unit.</th><th>Total</th></tr></thead>
          <tbody>{itens.map((item, index) => <tr key={item.chave}><td>{index + 1}</td><td>{item.produto.descricao}<small>{item.produto.apresentacao ? ` — ${item.produto.apresentacao}` : ""}</small></td><td>{item.produto.marca || "-"}</td><td>{item.quantidade}</td><td>{item.tipo_preco === "caixa" ? "Caixa" : (item.produto.unidade || "Unidade")}</td><td>{item.produto.quantidade_por_caixa || "-"}</td><td>{moeda4(precoVenda(item))}</td><td>{moeda4(totalItem(item))}</td></tr>)}</tbody>
        </table>
        <div className="cotacao-pdf-total"><span>VALOR TOTAL DA COTAÇÃO</span><strong>{moeda2(total)}</strong></div>
        <div className="cotacao-pdf-footer"><span>{dadosEmpresa?.nome || ""}</span><span>{[dadosEmpresa?.telefone, dadosEmpresa?.email].filter(Boolean).join(" • ")}</span></div>
      </div>
    </AppShell>
  );
}
