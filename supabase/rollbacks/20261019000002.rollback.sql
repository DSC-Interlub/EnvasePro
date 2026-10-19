-- =============================================================================
-- ROLLBACK de 20261019000002_painel_televisao
-- =============================================================================
-- Apaga painel_televisao() e os índices que esta migration criou.
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.painel_televisao();
DROP INDEX IF EXISTS public.idx_envase_records_data;
DROP INDEX IF EXISTS public.idx_checkout_programacoes_data;
DROP INDEX IF EXISTS public.idx_checkout_itens_programacao;
DROP INDEX IF EXISTS public.idx_empilhadeira_paradas_data;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000002';

NOTIFY pgrst, 'reload schema';
COMMIT;
