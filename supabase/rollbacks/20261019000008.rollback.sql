-- =============================================================================
-- ROLLBACK de 20261019000008_privilegios_minimos_tabelas
-- =============================================================================
-- Devolve o que havia antes: REFERENCES, TRIGGER e MAINTAIN ao authenticated e
-- MAINTAIN ao anon nas 24 tabelas antigas, e o privilégio padrão anterior do
-- papel postgres. (O TRUNCATE não volta: já tinha saído na 20261007000002.)
-- ATENÇÃO: isso REABRE privilégios que o app não usa.
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

GRANT REFERENCES, TRIGGER, MAINTAIN ON public.checklist_recebimentos TO authenticated;
GRANT MAINTAIN ON public.checklist_recebimentos TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.checkout_itens TO authenticated;
GRANT MAINTAIN ON public.checkout_itens TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.checkout_programacoes TO authenticated;
GRANT MAINTAIN ON public.checkout_programacoes TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.embalagens TO authenticated;
GRANT MAINTAIN ON public.embalagens TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.empilha_linhas TO authenticated;
GRANT MAINTAIN ON public.empilha_linhas TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.empilha_ocorrencias TO authenticated;
GRANT MAINTAIN ON public.empilha_ocorrencias TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.empilha_programacoes TO authenticated;
GRANT MAINTAIN ON public.empilha_programacoes TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.empilhadeira_configs TO authenticated;
GRANT MAINTAIN ON public.empilhadeira_configs TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.empilhadeira_manutencoes TO authenticated;
GRANT MAINTAIN ON public.empilhadeira_manutencoes TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.empilhadeira_paradas TO authenticated;
GRANT MAINTAIN ON public.empilhadeira_paradas TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.envase_records TO authenticated;
GRANT MAINTAIN ON public.envase_records TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.limpeza_locais TO authenticated;
GRANT MAINTAIN ON public.limpeza_locais TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.limpeza_programacoes TO authenticated;
GRANT MAINTAIN ON public.limpeza_programacoes TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.nota_fiscal_arquivos TO authenticated;
GRANT MAINTAIN ON public.nota_fiscal_arquivos TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.notificacao_destinatarios TO authenticated;
GRANT MAINTAIN ON public.notificacao_destinatarios TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.operators TO authenticated;
GRANT MAINTAIN ON public.operators TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.products TO authenticated;
GRANT MAINTAIN ON public.products TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.recebimento_fornecedores TO authenticated;
GRANT MAINTAIN ON public.recebimento_fornecedores TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.recebimento_itens TO authenticated;
GRANT MAINTAIN ON public.recebimento_itens TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.recebimento_ocorrencias TO authenticated;
GRANT MAINTAIN ON public.recebimento_ocorrencias TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.recebimento_participantes TO authenticated;
GRANT MAINTAIN ON public.recebimento_participantes TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.recebimentos TO authenticated;
GRANT MAINTAIN ON public.recebimentos TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.sap_pedidos TO authenticated;
GRANT MAINTAIN ON public.sap_pedidos TO anon;
GRANT REFERENCES, TRIGGER, MAINTAIN ON public.user_profiles TO authenticated;
GRANT MAINTAIN ON public.user_profiles TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT REFERENCES, TRIGGER, MAINTAIN ON TABLES TO authenticated;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000008';

NOTIFY pgrst, 'reload schema';
COMMIT;
