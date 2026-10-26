-- =============================================================================
-- ROLLBACK de 20261026000001_checkout_excluir_pedido_pendente
-- =============================================================================
-- Volta a exclusão de item de check-out a ser só do admin. Não toca em dados.
BEGIN;
DROP POLICY IF EXISTS checkout_itens_delete_pendente_ou_admin ON public.checkout_itens;
DROP POLICY IF EXISTS checkout_itens_delete_admin ON public.checkout_itens;
CREATE POLICY checkout_itens_delete_admin
  ON public.checkout_itens
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261026000001';

NOTIFY pgrst, 'reload schema';
COMMIT;
