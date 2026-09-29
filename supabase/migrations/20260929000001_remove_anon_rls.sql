-- ============================================================================
-- MIGRATION: 20260929000001_remove_anon_rls.sql
-- OBJETIVO: Remover completamente o acesso do papel 'anon' ao RLS.
-- Todas as 23 tabelas agora exigem estritamente sessão autenticada ('authenticated').
-- ============================================================================

-- 1. Remover policies que permitiam leitura anônima
DROP POLICY IF EXISTS "products_select_tv" ON public.products;
DROP POLICY IF EXISTS "operators_select_tv" ON public.operators;
DROP POLICY IF EXISTS "envase_select_tv" ON public.envase_records;
DROP POLICY IF EXISTS "checkout_prog_select_tv" ON public.checkout_programacoes;
DROP POLICY IF EXISTS "checkout_itens_select_tv" ON public.checkout_itens;
DROP POLICY IF EXISTS "empilha_config_select_tv" ON public.empilhadeira_configs;
DROP POLICY IF EXISTS "empilha_prog_select_tv" ON public.empilha_programacoes;
DROP POLICY IF EXISTS "empilha_linhas_select_tv" ON public.empilha_linhas;
DROP POLICY IF EXISTS "empilha_ocorr_select_tv" ON public.empilha_ocorrencias;
DROP POLICY IF EXISTS "empilha_paradas_select_tv" ON public.empilhadeira_paradas;

-- 2. Recriar policies de SELECT estritamente restritas a 'authenticated'
CREATE POLICY "products_select_auth" ON public.products
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "operators_select_auth" ON public.operators
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "envase_select_auth" ON public.envase_records
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "checkout_prog_select_auth" ON public.checkout_programacoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "checkout_itens_select_auth" ON public.checkout_itens
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "empilha_config_select_auth" ON public.empilhadeira_configs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "empilha_prog_select_auth" ON public.empilha_programacoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "empilha_linhas_select_auth" ON public.empilha_linhas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "empilha_ocorr_select_auth" ON public.empilha_ocorrencias
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "empilha_paradas_select_auth" ON public.empilhadeira_paradas
  FOR SELECT TO authenticated
  USING (true);

-- 3. Storage: restringir fotos-operadores também para authenticated
DROP POLICY IF EXISTS "fotos_public_read" ON storage.objects;
CREATE POLICY "fotos_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fotos-operadores');

-- 4. Notificar PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
