-- 1) Remover duplicados atuais mantendo o mais antigo
WITH duplicados AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        UPPER(TRIM(COALESCE(descricao, ''))),
        UPPER(TRIM(COALESCE(marca, '')))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS ordem
  FROM produtos
)
DELETE FROM produtos
WHERE id IN (
  SELECT id FROM duplicados WHERE ordem > 1
);

-- 2) Criar índice único para impedir novos duplicados por descrição + marca
-- Rode só depois de remover os duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_descricao_marca_unico
ON produtos (
  UPPER(TRIM(COALESCE(descricao, ''))),
  UPPER(TRIM(COALESCE(marca, '')))
);
