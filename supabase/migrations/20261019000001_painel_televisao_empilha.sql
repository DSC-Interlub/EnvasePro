-- =============================================================================
-- Painel da TV de empilhadeira, calculado no banco
-- =============================================================================
--
-- O QUE ISTO SUBSTITUI
--
-- /TelevisaoEmpilha baixava, a cada 10 segundos, TODAS as programações de
-- empilhadeira (uma por dia, desde sempre) e as 200 linhas mais recentes; a
-- cada 15 segundos, TODAS as ocorrências. Contava no navegador. O volume
-- cresce com o histórico: no volume da Base44, a tela passa o dia baixando o
-- ano inteiro para mostrar o dia de hoje.
--
-- Esta função devolve o painel pronto — os números do dia e só as linhas em
-- andamento — num objeto JSON só.
--
-- DUAS CORREÇÕES QUE VÊM DE GRAÇA (declaradas, e cobertas pelo teste)
--
--  1. A tela filtrava o dia DENTRO das 200 linhas mais recentes por
--     `updated_at`. Num dia com mais movimento, ou depois de alguém editar 200
--     linhas antigas, as linhas de hoje sumiam dos números. Aqui o dia é
--     filtrado direto, sem teto.
--  2. A "última ocorrência" da pílula era a primeira de uma lista ordenada só
--     por `data` — todas de hoje empatam, então era uma qualquer. Aqui é a de
--     hora mais recente.
--
-- SEGURANÇA — as mesmas decisões de contadores_do_menu():
--  - NÃO é SECURITY DEFINER: roda com os direitos de quem chama, o RLS vale.
--  - STABLE: só lê.
--  - search_path fixo.
--  - EXECUTE só para `authenticated`; nada para PUBLIC nem anon.
--
-- "HOJE" é o dia de Brasília: `(now() AT TIME ZONE 'America/Sao_Paulo')::date`.
-- Não troque por CURRENT_DATE (a sessão é UTC: entre 21h e meia-noite o banco
-- já está no dia seguinte e a TV zeraria às 21h).
--
-- PARIDADE: scripts/test-painel-empilha.mjs compara o resultado com o cálculo
-- que estava no JavaScript, com dados de verdade e indicadores diferentes de
-- zero.
-- =============================================================================

-- Índices de que esta função (e as telas de hoje) precisam. O banco não tinha
-- nenhum índice além das chaves primárias e dos UNIQUE de protocolo: toda
-- busca por dia era varredura completa.
CREATE INDEX IF NOT EXISTS idx_empilha_programacoes_data
  ON public.empilha_programacoes (data_programada);
CREATE INDEX IF NOT EXISTS idx_empilha_linhas_programacao
  ON public.empilha_linhas (programacao_id);
CREATE INDEX IF NOT EXISTS idx_empilha_ocorrencias_data
  ON public.empilha_ocorrencias (data);

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

COMMENT ON FUNCTION public.painel_televisao_empilha() IS
  'Painel do dia da TV de empilhadeira. Direitos do invocador: o RLS continua valendo. '
  'Substitui o download de todas as programações, 200 linhas e todas as ocorrências a cada 10-15s.';

REVOKE ALL ON FUNCTION public.painel_televisao_empilha() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.painel_televisao_empilha() FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_televisao_empilha() TO authenticated;
