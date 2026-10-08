/**
 * Gera um .sql que restaura o backup JSON de producao no banco LOCAL.
 *
 * Usa session_replication_role = replica para desligar triggers e checagem de
 * FK durante a carga: assim a ordem das tabelas deixa de importar e os
 * triggers de protecao nao recusam a propria restauracao.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGEM = process.argv[2];
const SAIDA = process.argv[3];
if (!ORIGEM || !SAIDA) { console.error('uso: node gerar_restore.mjs <backup> <saida.sql>'); process.exit(1); }

// Ordem so para legibilidade; com replication_role=replica nao e obrigatoria.
const TABELAS = [
  'products', 'embalagens', 'operators', 'empilhadeira_configs', 'limpeza_locais',
  'recebimento_fornecedores', 'notificacao_destinatarios', 'user_profiles',
  'checkout_programacoes', 'checkout_itens', 'empilha_programacoes', 'empilha_linhas',
  'empilha_ocorrencias', 'empilhadeira_paradas', 'empilhadeira_manutencoes',
  'limpeza_programacoes', 'recebimentos', 'recebimento_itens', 'recebimento_participantes',
  'recebimento_ocorrencias', 'checklist_recebimentos', 'nota_fiscal_arquivos',
  'envase_records', 'sap_pedidos',
];

// Colunas que sao ARRAY no Postgres (text[]), nao jsonb. Levantado do schema:
//   checklist_recebimentos.inspecionado_por = text[]
// As demais colunas estruturadas (limpeza_programacoes.responsaveis e
// .assinaturas_responsaveis) sao jsonb de verdade.
const COLUNAS_ARRAY = new Set(['inspecionado_por']);

// JSON.stringify escapa aspas e barra invertida do mesmo jeito que o literal
// de array do Postgres espera, entao serve direto e evita escapar a mao.
const literalArrayPg = (v) =>
  `'{${v.map((e) => JSON.stringify(String(e))).join(',')}}'`;

const lit = (v, coluna) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    // Literal de array do Postgres sem cast: o tipo e inferido da coluna.
    if (COLUNAS_ARRAY.has(coluna)) return v.length ? literalArrayPg(v) : "'{}'";
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const disponiveis = new Set((await readdir(ORIGEM)).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')));

let sql = `-- Restauracao do backup de producao no banco LOCAL.
-- Gerado automaticamente. NAO rodar contra projeto remoto.
BEGIN;
SET session_replication_role = replica;  -- desliga triggers e FK durante a carga
`;

const esperado = {};
for (const t of TABELAS) {
  if (!disponiveis.has(t)) { sql += `\n-- ${t}: sem arquivo no backup\n`; continue; }
  const linhas = JSON.parse(await readFile(path.join(ORIGEM, `${t}.json`), 'utf8'));
  esperado[t] = linhas.length;
  sql += `\nDELETE FROM public.${t};\n`;
  if (!linhas.length) { sql += `-- ${t}: 0 linhas\n`; continue; }

  // Colunas GERADAS (is_generated='ALWAYS') nao aceitam INSERT: o Postgres
  // recusa com "cannot insert a non-DEFAULT value". Hoje so existe uma, a
  // data de expiracao legal das notas fiscais, que e derivada da data de
  // emissao e sera recalculada sozinha na restauracao.
  const GERADAS = new Set(['data_expiracao_legal']);
  const colunas = Object.keys(linhas[0]).filter((c) => !GERADAS.has(c));
  const lista = colunas.map((c) => `"${c}"`).join(', ');
  // Em lotes de 200 para nao gerar um comando gigante.
  for (let i = 0; i < linhas.length; i += 200) {
    const lote = linhas.slice(i, i + 200);
    const valores = lote.map((l) => `(${colunas.map((c) => lit(l[c], c)).join(', ')})`).join(',\n  ');
    sql += `INSERT INTO public.${t} (${lista}) VALUES\n  ${valores};\n`;
  }
}

sql += `
-- ----------------------------------------------------------------------------
-- SINCRONIZA AS SEQUENCES DE PROTOCOLO
--
-- Restaurar linhas NAO avanca a sequence: ela e um contador separado. Sem este
-- passo, o primeiro registro novo depois da restauracao tenta reusar um
-- protocolo que ja existe e esbarra na restricao de unicidade:
--   duplicate key value violates unique constraint
--     "checkout_programacoes_codigo_programacao_key"
--
-- Descoberto em 08/10/2026, depois de restaurar o backup e tentar criar um
-- registro. Vale para a reimportacao do historico no go-live.
--
-- Cada protocolo tem o formato PREFIXO-ANO-NNNNNN; o contador e o ultimo campo.
do $$
declare
  pares constant text[][] := array[
    array['seq_checkout_prog',         'checkout_programacoes',  'codigo_programacao'],
    array['seq_empilha_prog',          'empilha_programacoes',   'codigo_programacao'],
    array['seq_envase_protocolo',      'envase_records',         'protocolo'],
    array['seq_recebimento_protocolo', 'recebimentos',           'protocolo_recebimento'],
    array['seq_checklist_recebimento', 'checklist_recebimentos', 'numero_checklist'],
    array['seq_nf_arquivo_protocolo',  'nota_fiscal_arquivos',   'protocolo_arquivo']
  ];
  i int;
  maior bigint;
begin
  for i in 1 .. array_length(pares, 1) loop
    execute format(
      'select coalesce(max(split_part(%I, ''-'', 3)::bigint), 0) from public.%I where %I is not null',
      pares[i][3], pares[i][2], pares[i][3]) into maior;
    execute format('alter sequence public.%I restart with %s', pares[i][1], maior + 1);
    raise notice 'sequence % ajustada para %', pares[i][1], maior + 1;
  end loop;
end $$;

SET session_replication_role = origin;
COMMIT;

-- Contagens apos a restauracao
SELECT tabela, linhas FROM (
${TABELAS.filter((t) => disponiveis.has(t)).map((t) => `  SELECT '${t}' AS tabela, count(*) AS linhas FROM public.${t}`).join('\n  UNION ALL\n')}
) q ORDER BY tabela;
`;

await writeFile(SAIDA, sql, 'utf8');
await writeFile(SAIDA + '.esperado.json', JSON.stringify(esperado, null, 2), 'utf8');
console.log(`SQL gerado: ${(sql.length / 1024 / 1024).toFixed(2)} MB`);
console.log('contagens esperadas:', Object.entries(esperado).map(([k, v]) => `${k}=${v}`).join(' '));
