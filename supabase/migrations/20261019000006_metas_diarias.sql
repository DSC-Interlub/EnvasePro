-- =============================================================================
-- Metas diárias — envase (unidades e envases, por sala), check-out e
-- empilhadeira
-- =============================================================================
--
-- DECIDIDO PELO DONO (19/10/2026)
--  - Envase: DUAS metas, unidades produzidas e envases concluídos, uma por
--    sala (Bio e Industrial).
--  - Check-out: pedidos concluídos no dia. Empilhadeira: linhas concluídas.
--  - Valor fixo que vale a partir de uma data, até ser trocado. Trocar a meta
--    é lançar uma linha nova; a antiga fica, e um dia passado usa a meta que
--    valia nele.
--
-- Antes desta tabela não havia meta em lugar nenhum do banco: o anel das TVs
-- mostrava a fração CONCLUÍDA do que fora lançado no dia, e o protótipo
-- ("meta 150") ficou sem número de verdade.
--
-- SEGURANÇA
--  - RLS: qualquer conta logada LÊ (as TVs precisam); só admin escreve.
--  - anon não lê nem escreve.
--  - metas_do_dia(): STABLE, sem SECURITY DEFINER, search_path fixo, EXECUTE
--    só para authenticated — o padrão das funções de painel.
--
-- Os dois painéis das TVs são recriados com dois acréscimos e NADA mais:
-- 'meta'/'metas' e o realizado do envase por sala (o texto deles vem das
-- migrations 20261019000001 e 20261019000002).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.metas_diarias (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo         text NOT NULL,
  indicador      text NOT NULL,
  sala           public.sala_tipo,
  valor          numeric(12, 0) NOT NULL,
  vigente_desde  date NOT NULL,
  observacao     text,
  criado_por     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_metas_item CHECK (
       (modulo = 'envase'       AND indicador IN ('unidades', 'envases') AND sala IS NOT NULL)
    OR (modulo = 'checkout'     AND indicador = 'pedidos'                AND sala IS NULL)
    OR (modulo = 'empilhadeira' AND indicador = 'linhas'                 AND sala IS NULL)
  ),
  CONSTRAINT chk_metas_valor CHECK (valor > 0)
);

COMMENT ON TABLE public.metas_diarias IS
  'Meta diária por módulo/indicador/sala, vigente a partir de uma data. Trocar = nova linha; o histórico fica.';

-- Uma meta por item e por data de início. NULLS NOT DISTINCT: sem isso, dois
-- itens sem sala (check-out, empilhadeira) com a mesma data não colidiriam.
CREATE UNIQUE INDEX IF NOT EXISTS uq_metas_item_vigencia
  ON public.metas_diarias (modulo, indicador, sala, vigente_desde) NULLS NOT DISTINCT;

ALTER TABLE public.metas_diarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metas_diarias_select ON public.metas_diarias;
CREATE POLICY metas_diarias_select ON public.metas_diarias
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS metas_diarias_insert ON public.metas_diarias;
CREATE POLICY metas_diarias_insert ON public.metas_diarias
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
-- O HISTÓRICO É IMUTÁVEL: uma meta que já valeu em dia passado não se altera
-- nem se apaga — senão o indicador de um dia antigo passaria a ser medido por
-- uma meta que não era a da época. Hoje e o futuro ainda podem ser corrigidos
-- (um erro de digitação do dia se corrige apagando e lançando de novo).
-- Trocar a meta daqui para frente = lançar uma linha nova.
DROP POLICY IF EXISTS metas_diarias_update ON public.metas_diarias;
CREATE POLICY metas_diarias_update ON public.metas_diarias
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND vigente_desde >= (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  WITH CHECK (public.is_admin() AND vigente_desde >= (now() AT TIME ZONE 'America/Sao_Paulo')::date);
DROP POLICY IF EXISTS metas_diarias_delete ON public.metas_diarias;
CREATE POLICY metas_diarias_delete ON public.metas_diarias
  FOR DELETE TO authenticated
  USING (public.is_admin() AND vigente_desde >= (now() AT TIME ZONE 'America/Sao_Paulo')::date);

-- Explícito, sem depender do privilégio padrão: authenticated fica SÓ com
-- SELECT/INSERT/UPDATE/DELETE (o RLS decide quem escreve). O padrão herdado
-- daria também TRUNCATE (que ignora RLS), REFERENCES, TRIGGER e MAINTAIN —
-- nada disso é necessário. (Ajustado ANTES de qualquer aplicação em produção:
-- achado no ensaio do script de aplicação, 19/10/2026.)
REVOKE ALL ON public.metas_diarias FROM anon;
REVOKE ALL ON public.metas_diarias FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_diarias TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_diarias TO service_role;

-- -----------------------------------------------------------------------------
-- A meta vigente de cada item num dia: a linha de vigente_desde mais recente
-- que não seja posterior ao dia. Sem linha, null.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.metas_do_dia(dia date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH v AS (
    SELECT DISTINCT ON (modulo, indicador, COALESCE(sala::text, ''))
           modulo, indicador, sala::text AS sala, valor
      FROM metas_diarias
     WHERE vigente_desde <= dia
     ORDER BY modulo, indicador, COALESCE(sala::text, ''), vigente_desde DESC
  )
  SELECT jsonb_build_object(
    'envase', jsonb_build_object(
      'unidades', jsonb_build_object(
        'Bio',        (SELECT valor FROM v WHERE modulo = 'envase' AND indicador = 'unidades' AND sala = 'Bio'),
        'Industrial', (SELECT valor FROM v WHERE modulo = 'envase' AND indicador = 'unidades' AND sala = 'Industrial')),
      'envases', jsonb_build_object(
        'Bio',        (SELECT valor FROM v WHERE modulo = 'envase' AND indicador = 'envases' AND sala = 'Bio'),
        'Industrial', (SELECT valor FROM v WHERE modulo = 'envase' AND indicador = 'envases' AND sala = 'Industrial'))),
    'checkout',     jsonb_build_object('pedidos', (SELECT valor FROM v WHERE modulo = 'checkout')),
    'empilhadeira', jsonb_build_object('linhas',  (SELECT valor FROM v WHERE modulo = 'empilhadeira'))
  );
$$;

COMMENT ON FUNCTION public.metas_do_dia(date) IS
  'Metas vigentes num dia. Direitos do invocador: o RLS vale.';
REVOKE ALL ON FUNCTION public.metas_do_dia(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.metas_do_dia(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.metas_do_dia(date) TO authenticated;

-- -----------------------------------------------------------------------------
-- Os painéis das TVs, com a meta.
-- -----------------------------------------------------------------------------
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
    -- Meta de linhas concluídas vigente hoje (null = sem meta).
    'meta',               public.metas_do_dia((SELECT hoje FROM dia))->'empilhadeira'->'linhas',
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
    -- As metas vigentes hoje (ver metas_do_dia).
    'metas',     public.metas_do_dia((SELECT hoje FROM dia)),

    'envase', jsonb_build_object(
      'producao_dia', COALESCE((SELECT sum(quantidade_produzida) FROM envase), 0),
      -- Por sala, porque a meta do envase é por sala.
      'por_sala', jsonb_build_object(
        'Bio', jsonb_build_object(
          'producao',   COALESCE((SELECT sum(quantidade_produzida) FROM envase WHERE sala = 'Bio'), 0),
          'concluidos', (SELECT count(*) FROM envase WHERE sala = 'Bio' AND termino IS NOT NULL)),
        'Industrial', jsonb_build_object(
          'producao',   COALESCE((SELECT sum(quantidade_produzida) FROM envase WHERE sala = 'Industrial'), 0),
          'concluidos', (SELECT count(*) FROM envase WHERE sala = 'Industrial' AND termino IS NOT NULL))
      ),
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

NOTIFY pgrst, 'reload schema';
