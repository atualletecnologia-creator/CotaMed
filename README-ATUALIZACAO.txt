Correção Dashboard — atualização real dos indicadores

Substitua:

app/dashboard/page.tsx

Agora o dashboard busca:
- total de produtos na tabela produtos
- preços desatualizados pela coluna data_atualizacao_custo
- registros vencidos comparando produtos e registros_anvisa
- PDFs disponíveis comparando produtos.pdf_url e registros_anvisa.pdf_path

Também foi adicionado botão Atualizar dados.
