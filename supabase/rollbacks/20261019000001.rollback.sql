-- =============================================================================
-- ROLLBACK de 20261019000001_painel_televisao_empilha
-- =============================================================================
-- Apaga painel_televisao_empilha() e os índices que esta migration criou.
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.painel_televisao_empilha();
DROP INDEX IF EXISTS public.idx_empilha_programacoes_data;
DROP INDEX IF EXISTS public.idx_empilha_linhas_programacao;
DROP INDEX IF EXISTS public.idx_empilha_ocorrencias_data;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000001';

NOTIFY pgrst, 'reload schema';
COMMIT;
