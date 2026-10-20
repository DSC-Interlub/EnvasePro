-- =============================================================================
-- ROLLBACK de 20261020000003_sessao_revogada
-- =============================================================================
-- Desliga a checagem por requisição e volta encerrar_sessoes() ao que era na
-- 20261020000001.
--
-- ATENÇÃO:
--  - Sem isto, o JWT de uma conta resetada/desativada/excluída volta a valer
--    até vencer (~1 h). É o buraco que a migration fechou.
--  - O código (bate-ponto e "Encerrar sessões") deve voltar junto, ou antes:
--    sem checar_sessao no banco, o bate-ponto recebe 404 e não faz nada, e a
--    ação "Encerrar sessões" continua apagando as sessões (sem matar o JWT).
--  - A ORDEM importa: primeiro o PostgREST deixa de chamar checar_sessao
--    (RESET + reload config), depois a função é apagada. Entre o COMMIT e o
--    PostgREST recarregar a configuração (instantes), uma requisição pode
--    falhar procurando a função; repetir resolve.
--
-- Aplicar À MÃO. Roda numa transação. Provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

ALTER ROLE authenticator RESET pgrst.db_pre_request;
NOTIFY pgrst, 'reload config';

DROP FUNCTION IF EXISTS public.checar_sessao();

CREATE OR REPLACE FUNCTION public.encerrar_sessoes(p_usuario uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n integer;
BEGIN
  IF p_usuario IS NULL THEN
    RAISE EXCEPTION 'encerrar_sessoes: usuário obrigatório';
  END IF;
  DELETE FROM auth.sessions WHERE user_id = p_usuario;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Token de renovação sem sessão (formato antigo do Auth) também sai.
  DELETE FROM auth.refresh_tokens WHERE user_id = p_usuario::text;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.encerrar_sessoes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessoes(uuid) TO service_role;

DROP TRIGGER IF EXISTS trg_proteger_sessoes_validas_desde ON public.user_profiles;
DROP FUNCTION IF EXISTS public.proteger_sessoes_validas_desde();
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS sessoes_validas_desde;

-- A ação "encerrar_sessoes" sai da lista. Registros que já a usaram ficam
-- (o histórico é imutável): por isso NOT VALID — vale só para linha nova.
ALTER TABLE public.auditoria_usuarios DROP CONSTRAINT IF EXISTS chk_auditoria_usuarios_acao;
ALTER TABLE public.auditoria_usuarios ADD CONSTRAINT chk_auditoria_usuarios_acao CHECK (acao IN (
  'criar', 'editar', 'resetar_senha', 'desativar', 'reativar', 'excluir',
  'trocar_propria_senha', 'negado'
)) NOT VALID;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261020000003';

NOTIFY pgrst, 'reload schema';
COMMIT;
