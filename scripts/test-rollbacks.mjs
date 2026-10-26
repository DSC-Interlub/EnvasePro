/**
 * scripts/test-rollbacks.mjs — os rollbacks de supabase/rollbacks/ funcionam.
 *
 * No banco LOCAL (que tem todas as migrations do repositório):
 *  1. assinatura do esquema ANTES;
 *  2. aplica os rollbacks na ordem inversa;
 *  3. a assinatura do passo 1 (local com TUDO aplicado) tem de ser IGUAL à de
 *     PRODUÇÃO (lida agora, só leitura): repositório = produção.
 *     Até 19/10/2026 este passo comparava o estado DESFEITO com produção,
 *     porque produção ainda não tinha estas migrations; naquele dia, antes de
 *     aplicar, desfeito = produção passou. Depois que as 9 foram aplicadas,
 *     produção é o estado "com tudo", e a comparação certa é com o passo 1;
 *  4. reaplica as migrations (supabase migration up --include-all);
 *  5. a assinatura tem de voltar a ser igual à do passo 1.
 *
 * "Assinatura" = cada função de public (definição, volatilidade, SECURITY
 * DEFINER, search_path, ACL), cada índice, cada tabela (RLS e ACL), cada
 * política e cada padrão de coluna, com hash da definição.
 *
 * Produção é só LIDA (supabase db query --linked, um SELECT).
 * Uso: node scripts/test-rollbacks.mjs [--sem-producao]
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-rollbacks');

const ORDEM = ['20261026000001', '20261020000003', '20261020000002', '20261020000001', '20261019000008', '20261019000007', '20261019000006', '20261019000005', '20261019000004', '20261019000003',
  '20261019000002', '20261019000001', '20261013000001'];
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

export const SQL_ASSINATURA = `
select coalesce(json_agg(x order by x.k), '[]'::json) from (
  select 'funcao ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as k,
         md5(btrim(regexp_replace(regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g'))) || ' ' || p.provolatile::text || ' sd=' || p.prosecdef::text
           || ' cfg=' || coalesce(array_to_string(p.proconfig, ','), '')
           || ' acl=' || coalesce((select string_agg(a, ',' order by a) from unnest(p.proacl::text[]) a), '') as v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
  union all
  select 'indice ' || indexname, md5(indexdef) from pg_indexes where schemaname = 'public'
  union all
  select 'tabela ' || c.relname, 'rls=' || c.relrowsecurity::text
           || ' acl=' || coalesce((select string_agg(a, ',' order by a) from unnest(c.relacl::text[]) a), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
  union all
  select 'politica ' || tablename || '.' || policyname,
         md5(cmd || coalesce(qual, '') || coalesce(with_check, '') || roles::text)
    from pg_policies where schemaname = 'public'
  union all
  select 'privpadrao ' || pg_get_userbyid(defaclrole) || ' ' || defaclobjtype::text,
         coalesce((select string_agg(a, ',' order by a) from unnest(defaclacl::text[]) a), '')
    from pg_default_acl where defaclnamespace = 'public'::regnamespace
  union all
  select 'padrao ' || table_name || '.' || column_name, coalesce(column_default, '')
    from information_schema.columns where table_schema = 'public' and column_default is not null
) x(k, v)`;

function local(sql) {
  const out = execFileSync('docker', ['exec', '-i', 'supabase_db_envase', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' });
  return out.trim();
}
function producao(sql) {
  // Por ARQUIVO, não pela linha de comando: no Windows o shell dobraria as
  // barras das expressões regulares e a consulta chegaria diferente.
  const tmp = `${process.env.TEMP || '/tmp'}/assinatura-producao.sql`;
  fs.writeFileSync(tmp, sql);
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['supabase', 'db', 'query', '--linked', '-o', 'json', '-f', JSON.stringify(tmp)],
    { encoding: 'utf8', shell: true });
  fs.rmSync(tmp, { force: true });
  const j = JSON.parse(out.slice(out.indexOf('{')));
  const linha = j.rows?.[0];
  return JSON.stringify(Object.values(linha)[0]);
}
const mapa = (json) => new Map(JSON.parse(json).map((r) => [r.k, r.v]));
function diferencas(a, b) {
  const d = [];
  for (const [k, v] of a) if (!b.has(k)) d.push(`só no primeiro: ${k}`); else if (b.get(k) !== v) d.push(`difere: ${k}`);
  for (const k of b.keys()) if (!a.has(k)) d.push(`só no segundo: ${k}`);
  return d;
}

console.log('='.repeat(76));
console.log('ROLLBACKS — desfazer e refazer no banco local');
console.log('='.repeat(76));

const antes = mapa(local(SQL_ASSINATURA));
console.log(`\n1. Assinatura ANTES: ${antes.size} objetos`);

console.log('\n2. Rollbacks, na ordem inversa');
for (const v of ORDEM) {
  try {
    local(fs.readFileSync(`supabase/rollbacks/${v}.rollback.sql`, 'utf8'));
    const ainda = local(`select count(*) from supabase_migrations.schema_migrations where version = '${v}'`);
    ok(ainda === '0', `${v}: aplicado, e a linha saiu do histórico`);
  } catch (e) {
    ok(false, `${v}: ${String(e.stderr || e.message).slice(0, 300)}`);
  }
}
const desfeito = mapa(local(SQL_ASSINATURA));
const mudou = diferencas(antes, desfeito).length;
ok(mudou > 0, `os rollbacks mudaram o esquema (${mudou} diferença(s) em relação ao passo 1)`);

if (!process.argv.includes('--sem-producao')) {
  console.log('\n3. Local com tudo aplicado (passo 1) × PRODUÇÃO hoje (só leitura)');
  const prod = mapa(producao(SQL_ASSINATURA));
  // Divergências CONHECIDAS e explicadas (comparação de 19/10/2026):
  //  - contadores_do_menu: produção tem um GRANT EXECUTE a mais para
  //    service_role (dado à mão em produção; o repositório não concede);
  //  - rls_auto_enable: função da PLATAFORMA Supabase (gatilho de evento),
  //    não deste repositório; a versão da nuvem é mais nova que a local.
  //  - privpadrao postgres f / S: em PRODUÇÃO, função nova criada pelo papel
  //    postgres nasce com EXECUTE para anon e authenticated, e sequence com
  //    rwU para anon; no local, não. As migrations novas revogam o EXECUTE
  //    explicitamente (conferido uma a uma). Achado registrado para o dono.
  const CONHECIDAS = ['difere: funcao contadores_do_menu()', 'difere: funcao rls_auto_enable()',
    'difere: privpadrao postgres f', 'difere: privpadrao postgres S'];
  //  - consequência da anterior: toda função criada pelas migrations de 19/10
  //    nasceu em produção com EXECUTE também para service_role (o local não dá).
  //    É a ÚNICA diferença aceita aqui: o resto da assinatura (corpo,
  //    volatilidade, search_path, e anon sem nada) tem de ser idêntico.
  //    service_role já ignora RLS; isso não abre nada novo.
  const semServiceRoleExtra = (k, v) => (k.startsWith('funcao ')
    ? v.replace(/,service_role=X\/postgres(?=,|$)/, '') : v);
  const prodNormal = new Map([...prod].map(([k, v]) => [k, antes.has(k) && !antes.get(k).includes('service_role=X')
    ? semServiceRoleExtra(k, v) : v]));
  const soServiceRole = diferencas(antes, prod).length - diferencas(antes, prodNormal).length;
  if (soServiceRole) console.log(`      (conhecida) ${soServiceRole} função(ões) com EXECUTE extra só para service_role em produção`);
  const todas = diferencas(antes, prodNormal);
  const d = todas.filter((x) => !CONHECIDAS.includes(x));
  for (const x of todas.filter((y) => CONHECIDAS.includes(y))) console.log(`      (conhecida) ${x}`);
  ok(d.length === 0, `esquema local com tudo aplicado = produção (${prod.size} objetos), fora as ${CONHECIDAS.length} conhecidas`);
  for (const x of d.slice(0, 40)) console.log(`      ${x}`);
  fs.mkdirSync('scratch/rollbacks', { recursive: true });
  fs.writeFileSync('scratch/rollbacks/diferencas-local-x-producao.txt', d.join('\n'));
}

console.log('\n4. Reaplicando as migrations');
const up = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['supabase', 'migration', 'up', '--local', '--include-all'], { encoding: 'utf8', shell: true });
console.log(`     ${up.split('\n').filter((l) => /Applying/.test(l)).length} migration(s) reaplicada(s)`);
const depois = mapa(local(SQL_ASSINATURA));
const d2 = diferencas(antes, depois);
ok(d2.length === 0, `5. depois de reaplicar = antes do rollback (${depois.size} objetos)`);
for (const x of d2.slice(0, 20)) console.log(`      ${x}`);

console.log('\n' + '='.repeat(76));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
