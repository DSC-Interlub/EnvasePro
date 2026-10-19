-- =============================================================================
-- Indicadores de recebimento num período, calculados no banco
-- =============================================================================
--
-- O QUE ISTO SUBSTITUI
--
-- /IndicadoresRecebimento baixava TODOS os recebimentos, TODAS as ocorrências
-- e TODOS os participantes de todo o histórico para mostrar um período (e
-- conferia participante × recebimento com um `.some()` dentro de um
-- `.filter()`: quadrático no tamanho do histórico).
--
-- A REGRA É A DA PÁGINA. A data de um recebimento é a de chegada, senão a
-- prevista. Tempo médio com o arredondamento do Math.round (floor(x + 0.5)).
--
-- CORREÇÕES DECLARADAS
--  1. O tempo médio por tipo listava Importação, Devolução, Material auxiliar
--     e Outro — e omitia NACIONAL, que é um tipo válido do enum. Entra.
--  2. Desempates (equipe, fatias) em ordem de código do nome; antes, ordem de
--     chegada das linhas.
--  3. Tipo ou nome ausente aparecia como "null"; agora "Sem tipo"/"Sem nome".
--
-- O CHECKLIST NÃO ESTÁ AQUI de propósito: as faixas de nota moram em
-- src/lib/checklist.js (docs/ETAPA2-INDICADORES.md §2.6). Ele continua no
-- navegador, buscando só o período em vez dos 500 mais recentes.
--
-- SEGURANÇA — as de sempre: sem SECURITY DEFINER (o RLS vale), STABLE,
-- search_path fixo, EXECUTE só para `authenticated`.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_recebimento_participantes_recebimento
  ON public.recebimento_participantes (recebimento_id);
CREATE INDEX IF NOT EXISTS idx_recebimento_ocorrencias_recebimento
  ON public.recebimento_ocorrencias (recebimento_id);
CREATE INDEX IF NOT EXISTS idx_checklist_recebimentos_entrega
  ON public.checklist_recebimentos (data_entrega);

CREATE OR REPLACE FUNCTION public.indicadores_recebimento(de date, ate date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH
  r AS (
    SELECT *, COALESCE(data_chegada, data_prevista) AS dia
      FROM recebimentos
     WHERE COALESCE(data_chegada, data_prevista) BETWEEN de AND ate
  ),
  concl AS (SELECT * FROM r WHERE status = 'Concluído' AND tempo_produtivo_minutos IS NOT NULL),
  oc AS (SELECT o.* FROM recebimento_ocorrencias o WHERE o.recebimento_id IN (SELECT id FROM r)),
  eq AS (
    SELECT COALESCE(NULLIF(p.operator_nome, ''), 'Sem nome') AS nome, count(*) AS total
      FROM recebimento_participantes p
     WHERE p.recebimento_id IN (SELECT id FROM r)
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'de', de, 'ate', ate, 'gerado_em', now(),
    'total',        (SELECT count(*) FROM r),
    'concluidos',   (SELECT count(*) FROM r WHERE status = 'Concluído'),
    'em_andamento', (SELECT count(*) FROM r WHERE status = 'Em andamento'),
    'cancelados',   (SELECT count(*) FROM r WHERE status = 'Cancelado'),
    'por_tipo', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', t, 'value', n) ORDER BY t COLLATE "C")
                  FROM (SELECT COALESCE(tipo::text, 'Sem tipo') AS t, count(*) AS n FROM r GROUP BY 1) x), '[]'::jsonb),
    'por_dia', COALESCE((SELECT jsonb_agg(jsonb_build_object('dia', dia, 'total', n) ORDER BY dia)
                  FROM (SELECT dia, count(*) AS n FROM r WHERE dia IS NOT NULL GROUP BY dia) x), '[]'::jsonb),
    'tempo', jsonb_build_object(
      'medio', COALESCE((SELECT floor(avg(tempo_produtivo_minutos) + 0.5)::int FROM concl), 0),
      'produtivo_total', COALESCE((SELECT sum(COALESCE(tempo_produtivo_minutos, 0)) FROM r), 0),
      'pausado_total',   COALESCE((SELECT sum(COALESCE(tempo_pausado_minutos, 0)) FROM r), 0),
      'base', (SELECT count(*) FROM concl),
      'por_tipo', (SELECT jsonb_agg(jsonb_build_object(
                     'tipo', t.tipo,
                     'media', COALESCE((SELECT floor(avg(tempo_produtivo_minutos) + 0.5)::int FROM concl c WHERE c.tipo::text = t.tipo), 0),
                     'total', (SELECT count(*) FROM concl c WHERE c.tipo::text = t.tipo)) ORDER BY t.ordem)
                   FROM unnest(enum_range(NULL::tipo_recebimento)::text[]) WITH ORDINALITY AS t(tipo, ordem))
    ),
    'ocorrencias', jsonb_build_object(
      'total',      (SELECT count(*) FROM oc),
      'abertas',    (SELECT count(*) FROM oc WHERE resolvido IS NOT TRUE),
      'resolvidas', (SELECT count(*) FROM oc WHERE resolvido IS TRUE),
      'por_tipo', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', t, 'value', n) ORDER BY t COLLATE "C")
                    FROM (SELECT COALESCE(tipo::text, 'Sem tipo') AS t, count(*) AS n FROM oc GROUP BY 1) x), '[]'::jsonb)
    ),
    'equipe', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'total', total) ORDER BY total DESC, nome COLLATE "C")
                FROM (SELECT * FROM eq ORDER BY total DESC, nome COLLATE "C" LIMIT 8) x), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.indicadores_recebimento(date, date) IS
  'Indicadores de recebimento num período (sem o checklist, cujas faixas moram no front). '
  'Direitos do invocador: o RLS vale. Substitui o download de todo o histórico.';

REVOKE ALL ON FUNCTION public.indicadores_recebimento(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.indicadores_recebimento(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.indicadores_recebimento(date, date) TO authenticated;
