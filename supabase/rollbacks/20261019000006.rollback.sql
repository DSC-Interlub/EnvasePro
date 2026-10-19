-- =============================================================================
-- ROLLBACK de 20261019000006_metas_diarias
-- =============================================================================
-- Volta os painéis das TVs ao texto das migrations 000001/000002 (sem meta),
-- apaga metas_do_dia() e a tabela metas_diarias.
--
-- ATENÇÃO: apagar a tabela APAGA AS METAS LANÇADAS. Exporte antes:
--   select * from public.metas_diarias;
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.painel_televisao_empilha()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH dia AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  linhas AS (
    SELECT l.*
      FROM empilha_linhas l
      JOIN empilha_programacoes p ON p.id = l.programacao_id
     WHERE p.data_programada = (SELECT hoje FROM dia)
  ),
  -- O JavaScript fazia `tempo_total.split(":")` e somava h*60+m. Texto fora
  -- do formato H:MM virava NaN e estragava a média inteira; aqui fica de fora.
  tempos AS (
    SELECT split_part(tempo_total, ':', 1)::int * 60
         + split_part(tempo_total, ':', 2)::int AS minutos
      FROM linhas
     WHERE status = 'Concluído'
       AND tempo_total ~ '^\s*\d+:\d+'
  ),
  ocorr AS (
    SELECT tipo, hora, created_at
      FROM empilha_ocorrencias
     WHERE data = (SELECT hoje FROM dia)
       AND resolvido IS NOT TRUE
  )
  SELECT jsonb_build_object(
    'dia',                (SELECT hoje FROM dia),
    'gerado_em',          now(),
    'total',              (SELECT count(*) FROM linhas),
    'concluidas',         (SELECT count(*) FROM linhas WHERE status = 'Concluído'),
    'em_andamento',       (SELECT count(*) FROM linhas WHERE status = 'Em Andamento'),
    'criticos_pendentes', (SELECT count(*) FROM linhas
                            WHERE tipo_linha = 'Crítico' AND status <> 'Concluído'),
    -- Math.round do JS e round() do numeric coincidem para positivos.
    'tempo_medio_min',    COALESCE((SELECT round(avg(minutos))::int FROM tempos), 0),
    'ocorrencias_abertas', (SELECT count(*) FROM ocorr),
    'ultima_ocorrencia',  (SELECT jsonb_build_object('tipo', tipo, 'hora', hora)
                             FROM ocorr ORDER BY hora DESC, created_at DESC LIMIT 1),
    -- Só as linhas EM ANDAMENTO, na ordem Crítico → Avulso → Normal (a regra
    -- de /Televisao; /TelevisaoEmpilha só punha as críticas no topo e deixava
    -- o resto na ordem do download — agora as duas TVs usam a mesma), e
    -- dentro de cada tipo pela hora de início. Com os campos que o cartão mostra. Teto de 60: a grade mostra 4 por página e
    -- roda; 60 linhas simultâneas é mais que a fábrica tem empilhadeiras.
    'operacoes', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) - 'ordem' ORDER BY o.ordem, o.hora_inicio NULLS LAST, o.id)
        FROM (
          SELECT id, tipo_linha, status,
                 (tipo_linha = 'Crítico') AS critica,
                 CASE tipo_linha WHEN 'Crítico' THEN 0 WHEN 'Avulso' THEN 1 ELSE 2 END AS ordem,
                 operador_empilhadeira, operador_empilhadeira_id, operador_ajudante,
                 descricao_produto, codigo_produto, numero_item, rua_torre,
                 deposito, quantidade, hora_inicio
            FROM linhas
           WHERE status = 'Em Andamento'
           ORDER BY ordem, hora_inicio NULLS LAST, id
           LIMIT 60
        ) o
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.painel_televisao_empilha() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_televisao_empilha() FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_televisao_empilha() TO authenticated;

CREATE OR REPLACE FUNCTION public.painel_televisao()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH dia AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  mes AS (
    SELECT date_trunc('month', hoje)::date AS inicio,
           (date_trunc('month', hoje) + interval '1 month')::date AS fim
      FROM dia
  ),
  envase AS (
    SELECT e.* FROM envase_records e WHERE e.data = (SELECT hoje FROM dia)
  ),
  -- A regra do cartão: começou; na sala Bio fica até o material ser
  -- retirado; nas outras, até terminar.
  envase_ativo AS (
    SELECT * FROM envase
     WHERE inicio IS NOT NULL
       AND CASE WHEN sala = 'Bio' THEN material_retirado IS NOT TRUE
                ELSE termino IS NULL END
  ),
  checkout AS (
    SELECT i.*
      FROM checkout_itens i
      JOIN checkout_programacoes p ON p.id = i.programacao_id
     WHERE p.data_programada = (SELECT hoje FROM dia)
  ),
  checkout_ativo AS (
    SELECT * FROM checkout
     WHERE hora_inicio IS NOT NULL AND hora_termino IS NULL AND status = 'Em Andamento'
  ),
  envase_mes AS (
    SELECT e.sala, e.quantidade_produzida, p.categoria::text AS categoria
      FROM envase_records e
      LEFT JOIN products p ON p.codigo = e.codigo_produto
     WHERE e.data >= (SELECT inicio FROM mes) AND e.data < (SELECT fim FROM mes)
  ),
  empilhadeira AS (
    SELECT nome, data_proxima_manutencao
      FROM empilhadeira_configs WHERE ativa IS TRUE
     ORDER BY created_at LIMIT 1
  )
  SELECT jsonb_build_object(
    'dia',       (SELECT hoje FROM dia),
    'gerado_em', now(),

    'envase', jsonb_build_object(
      'producao_dia', COALESCE((SELECT sum(quantidade_produzida) FROM envase), 0),
      'concluidos',   (SELECT count(*) FROM envase WHERE termino IS NOT NULL),
      'lancados',     (SELECT count(*) FROM envase WHERE inicio IS NOT NULL OR termino IS NOT NULL),
      'em_andamento', (SELECT count(*) FROM envase_ativo),
      'operacoes', COALESCE((
        SELECT jsonb_agg(o ORDER BY o.atualizado DESC, o.id)
          FROM (
            SELECT a.id, a.sala, a.op, a.operador, a.operator_id,
                   a.codigo_produto, a.descricao_produto, a.quantidade_produzida,
                   a.inicio, a.termino, a.material_retirado,
                   COALESCE(pr.halal, false) AS halal, COALESCE(pr.kosher, false) AS kosher,
                   COALESCE(pr.nsf_3h, false) AS nsf_3h, COALESCE(pr.nsf_h1, false) AS nsf_h1,
                   a.updated_at AS atualizado
              FROM envase_ativo a
              LEFT JOIN products pr ON pr.codigo = a.codigo_produto
             ORDER BY a.updated_at DESC, a.id
             LIMIT 60
          ) o
      ), '[]'::jsonb)
    ),

    'checkout', jsonb_build_object(
      'total_dia',    (SELECT count(*) FROM checkout),
      'concluidos',   (SELECT count(*) FROM checkout WHERE status = 'Concluído'),
      'pendentes',    (SELECT count(*) FROM checkout WHERE status <> 'Concluído'),
      'em_andamento', (SELECT count(*) FROM checkout_ativo),
      'criticos',     (SELECT count(*) FROM checkout_ativo WHERE critico IS TRUE),
      'operacoes', COALESCE((
        SELECT jsonb_agg(o ORDER BY o.hora_inicio DESC, o.id)
          FROM (
            SELECT id, numero_pedido, cliente, data_entrega, critico,
                   operador, operator_id, hora_inicio
              FROM checkout_ativo
             ORDER BY hora_inicio DESC, id
             LIMIT 60
          ) o
      ), '[]'::jsonb)
    ),

    -- A mesma função da TV de empilhadeira — uma regra só para as duas TVs —
    -- mais o que só a TV principal mostra no rodapé.
    'empilha', public.painel_televisao_empilha() || jsonb_build_object(
      'parada_ativa', EXISTS (SELECT 1 FROM empilhadeira_paradas
                               WHERE data = (SELECT hoje FROM dia) AND hora_fim IS NULL),
      'empilhadeira', (SELECT to_jsonb(e) FROM empilhadeira e)
    ),

    'mes', (
      SELECT jsonb_build_object(
        'total',                COALESCE(sum(quantidade_produzida), 0),
        'bio',                  COALESCE(sum(quantidade_produzida) FILTER (WHERE sala = 'Bio'), 0),
        'industrial',           COALESCE(sum(quantidade_produzida) FILTER (WHERE sala = 'Industrial'), 0),
        'registros',            count(*),
        'bio_registros',        count(*) FILTER (WHERE sala = 'Bio'),
        'industrial_registros', count(*) FILTER (WHERE sala = 'Industrial'),
        'oleo',  COALESCE(sum(quantidade_produzida) FILTER (WHERE categoria = 'Óleo'), 0),
        'graxa', COALESCE(sum(quantidade_produzida) FILTER (WHERE categoria = 'Graxa'), 0),
        'pasta', COALESCE(sum(quantidade_produzida) FILTER (WHERE categoria = 'Pasta'), 0)
      )
      FROM envase_mes
    )
  );
$$;
REVOKE ALL ON FUNCTION public.painel_televisao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_televisao() FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_televisao() TO authenticated;

DROP FUNCTION IF EXISTS public.metas_do_dia(date);
DROP TABLE IF EXISTS public.metas_diarias;

-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019000006';

NOTIFY pgrst, 'reload schema';
COMMIT;
