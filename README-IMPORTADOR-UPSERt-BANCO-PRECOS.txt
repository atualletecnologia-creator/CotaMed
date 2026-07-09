Correção do importador do Banco de Preços

Alteração:
- A importação por planilha não usa mais insert em lote que trava com duplicados.
- Para cada produto, o sistema verifica se já existe o mesmo produto por descrição + marca.
- Se existir, atualiza custo, registro, apresentação, unidade, PDF e data de atualização.
- Se não existir, insere como produto novo.
- Se o banco ainda retornar duplicate key, tenta atualizar o produto existente como fallback.
- No final mostra quantos produtos foram novos e quantos foram atualizados.
