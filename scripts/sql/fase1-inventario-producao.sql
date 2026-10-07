-- ============================================================================
-- FASE 1 — INVENTARIO DE PRODUCAO (SOMENTE LEITURA)
-- ============================================================================
-- Rode no SQL Editor do Supabase do projeto de PRODUCAO e cole a saida de
-- volta na sessao. Nenhum comando aqui altera nada: so SELECT.
--
-- Cada bloco esta numerado. Se o editor truncar a saida, rode bloco por bloco
-- e cole em partes — vale mais a saida completa de um bloco do que a saida
-- cortada de todos.
--
-- O objetivo e montar a tabela "repo x producao" e, em especial, responder os
-- achados F0-1 (permissoes ausentes) e F0-2 (provedor de e-mail) da Fase 0.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCO 1 — Migrations que o Supabase considera aplicadas
-- ----------------------------------------------------------------------------
-- Compare com os arquivos do repo. Interessa saber se 20261006000001 e
-- 20261006000002 constam aqui (o Supabase NAO reaplica versao ja registrada,
-- e os arquivos foram editados depois) e se as 2026100615000{1,2,3} faltam.
select 'BLOCO 1: migrations' as bloco;
select version, name
  from supabase_migrations.schema_migrations
 order by version;


-- ----------------------------------------------------------------------------
-- BLOCO 2 — Definicao real das funcoes de seguranca
-- ----------------------------------------------------------------------------
-- Compare texto a texto com o repo. Atencao a SECURITY DEFINER e ao search_path:
-- uma funcao SECURITY DEFINER sem search_path fixo e vetor de escalacao.
select 'BLOCO 2: funcoes' as bloco;
select p.proname,
       p.prosecdef                                   as security_definer,
       coalesce(array_to_string(p.proconfig, ', '), 'AUSENTE') as config,
       pg_get_functiondef(p.oid)                     as definicao
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by p.prosecdef desc, p.proname;


-- ----------------------------------------------------------------------------
-- BLOCO 3 — Triggers reais, por tabela
-- ----------------------------------------------------------------------------
-- O nome que a IA anterior disse ter aplicado (trg_user_profiles_protect_role)
-- nao existe em arquivo nenhum do repo, que usa trg_protect_user_role_update.
-- Esta lista diz qual nome existe DE FATO, e e ela que a migration da Fase 2
-- vai usar nos DROP TRIGGER IF EXISTS.
select 'BLOCO 3: triggers' as bloco;
select c.relname        as tabela,
       t.tgname         as trigger,
       p.proname        as funcao,
       pg_get_triggerdef(t.oid) as definicao
  from pg_trigger t
  join pg_class     c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc      p on p.oid = t.tgfoid
 where not t.tgisinternal
   and n.nspname = 'public'
 order by c.relname, t.tgname;


-- ----------------------------------------------------------------------------
-- BLOCO 4 — PERMISSOES (achado F0-1) — o bloco mais importante
-- ----------------------------------------------------------------------------
-- No banco local, construido SO pelas migrations do repo, anon/authenticated/
-- service_role ficam sem SELECT/INSERT/UPDATE/DELETE e todo acesso devolve
-- 42501. Nao existe nenhum GRANT em migration nenhuma do repo.
-- Se producao TEM os privilegios, eles vieram de fora das migrations (Base44
-- ou painel) e precisam ser escritos explicitamente na migration da Fase 2.
select 'BLOCO 4a: privilegios por tabela' as bloco;
select grantee,
       table_name,
       string_agg(distinct privilege_type, ',' order by privilege_type) as privilegios
  from information_schema.table_privileges
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated', 'service_role')
 group by grantee, table_name
 order by table_name, grantee;

-- Resumo: alguma tabela sem DML para authenticated?
select 'BLOCO 4b: tabelas SEM dml para authenticated' as bloco;
select t.table_name
  from information_schema.tables t
 where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
   and not exists (
     select 1 from information_schema.table_privileges p
      where p.table_schema = 'public'
        and p.table_name = t.table_name
        and p.grantee = 'authenticated'
        and p.privilege_type = 'SELECT')
 order by 1;

-- De onde vem o default: dono das tabelas e os default ACLs.
-- Local: o ACL do postgres concede so Dxtm; o do supabase_admin concede arwdDxtm.
select 'BLOCO 4c: dono das tabelas' as bloco;
select tablename, tableowner
  from pg_tables
 where schemaname = 'public'
 order by 1;

select 'BLOCO 4d: default ACLs' as bloco;
select pg_get_userbyid(defaclrole)        as concedente,
       defaclnamespace::regnamespace      as schema,
       defaclobjtype                      as tipo,  -- r=tabela S=sequence f=funcao
       defaclacl
  from pg_default_acl
 order by 1, 2;

-- Quem pode EXECUTAR as funcoes do schema public (expostas como RPC pelo
-- PostgREST). No local, TODAS estao com EXECUTE para PUBLIC.
select 'BLOCO 4e: execute nas funcoes' as bloco;
select p.proname,
       coalesce(array_to_string(p.proacl, ', '), 'AUSENTE (= PUBLIC)') as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by p.proname;


-- ----------------------------------------------------------------------------
-- BLOCO 5 — RLS: esta ligado em todas as tabelas?
-- ----------------------------------------------------------------------------
select 'BLOCO 5: rls por tabela' as bloco;
select c.relname as tabela,
       c.relrowsecurity as rls_ligado,
       c.relforcerowsecurity as rls_forcado,
       (select count(*) from pg_policies pol
         where pol.schemaname = 'public' and pol.tablename = c.relname) as politicas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relrowsecurity, c.relname;


-- ----------------------------------------------------------------------------
-- BLOCO 6 — Politicas de RLS (public e storage)
-- ----------------------------------------------------------------------------
select 'BLOCO 6: politicas' as bloco;
select schemaname, tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname in ('public', 'storage')
 order by schemaname, tablename, cmd, policyname;


-- ----------------------------------------------------------------------------
-- BLOCO 7 — Storage: buckets e seus limites
-- ----------------------------------------------------------------------------
-- Esperado hoje (migration de storage pendente): fotos-operadores ainda
-- publico, e um bucket "arquivos" publico e sem limite que o codigo nao usa.
select 'BLOCO 7a: buckets' as bloco;
select id, name, public, file_size_limit, allowed_mime_types, created_at
  from storage.buckets
 order by id;

-- Quantos arquivos e quanto espaco em cada bucket (para a Fase 6 de backup).
select 'BLOCO 7b: objetos por bucket' as bloco;
select bucket_id,
       count(*) as arquivos,
       min(created_at) as mais_antigo,
       max(created_at) as mais_recente
  from storage.objects
 group by bucket_id
 order by bucket_id;


-- ----------------------------------------------------------------------------
-- BLOCO 8 — A coluna notificado_em existe?
-- ----------------------------------------------------------------------------
-- Ela so aparece depois da migration 20261006150003, que esta pendente.
-- NOTA DA FASE 0: ja esta provado que o codigo da API que usa notificado_em
-- NAO esta em origin/main (producao serve c0bfc78), portanto o e-mail de
-- ocorrencia nao esta quebrado hoje. Confirme a coluna de todo modo.
select 'BLOCO 8: notificado_em' as bloco;
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'empilha_ocorrencias'
 order by ordinal_position;


-- ----------------------------------------------------------------------------
-- BLOCO 9 — CHECK constraints de dominio
-- ----------------------------------------------------------------------------
-- Confirma se as CHECKs da migration pendente 20261006150001 ja existem e,
-- sobretudo, que NAO existe nenhuma CHECK errada em nota_final: a nota vai de
-- -90 a +90, e uma CHECK 0..100 quebra o checklist.
select 'BLOCO 9: check constraints' as bloco;
select con.conrelid::regclass as tabela,
       con.conname            as constraint,
       pg_get_constraintdef(con.oid) as definicao,
       con.convalidated       as validada
  from pg_constraint con
  join pg_namespace n on n.oid = con.connamespace
 where n.nspname = 'public' and con.contype = 'c'
 order by 1, 2;


-- ----------------------------------------------------------------------------
-- BLOCO 10 — Contas de autenticacao
-- ----------------------------------------------------------------------------
-- Para comparar com as 4 oficiais e identificar a conta de teste
-- operacoes@interlub.com (22 caracteres) sem confundir com
-- operacoes.equipe@interlub.com (29). Nao traz senha nem hash.
select 'BLOCO 10: contas' as bloco;
select u.id,
       u.email,
       length(u.email) as tam_email,
       up.role,
       u.created_at,
       u.last_sign_in_at,
       u.email_confirmed_at is not null as email_confirmado,
       u.raw_user_meta_data ? 'role'    as tem_role_no_metadata
  from auth.users u
  left join public.user_profiles up on up.id = u.id
 order by u.email;


-- ----------------------------------------------------------------------------
-- BLOCO 11 — Contagem por tabela (quanto dado real existe)
-- ----------------------------------------------------------------------------
-- Estimativa pelo planner: barata e suficiente para dimensionar a Fase 6.
-- Numeros negativos ou -1 significam "tabela nunca analisada".
select 'BLOCO 11: contagens estimadas' as bloco;
select c.relname as tabela,
       c.reltuples::bigint as linhas_estimadas
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.reltuples desc, c.relname;
