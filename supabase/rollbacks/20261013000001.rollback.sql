-- =============================================================================
-- ROLLBACK de 20261013000001_fuso_brasilia_no_banco
-- =============================================================================
-- Volta gerar_protocolo ao ano de CURRENT_DATE e o padrão de
-- nota_fiscal_arquivos.data_arquivo a CURRENT_DATE — o estado de produção
-- antes da migration (snapshot prod_2026-10-19T17-56-01Z). Os comentários que
-- a migration pôs eram nulos antes, e voltam a ser.
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.gerar_protocolo(prefixo text, nome_sequence text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
COMMENT ON FUNCTION public.gerar_protocolo(text, text) IS NULL;

ALTER TABLE public.nota_fiscal_arquivos ALTER COLUMN data_arquivo SET DEFAULT CURRENT_DATE;
COMMENT ON COLUMN public.nota_fiscal_arquivos.data_arquivo IS NULL;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261013000001';

NOTIFY pgrst, 'reload schema';
COMMIT;
