-- =============================================================================
-- ROLLBACK de 20261019000007_status_completo_so_admin
-- =============================================================================
-- Tira os três gatilhos e a função protect_status_completo(). ATENÇÃO: isso
-- REABRE o buraco (operador volta a conseguir marcar 'Completo' sem o líder).
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_empilha_linhas_status_completo ON public.empilha_linhas;
DROP TRIGGER IF EXISTS trg_limpeza_prog_status_completo ON public.limpeza_programacoes;
DROP TRIGGER IF EXISTS trg_recebimentos_status_completo ON public.recebimentos;
DROP FUNCTION IF EXISTS public.protect_status_completo();

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000007';

NOTIFY pgrst, 'reload schema';
COMMIT;
