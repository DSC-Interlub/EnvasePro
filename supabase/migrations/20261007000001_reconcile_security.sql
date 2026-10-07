-- ============================================================================
-- MIGRATION: 20261007000001_reconcile_security.sql
-- ============================================================================
-- Reconcilia o banco de PRODUCAO com o repositorio. Escrita a partir do
-- inventario real de producao de 07/10/2026 (CLAUDE.md Fase 1), nao a partir
-- de suposicao.
--
-- IDEMPOTENTE: leva QUALQUER estado ao estado desejado. Pode rodar quantas
-- vezes for preciso, em producao ou num banco criado do zero.
--
-- NAO inclui a privacidade dos buckets. Tornar 'fotos-operadores' privado
-- quebraria as 13 fotos gravadas como URL publica, porque a funcao
-- resolverFotosOperadores() NAO existe em origin/main (= o codigo que esta em
-- producao). Aquilo vai em 20261006150002, que so pode ser aplicada JUNTO com
-- o deploy do codigo.
--
-- Divergencias que esta migration corrige (medidas em producao):
--   1. protect_write_once_columns() NAO EXISTIA em producao.
--   2. envase_records e checkout_itens usavam protect_admin_columns nas colunas
--      de operador, o que IMPEDE o operador comum de gravar a propria autoria.
--      Era a causa de "selecionar operador no check-out" e "gravar autoria no
--      envase" falharem.
--   3. empilha_linhas nao tinha protecao NENHUMA nas colunas de operador.
--   4. Buraco na assinatura: o operador era barrado so ao ir PARA 'Completo';
--      ainda conseguia REVERTER um registro ja 'Completo'.
--   5. Nenhum GRANT existia em migration alguma do repo, enquanto producao tem
--      DML concedido. Um banco criado so pelas migrations era inutilizavel
--      (42501 em todo SELECT).
--   6. EXECUTE para PUBLIC em todas as funcoes: 'anon', sem login, podia
--      chamar gerar_protocolo e avancar as sequences de protocolo.
--   7. gerar_protocolo, calcular_nota_checklist e set_updated_at sem
--      search_path fixo.
--   8. rls_auto_enable()/ensure_rls existem em producao e em nenhum arquivo do
--      repo.
-- ============================================================================


-- ============================================================================
-- 1. FUNCAO DE ESCRITA UNICA (ausente em producao)
-- ============================================================================
-- Operador comum preenche uma coluna vazia, mas nao altera o que ja tem valor.
-- Admin e service_role passam livres.
CREATE OR REPLACE FUNCTION public.protect_write_once_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  i INTEGER;
  col_name TEXT;
  old_val TEXT;
  old_json JSONB;
  new_json JSONB;
BEGIN
  IF (current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role') THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOR i IN 0 .. (TG_NARGS - 1) LOOP
    col_name := TG_ARGV[i];
    old_val  := old_json->>col_name;

    IF (old_json -> col_name) IS DISTINCT FROM (new_json -> col_name) THEN
      IF old_val IS NOT NULL AND trim(old_val) <> '' THEN
        RAISE EXCEPTION
          'Acesso negado: a coluna "%" na tabela "%" ja possui valor definido e so pode ser alterada por administradores.',
          col_name, TG_TABLE_NAME;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================================
-- 2. BURACO DA ASSINATURA: nao reverter um registro ja 'Completo'
-- ============================================================================
-- Antes, o operador era barrado apenas ao TENTAR ir para 'Completo'. Com o
-- registro ja 'Completo', ele conseguia voltar para 'Parcial'/'Pendente' e
-- reescrever as assinaturas. Agora, estando OLD.status_assinatura='Completo',
-- nenhuma coluna de assinatura nem o proprio status muda, salvo admin ou
-- service_role.
CREATE OR REPLACE FUNCTION public.protect_assinatura_completa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  col_name TEXT;
  old_json JSONB;
  new_json JSONB;
BEGIN
  IF (current_setting('request.jwt.claim.role', true) = 'service_role'
      OR auth.role() = 'service_role') THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- So age sobre registro que JA estava completo.
  IF OLD.status_assinatura IS DISTINCT FROM 'Completo' THEN
    RETURN NEW;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOR col_name IN
    SELECT c.column_name
      FROM information_schema.columns c
     WHERE c.table_schema = TG_TABLE_SCHEMA
       AND c.table_name   = TG_TABLE_NAME
       AND (c.column_name LIKE 'assinatura%' OR c.column_name = 'status_assinatura')
  LOOP
    IF (old_json -> col_name) IS DISTINCT FROM (new_json -> col_name) THEN
      RAISE EXCEPTION
        'Acesso negado: a tabela "%" ja esta com status_assinatura = Completo. A coluna "%" nao pode mais ser alterada por operador; apenas administradores.',
        TG_TABLE_NAME, col_name;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- ============================================================================
-- 3. search_path FIXO nas funcoes que estavam sem (F0-8)
-- ============================================================================
-- ALTER FUNCTION em vez de CREATE OR REPLACE de proposito: nao e preciso
-- reescrever o corpo, portanto nao se corre o risco de divergir do que esta em
-- producao hoje.
ALTER FUNCTION public.set_updated_at()          SET search_path = public, pg_temp;
ALTER FUNCTION public.calcular_nota_checklist() SET search_path = public, pg_temp;


-- ============================================================================
-- 4. gerar_protocolo: allowlist de sequences (fecha o F0-7 sem quebrar nada)
-- ============================================================================
-- A funcao e DEFAULT de coluna em 6 tabelas, logo 'authenticated' PRECISA de
-- EXECUTE nela e ela nao pode ser revogada. O abuso (avancar qualquer sequence)
-- morre aqui dentro: so as 6 sequences de protocolo sao aceitas.
CREATE OR REPLACE FUNCTION public.gerar_protocolo(prefixo TEXT, nome_sequence TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  proximo_val BIGINT;
  ano_atual TEXT;
BEGIN
  IF nome_sequence NOT IN (
    'public.seq_checklist_recebimento',
    'public.seq_recebimento_protocolo',
    'public.seq_envase_protocolo',
    'public.seq_checkout_prog',
    'public.seq_empilha_prog',
    'public.seq_nf_arquivo_protocolo'
  ) THEN
    RAISE EXCEPTION 'Sequence nao permitida em gerar_protocolo: %', nome_sequence;
  END IF;

  EXECUTE format('SELECT nextval(%L)', nome_sequence) INTO proximo_val;
  ano_atual := to_char(CURRENT_DATE, 'YYYY');
  RETURN prefixo || '-' || ano_atual || '-' || LPAD(proximo_val::TEXT, 6, '0');
END;
$$;


-- ============================================================================
-- 5. rls_auto_enable / ensure_rls: codifica o que producao ja tem
-- ============================================================================
-- Existe em producao e em nenhum arquivo do repo. Liga RLS automaticamente em
-- toda tabela nova. Criada apenas SE NAO EXISTIR, para nao sobrescrever a
-- versao que ja roda em producao.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    CREATE FUNCTION public.rls_auto_enable()
    RETURNS event_trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $fn$
    DECLARE
      cmd record;
    BEGIN
      FOR cmd IN
        SELECT * FROM pg_event_trigger_ddl_commands()
         WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS')
           AND object_type IN ('table', 'partitioned table')
      LOOP
        IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') THEN
          BEGIN
            EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
            RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
          EXCEPTION WHEN OTHERS THEN
            RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
          END;
        ELSE
          RAISE LOG 'rls_auto_enable: skip %', cmd.object_identity;
        END IF;
      END LOOP;
    END;
    $fn$;
    RAISE NOTICE 'rls_auto_enable criada (nao existia).';
  ELSE
    RAISE NOTICE 'rls_auto_enable ja existia; preservada como esta em producao.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
      EXECUTE FUNCTION public.rls_auto_enable();
    RAISE NOTICE 'event trigger ensure_rls criado.';
  ELSE
    RAISE NOTICE 'event trigger ensure_rls ja existia.';
  END IF;
END $$;


-- ============================================================================
-- 6. TRIGGERS: troca admin-only por escrita-unica nas colunas de operador
-- ============================================================================
-- envase_records: era protect_admin_columns('operator_id','operador'), que
-- impedia o operador de gravar a propria autoria.
DROP TRIGGER IF EXISTS trg_envase_records_admin_cols      ON public.envase_records;
DROP TRIGGER IF EXISTS trg_envase_records_write_once_cols ON public.envase_records;
CREATE TRIGGER trg_envase_records_write_once_cols
  BEFORE UPDATE ON public.envase_records
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_write_once_columns('operator_id', 'operador');

-- checkout_itens: mesma troca. Era o que travava "selecionar operador no item".
DROP TRIGGER IF EXISTS trg_checkout_itens_admin_cols      ON public.checkout_itens;
DROP TRIGGER IF EXISTS trg_checkout_itens_write_once_cols ON public.checkout_itens;
CREATE TRIGGER trg_checkout_itens_write_once_cols
  BEFORE UPDATE ON public.checkout_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_write_once_columns('operador', 'operator_id');

-- empilha_linhas: nao tinha protecao nenhuma nas colunas de operador.
-- O trigger admin_cols das assinaturas de lider continua como esta.
DROP TRIGGER IF EXISTS trg_empilha_linhas_write_once_cols ON public.empilha_linhas;
CREATE TRIGGER trg_empilha_linhas_write_once_cols
  BEFORE UPDATE ON public.empilha_linhas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_write_once_columns(
    'operador_empilhadeira', 'operador_empilhadeira_id',
    'operador_ajudante', 'operador_ajudante_id');

-- Garante o admin-only das assinaturas de lider nas 3 tabelas que assinam.
DROP TRIGGER IF EXISTS trg_empilha_linhas_admin_cols ON public.empilha_linhas;
CREATE TRIGGER trg_empilha_linhas_admin_cols
  BEFORE UPDATE ON public.empilha_linhas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_hora');

DROP TRIGGER IF EXISTS trg_limpeza_prog_admin_cols ON public.limpeza_programacoes;
CREATE TRIGGER trg_limpeza_prog_admin_cols
  BEFORE UPDATE ON public.limpeza_programacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_hora');

DROP TRIGGER IF EXISTS trg_recebimentos_admin_cols ON public.recebimentos;
CREATE TRIGGER trg_recebimentos_admin_cols
  BEFORE UPDATE ON public.recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_datetime');

-- Trava de reversao de 'Completo' nas 3 tabelas que tem status_assinatura.
DROP TRIGGER IF EXISTS trg_empilha_linhas_assinatura_completa ON public.empilha_linhas;
CREATE TRIGGER trg_empilha_linhas_assinatura_completa
  BEFORE UPDATE ON public.empilha_linhas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_assinatura_completa();

DROP TRIGGER IF EXISTS trg_limpeza_prog_assinatura_completa ON public.limpeza_programacoes;
CREATE TRIGGER trg_limpeza_prog_assinatura_completa
  BEFORE UPDATE ON public.limpeza_programacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_assinatura_completa();

DROP TRIGGER IF EXISTS trg_recebimentos_assinatura_completa ON public.recebimentos;
CREATE TRIGGER trg_recebimentos_assinatura_completa
  BEFORE UPDATE ON public.recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_assinatura_completa();


-- ============================================================================
-- 7. PERMISSOES EXPLICITAS (F0-1)
-- ============================================================================
-- Producao tem DML concedido a anon/authenticated/service_role, mas isso veio
-- de fora das migrations (Base44/painel). Um banco criado so pelas migrations
-- nascia sem nenhum DML: as migrations rodam como 'postgres', e o
-- pg_default_acl do 'postgres' para public/tabelas concede apenas Dxtm.
-- A partir daqui o privilegio e explicito, nao heranca acidental.
DO $$
BEGIN
  -- 'authenticated' e quem o app usa. RLS continua sendo o que decide a linha.
  EXECUTE 'GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role';
  EXECUTE 'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role';

  -- 'anon' nao escreve nada. Hoje tinha DML concedido e era barrado apenas por
  -- ausencia de politica de RLS: uma unica politica mal escrita abriria tudo.
  EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon';
  EXECUTE 'REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon';
  EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
END $$;

-- Default privileges: para que tabela NOVA criada por 'postgres' ja nasca certa
-- e o banco local deixe de divergir de producao.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated, service_role;


-- ============================================================================
-- 8. EXECUTE NAS FUNCOES (F0-7)
-- ============================================================================
-- Hoje todas estao com EXECUTE para PUBLIC, e 'anon' chamava gerar_protocolo
-- sem login. Regra: ninguem por padrao; devolve-se EXECUTE apenas ao que e
-- realmente chamado pelo app.
--
-- Mantem-se para 'authenticated':
--   * is_admin()        -> usado por 88 politicas de RLS (public e storage);
--                          sem EXECUTE, toda politica admin falha.
--   * gerar_protocolo() -> DEFAULT de coluna em 6 tabelas; sem EXECUTE,
--                          nenhum INSERT nessas tabelas funciona.
-- As funcoes de trigger NAO precisam de EXECUTE: o Postgres nao verifica esse
-- privilegio ao disparar um trigger.
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon';
  EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.gerar_protocolo(text, text) TO authenticated';

  -- service_role e usado pelas funcoes serverless; mantem acesso amplo.
  EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role';
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;


-- ============================================================================
-- 9. RESUMO
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'reconcile_security aplicada.';
  RAISE NOTICE '  protect_write_once_columns existe: %',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'protect_write_once_columns');
  RAISE NOTICE '  triggers write_once: %',
    (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgname LIKE '%write_once%');
  RAISE NOTICE '  triggers assinatura_completa: %',
    (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgname LIKE '%assinatura_completa%');
END $$;
