-- Conferir duplicados por nome + marca + preço/custo
SELECT
  UPPER(TRIM(COALESCE(descricao, ''))) AS nome,
  UPPER(TRIM(COALESCE(marca, ''))) AS marca,
  COALESCE(custo_unitario, 0) AS custo_unitario,
  COALESCE(custo_caixa, 0) AS custo_caixa,
  COUNT(*) AS total
FROM produtos
GROUP BY
  UPPER(TRIM(COALESCE(descricao, ''))),
  UPPER(TRIM(COALESCE(marca, ''))),
  COALESCE(custo_unitario, 0),
  COALESCE(custo_caixa, 0)
HAVING COUNT(*) > 1
ORDER BY total DESC;

-- Apagar duplicados mantendo o mais antigo
WITH duplicados AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        UPPER(TRIM(COALESCE(descricao, ''))),
        UPPER(TRIM(COALESCE(marca, ''))),
        COALESCE(custo_unitario, 0),
        COALESCE(custo_caixa, 0)
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS ordem
  FROM produtos
)
DELETE FROM produtos
WHERE id IN (
  SELECT id FROM duplicados WHERE ordem > 1
);

SELECT COUNT(*) FROM produtos;
