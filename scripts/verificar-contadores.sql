-- Confere COMO a funcao contadores_do_menu esta declarada.
-- Isto nao da para ver pelo PostgREST, por isso vive aqui e nao na suite JS.
--
-- Uso local:
--   docker exec -i supabase_db_envase psql -U postgres -d postgres \
--     < scripts/verificar-contadores.sql
--
-- O que tem de aparecer:
--   volatilidade = stable      (so le)
--   seguranca    = invocador   (o RLS continua valendo)
--   search_path  = search_path=public, pg_temp
--   quem_executa = authenticated   (e SO ele; nada para anon nem PUBLIC)

SELECT
  p.proname                                              AS funcao,
  CASE p.provolatile WHEN 's' THEN 'stable'
                     WHEN 'i' THEN 'immutable'
                     ELSE 'volatile (ERRADO)' END        AS volatilidade,
  CASE WHEN p.prosecdef THEN 'definidor (ERRADO)'
       ELSE 'invocador' END                              AS seguranca,
  array_to_string(p.proconfig, ', ')                     AS search_path
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'contadores_do_menu';

-- Quem tem EXECUTE. Esperado: so authenticated.
SELECT grantee AS quem_executa, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' AND routine_name = 'contadores_do_menu'
  AND grantee <> 'postgres'
ORDER BY grantee;
