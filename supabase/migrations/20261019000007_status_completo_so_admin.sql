-- =============================================================================
-- status_assinatura = 'Completo' volta a exigir admin
-- =============================================================================
--
-- O BURACO (achado na rodada final de 19/10/2026, pela suíte
-- scripts/test-critical-columns-triggers.js, e confirmado em produção só
-- lendo os gatilhos):
--
-- A 0002 barrava o operador ao levar status_assinatura PARA 'Completo'. A
-- reconciliação (20261007000001) trocou os gatilhos das três tabelas por
-- protect_admin_columns('assinatura_lider', ...) — e status_assinatura saiu da
-- lista. Desde 07/10, um operador consegue marcar um registro como 'Completo'
-- SEM a assinatura do líder. Depois disso a trava de 'Completo' (que a
-- reconciliação acertou) impede o próprio operador de desfazer.
--
-- A suíte da reconciliação testava REVERTER 'Completo', nunca CHEGAR nele.
--
-- A CORREÇÃO: só admin (ou service_role) leva status_assinatura a 'Completo',
-- por UPDATE ou já no INSERT, nas três tabelas que têm assinatura de líder.
-- Nenhum fluxo de operador é afetado: as três telas só gravam 'Completo' na
-- assinatura do líder, que já é exclusiva de admin (conferido no código:
-- EmpilhaLinhaCard, ModalAssinaturaLimpeza, ModalAssinaturaRecebimento).
--
-- Mesmas decisões das outras funções de gatilho: sem SECURITY DEFINER,
-- search_path fixo, sem EXECUTE para ninguém (gatilho não precisa).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_status_completo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status_assinatura = 'Completo'
     AND (TG_OP = 'INSERT' OR OLD.status_assinatura IS DISTINCT FROM 'Completo') THEN
    RAISE EXCEPTION
      'Acesso negado: marcar status_assinatura como "Completo" na tabela "%" exige perfil de administrador (é a assinatura do líder).',
      TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_status_completo() IS
  'Só admin/service_role leva status_assinatura a Completo (UPDATE ou INSERT). Corrige a regressão de 20261007000001.';

REVOKE ALL ON FUNCTION public.protect_status_completo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_status_completo() FROM anon;
REVOKE ALL ON FUNCTION public.protect_status_completo() FROM authenticated;

DROP TRIGGER IF EXISTS trg_empilha_linhas_status_completo ON public.empilha_linhas;
CREATE TRIGGER trg_empilha_linhas_status_completo
  BEFORE INSERT OR UPDATE OF status_assinatura ON public.empilha_linhas
  FOR EACH ROW EXECUTE FUNCTION public.protect_status_completo();

DROP TRIGGER IF EXISTS trg_limpeza_prog_status_completo ON public.limpeza_programacoes;
CREATE TRIGGER trg_limpeza_prog_status_completo
  BEFORE INSERT OR UPDATE OF status_assinatura ON public.limpeza_programacoes
  FOR EACH ROW EXECUTE FUNCTION public.protect_status_completo();

DROP TRIGGER IF EXISTS trg_recebimentos_status_completo ON public.recebimentos;
CREATE TRIGGER trg_recebimentos_status_completo
  BEFORE INSERT OR UPDATE OF status_assinatura ON public.recebimentos
  FOR EACH ROW EXECUTE FUNCTION public.protect_status_completo();
