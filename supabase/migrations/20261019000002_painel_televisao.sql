-- =============================================================================
-- Painel da TV principal (/Televisao), calculado no banco
-- =============================================================================
--
-- O QUE ISTO SUBSTITUI
--
-- /Televisao fazia 13 consultas, com OITO intervalos diferentes (30 s a
-- 300 s). Três delas baixavam tabelas INTEIRAS a cada minuto só para contar
-- o dia de hoje: todos os envases, todas as programações de check-out e todos
-- os itens de check-out. No volume da Base44 isso é ~10 MB por minuto, por TV.
--
-- Esta função devolve os quatro painéis que dependem do banco — envase,
-- check-out, empilhadeira e mês — num objeto JSON só. (O de importações
-- continua com a sua consulta: sap_pedidos é outra fonte, e muda uma vez por
-- importação.)
--
-- AS REGRAS SÃO AS DA TELA, com quatro correções. Cada uma é DECLARADA aqui
-- e coberta pelo teste scripts/test-painel-televisao.mjs, que mostra o valor
-- antigo ao lado do novo:
--
--  1. TETO DE 100 LINHAS. "Envase em andamento" e "check-out em andamento"
--     saíam das 100 linhas mais recentes por updated_at. Bastava alguém editar
--     100 registros antigos para as operações de hoje sumirem da TV. Aqui o dia
--     é filtrado direto.
--  2. CHECK-OUT "PENDENTES" ERA O TOTAL. A tela chamava de `checkoutPendentes`
--     a contagem de TODOS os itens do dia, concluídos inclusive; o rodapé dizia
--     "N pendentes" com o total, e o anel somava concluídos + total ("no dia"
--     contava os concluídos duas vezes). Aqui: `pendentes` = do dia, não
--     concluídos; `total_dia` = todos.
--  3. ENVASE "LANÇADOS" CONTAVA DUAS VEZES o envase Bio terminado e ainda não
--     retirado: ele é "concluído" (tem término) e também "em andamento"
--     (aparece no cartão aguardando retirada). Aqui: `lancados` = envases do
--     dia com início ou término, cada um uma vez.
--  4. O MÊS ERA LIMITADO aos 2.000 envases mais recentes. No volume atual
--     (~660 por mês) não muda nada; com o tempo, mudaria. Aqui não há teto.
--
-- O resto é paridade estrita: produção do dia, concluídos, operações e seus
-- campos, ocorrências, parada ativa, manutenção, números do mês por sala e
-- por categoria.
--
-- SEGURANÇA — as mesmas decisões de contadores_do_menu():
--  - NÃO é SECURITY DEFINER: roda com os direitos de quem chama, o RLS vale.
--  - STABLE: só lê.  search_path fixo.  EXECUTE só para `authenticated`.
--
-- "HOJE" e "ESTE MÊS" são os de Brasília, não os da sessão (UTC).
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_envase_records_data
  ON public.envase_records (data);
CREATE INDEX IF NOT EXISTS idx_checkout_programacoes_data
  ON public.checkout_programacoes (data_programada);
CREATE INDEX IF NOT EXISTS idx_checkout_itens_programacao
  ON public.checkout_itens (programacao_id);
CREATE INDEX IF NOT EXISTS idx_empilhadeira_paradas_data
  ON public.empilhadeira_paradas (data);

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

COMMENT ON FUNCTION public.painel_televisao() IS
  'Painéis de envase, check-out, empilhadeira e mês da TV principal. Direitos do invocador: '
  'o RLS continua valendo. Substitui 12 consultas, três delas de tabelas inteiras a cada minuto.';

REVOKE ALL ON FUNCTION public.painel_televisao() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_televisao() FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_televisao() TO authenticated;
