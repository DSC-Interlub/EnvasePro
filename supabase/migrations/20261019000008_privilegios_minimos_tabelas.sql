-- =============================================================================
-- Privilégios mínimos nas tabelas de public
-- =============================================================================
--
-- Autorizado pelo dono por escrito em 19/10/2026.
--
-- O QUE HAVIA (lido em produção e no local, iguais):
--  - authenticated tinha arwdxtm em todas as tabelas antigas: além do DML,
--    REFERENCES (x), TRIGGER (t) e MAINTAIN (m). O TRUNCATE já tinha saído na
--    20261007000002.
--  - anon tinha MAINTAIN (m) nas mesmas tabelas — e nada mais.
--  - O privilégio padrão do papel postgres em public (que vale para toda
--    tabela criada por migration) dava arwdxtm ao authenticated.
--
-- Nenhum desses privilégios é usado pelo app: o PostgREST só faz DML, e o RLS
-- decide quem lê e escreve o quê. TRIGGER deixaria um papel com acesso a SQL
-- criar gatilho nas tabelas; MAINTAIN, travar (LOCK) ou reindexar.
--
-- O QUE FICA:
--  - authenticated: SELECT, INSERT, UPDATE, DELETE — exatamente como estava;
--  - anon: nada;
--  - service_role e postgres: inalterados;
--  - privilégio padrão do papel postgres: tabela futura nasce com authenticated
--    só arwd.
--
-- O QUE ESTA MIGRATION NÃO COBRE (declarado):
--  - Tabela criada pelo PAINEL do Supabase nasce pelo papel supabase_admin,
--    cujos privilégios padrão dão arwdDxtm a anon e authenticated. O papel
--    postgres não pode alterar os padrões de outro papel. Toda tabela criada
--    pelo painel precisa de REVOKE à mão (ver GO-LIVE.md).
--
-- Idempotente: REVOKE de privilégio ausente não é erro.
-- =============================================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE REFERENCES, TRIGGER, MAINTAIN, TRUNCATE ON public.%I FROM authenticated', t.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.relname);
  END LOOP;
END;
$$;

-- Tabelas futuras criadas por migration (papel postgres).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE REFERENCES, TRIGGER, MAINTAIN, TRUNCATE ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
