-- ============================================================================
-- MIGRATION: 20261006000001_secure_handle_new_user_and_role_lock.sql
-- DESCRIÇÃO: 
--   1. Recria a função handle_new_user() forçando role = 'operator' e ignorando
--      qualquer role enviado em raw_user_meta_data, com SET search_path seguro.
--   2. Atualiza a função is_admin() garantindo SET search_path = public, pg_temp.
--   3. Cria função e trigger BEFORE UPDATE em public.user_profiles que bloqueia
--      qualquer alteração da coluna 'role' por usuários comuns (sem SECURITY DEFINER
--      e sem cláusula current_user='postgres').
-- ============================================================================

-- 1. Garante search_path seguro em public.is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2. Recria handle_new_user() forçando estritamente role = 'operator' com search_path seguro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'operator'::public.user_role
  );
  RETURN NEW;
END;
$$;

-- Garante que o trigger em auth.users está associado à nova versão da função
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Função de proteção BEFORE UPDATE para impedir auto-promoção de role
-- OBSERVAÇÕES DE SEGURANÇA:
-- - Executa como SECURITY INVOKER (sem SECURITY DEFINER) para respeitar o contexto do chamador.
-- - Sem cláusula vulnerável current_user='postgres'.
-- - search_path travado em public, pg_temp.
CREATE OR REPLACE FUNCTION public.protect_user_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se o campo role está sendo modificado
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Permite alteração APENAS se o executor for:
    -- a) Um administrador autenticado (public.is_admin() = true)
    -- b) O cliente backend service_role (auth.role() = 'service_role')
    IF NOT (
      public.is_admin()
      OR auth.role() = 'service_role'
    ) THEN
      RAISE EXCEPTION 'Acesso negado: apenas administradores ou service_role podem alterar o papel (role) de um usuário.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Trigger BEFORE UPDATE na tabela public.user_profiles
DROP TRIGGER IF EXISTS trg_protect_user_role_update ON public.user_profiles;
CREATE TRIGGER trg_protect_user_role_update
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_role_update();
