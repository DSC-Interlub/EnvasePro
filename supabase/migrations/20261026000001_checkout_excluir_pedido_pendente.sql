-- =============================================================================
-- 20261026000001_checkout_excluir_pedido_pendente
--
-- Pedido do check-out (26/10/2026): a programação é feita de manhã e, ao longo
-- do dia, um pedido pode ser CANCELADO e não ser separado. Na Base44 dava para
-- excluí-lo; aqui só o admin podia, e a programação do dia ficava sempre com
-- algo pendente.
--
-- Regra nova: qualquer conta logada exclui um item de check-out que ainda está
-- 'Pendente' (não foi iniciado). Item 'Em Andamento' ou 'Concluído' continua
-- só para admin — é histórico de trabalho feito e não some por engano.
-- A tela ExecutarCheckout já recalcula total e status da programação quando a
-- lista muda, então a programação fecha como 'Concluído' sozinha.
--
-- Rollback: supabase/rollbacks/20261026000001.rollback.sql
-- =============================================================================

DROP POLICY IF EXISTS checkout_itens_delete_admin ON public.checkout_itens;
DROP POLICY IF EXISTS checkout_itens_delete_pendente_ou_admin ON public.checkout_itens;

CREATE POLICY checkout_itens_delete_pendente_ou_admin
  ON public.checkout_itens
  FOR DELETE
  TO authenticated
  USING (public.is_admin() OR status = 'Pendente'::public.status_padrao);
