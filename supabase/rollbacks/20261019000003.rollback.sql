-- =============================================================================
-- ROLLBACK de 20261019000003_painel_geral
-- =============================================================================
-- Apaga painel_geral() e os índices que esta migration criou.
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.painel_geral();
DROP INDEX IF EXISTS public.idx_limpeza_programacoes_data;
DROP INDEX IF EXISTS public.idx_recebimentos_status;
DROP INDEX IF EXISTS public.idx_recebimento_participantes_recebimento;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000003';

NOTIFY pgrst, 'reload schema';
COMMIT;
