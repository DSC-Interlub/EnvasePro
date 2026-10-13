-- Levanta TODO lugar do banco que decide "hoje"/"agora" e pode cair no
-- problema de fuso: CURRENT_DATE / current_date / now()::date / localtimestamp.
--
-- `CURRENT_DATE` devolve o dia conforme o fuso da SESSAO, e a sessao do
-- Supabase e UTC. Entre 21h e meia-noite de Brasilia o banco ja virou o dia.
-- Pior: quem chama pode definir o fuso da propria sessao.
--
-- Uso local:
--   docker exec -i supabase_db_envase psql -U postgres -d postgres \
--     < scripts/auditar-fuso-banco.sql

\echo '=== 1. FUNCOES com CURRENT_DATE / now()::date / localtimestamp ==='
SELECT n.nspname AS esquema, p.proname AS funcao,
       CASE WHEN p.prosecdef THEN 'definidor' ELSE 'invocador' END AS seguranca,
       regexp_replace(
         substring(pg_get_functiondef(p.oid)
           from '(?i)[^\n]*(current_date|now\(\)::date|localtimestamp|current_timestamp::date)[^\n]*'),
         '^\s+', '') AS linha
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
  AND p.prokind = 'f'   -- so funcoes normais: pg_get_functiondef falha em agregacao
  AND pg_get_functiondef(p.oid) ~* '(current_date|now\(\)::date|localtimestamp|current_timestamp::date)'
ORDER BY 1, 2;

\echo ''
\echo '=== 2. DEFAULTS de coluna com CURRENT_DATE / now()::date ==='
SELECT c.table_schema AS esquema, c.table_name AS tabela, c.column_name AS coluna,
       c.data_type AS tipo, c.column_default AS padrao
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND c.column_default ~* '(current_date|now\(\)::date|localtimestamp|current_timestamp::date)'
ORDER BY 1, 2, 3;

\echo ''
\echo '=== 3. COLUNAS GERADAS que dependem de data ==='
SELECT c.table_name AS tabela, c.column_name AS coluna, c.generation_expression AS expressao
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.is_generated = 'ALWAYS'
ORDER BY 1, 2;

\echo ''
\echo '=== 4. RESTRICOES CHECK que comparam com data corrente ==='
SELECT c.conrelid::regclass::text AS tabela, c.conname AS restricao,
       pg_get_constraintdef(c.oid) AS definicao
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND pg_get_constraintdef(c.oid) ~* '(current_date|now\(\)|localtimestamp)'
ORDER BY 1, 2;

\echo ''
\echo '=== 5. INDICES com data corrente na expressao (seriam nao-deterministicos) ==='
SELECT schemaname AS esquema, tablename AS tabela, indexname AS indice, indexdef AS definicao
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef ~* '(current_date|now\(\)|localtimestamp)'
ORDER BY 1, 2, 3;

\echo ''
\echo '=== 6. VISOES com data corrente ==='
SELECT schemaname AS esquema, viewname AS visao
FROM pg_views
WHERE schemaname = 'public' AND definition ~* '(current_date|now\(\)::date|localtimestamp)'
ORDER BY 1, 2;

\echo ''
\echo '=== 7. O que ja esta CERTO (usa America/Sao_Paulo) ==='
SELECT p.proname AS funcao
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND pg_get_functiondef(p.oid) ~ 'America/Sao_Paulo'
ORDER BY 1;

\echo ''
\echo '=== 8. Fuso da sessao e o efeito pratico agora ==='
SELECT current_setting('TimeZone') AS fuso_da_sessao,
       current_date AS current_date_sessao,
       (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje_brt,
       CASE WHEN current_date <> (now() AT TIME ZONE 'America/Sao_Paulo')::date
            THEN 'DIVERGINDO AGORA' ELSE 'iguais neste horario' END AS situacao;
