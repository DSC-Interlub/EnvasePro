-- ============================================================================
-- MIGRATION: 20261006000004_notificar_ocorrencia_idempotency.sql
-- DESCRIÇÃO: Adiciona a coluna notificado_em na tabela empilha_ocorrencias para
--            garantir idempotência no envio de notificações por e-mail.
-- ============================================================================

ALTER TABLE public.empilha_ocorrencias
  ADD COLUMN IF NOT EXISTS notificado_em TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.empilha_ocorrencias.notificado_em IS
  'Timestamp do envio da notificação por e-mail para prevenir disparos duplicados (idempotência).';
