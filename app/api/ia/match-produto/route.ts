import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY não configurada." },
        { status: 400 }
      );
    }

    const body = await req.json();

    const descricao = body.descricao;
    const produtos = body.produtos || [];

    const prompt = `
Você é um assistente para cotação de licitações hospitalares.

Compare a descrição da licitação com a lista de produtos do banco.

Descrição da licitação:
${descricao}

Produtos disponíveis:
${produtos
  .map(
    (p: any, index: number) =>
      `${index + 1}. ${p.descricao || ""} | apresentação: ${p.apresentacao || ""} | marca: ${p.marca || ""}`
  )
  .join("\n")}

Responda somente JSON válido:
{
  "indice": número do melhor produto começando em 1 ou null,
  "confianca": número de 0 a 100,
  "motivo": "texto curto"
}
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "CotaMed"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
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
    return NextResponse.json(
      { error: error?.message || "Erro na IA." },
      { status: 500 }
    );
  }
}
