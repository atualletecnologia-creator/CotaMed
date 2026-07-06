Licitações - preenchimento manual livre

Arquivo alterado:
app/licitacoes/page.tsx

Novo recurso:
- Em cada item da licitação, além de buscar produto cadastrado, agora dá para preencher:
  - Marca manual
  - Registro ANVISA manual
  - Custo manual
- Quando informar o custo, o sistema calcula automaticamente:
  - valor unitário com a margem configurada
  - valor total conforme quantidade
- O item fica com status Manual e entra na planilha final.
