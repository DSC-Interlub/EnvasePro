-- Migration: 20261005000001_sap_pedidos_restrict_to_admin.sql
-- Objetivo: Restringir leitura de sap_pedidos a admins (valores comerciais de fornecedores)
-- Decisão: Operadores de chão de fábrica não devem ver pedidos SAP com valores comerciais.
-- Item 16 da auditoria de segurança (2026-10-02).

-- Remove a política permissiva atual (leitura por qualquer authenticated)
DROP POLICY IF EXISTS "sap_pedidos_select_auth" ON public.sap_pedidos;

-- Cria nova política restrita: SELECT apenas para admin
CREATE POLICY "sap_pedidos_select_admin" ON public.sap_pedidos
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- WRITE já estava restrito a admin — sem alteração necessária.
-- (sap_pedidos_write_admin mantida como está)
