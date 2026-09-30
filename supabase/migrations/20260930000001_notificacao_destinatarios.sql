-- ============================================================================
-- MIGRATION: 20260930000001_notificacao_destinatarios.sql
-- OBJETIVO: Tabela para gerenciar destinatários de alertas de ocorrência de empilhadeira
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notificacao_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  nome TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacao_destinatarios ENABLE ROW LEVEL SECURITY;

-- 1. Leitura: usuários autenticados
CREATE POLICY "notificacao_destinatarios_select" ON public.notificacao_destinatarios
  FOR SELECT TO authenticated
  USING (true);

-- 2. Escrita: exclusivo para Administradores
CREATE POLICY "notificacao_destinatarios_insert" ON public.notificacao_destinatarios
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "notificacao_destinatarios_update" ON public.notificacao_destinatarios
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "notificacao_destinatarios_delete" ON public.notificacao_destinatarios
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- 3. Notificar recarregamento de schema do PostgREST
NOTIFY pgrst, 'reload schema';
