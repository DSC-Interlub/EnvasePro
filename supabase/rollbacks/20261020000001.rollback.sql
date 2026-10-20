-- =============================================================================
-- ROLLBACK de 20261020000001_gestao_usuarios
-- =============================================================================
-- Tira a trilha de auditoria, a função encerrar_sessoes() e a trava do último
-- administrador.
--
-- ATENÇÃO:
--  - O HISTÓRICO DE ALTERAÇÕES DE USUÁRIOS SE PERDE com a tabela. Se ele tiver
--    valor, exporte antes: select * from public.auditoria_usuarios;
--  - Sem a tabela e a função, /api/admin-usuarios deixa de funcionar (responde
--    erro). Reverta o deploy do código junto, ou antes.
--  - Sem a trava, dois admins se excluindo ao mesmo tempo voltam a poder deixar
--    o sistema sem nenhum administrador.
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Provado por scripts/test-rollbacks.mjs.
-- (DROP TABLE não é barrado pelo gatilho de imutabilidade: ele só recusa
-- UPDATE, DELETE e TRUNCATE.)
-- =============================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_proteger_ultimo_admin ON public.user_profiles;
DROP FUNCTION IF EXISTS public.proteger_ultimo_admin();
DROP FUNCTION IF EXISTS public.encerrar_sessoes(uuid);
DROP TABLE IF EXISTS public.auditoria_usuarios;
DROP FUNCTION IF EXISTS public.auditoria_usuarios_imutavel();

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261020000001';

NOTIFY pgrst, 'reload schema';
COMMIT;
