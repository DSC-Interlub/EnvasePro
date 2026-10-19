-- =============================================================================
-- ROLLBACK de 20261019000004_indicadores_empilhadeira
-- =============================================================================
-- Apaga indicadores_empilhadeira(date, date). Os dois índices que ela declara
-- (idx_empilha_ocorrencias_data, idx_empilhadeira_paradas_data) foram criados
-- antes, pela 000001 e pela 000002, e ficam.
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.indicadores_empilhadeira(date, date);

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000004';

NOTIFY pgrst, 'reload schema';
COMMIT;
