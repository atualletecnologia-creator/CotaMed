ATUALIZAÇÃO DA BUSCA AUTOMÁTICA EM LICITAÇÕES

A busca foi refeita para trabalhar bem com e sem IA:

- normaliza abreviações e variações de descrição;
- extrai dosagem, volume, tamanho e outras medidas;
- converte unidades equivalentes, como 1 g = 1000 mg e 1 L = 1000 ml;
- compara nome principal, apresentação, características técnicas, marca e registro ANVISA;
- aceita descrições longas do edital quando o produto cadastrado é resumido;
- bloqueia medidas, marca, registro ou apresentação incompatíveis;
- usa IA somente entre os melhores candidatos da busca local;
- itens com boa correspondência, mas alguma ambiguidade, ficam como "Conferir";
- mantém o aprendizado das escolhas manuais feitas pelo usuário.

VALIDAÇÃO
- TypeScript: aprovado.
- Next.js: compilação e validação de tipos aprovadas.
- O build chegou à etapa de coleta de dados das páginas; essa etapa depende das variáveis do Supabase no ambiente.
