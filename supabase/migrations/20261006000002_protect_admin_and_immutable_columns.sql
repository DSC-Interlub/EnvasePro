-- ============================================================================
-- MIGRATION: 20261006000002_protect_admin_and_immutable_columns.sql
-- DESCRIÇÃO:
--   1. Função genérica protect_admin_columns() recebendo colunas via TG_ARGV.
--      SEM SECURITY DEFINER (SECURITY INVOKER), libera apenas admin e service_role.
--      Comporta caso especial para status_assinatura (permite operador avançar
--      para 'Parcial', mas restringe a finalização 'Completo' para admin).
--   2. Função genérica protect_immutable_columns() recebendo colunas via TG_ARGV.
--      SEM SECURITY DEFINER (SECURITY INVOKER), bloqueia todos inclusive admin.
--      Permite apenas service_role.
--   3. Triggers BEFORE UPDATE nas tabelas aprovadas:
--      - empilha_linhas (assinatura_lider*, status_assinatura, operador_empilhadeira_id, operador_ajudante_id, created_at)
--      - limpeza_programacoes (assinatura_lider*, status_assinatura, created_at)
--      - recebimentos (assinatura_lider*, status_assinatura, protocolo_recebimento, created_at)
--      - empilha_ocorrencias (resolvido, resolucao, registrado_por, registrado_por_id, created_at)
--      - recebimento_ocorrencias (resolvido, resolucao, registrado_por, registrado_por_id, created_at)
--      - nota_fiscal_arquivos (descartado, descartado_por, descartado_em, arquivo_url, protocolo_arquivo, created_at)
--      - envase_records (operator_id, operador, protocolo, created_at)
--      - checkout_itens (operador, operador_id, created_at)
--      - checklist_recebimentos (criado_por_id, criado_por_nome, numero_checklist, created_at)
--      - checkout_programacoes (codigo_programacao, created_at)
--      - empilha_programacoes (codigo_programacao, created_at)
-- ============================================================================

-- 1. Função genérica de proteção para colunas restritas a Administrador
CREATE OR REPLACE FUNCTION public.protect_admin_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  i INTEGER;
  col_name TEXT;
  old_json JSONB;
  new_json JSONB;
  is_privileged BOOLEAN;
BEGIN
  -- Permite se for admin autenticado (is_admin() é SECURITY DEFINER) ou service_role
  is_privileged := (public.is_admin() OR auth.role() = 'service_role');

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  -- Itera sobre as colunas passadas nos argumentos do trigger
  FOR i IN 0 .. (TG_NARGS - 1) LOOP
    col_name := TG_ARGV[i];

    -- Tratamento especial para status_assinatura:
    -- Operadores comuns podem avançar para 'Parcial', mas apenas admin pode finalizar para 'Completo'
    IF col_name = 'status_assinatura' THEN
      IF (new_json ->> 'status_assinatura') = 'Completo' 
         AND (old_json ->> 'status_assinatura') IS DISTINCT FROM 'Completo' THEN
        RAISE EXCEPTION 'Acesso negado: a alteração de status_assinatura para "Completo" na tabela "%" exige perfil de administrador.',
          TG_TABLE_NAME;
      END IF;
    ELSE
      -- Comparação genérica tipo-agnóstica via JSONB
      IF (old_json -> col_name) IS DISTINCT FROM (new_json -> col_name) THEN
        RAISE EXCEPTION 'Acesso negado: a coluna "%" na tabela "%" só pode ser alterada por administradores.',
          col_name, TG_TABLE_NAME;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2. Função genérica de proteção para colunas estritamente Imutáveis
CREATE OR REPLACE FUNCTION public.protect_immutable_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  i INTEGER;
  col_name TEXT;
  old_json JSONB;
  new_json JSONB;
BEGIN
  -- Permite apenas service_role do sistema (ex: migrações de dados internos)
  -- Bloqueia todos os usuários via API/App, inclusive administradores
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  old_json := to_jsonb(OLD);
  new_json := to_jsonb(NEW);

  FOR i IN 0 .. (TG_NARGS - 1) LOOP
    col_name := TG_ARGV[i];

    IF (old_json -> col_name) IS DISTINCT FROM (new_json -> col_name) THEN
      RAISE EXCEPTION 'Operação inválida: a coluna "%" na tabela "%" é estritamente imutável.',
        col_name, TG_TABLE_NAME;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGERS BEFORE UPDATE POR TABELA
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1 empilha_linhas
DROP TRIGGER IF EXISTS trg_empilha_linhas_admin_cols ON public.empilha_linhas;
CREATE TRIGGER trg_empilha_linhas_admin_cols
  BEFORE UPDATE ON public.empilha_linhas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_hora', 
    'status_assinatura', 'operador_empilhadeira_id', 'operador_ajudante_id'
  );

DROP TRIGGER IF EXISTS trg_empilha_linhas_immutable_cols ON public.empilha_linhas;
CREATE TRIGGER trg_empilha_linhas_immutable_cols
  BEFORE UPDATE ON public.empilha_linhas
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('created_at');

-- 3.2 limpeza_programacoes
DROP TRIGGER IF EXISTS trg_limpeza_prog_admin_cols ON public.limpeza_programacoes;
CREATE TRIGGER trg_limpeza_prog_admin_cols
  BEFORE UPDATE ON public.limpeza_programacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_hora', 'status_assinatura'
  );

DROP TRIGGER IF EXISTS trg_limpeza_prog_immutable_cols ON public.limpeza_programacoes;
CREATE TRIGGER trg_limpeza_prog_immutable_cols
  BEFORE UPDATE ON public.limpeza_programacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('created_at');

-- 3.3 recebimentos
DROP TRIGGER IF EXISTS trg_recebimentos_admin_cols ON public.recebimentos;
CREATE TRIGGER trg_recebimentos_admin_cols
  BEFORE UPDATE ON public.recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'assinatura_lider', 'assinatura_lider_nome', 'assinatura_lider_datetime', 'status_assinatura'
  );

DROP TRIGGER IF EXISTS trg_recebimentos_immutable_cols ON public.recebimentos;
CREATE TRIGGER trg_recebimentos_immutable_cols
  BEFORE UPDATE ON public.recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('protocolo_recebimento', 'created_at');

-- 3.4 empilha_ocorrencias
DROP TRIGGER IF EXISTS trg_empilha_ocorrencias_admin_cols ON public.empilha_ocorrencias;
CREATE TRIGGER trg_empilha_ocorrencias_admin_cols
  BEFORE UPDATE ON public.empilha_ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'resolvido', 'resolucao', 'registrado_por', 'registrado_por_id'
  );

DROP TRIGGER IF EXISTS trg_empilha_ocorrencias_immutable_cols ON public.empilha_ocorrencias;
CREATE TRIGGER trg_empilha_ocorrencias_immutable_cols
  BEFORE UPDATE ON public.empilha_ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('created_at');

-- 3.5 recebimento_ocorrencias
DROP TRIGGER IF EXISTS trg_recebimento_ocorrencias_admin_cols ON public.recebimento_ocorrencias;
CREATE TRIGGER trg_recebimento_ocorrencias_admin_cols
  BEFORE UPDATE ON public.recebimento_ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'resolvido', 'resolucao', 'registrado_por', 'registrado_por_id'
  );

DROP TRIGGER IF EXISTS trg_recebimento_ocorrencias_immutable_cols ON public.recebimento_ocorrencias;
CREATE TRIGGER trg_recebimento_ocorrencias_immutable_cols
  BEFORE UPDATE ON public.recebimento_ocorrencias
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('created_at');

-- 3.6 nota_fiscal_arquivos
DROP TRIGGER IF EXISTS trg_nota_fiscal_arquivos_admin_cols ON public.nota_fiscal_arquivos;
CREATE TRIGGER trg_nota_fiscal_arquivos_admin_cols
  BEFORE UPDATE ON public.nota_fiscal_arquivos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns(
    'descartado', 'descartado_por', 'descartado_em', 'arquivo_url'
  );

DROP TRIGGER IF EXISTS trg_nota_fiscal_arquivos_immutable_cols ON public.nota_fiscal_arquivos;
CREATE TRIGGER trg_nota_fiscal_arquivos_immutable_cols
  BEFORE UPDATE ON public.nota_fiscal_arquivos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('protocolo_arquivo', 'created_at');

-- 3.7 envase_records
DROP TRIGGER IF EXISTS trg_envase_records_admin_cols ON public.envase_records;
CREATE TRIGGER trg_envase_records_admin_cols
  BEFORE UPDATE ON public.envase_records
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns('operator_id', 'operador');

DROP TRIGGER IF EXISTS trg_envase_records_immutable_cols ON public.envase_records;
CREATE TRIGGER trg_envase_records_immutable_cols
  BEFORE UPDATE ON public.envase_records
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('protocolo', 'created_at');

-- 3.8 checkout_itens
DROP TRIGGER IF EXISTS trg_checkout_itens_admin_cols ON public.checkout_itens;
CREATE TRIGGER trg_checkout_itens_admin_cols
  BEFORE UPDATE ON public.checkout_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns('operador', 'operator_id');

DROP TRIGGER IF EXISTS trg_checkout_itens_immutable_cols ON public.checkout_itens;
CREATE TRIGGER trg_checkout_itens_immutable_cols
  BEFORE UPDATE ON public.checkout_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('created_at');

-- 3.9 checklist_recebimentos
DROP TRIGGER IF EXISTS trg_checklist_recebimentos_admin_cols ON public.checklist_recebimentos;
CREATE TRIGGER trg_checklist_recebimentos_admin_cols
  BEFORE UPDATE ON public.checklist_recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_admin_columns('criado_por_id', 'criado_por_nome');

DROP TRIGGER IF EXISTS trg_checklist_recebimentos_immutable_cols ON public.checklist_recebimentos;
CREATE TRIGGER trg_checklist_recebimentos_immutable_cols
  BEFORE UPDATE ON public.checklist_recebimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('numero_checklist', 'created_at');

-- 3.10 checkout_programacoes
DROP TRIGGER IF EXISTS trg_checkout_prog_immutable_cols ON public.checkout_programacoes;
CREATE TRIGGER trg_checkout_prog_immutable_cols
  BEFORE UPDATE ON public.checkout_programacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('codigo_programacao', 'created_at');

-- 3.11 empilha_programacoes
DROP TRIGGER IF EXISTS trg_empilha_prog_immutable_cols ON public.empilha_programacoes;
CREATE TRIGGER trg_empilha_prog_immutable_cols
  BEFORE UPDATE ON public.empilha_programacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_immutable_columns('codigo_programacao', 'created_at');
