-- =============================================================================
-- Indicadores da empilhadeira num período, calculados no banco
-- =============================================================================
--
-- O QUE ISTO SUBSTITUI
--
-- /IndicadoresEmpilha e a aba "Indicadores" de /Empilhadeira baixavam TODAS
-- as programações, TODAS as linhas, TODAS as paradas e TODAS as ocorrências,
-- de todo o histórico, para mostrar um período. Esta função devolve os cinco
-- blocos (produção, operadores, paradas, ocorrências, OEE) prontos.
--
-- A REGRA É A DO COMPONENTE (BlocosIndicadores.jsx), linha a linha, incluindo
-- como o texto `tempo_total` vira minutos:
--   linha:  "X min" → X (parseInt);  "H:MM" → H*60 + MM;  lixo → 0
--   parada: parseInt do texto ("45" → 45, "1:30" → 1)
-- e o arredondamento do Math.round (floor(x + 0.5)).
--
-- CORREÇÕES DECLARADAS
--  1. Empilhadeira do turno: a página usava a ATIVA, a aba da /Empilhadeira a
--     PRIMEIRA da lista. Agora as duas usam a ativa (a mais antiga, se houver
--     mais de uma); sem nenhuma ativa, 8 h, como antes.
--  2. Desempates (rankings, fatias dos gráficos de pizza) em ordem de código
--     do nome. Antes dependiam da ordem em que as linhas chegavam.
--  3. Parada sem tipo aparecia na pizza com o rótulo "null"; agora "Sem tipo".
--  4. Período invertido (início depois do fim) derrubava a tela
--     (eachDayOfInterval lança); agora devolve vazio.
--
-- SEGURANÇA — as mesmas da contadores_do_menu(): sem SECURITY DEFINER (o RLS
-- vale), STABLE, search_path fixo, EXECUTE só para `authenticated`.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_empilha_ocorrencias_data
  ON public.empilha_ocorrencias (data);
CREATE INDEX IF NOT EXISTS idx_empilhadeira_paradas_data
  ON public.empilhadeira_paradas (data);

CREATE OR REPLACE FUNCTION public.indicadores_empilhadeira(de date, ate date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH
  turno AS (
    SELECT COALESCE(NULLIF((SELECT duracao_turno_horas FROM empilhadeira_configs
                             WHERE ativa IS TRUE ORDER BY created_at, id LIMIT 1), 0), 8)::numeric AS horas
  ),
  dias AS (
    SELECT d::date AS dia FROM generate_series(de, ate, interval '1 day') AS d
  ),
  linhas AS (
    SELECT l.*, p.data_programada AS dia,
           CASE
             WHEN l.tempo_total IS NULL OR l.tempo_total = '' THEN 0
             WHEN position('min' in l.tempo_total) > 0
               THEN COALESCE(substring(l.tempo_total from '^\s*([+-]?\d+)')::numeric, 0)
             ELSE
               (CASE WHEN btrim(split_part(l.tempo_total, ':', 1), E' \t\r\n') ~ '^[+-]?(\d+\.?\d*|\.\d+)$'
                     THEN btrim(split_part(l.tempo_total, ':', 1), E' \t\r\n')::numeric ELSE 0 END) * 60
             + (CASE WHEN btrim(split_part(l.tempo_total, ':', 2), E' \t\r\n') ~ '^[+-]?(\d+\.?\d*|\.\d+)$'
                     THEN btrim(split_part(l.tempo_total, ':', 2), E' \t\r\n')::numeric ELSE 0 END)
           END AS minutos,
           (l.tipo_linha = 'Normal' OR l.tipo_linha IS NULL) AS normal
      FROM empilha_linhas l
      JOIN empilha_programacoes p ON p.id = l.programacao_id
     WHERE p.data_programada BETWEEN de AND ate
  ),
  concl AS (SELECT * FROM linhas WHERE status = 'Concluído'),
  comtempo AS (SELECT * FROM concl WHERE tempo_total IS NOT NULL AND tempo_total <> ''),
  paradas AS (
    SELECT p.*, COALESCE(p.tipo::text, 'Sem tipo') AS rotulo,
           COALESCE(substring(p.tempo_total from '^\s*([+-]?\d+)')::numeric, 0) AS minutos
      FROM empilhadeira_paradas p
     WHERE p.data BETWEEN de AND ate
  ),
  ocorr AS (
    SELECT * FROM empilha_ocorrencias WHERE data BETWEEN de AND ate
  ),
  oee AS (
    SELECT d.dia,
           COALESCE((SELECT sum(minutos) FROM comtempo c WHERE c.dia = d.dia), 0) AS produtivo,
           COALESCE((SELECT sum(minutos) FROM paradas p WHERE p.data = d.dia), 0) AS parado
      FROM dias d
  ),
  oee2 AS (
    SELECT dia, produtivo, parado,
           CASE WHEN (SELECT horas FROM turno) * 60 > 0
                THEN least(100, floor(produtivo / ((SELECT horas FROM turno) * 60) * 100 + 0.5))::int
                ELSE 0 END AS aproveitamento
      FROM oee
  )
  SELECT jsonb_build_object(
    'de', de, 'ate', ate,
    'duracao_turno_horas', (SELECT horas FROM turno),
    'gerado_em', now(),

    'producao', jsonb_build_object(
      'total',      (SELECT count(*) FROM linhas),
      'normal',     (SELECT count(*) FROM linhas WHERE normal),
      'critico',    (SELECT count(*) FROM linhas WHERE tipo_linha = 'Crítico'),
      'avulso',     (SELECT count(*) FROM linhas WHERE tipo_linha = 'Avulso'),
      'concluidas', (SELECT count(*) FROM concl),
      'tempo_medio', COALESCE((SELECT floor(avg(minutos) + 0.5)::int FROM comtempo), 0),
      'por_tipo', (SELECT jsonb_agg(jsonb_build_object(
                     'tipo', t.tipo,
                     'media', COALESCE((SELECT floor(avg(minutos) + 0.5)::int FROM comtempo c
                                         WHERE CASE WHEN t.tipo = 'Normal' THEN c.normal ELSE c.tipo_linha::text = t.tipo END), 0),
                     'count', (SELECT count(*) FROM comtempo c
                                WHERE CASE WHEN t.tipo = 'Normal' THEN c.normal ELSE c.tipo_linha::text = t.tipo END))
                   ORDER BY t.ordem)
                     FROM (VALUES ('Normal', 1), ('Crítico', 2), ('Avulso', 3)) AS t(tipo, ordem)),
      'por_dia', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                     'dia', d.dia,
                     'Normal',  (SELECT count(*) FROM linhas l WHERE l.dia = d.dia AND l.normal),
                     'Crítico', (SELECT count(*) FROM linhas l WHERE l.dia = d.dia AND l.tipo_linha = 'Crítico'),
                     'Avulso',  (SELECT count(*) FROM linhas l WHERE l.dia = d.dia AND l.tipo_linha = 'Avulso'))
                   ORDER BY d.dia) FROM dias d), '[]'::jsonb)
    ),

    'operadores', jsonb_build_object(
      'empilhadores', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'total', total, 'media', media)
                                 ORDER BY total DESC, nome COLLATE "C")
                         FROM (SELECT operador_empilhadeira AS nome, count(*) AS total,
                                      COALESCE(floor(avg(minutos) FILTER (WHERE tempo_total IS NOT NULL AND tempo_total <> '') + 0.5)::int, 0) AS media
                                 FROM concl WHERE COALESCE(operador_empilhadeira, '') <> ''
                                GROUP BY operador_empilhadeira) r), '[]'::jsonb),
      'ajudantes', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'total', total, 'media', media)
                                 ORDER BY total DESC, nome COLLATE "C")
                         FROM (SELECT operador_ajudante AS nome, count(*) AS total,
                                      COALESCE(floor(avg(minutos) FILTER (WHERE tempo_total IS NOT NULL AND tempo_total <> '') + 0.5)::int, 0) AS media
                                 FROM concl WHERE COALESCE(operador_ajudante, '') NOT IN ('', 'nenhum')
                                GROUP BY operador_ajudante) r), '[]'::jsonb)
    ),

    'paradas', jsonb_build_object(
      'total',   (SELECT count(*) FROM paradas),
      'minutos', COALESCE((SELECT sum(minutos) FROM paradas), 0),
      'por_tipo', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', rotulo, 'value', v) ORDER BY rotulo COLLATE "C")
                    FROM (SELECT rotulo, sum(minutos) AS v FROM paradas GROUP BY rotulo) x), '[]'::jsonb),
      'por_dia', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'dia', d.dia,
                    'paradas', (SELECT count(*) FROM paradas p WHERE p.data = d.dia),
                    'tempo', COALESCE((SELECT sum(minutos) FROM paradas p WHERE p.data = d.dia), 0))
                  ORDER BY d.dia) FROM dias d), '[]'::jsonb)
    ),

    'ocorrencias', jsonb_build_object(
      'total',      (SELECT count(*) FROM ocorr),
      'resolvidas', (SELECT count(*) FROM ocorr WHERE resolvido IS TRUE),
      'por_tipo', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', t, 'value', n) ORDER BY t COLLATE "C")
                    FROM (SELECT COALESCE(NULLIF(tipo::text, ''), 'Outro') AS t, count(*) AS n FROM ocorr GROUP BY 1) x), '[]'::jsonb),
      'ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', registrado_por, 'total', n)
                             ORDER BY n DESC, registrado_por COLLATE "C")
                    FROM (SELECT registrado_por, count(*) AS n FROM ocorr
                           WHERE COALESCE(registrado_por, '') <> '' GROUP BY registrado_por) x), '[]'::jsonb)
    ),

    'oee', jsonb_build_object(
      'dias', COALESCE((SELECT jsonb_agg(jsonb_build_object('dia', dia, 'aproveitamento', aproveitamento,
                                                           'produtivo', produtivo, 'parado', parado) ORDER BY dia)
                 FROM oee2), '[]'::jsonb),
      'medio', COALESCE((SELECT floor(avg(aproveitamento) + 0.5)::int FROM oee2), 0)
    )
  );
$$;

COMMENT ON FUNCTION public.indicadores_empilhadeira(date, date) IS
  'Os cinco blocos de indicadores da empilhadeira num período. Direitos do invocador: o RLS vale. '
  'Substitui o download de todo o histórico de linhas, programações, paradas e ocorrências.';

REVOKE ALL ON FUNCTION public.indicadores_empilhadeira(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.indicadores_empilhadeira(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.indicadores_empilhadeira(date, date) TO authenticated;
