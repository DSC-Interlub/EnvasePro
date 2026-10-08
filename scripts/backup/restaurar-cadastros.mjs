/**
 * scripts/backup/restaurar-cadastros.mjs
 *
 * Gera o SQL que devolve APENAS OS CADASTROS a partir de um backup.
 * NAO executa nada: escreve um arquivo .sql para ser revisado e rodado a mao.
 *
 * Serve para desfazer a limpeza total de 08/10/2026, ou para repovoar um banco
 * vazio sem trazer de volta o movimento (envases, check-outs, recebimentos).
 *
 * O QUE RESTAURA (5 tabelas, so cadastro):
 *   products, embalagens, operators, limpeza_locais, recebimento_fornecedores
 *
 * O QUE NAO RESTAURA, de proposito:
 *   - as tabelas operacionais (movimento);
 *   - user_profiles e empilhadeira_configs, que nao foram apagadas;
 *   - auth.users, que o backup NAO contem com senha (a Management API nao
 *     expoe hash), portanto conta nao se restaura por aqui;
 *   - os arquivos do storage, que tem script proprio.
 *
 * Uso:
 *   node scripts/backup/restaurar-cadastros.mjs <pasta-backup> <saida.sql>
 *
 * Depois, revisar o .sql e aplicar a mao. Contra o banco LOCAL:
 *   docker cp saida.sql supabase_db_envase:/tmp/r.sql
 *   docker exec supabase_db_envase psql -U postgres -d postgres -f /tmp/r.sql
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const ORIGEM = process.argv[2];
const SAIDA = process.argv[3];
if (!ORIGEM || !SAIDA) {
  console.error('uso: node restaurar-cadastros.mjs <pasta-backup> <saida.sql>');
  process.exit(1);
}

// Ordem importa: operators e referenciado por nada aqui, mas products e
// embalagens sao pais de tabelas operacionais que NAO serao restauradas.
const CADASTROS = ['products', 'embalagens', 'operators', 'limpeza_locais', 'recebimento_fornecedores'];

// Coluna GENERATED ALWAYS nao aceita INSERT (hoje nenhuma destas tem, mas a
// lista fica para o caso de o schema mudar).
const GERADAS = new Set(['data_expiracao_legal']);

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

let sql = `-- ============================================================================
-- RESTAURACAO APENAS DOS CADASTROS
-- Gerado de: ${ORIGEM}
-- Gerado em: ${new Date().toISOString()}
--
-- REVISE ANTES DE RODAR. Nao traz movimento, nao traz contas, nao traz arquivo.
-- Use ON CONFLICT DO NOTHING, entao rodar duas vezes nao duplica.
-- ============================================================================
BEGIN;
`;

const resumo = {};
for (const tabela of CADASTROS) {
  const arquivo = path.join(ORIGEM, `${tabela}.json`);
  try { await access(arquivo); } catch {
    sql += `\n-- ${tabela}: sem arquivo no backup\n`;
    resumo[tabela] = 'ausente';
    continue;
  }
  const linhas = JSON.parse(await readFile(arquivo, 'utf8'));
  resumo[tabela] = linhas.length;
  if (!linhas.length) { sql += `\n-- ${tabela}: 0 linhas\n`; continue; }

  const colunas = Object.keys(linhas[0]).filter((c) => !GERADAS.has(c));
  const lista = colunas.map((c) => `"${c}"`).join(', ');
  sql += `\n-- ${tabela}: ${linhas.length} linhas\n`;
  for (let i = 0; i < linhas.length; i += 200) {
    const lote = linhas.slice(i, i + 200)
      .map((l) => `(${colunas.map((c) => lit(l[c])).join(', ')})`).join(',\n  ');
    sql += `INSERT INTO public.${tabela} (${lista}) VALUES\n  ${lote}\n  ON CONFLICT DO NOTHING;\n`;
  }
}

sql += `
COMMIT;

-- Conferencia
SELECT tabela, linhas FROM (
${CADASTROS.map((t) => `  SELECT '${t}' AS tabela, count(*) AS linhas FROM public.${t}`).join('\n  UNION ALL\n')}
) q ORDER BY tabela;
`;

await writeFile(SAIDA, sql, 'utf8');
console.log(`SQL gerado (NAO executado): ${SAIDA}`);
console.log(`tamanho: ${(sql.length / 1024).toFixed(0)} KB`);
console.log('restauraria:');
for (const [t, n] of Object.entries(resumo)) console.log(`  ${t.padEnd(26)} ${n}`);
console.log('\nNADA foi executado. Revise o arquivo e aplique a mao.');
