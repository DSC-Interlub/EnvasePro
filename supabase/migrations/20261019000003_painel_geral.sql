-- =============================================================================
-- Painel geral (/Painel), calculado no banco
-- =============================================================================
--
-- O QUE ISTO SUBSTITUI
--
-- /Painel fazia 16 consultas, cada uma com um teto (100, 50, 30 ou 10 linhas
-- mais recentes), e calculava "hoje", "semana" e as pendências DENTRO dessas
-- janelas. Com o volume da Base44 (~22 envases por dia, ~150 por semana) os
-- números da semana saíam truncados, sem aviso nenhum.
--
-- Esta função devolve o painel inteiro num objeto JSON só.
--
-- CORREÇÕES — declaradas, cada uma com o valor antigo ao lado do novo no teste
-- scripts/test-painel-geral.mjs:
--
--  1. TETOS. Toda contagem era feita dentro das N linhas mais recentes. Aqui
--     não há teto em contagem nenhuma; só as listas de cartões são curtas
--     (4 por módulo, 5 ocorrências), como a tela já mostrava.
--  2. "HOJE" E "SEMANA" EM UTC. Checklists, NFs, recebimentos, check-outs e
--     linhas da semana eram comparados pelo texto de created_at/updated_at,
--     que está em UTC: o que acontecia depois das 21h caía no dia seguinte.
--     Aqui a data de cada registro é a de Brasília.
--  3. LIMPEZAS DA SEMANA incluíam todas as programadas a partir de segunda,
--     inclusive as das semanas SEGUINTES (e, com o teto de 100 ordenado pela
--     data prevista mais distante, quase só elas). Aqui é segunda a domingo.
--  4. PÍLULA "N ativo(s)" contava depois do corte de 4 cartões: nunca passava
--     de 4. Aqui é o total.
--  5. CARTÃO DE RECEBIMENTO lia `operador_nome` do participante — a coluna se
--     chama `operator_nome`. O nome e a foto do participante nunca apareciam.
--  6. CARTÃO DA EMPILHADEIRA lia `numero_linha` e `descricao`, colunas que
--     não existem em empilha_linhas: todo cartão dizia só "Linha". Aqui vão
--     numero_item e descricao_produto.
--  7. MANUTENÇÃO PRÓXIMA fazia a conta com a data em UTC e, depois das 21h,
--     pegava uma manutenção a 8 dias — e divergia do selo do menu. Aqui é a
--     regra de contadores_do_menu(): data_proxima_manutencao <= hoje + 7.
--
-- O resto é paridade estrita. A média da nota do checklist usa
-- floor(x + 0.5), que é o Math.round do JavaScript: a nota vai de -90 a +90 e
-- o round() do Postgres arredonda -2,5 para -3, o JS para -2.
--
-- SEGURANÇA — as mesmas decisões de contadores_do_menu():
--  - NÃO é SECURITY DEFINER: o RLS vale.  STABLE.  search_path fixo.
--  - EXECUTE só para `authenticated`.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_limpeza_programacoes_data
  ON public.limpeza_programacoes (data_prevista);
CREATE INDEX IF NOT EXISTS idx_recebimentos_status
  ON public.recebimentos (status);
CREATE INDEX IF NOT EXISTS idx_recebimento_participantes_recebimento
  ON public.recebimento_participantes (recebimento_id);

CREATE OR REPLACE FUNCTION public.painel_geral()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH t AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  p AS (
    -- Semana de segunda a domingo (date_trunc('week') começa na segunda).
    SELECT hoje,
           date_trunc('week', hoje)::date AS semana,
           (date_trunc('week', hoje) + interval '6 days')::date AS semana_fim
      FROM t
  ),
  -- A data de Brasília de um instante.
  ck AS (
    SELECT c.*, (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia
      FROM checklist_recebimentos c
  ),
  envase_hoje AS (
    SELECT * FROM envase_records WHERE data = (SELECT hoje FROM p)
  ),
  envase_ativo AS (
    SELECT * FROM envase_hoje
     WHERE inicio IS NOT NULL
       AND CASE WHEN sala = 'Bio' THEN material_retirado IS NOT TRUE ELSE termino IS NULL END
  ),
  checkout_hoje AS (
    SELECT i.* FROM checkout_itens i
      JOIN checkout_programacoes pr ON pr.id = i.programacao_id
     WHERE pr.data_programada = (SELECT hoje FROM p)
  ),
  checkout_ativo AS (
    SELECT * FROM checkout_hoje
     WHERE hora_inicio IS NOT NULL AND hora_termino IS NULL AND status = 'Em Andamento'
  ),
  empilha_ativa AS (
    SELECT l.* FROM empilha_linhas l
      JOIN empilha_programacoes pr ON pr.id = l.programacao_id
     WHERE pr.data_programada = (SELECT hoje FROM p) AND l.status = 'Em Andamento'
  ),
  receb_ativo AS (
    SELECT * FROM recebimentos WHERE status = 'Em andamento'
  ),
  limp AS (
    SELECT * FROM limpeza_programacoes
  )
  SELECT jsonb_build_object(
    'dia',         (SELECT hoje FROM p),
    'semana_inicio', (SELECT semana FROM p),
    'gerado_em',   now(),

    'hoje', jsonb_build_object(
      'envases',             (SELECT count(*) FROM envase_hoje),
      'envases_concluidos',  (SELECT count(*) FROM envase_hoje WHERE termino IS NOT NULL),
      'producao',            COALESCE((SELECT sum(quantidade_produzida) FROM envase_hoje), 0),
      'checklists',          (SELECT count(*) FROM ck WHERE dia = (SELECT hoje FROM p)),
      'nota_media',          (SELECT floor(avg(COALESCE(nota_final, 0)) + 0.5)::int
                                FROM ck WHERE dia = (SELECT hoje FROM p)),
      'limpezas',            (SELECT count(*) FROM limp WHERE data_prevista = (SELECT hoje FROM p)),
      'limpezas_concluidas', (SELECT count(*) FROM limp
                               WHERE data_prevista = (SELECT hoje FROM p) AND status = 'Concluído')
    ),

    'semana', jsonb_build_object(
      'envases',  (SELECT count(*) FROM envase_records
                    WHERE data BETWEEN (SELECT semana FROM p) AND (SELECT hoje FROM p)),
      'producao', COALESCE((SELECT sum(quantidade_produzida) FROM envase_records
                    WHERE data BETWEEN (SELECT semana FROM p) AND (SELECT hoje FROM p)), 0),
      'checkouts_concluidos', (SELECT count(*) FROM checkout_itens
                    WHERE status = 'Concluído'
                      AND (updated_at AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT semana FROM p)),
      'linhas_movimentadas', (SELECT count(*) FROM empilha_linhas
                    WHERE status = 'Concluído'
                      AND (updated_at AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT semana FROM p)),
      'recebimentos', (SELECT count(*) FROM recebimentos
                    WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT semana FROM p)),
      'checklists',   (SELECT count(*) FROM ck WHERE dia >= (SELECT semana FROM p)),
      'nota_media',   (SELECT floor(avg(COALESCE(nota_final, 0)) + 0.5)::int
                         FROM ck WHERE dia >= (SELECT semana FROM p)),
      'limpezas',     (SELECT count(*) FROM limp
                    WHERE data_prevista BETWEEN (SELECT semana FROM p) AND (SELECT semana_fim FROM p)),
      'limpezas_concluidas', (SELECT count(*) FROM limp
                    WHERE data_prevista BETWEEN (SELECT semana FROM p) AND (SELECT semana_fim FROM p)
                      AND status = 'Concluído'),
      'nfs', (SELECT count(*) FROM nota_fiscal_arquivos
                    WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT semana FROM p))
    ),

    'pendencias', jsonb_build_object(
      'assinaturas',
          (SELECT count(*) FROM empilha_linhas WHERE status = 'Concluído' AND assinatura_lider IS NOT TRUE)
        + (SELECT count(*) FROM limp WHERE status = 'Concluído'
              AND assinatura_responsavel IS TRUE AND assinatura_lider IS NOT TRUE)
        + (SELECT count(*) FROM recebimentos WHERE status = 'Concluído' AND assinatura_lider IS NOT TRUE),
      'ocorrencias',
          (SELECT count(*) FROM empilha_ocorrencias WHERE resolvido IS NOT TRUE)
        + (SELECT count(*) FROM recebimento_ocorrencias WHERE resolvido IS NOT TRUE),
      'limpezas_atrasadas', (SELECT count(*) FROM limp
                    WHERE data_prevista < (SELECT hoje FROM p) AND status <> 'Concluído'),
      'checklists_reprovados_hoje', (SELECT count(*) FROM ck
                    WHERE dia = (SELECT hoje FROM p) AND COALESCE(nota_final, 0) < 0),
      'nfs_sem_arquivo_3dias', (SELECT count(*) FROM nota_fiscal_arquivos
                    WHERE COALESCE(arquivo_url, '') = '' AND created_at < now() - interval '3 days'),
      'manutencao', (SELECT count(*) FROM empilhadeira_configs
                    WHERE data_proxima_manutencao IS NOT NULL
                      AND data_proxima_manutencao <= (SELECT hoje FROM p) + 7)
    ),

    'ao_vivo', jsonb_build_object(
      'envase', jsonb_build_object(
        'total', (SELECT count(*) FROM envase_ativo),
        'itens', COALESCE((SELECT jsonb_agg(x ORDER BY x.atualizado DESC, x.id) FROM (
            SELECT id, operador, operator_id, sala, descricao_produto, quantidade_produzida, inicio,
                   updated_at AS atualizado
              FROM envase_ativo ORDER BY updated_at DESC, id LIMIT 4) x), '[]'::jsonb)
      ),
      'checkout', jsonb_build_object(
        'total',    (SELECT count(*) FROM checkout_ativo),
        'criticos', (SELECT count(*) FROM checkout_hoje WHERE critico IS TRUE AND status <> 'Concluído'),
        'itens', COALESCE((SELECT jsonb_agg(x ORDER BY x.hora_inicio DESC, x.id) FROM (
            SELECT id, numero_pedido, cliente, operador, operator_id, critico, data_entrega, hora_inicio
              FROM checkout_ativo ORDER BY hora_inicio DESC, id LIMIT 4) x), '[]'::jsonb)
      ),
      'empilha', jsonb_build_object(
        'total', (SELECT count(*) FROM empilha_ativa),
        'parada', (SELECT jsonb_build_object('tipo', tipo, 'hora_inicio', hora_inicio)
                     FROM empilhadeira_paradas
                    WHERE data = (SELECT hoje FROM p) AND hora_fim IS NULL
                    ORDER BY created_at DESC LIMIT 1),
        'itens', COALESCE((SELECT jsonb_agg(to_jsonb(x) - 'ordem' ORDER BY x.ordem, x.hora_inicio NULLS LAST, x.id) FROM (
            SELECT id, operador_empilhadeira, operador_empilhadeira_id, tipo_linha,
                   numero_item, descricao_produto, codigo_produto, hora_inicio,
                   CASE tipo_linha WHEN 'Crítico' THEN 0 WHEN 'Avulso' THEN 1 ELSE 2 END AS ordem
              FROM empilha_ativa ORDER BY ordem, hora_inicio NULLS LAST, id LIMIT 4) x), '[]'::jsonb)
      ),
      'recebimento', jsonb_build_object(
        'total', (SELECT count(*) FROM receb_ativo),
        'itens', COALESCE((SELECT jsonb_agg(x ORDER BY x.criado DESC, x.id) FROM (
            SELECT r.id, r.tipo, r.prioridade, r.numero_documento, r.fornecedor_nome, r.datetime_inicio,
                   r.created_at AS criado,
                   (SELECT count(*) FROM recebimento_participantes rp WHERE rp.recebimento_id = r.id) AS participantes,
                   (SELECT jsonb_build_object('id', rp.operator_id, 'nome', rp.operator_nome)
                      FROM recebimento_participantes rp WHERE rp.recebimento_id = r.id
                     ORDER BY rp.created_at DESC, rp.id LIMIT 1) AS primeiro
              FROM receb_ativo r ORDER BY r.created_at DESC, r.id LIMIT 4) x), '[]'::jsonb)
      )
    ),

    -- As abertas, as de empilhadeira primeiro (a ordem da tela), 5 no máximo.
    'ocorrencias', COALESCE((SELECT jsonb_agg(to_jsonb(x) - 'ordem' ORDER BY x.ordem, x.created_at DESC, x.id) FROM (
        SELECT * FROM (
          SELECT id, 'Empilhadeira' AS modulo, tipo::text AS tipo, descricao, registrado_por, created_at, 0 AS ordem
            FROM empilha_ocorrencias WHERE resolvido IS NOT TRUE
          UNION ALL
          SELECT id, 'Recebimento', tipo::text, descricao, registrado_por, created_at, 1
            FROM recebimento_ocorrencias WHERE resolvido IS NOT TRUE
        ) u ORDER BY ordem, created_at DESC, id LIMIT 5) x), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.painel_geral() IS
  'Painel geral (/Painel): hoje, semana, pendências, cartões ao vivo e ocorrências. '
  'Direitos do invocador: o RLS continua valendo. Substitui 16 consultas com teto.';

REVOKE ALL ON FUNCTION public.painel_geral() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_geral() FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_geral() TO authenticated;
