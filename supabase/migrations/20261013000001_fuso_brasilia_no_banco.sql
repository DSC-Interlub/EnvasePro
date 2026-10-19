-- =============================================================================
-- "Hoje" no banco passa a ser o dia de Brasília
-- =============================================================================
--
-- O PROBLEMA
--
-- `CURRENT_DATE` devolve o dia conforme o fuso da **sessão**, e a sessão do
-- Supabase é UTC. Entre 21h e meia-noite de Brasília (UTC-3) o banco já virou
-- o dia.
--
-- E há um motivo mais grave que o UTC: **quem chama pode definir o fuso da
-- própria sessão.** Medido em produção em 09/10/2026:
--
--   SET TIME ZONE 'Pacific/Kiritimati';
--   fuso_da_sessao     | current_date | hoje BRT
--   Pacific/Kiritimati | 2026-10-10   | 2026-10-09
--
-- Ou seja: o dia não é uma propriedade do banco, é uma propriedade de quem
-- pergunta. Para um número de protocolo e para o início de uma retenção
-- legal, isso não serve.
--
-- OS DOIS PONTOS, levantados com scripts/auditar-fuso-banco.sql
--
--  1. `gerar_protocolo()` — o ANO do protocolo vem de
--     `to_char(CURRENT_DATE, 'YYYY')`. Em 31/12 depois das 21h de Brasília,
--     o protocolo sai com o ano seguinte. A numeração de protocolo é
--     justamente o que as travas de imutabilidade existem para proteger, e
--     um protocolo com o ano errado não se corrige depois.
--
--  2. `nota_fiscal_arquivos.data_arquivo` — `DEFAULT CURRENT_DATE`. Esta
--     coluna é o início da **retenção legal de 5 anos**: a coluna gerada
--     `data_expiracao_legal` é `data_arquivo + 5 years`. Um arquivo enviado
--     às 22h de 31/12 nasceria com a retenção começando no ano seguinte.
--     Corrigir o DEFAULT corrige a coluna gerada por consequência — ela
--     deriva de `data_arquivo`, não da data corrente.
--
-- O levantamento no banco (local e produção, 13/10/2026) achou **só estes
-- dois**: nenhuma restrição CHECK, nenhum índice, nenhuma visão e nenhuma
-- outra função dependem da data corrente. `contadores_do_menu()` já estava
-- correta.
--
-- A ZONA É NOMEADA, e não `-03`, de propósito: a zona nomeada acompanha
-- mudanças de regra de horário; um deslocamento fixo não.
--
-- IDEMPOTENTE: `CREATE OR REPLACE FUNCTION` e `ALTER COLUMN ... SET DEFAULT`
-- podem rodar quantas vezes for.
--
-- NÃO MUDA DADO. Nenhuma linha existente é alterada: o DEFAULT só vale para
-- linhas novas, e a função só muda o que ela devolve de agora em diante.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. gerar_protocolo: o ano do protocolo é o ano de Brasília
-- -----------------------------------------------------------------------------
-- O corpo é o mesmo da 20261007000001, com UMA linha mudada (`ano_atual`).
-- A lista de sequences permitidas continua sendo a trava contra chamar a
-- função com um nome arbitrário (achado F0-7).
CREATE OR REPLACE FUNCTION public.gerar_protocolo(prefixo TEXT, nome_sequence TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  proximo_val BIGINT;
  ano_atual TEXT;
BEGIN
  -- A lista e IDENTICA a da 20261007000001, incluindo o prefixo `public.`:
  -- e assim que o chamador passa o nome. Copiar sem o esquema quebraria a
  -- geracao de protocolo inteira — foi o que eu fiz na primeira versao desta
  -- migration, e a suite de gatilhos pegou.
  IF nome_sequence NOT IN (
    'public.seq_checklist_recebimento',
    'public.seq_recebimento_protocolo',
    'public.seq_envase_protocolo',
    'public.seq_checkout_prog',
    'public.seq_empilha_prog',
    'public.seq_nf_arquivo_protocolo'
  ) THEN
    RAISE EXCEPTION 'Sequence nao permitida em gerar_protocolo: %', nome_sequence;
  END IF;

  EXECUTE format('SELECT nextval(%L)', nome_sequence) INTO proximo_val;

  -- Era to_char(CURRENT_DATE, 'YYYY'), que em 31/12 as 22h de Brasilia ja
  -- devolvia o ano seguinte, porque a sessao do Supabase e UTC.
  ano_atual := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY');

  RETURN prefixo || '-' || ano_atual || '-' || LPAD(proximo_val::TEXT, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.gerar_protocolo(TEXT, TEXT) IS
  'Gera protocolo PREFIXO-AAAA-NNNNNN. O ano e o de America/Sao_Paulo, nao o '
  'da sessao: CURRENT_DATE segue o fuso de quem chama e viraria o ano as 21h '
  'de 31/12. A lista de sequences permitidas e trava deliberada.';

-- -----------------------------------------------------------------------------
-- 2. nota_fiscal_arquivos.data_arquivo: o dia de Brasília
-- -----------------------------------------------------------------------------
-- Esta coluna inicia a retencao legal de 5 anos (data_expiracao_legal e
-- GENERATED a partir dela). Nao e so cosmetico: e prazo legal.
ALTER TABLE public.nota_fiscal_arquivos
  ALTER COLUMN data_arquivo
  SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date;

COMMENT ON COLUMN public.nota_fiscal_arquivos.data_arquivo IS
  'Dia do envio, no fuso de Brasilia. Inicia a retencao legal de 5 anos '
  '(ver data_expiracao_legal). Nao usar CURRENT_DATE: segue o fuso da sessao.';
