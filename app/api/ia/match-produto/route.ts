import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { indice: null, confianca: 0, motivo: "OPENROUTER_API_KEY não configurada." },
        { status: 200 }
      );
    }

    const body = await req.json();

    const descricao = body.descricao;
    const produtos = body.produtos || [];

    if (!descricao || !produtos.length) {
      return NextResponse.json({ indice: null, confianca: 0, motivo: "Dados insuficientes." });
    }

    const prompt = `
Compare a descrição da licitação com os produtos do banco.
Escolha apenas se houver correspondência real de princípio ativo/produto, dosagem e apresentação.

Descrição:
${descricao}

Produtos:
${produtos
  .map(
    (p: any, index: number) =>
      `${index + 1}. ${p.descricao || ""} | ${p.apresentacao || ""} | ${p.marca || ""}`
  )
  .join("\n")}

Responda somente JSON:
{"indice": número ou null, "confianca": número 0-100, "motivo": "curto"}
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://cota-med.vercel.app",
        "X-Title": "CotaMed"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "{}";

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { indice: null, confianca: 0, motivo: "IA respondeu fora do formato esperado." };
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    const mensagem =
      error?.name === "AbortError"
        ? "Tempo limite da IA excedido."
        : error?.message || "Erro na IA.";

    return NextResponse.json({ indice: null, confianca: 0, motivo: mensagem });
  } finally {
    clearTimeout(timeout);
  }
}
