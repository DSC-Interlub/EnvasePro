/**
 * scripts/gerar-rollbacks.mjs — gera supabase/rollbacks/<versão>.rollback.sql
 *
 * Um rollback por migration autorizada em 19/10/2026, para desfazer UMA de
 * cada vez, na ordem inversa. Cada um:
 *  - roda numa transação (ou desfaz tudo, ou nada);
 *  - deixa o banco exatamente como estava ANTES daquela migration — inclusive
 *    índices que a migration criou e funções que ela recriou;
 *  - remove a linha da migration de supabase_migrations.schema_migrations,
 *    para o histórico continuar dizendo a verdade.
 *
 * O texto de uma função "anterior" sai da migration anterior (ou, para o
 * fuso, do snapshot de produção de 19/10/2026), nunca de cópia à mão.
 *
 * Provado por scripts/test-rollbacks.mjs no banco LOCAL: depois de todos os
 * rollbacks, o esquema é igual ao de produção antes das migrations; depois de
 * reaplicar, igual ao de antes do rollback.
 *
 * A pasta supabase/rollbacks/ NÃO é lida pela CLI do Supabase (só
 * supabase/migrations/ é). Rollback se aplica à mão, um arquivo por vez.
 */
import fs from 'node:fs';

const ler = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const funcao = (arq, nome) => {
  const t = ler(`supabase/migrations/${arq}`);
  const i = t.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}()`);
  const j = t.indexOf('$$;', i) + 3;
  if (i < 0 || j < 3) throw new Error(`${nome} não encontrada em ${arq}`);
  return t.slice(i, j);
};
const acl = (assinatura) => `REVOKE ALL ON FUNCTION ${assinatura} FROM PUBLIC;
REVOKE ALL ON FUNCTION ${assinatura} FROM anon;
GRANT EXECUTE ON FUNCTION ${assinatura} TO authenticated;`;
const cabecalho = (versao, oQue) => `-- =============================================================================
-- ROLLBACK de ${versao}
-- =============================================================================
-- ${oQue}
--
-- Aplicar À MÃO, um arquivo por vez, na ordem INVERSA das migrations. Roda
-- numa transação: ou desfaz tudo, ou nada. Gerado por
-- scripts/gerar-rollbacks.mjs; provado por scripts/test-rollbacks.mjs.
-- =============================================================================
BEGIN;
`;
const rodape = (versao) => `
-- O histórico de migrations volta a dizer a verdade.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '${versao}';

NOTIFY pgrst, 'reload schema';
COMMIT;
`;

const R = {};

R['20261019000007'] = cabecalho('20261019000007_status_completo_so_admin',
  `Tira os três gatilhos e a função protect_status_completo(). ATENÇÃO: isso
-- REABRE o buraco (operador volta a conseguir marcar 'Completo' sem o líder).`) + `
DROP TRIGGER IF EXISTS trg_empilha_linhas_status_completo ON public.empilha_linhas;
DROP TRIGGER IF EXISTS trg_limpeza_prog_status_completo ON public.limpeza_programacoes;
DROP TRIGGER IF EXISTS trg_recebimentos_status_completo ON public.recebimentos;
DROP FUNCTION IF EXISTS public.protect_status_completo();
` + rodape('20261019000007');

R['20261019000006'] = cabecalho('20261019000006_metas_diarias',
  `Volta os painéis das TVs ao texto das migrations 000001/000002 (sem meta),
-- apaga metas_do_dia() e a tabela metas_diarias.
--
-- ATENÇÃO: apagar a tabela APAGA AS METAS LANÇADAS. Exporte antes:
--   select * from public.metas_diarias;`) + `
${funcao('20261019000001_painel_televisao_empilha.sql', 'painel_televisao_empilha')}
${acl('public.painel_televisao_empilha()')}

${funcao('20261019000002_painel_televisao.sql', 'painel_televisao')}
${acl('public.painel_televisao()')}

DROP FUNCTION IF EXISTS public.metas_do_dia(date);
DROP TABLE IF EXISTS public.metas_diarias;
` + rodape('20261019000006');

R['20261019000005'] = cabecalho('20261019000005_indicadores_recebimento',
  `Apaga indicadores_recebimento(date, date) e os índices que só esta
-- migration criou. (idx_recebimento_participantes_recebimento é da 000003 e fica.)`) + `
DROP FUNCTION IF EXISTS public.indicadores_recebimento(date, date);
DROP INDEX IF EXISTS public.idx_recebimento_ocorrencias_recebimento;
DROP INDEX IF EXISTS public.idx_checklist_recebimentos_entrega;
` + rodape('20261019000005');

R['20261019000004'] = cabecalho('20261019000004_indicadores_empilhadeira',
  `Apaga indicadores_empilhadeira(date, date). Os dois índices que ela declara
-- (idx_empilha_ocorrencias_data, idx_empilhadeira_paradas_data) foram criados
-- antes, pela 000001 e pela 000002, e ficam.`) + `
DROP FUNCTION IF EXISTS public.indicadores_empilhadeira(date, date);
` + rodape('20261019000004');

R['20261019000003'] = cabecalho('20261019000003_painel_geral',
  'Apaga painel_geral() e os índices que esta migration criou.') + `
DROP FUNCTION IF EXISTS public.painel_geral();
DROP INDEX IF EXISTS public.idx_limpeza_programacoes_data;
DROP INDEX IF EXISTS public.idx_recebimentos_status;
DROP INDEX IF EXISTS public.idx_recebimento_participantes_recebimento;
` + rodape('20261019000003');

R['20261019000002'] = cabecalho('20261019000002_painel_televisao',
  'Apaga painel_televisao() e os índices que esta migration criou.') + `
DROP FUNCTION IF EXISTS public.painel_televisao();
DROP INDEX IF EXISTS public.idx_envase_records_data;
DROP INDEX IF EXISTS public.idx_checkout_programacoes_data;
DROP INDEX IF EXISTS public.idx_checkout_itens_programacao;
DROP INDEX IF EXISTS public.idx_empilhadeira_paradas_data;
` + rodape('20261019000002');

R['20261019000001'] = cabecalho('20261019000001_painel_televisao_empilha',
  'Apaga painel_televisao_empilha() e os índices que esta migration criou.') + `
DROP FUNCTION IF EXISTS public.painel_televisao_empilha();
DROP INDEX IF EXISTS public.idx_empilha_programacoes_data;
DROP INDEX IF EXISTS public.idx_empilha_linhas_programacao;
DROP INDEX IF EXISTS public.idx_empilha_ocorrencias_data;
` + rodape('20261019000001');

// Fuso: o texto anterior vem do snapshot de produção de 19/10/2026 (estado
// real antes da migration), com os comentários nulos que produção tinha.
R['20261013000001'] = cabecalho('20261013000001_fuso_brasilia_no_banco',
  `Volta gerar_protocolo ao ano de CURRENT_DATE e o padrão de
-- nota_fiscal_arquivos.data_arquivo a CURRENT_DATE — o estado de produção
-- antes da migration (snapshot prod_2026-10-19T17-56-01Z). Os comentários que
-- a migration pôs eram nulos antes, e voltam a ser.`) + `
CREATE OR REPLACE FUNCTION public.gerar_protocolo(prefixo text, nome_sequence text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  proximo_val BIGINT;
  ano_atual TEXT;
BEGIN
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
  ano_atual := to_char(CURRENT_DATE, 'YYYY');
  RETURN prefixo || '-' || ano_atual || '-' || LPAD(proximo_val::TEXT, 6, '0');
END;
$function$;
COMMENT ON FUNCTION public.gerar_protocolo(text, text) IS NULL;

ALTER TABLE public.nota_fiscal_arquivos ALTER COLUMN data_arquivo SET DEFAULT CURRENT_DATE;
COMMENT ON COLUMN public.nota_fiscal_arquivos.data_arquivo IS NULL;
` + rodape('20261013000001');

fs.mkdirSync('supabase/rollbacks', { recursive: true });
for (const [v, sql] of Object.entries(R)) {
  fs.writeFileSync(`supabase/rollbacks/${v}.rollback.sql`, sql);
  console.log(`supabase/rollbacks/${v}.rollback.sql`);
}
