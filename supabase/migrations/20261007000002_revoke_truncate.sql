-- ============================================================================
-- MIGRATION: 20261007000002_revoke_truncate.sql
-- ============================================================================
-- Remove o privilegio TRUNCATE de 'authenticated' e de 'anon'.
--
-- POR QUE: TRUNCATE **nao passa por RLS**. Politica de linha nenhuma protege
-- contra ele: quem tem TRUNCATE esvazia a tabela inteira, independentemente de
-- qualquer USING/WITH CHECK. Era privilegio herdado do estado anterior do banco
-- (o default ACL do supabase_admin concede 'arwdDxtm', onde D = TRUNCATE).
--
-- O risco pratico era baixo porque o PostgREST nao expoe TRUNCATE e o app nunca
-- o usa, mas e privilegio que nao serve a nada e contorna a unica barreira que
-- de fato protege os dados.
--
-- IDEMPOTENTE: REVOKE de privilegio ausente e no-op, nao erro.
--
-- LIMITE CONHECIDO: ALTER DEFAULT PRIVILEGES so afeta objetos criados pelo
-- papel que o executa (aqui, 'postgres'). Tabela criada por 'supabase_admin'
-- — por exemplo pelo painel do Supabase — volta a nascer com 'arwdDxtm', ou
-- seja, com TRUNCATE. Nao ha como cobrir isso por migration; a verificacao
-- periodica do privilegio fica como item de conferencia.
-- ============================================================================

DO $$
BEGIN
  -- 1. Tira o privilegio das tabelas que existem hoje.
  EXECUTE 'REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated';
  EXECUTE 'REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon';

  -- 2. 'anon' nao deve ter nem REFERENCES nem TRIGGER: ambos sao privilegios de
  --    DDL (criar FK apontando para a tabela, criar trigger nela) e o papel
  --    anonimo nao tem nada que fazer com eles.
  EXECUTE 'REVOKE REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon';
END $$;

-- 3. Tabela FUTURA criada por 'postgres' (que e como as migrations rodam) nao
--    herda TRUNCATE. Repete o GRANT desejado de forma explicita, sem TRUNCATE.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

-- ============================================================================
-- RESUMO
-- ============================================================================
DO $$
DECLARE
  n_trunc_auth int;
  n_trunc_anon int;
  n_anon_qualquer int;
BEGIN
  SELECT count(*) INTO n_trunc_auth
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'TRUNCATE';
  SELECT count(*) INTO n_trunc_anon
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND grantee = 'anon' AND privilege_type = 'TRUNCATE';
  SELECT count(*) INTO n_anon_qualquer
    FROM information_schema.table_privileges
   WHERE table_schema = 'public' AND grantee = 'anon';

  RAISE NOTICE 'revoke_truncate aplicada.';
  RAISE NOTICE '  tabelas com TRUNCATE para authenticated: % (esperado 0)', n_trunc_auth;
  RAISE NOTICE '  tabelas com TRUNCATE para anon ........: % (esperado 0)', n_trunc_anon;
  RAISE NOTICE '  privilegios de qualquer tipo para anon : % (esperado 0)', n_anon_qualquer;
END $$;
