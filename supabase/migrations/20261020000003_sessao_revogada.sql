-- =============================================================================
-- 20261020000003 — encerramento IMEDIATO de sessão
-- =============================================================================
--
-- O BURACO: resetar a senha, desativar ou excluir uma conta apagava as sessões
-- e os refresh tokens (encerrar_sessoes), mas o access token (JWT) já emitido
-- continuava valendo até vencer — até ~1 h — e o navegador da pessoa nem
-- percebia. Exigência do dono: trocar a senha, bloquear ou excluir DESLOGA NA
-- HORA.
--
-- COMO:
--  1. user_profiles.sessoes_validas_desde: o instante a partir do qual os JWT
--     da conta valem. Só a service_role (o servidor) muda — gatilho.
--  2. encerrar_sessoes(uuid) passa a gravar sessoes_validas_desde = now()
--     além de apagar sessões e refresh tokens.
--  3. checar_sessao(): roda ANTES de toda requisição ao PostgREST
--     (pgrst.db_pre_request). Com usuário (JWT com sub), recusa quando:
--       - a conta não existe mais em auth.users            -> sessao_revogada
--       - a conta está banida (desativada)                 -> sessao_revogada
--       - não há perfil em user_profiles                   -> sessao_revogada
--       - o iat do JWT é anterior a sessoes_validas_desde  -> sessao_revogada
--       - a conta ainda está com a senha temporária        -> senha_temporaria
--     (sessao_revogada = HTTP 401; senha_temporaria = HTTP 403: a tela não
--     desloga quem está no meio da troca obrigatória.)
--     Sem usuário (anon) ou service_role: passa direto.
--
-- POR QUE checar_sessao TEM EXECUTE PARA anon E authenticated (exceção à regra
-- "anon sem EXECUTE" das migrations anteriores): o PostgREST chama a função de
-- pre-request COM O PAPEL DA REQUISIÇÃO. Sem EXECUTE, toda requisição — inclusive
-- as do anon, que já não leem nada — falharia. A função:
--   - não recebe parâmetro e não devolve nada (void);
--   - só olha a conta do PRÓPRIO JWT (o sub), por chave primária;
--   - o único efeito observável é recusar a requisição de quem chamou, dizendo
--     apenas "sessao_revogada" ou "senha_temporaria" sobre a própria conta;
--   - para anon, retorna sem consultar nada.
-- Chamada direto como RPC (/rpc/checar_sessao), faz a mesma coisa — é o
-- "bate-ponto" das telas paradas.
--
-- SECURITY DEFINER porque authenticated não lê auth.users. search_path fixo.
--
-- Custo: duas leituras por chave primária (auth.users e user_profiles) por
-- requisição autenticada. Medido no banco local: ver docs/GESTAO-USUARIOS.md.
--
-- Idempotente. Rollback em supabase/rollbacks/20261020000003.rollback.sql.
-- =============================================================================

-- ── 1. A coluna ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS sessoes_validas_desde timestamptz;

COMMENT ON COLUMN public.user_profiles.sessoes_validas_desde IS
  'JWT com iat anterior a este instante são recusados (checar_sessao). Só o servidor (service_role) altera.';

CREATE OR REPLACE FUNCTION public.proteger_sessoes_validas_desde()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sessoes_validas_desde IS DISTINCT FROM OLD.sessoes_validas_desde
     AND coalesce(auth.role(), '') <> 'service_role'
     -- encerrar_sessoes() é SECURITY DEFINER (dono postgres) e só a
     -- service_role a executa; manutenção pelo SQL também roda como postgres.
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'sessoes_validas_desde só muda pelo servidor' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_sessoes_validas_desde ON public.user_profiles;
CREATE TRIGGER trg_proteger_sessoes_validas_desde
  BEFORE UPDATE OF sessoes_validas_desde ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_sessoes_validas_desde();

REVOKE EXECUTE ON FUNCTION public.proteger_sessoes_validas_desde() FROM PUBLIC, anon, authenticated, service_role;

-- ── 2. encerrar_sessoes também invalida os JWT já emitidos ─────────────────
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
  -- Os JWT emitidos ATÉ AGORA deixam de valer na próxima requisição.
  -- O iat do JWT tem resolução de SEGUNDO: um token emitido neste mesmo
  -- segundo, logo antes, teria o mesmo iat que um emitido logo depois. Pelo
  -- lado seguro, a revogação vale até o INÍCIO DO PRÓXIMO segundo: nenhum
  -- token anterior sobrevive; o custo é que um login refeito em menos de 1 s
  -- também é recusado (o servidor espera esse segundo antes de abrir a sessão
  -- nova de quem troca a própria senha).
  UPDATE public.user_profiles
     SET sessoes_validas_desde = date_trunc('second', now()) + interval '1 second'
   WHERE id = p_usuario;
  DELETE FROM auth.sessions WHERE user_id = p_usuario;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM auth.refresh_tokens WHERE user_id = p_usuario::text;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.encerrar_sessoes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encerrar_sessoes(uuid) TO service_role;

-- ── 3. A checagem a cada requisição ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.checar_sessao()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb;
  uid uuid;
  emitido timestamptz;
  banido_ate timestamptz;
  temporaria boolean;
  existe_conta boolean := false;
  existe_perfil boolean := false;
  validas_desde timestamptz;
BEGIN
  BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    claims := NULL;
  END;
  IF claims IS NULL OR coalesce(claims->>'sub', '') = '' OR claims->>'role' = 'service_role' THEN
    RETURN;
  END IF;

  BEGIN
    uid := (claims->>'sub')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'sessao_revogada' USING ERRCODE = 'PT401', DETAIL = 'sessao_revogada';
  END;
  emitido := to_timestamp(coalesce((claims->>'iat')::double precision, 0));

  SELECT true, u.banned_until, coalesce((u.raw_app_meta_data->>'trocar_senha')::boolean, false)
    INTO existe_conta, banido_ate, temporaria
    FROM auth.users u WHERE u.id = uid;
  SELECT true, p.sessoes_validas_desde
    INTO existe_perfil, validas_desde
    FROM public.user_profiles p WHERE p.id = uid;

  IF NOT coalesce(existe_conta, false)
     OR (banido_ate IS NOT NULL AND banido_ate > now())
     OR NOT coalesce(existe_perfil, false)
     OR (validas_desde IS NOT NULL AND emitido < validas_desde) THEN
    RAISE EXCEPTION 'sessao_revogada' USING ERRCODE = 'PT401', DETAIL = 'sessao_revogada';
  END IF;

  IF temporaria THEN
    RAISE EXCEPTION 'senha_temporaria' USING ERRCODE = 'PT403', DETAIL = 'senha_temporaria';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.checar_sessao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checar_sessao() TO anon, authenticated, service_role;

-- ── 4. O PostgREST passa a chamá-la antes de cada requisição ───────────────
ALTER ROLE authenticator SET pgrst.db_pre_request TO 'public.checar_sessao';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ── 5. A trilha de auditoria conhece a ação nova "encerrar_sessoes" ─────────
ALTER TABLE public.auditoria_usuarios DROP CONSTRAINT IF EXISTS chk_auditoria_usuarios_acao;
ALTER TABLE public.auditoria_usuarios ADD CONSTRAINT chk_auditoria_usuarios_acao CHECK (acao IN (
  'criar', 'editar', 'resetar_senha', 'desativar', 'reativar', 'excluir',
  'trocar_propria_senha', 'encerrar_sessoes', 'negado'
));
