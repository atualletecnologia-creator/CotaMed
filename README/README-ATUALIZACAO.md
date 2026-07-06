# Atualização CotaMed — Item automático

Agora a coluna:

item

não precisa mais existir na planilha.

O sistema gera automaticamente:

1
2
3
4
5

na ordem da importação.

## Nova planilha modelo

Agora use somente:

descricao
apresentacao
marca
unidade
quantidade_por_caixa
custo_unitario
custo_caixa

## Registros ANVISA

O sistema continua vinculando automaticamente:
- registro_anvisa
- vencimento_registro
- PDF do registro

Usando:
- descricao
- apresentacao
- marca

## Lógica nova

Durante a importação:

item = index + 1

automaticamente.
