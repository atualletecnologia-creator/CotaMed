Otimização pesada contra travamento

Alterações:
- Licitações:
  - Processamento da planilha em lotes de 25 itens, liberando a interface.
  - Indicador de progresso durante cotação.
  - Busca de candidatos reduzida para evitar congelamento com 500+ itens.
  - Mantém paginação visual.

- Banco de Preços:
  - Remove select gigante de registros em cada linha.
  - Agora o vínculo manual abre somente no produto clicado.
  - Busca de registro mostra no máximo 25 resultados.
  - Página visual reduzida para 30 produtos por vez.

Essas mudanças atacam a causa principal dos travamentos: renderização e processamento de milhares de opções ao mesmo tempo.
