-- CotaMed - Rascunho de Licitações por usuário
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS public.licitacoes_rascunhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arquivo_nome text,
  conteudo jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_licitacoes_rascunhos_user_id
ON public.licitacoes_rascunhos(user_id);

ALTER TABLE public.licitacoes_rascunhos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário gerencia próprio rascunho de licitação" ON public.licitacoes_rascunhos;

CREATE POLICY "Usuário gerencia próprio rascunho de licitação"
ON public.licitacoes_rascunhos
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Limpar rascunhos antigos, se quiser executar manualmente:
-- DELETE FROM public.licitacoes_rascunhos WHERE updated_at < now() - interval '24 hours';
