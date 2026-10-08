-- =============================================================================
-- Contadores do menu, calculados no banco
-- =============================================================================
--
-- O QUE ISTO SUBSTITUI
--
-- O menu lateral (src/Layout.jsx) calculava os dois selos de pendência
-- baixando SETE tabelas inteiras a cada 60 segundos e contando no navegador.
-- Só roda para admin, mas é a tela que o admin deixa aberta o dia todo: a
-- cada minuto vinham todas as linhas de empilhadeira, todas as ocorrências,
-- todas as paradas, todas as programações de limpeza e todos os recebimentos,
-- para produzir dois números.
--
-- Esta função devolve os números já contados, numa linha só.
--
-- AS DECISÕES DE SEGURANÇA, e por quê
--
--  - **NÃO é SECURITY DEFINER.** Roda com os direitos de quem chama, então o
--    RLS continua valendo exatamente como vale hoje nas consultas do
--    navegador. Uma função SECURITY DEFINER aqui viraria um caminho para
--    contar linhas que o RLS esconde — um vazamento por contagem.
--  - **STABLE**: só lê. Não pode ser usada para escrever nada.
--  - **search_path fixo** (`public, pg_temp`): sem isto, quem chama pode
--    anteceder um esquema seu e fazer a função ler as tabelas dele.
--  - **anon não recebe nada.** EXECUTE é revogado de PUBLIC e concedido só a
--    `authenticated`.
--
-- PARIDADE
--
-- Cada contador abaixo reproduz a condição que estava no JavaScript. O que
-- mudar aqui tem de mudar lá, e o teste scripts/test-contadores-menu.js
-- compara os dois resultados com dados de verdade.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.contadores_do_menu()
RETURNS TABLE (
  assinaturas_pendentes  bigint,  -- empilha: concluída e sem assinatura do líder
  ocorrencias_abertas    bigint,  -- empilha: ocorrência não resolvida
  paradas_abertas        bigint,  -- empilhadeira parada sem hora de fim
  alertas_manutencao     bigint,  -- manutenção vencida ou a vencer em 7 dias
  limpezas_atrasadas     bigint,  -- prevista para antes de hoje e não concluída
  limpezas_aguardando    bigint,  -- concluída e assinada, à espera do líder
  receb_aguarda_lider    bigint,  -- recebimento concluído sem assinatura do líder
  receb_ocorr_abertas    bigint   -- recebimento: ocorrência não resolvida
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*) FROM empilha_linhas
      WHERE status = 'Concluído' AND assinatura_lider IS NOT TRUE),

    (SELECT count(*) FROM empilha_ocorrencias
      WHERE resolvido IS NOT TRUE),

    (SELECT count(*) FROM empilhadeira_paradas
      WHERE hora_fim IS NULL),

    -- O JavaScript fazia ceil((data - agora)/dia) <= 7, o que inclui as
    -- vencidas (diferença negativa). Daí o <=, sem piso.
    (SELECT count(*) FROM empilhadeira_configs
      WHERE data_proxima_manutencao IS NOT NULL
        AND data_proxima_manutencao <= CURRENT_DATE + 7),

    (SELECT count(*) FROM limpeza_programacoes
      WHERE data_prevista < CURRENT_DATE AND status <> 'Concluído'),

    (SELECT count(*) FROM limpeza_programacoes
      WHERE status = 'Concluído'
        AND assinatura_responsavel IS TRUE
        AND assinatura_lider IS NOT TRUE),

    (SELECT count(*) FROM recebimentos
      WHERE status = 'Concluído' AND assinatura_lider IS NOT TRUE),

    (SELECT count(*) FROM recebimento_ocorrencias
      WHERE resolvido IS NOT TRUE);
$$;

COMMENT ON FUNCTION public.contadores_do_menu() IS
  'Contadores dos selos do menu. Direitos do invocador: o RLS continua valendo. '
  'Substitui o download de 7 tabelas inteiras a cada 60s no navegador.';

REVOKE ALL ON FUNCTION public.contadores_do_menu() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contadores_do_menu() FROM anon;
GRANT EXECUTE ON FUNCTION public.contadores_do_menu() TO authenticated;
