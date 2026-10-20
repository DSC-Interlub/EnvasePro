-- =============================================================================
-- 20261020000001 — gestão de usuários pelo sistema: trilha de auditoria e
-- encerramento de sessões
-- =============================================================================
--
-- Quem cria, edita, reseta senha, desativa ou exclui conta é a função
-- serverless api/admin-usuarios.js, que roda com a service_role NO SERVIDOR
-- depois de conferir que quem chamou é admin ativo. Esta migration dá a ela
-- duas coisas que a API do Auth não dá:
--
--  1. public.auditoria_usuarios — quem fez o quê, em qual conta, quando.
--     IMUTÁVEL: só INSERT (pelo servidor) e SELECT (admin). Nem a service_role
--     altera ou apaga uma linha, e TRUNCATE é recusado por gatilho.
--     Não tem chave estrangeira para auth.users de propósito: o registro de
--     "fulano excluiu beltrano" tem de sobreviver à exclusão de beltrano.
--     Nunca guarda senha: um CHECK recusa chave de senha/token em `detalhes`.
--
--     Por que o INSERT é só da service_role e não do admin pelo navegador: se
--     o admin pudesse inserir direto, poderia escrever uma linha dizendo que
--     outra pessoa fez algo. Pelo servidor, `ator_id` sai do JWT conferido.
--
--  2. public.encerrar_sessoes(uuid) — apaga as sessões de UMA conta (os
--     refresh tokens saem junto, por ON DELETE CASCADE). A API de
--     administração do Auth não tem como derrubar a sessão de outra pessoa.
--     Só a service_role executa.
--
-- Idempotente: CREATE ... IF NOT EXISTS / OR REPLACE e DROP ... IF EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.auditoria_usuarios (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  ator_id     uuid NOT NULL,
  ator_email  text NOT NULL,
  acao        text NOT NULL,
  alvo_id     uuid,
  alvo_email  text,
  detalhes    jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.auditoria_usuarios DROP CONSTRAINT IF EXISTS chk_auditoria_usuarios_acao;
ALTER TABLE public.auditoria_usuarios ADD CONSTRAINT chk_auditoria_usuarios_acao CHECK (acao IN (
  'criar', 'editar', 'resetar_senha', 'desativar', 'reativar', 'excluir',
  'trocar_propria_senha', 'negado'
));

-- Defesa em profundidade: o servidor já não manda senha; isto recusa se um
-- dia alguém mandar.
ALTER TABLE public.auditoria_usuarios DROP CONSTRAINT IF EXISTS chk_auditoria_usuarios_sem_segredo;
ALTER TABLE public.auditoria_usuarios ADD CONSTRAINT chk_auditoria_usuarios_sem_segredo CHECK (
  NOT (detalhes ?| ARRAY['senha', 'password', 'senha_temporaria', 'senha_nova', 'senha_atual', 'token', 'access_token', 'refresh_token'])
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuarios_criado_em ON public.auditoria_usuarios (criado_em DESC);
-- O limite de tentativas por administrador conta as ações dele nos últimos
-- minutos: este índice é o que deixa essa conta barata.
CREATE INDEX IF NOT EXISTS idx_auditoria_usuarios_ator_criado ON public.auditoria_usuarios (ator_id, criado_em DESC);

-- ── Imutabilidade ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auditoria_usuarios_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'auditoria_usuarios é imutável: % não é permitido', TG_OP
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_usuarios_imutavel ON public.auditoria_usuarios;
CREATE TRIGGER trg_auditoria_usuarios_imutavel
  BEFORE UPDATE OR DELETE ON public.auditoria_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.auditoria_usuarios_imutavel();

DROP TRIGGER IF EXISTS trg_auditoria_usuarios_sem_truncate ON public.auditoria_usuarios;
CREATE TRIGGER trg_auditoria_usuarios_sem_truncate
  BEFORE TRUNCATE ON public.auditoria_usuarios
  FOR EACH STATEMENT EXECUTE FUNCTION public.auditoria_usuarios_imutavel();

REVOKE EXECUTE ON FUNCTION public.auditoria_usuarios_imutavel() FROM PUBLIC, anon, authenticated, service_role;

-- ── RLS e privilégios ──────────────────────────────────────────────────────
ALTER TABLE public.auditoria_usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auditoria_usuarios_admin_le ON public.auditoria_usuarios;
CREATE POLICY auditoria_usuarios_admin_le ON public.auditoria_usuarios
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.auditoria_usuarios FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.auditoria_usuarios TO authenticated;
GRANT SELECT, INSERT ON public.auditoria_usuarios TO service_role;

-- ── Nunca ficar sem administrador ───────────────────────────────────────────
-- A função serverless já recusa excluir/rebaixar o último admin ativo, mas
-- isso é uma conferência seguida de uma ação: dois admins excluindo um ao
-- outro ao MESMO tempo passariam os dois e o sistema ficaria sem admin (o
-- cadastro público é fechado, então ninguém mais entraria como admin).
-- Aqui a regra vale no banco: com as linhas de admin travadas (FOR UPDATE),
-- rebaixar ou apagar o último perfil admin é recusado. A exclusão de conta no
-- Auth apaga o perfil por cascata, portanto também passa por aqui e é desfeita
-- inteira se for a última.
CREATE OR REPLACE FUNCTION public.proteger_ultimo_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin') THEN
    PERFORM 1 FROM public.user_profiles WHERE role = 'admin' FOR UPDATE;
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE role = 'admin' AND id <> OLD.id) THEN
      RAISE EXCEPTION 'É preciso manter pelo menos um administrador.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_ultimo_admin ON public.user_profiles;
CREATE TRIGGER trg_proteger_ultimo_admin
  BEFORE UPDATE OF role OR DELETE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_ultimo_admin();

REVOKE EXECUTE ON FUNCTION public.proteger_ultimo_admin() FROM PUBLIC, anon, authenticated, service_role;

-- ── Encerrar as sessões de uma conta ────────────────────────────────────────
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
