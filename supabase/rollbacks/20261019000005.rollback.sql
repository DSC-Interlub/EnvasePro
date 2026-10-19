-- =============================================================================
-- ROLLBACK de 20261019000005_indicadores_recebimento
-- =============================================================================
-- Apaga indicadores_recebimento(date, date) e os índices que só esta
-- migration criou. (idx_recebimento_participantes_recebimento é da 000003 e fica.)
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.indicadores_recebimento(date, date);
DROP INDEX IF EXISTS public.idx_recebimento_ocorrencias_recebimento;
DROP INDEX IF EXISTS public.idx_checklist_recebimentos_entrega;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000005';

NOTIFY pgrst, 'reload schema';
COMMIT;
