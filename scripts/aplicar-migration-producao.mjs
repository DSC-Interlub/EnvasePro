/**
 * scripts/aplicar-migration-producao.mjs — aplica UMA migration em PRODUÇÃO
 * e verifica o que ela criou.
 *
 * Autorizado pelo dono por escrito em 19/10/2026 para 20261013000001 e
 * 20261019000001 a 20261019000006. Fora disso, não use.
 *
 * Exige as DUAS confirmações do db-guard: --allow-production e
 * --confirm-ref=xifzjpbkpxislqrowswd. Usa o login da CLI do Supabase
 * (supabase db query --linked, Management API) — nunca a service key.
 *
 * O que faz, nesta ordem:
 *  1. confere que a versão NÃO está no histórico de produção e que as
 *     anteriores do repositório estão (aplicar fora de ordem é recusado);
 *  2. aplica o arquivo numa transação, com lock_timeout de 5 s (produção está
 *     em uso; um bloqueio longo faria a transação desistir, não travar a
 *     fábrica), e registra a versão em supabase_migrations.schema_migrations
 *     NA MESMA transação — ou entra tudo, ou nada;
 *  3. verifica: cada função esperada existe, é STABLE (as de painel), sem
 *     SECURITY DEFINER, com search_path fixo, EXECUTE só para authenticated
 *     (nada para PUBLIC nem anon); cada tabela nova com RLS ativa, anon sem
 *     nada e authenticated sem TRUNCATE; cada índice esperado existe.
 *
 * Uso: node scripts/aplicar-migration-producao.mjs <versão> --allow-production --confirm-ref=xifzjpbkpxislqrowswd
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REF = 'xifzjpbkpxislqrowswd';
const versao = process.argv[2];
// Ensaio: o MESMO procedimento contra o banco LOCAL (--local em vez de --linked).
const ENSAIO = process.argv.includes('--ensaio-local');
const ALVO = ENSAIO ? '--local' : '--linked';
if (!ENSAIO && (!process.argv.includes('--allow-production') || !process.argv.includes(`--confirm-ref=${REF}`))) {
  console.error('Recusado: produção exige --allow-production e --confirm-ref=' + REF);
  process.exit(2);
}
const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (!ENSAIO && ref !== REF) { console.error(`Recusado: o projeto vinculado é ${ref}, não ${REF}`); process.exit(2); }

// 000007 e 000008: autorizadas pelo dono por escrito na segunda mensagem de 19/10/2026.
// 20261020000001: autorizada pelo dono por escrito em 20/10/2026 (gestão de usuários).
const AUTORIZADAS = ['20261013000001', '20261019000001', '20261019000002', '20261019000003',
  '20261019000004', '20261019000005', '20261019000006', '20261019000007', '20261019000008', '20261020000001'];
if (!ENSAIO && !AUTORIZADAS.includes(versao)) { console.error(`Recusado: ${versao} não está na autorização do dono`); process.exit(2); }

const arquivo = fs.readdirSync('supabase/migrations').find((f) => f.startsWith(`${versao}_`));
const nome = arquivo.replace(/^\d+_/, '').replace(/\.sql$/, '');
const sqlMigration = fs.readFileSync(`supabase/migrations/${arquivo}`, 'utf8');

function consultar(sql) {
  const tmp = path.join(os.tmpdir(), `prod-${versao}-${Date.now()}.sql`);
  fs.writeFileSync(tmp, sql);
  try {
    const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['supabase', 'db', 'query', ALVO, '-o', 'json', '-f', tmp], { encoding: 'utf8', shell: true });
    const j = JSON.parse(out.slice(out.indexOf('{')));
    return j.rows ?? [];
  } finally { fs.rmSync(tmp, { force: true }); }
}
const dolar = (s) => `$migration_texto$${s}$migration_texto$`;

// O passo de APLICAR tem vários comandos. Em produção vai pela Management API
// (supabase db query --linked), que os aceita — foi assim em 07/10. No ensaio
// local, `db query --local` usa prepared statement e recusa vários comandos;
// ali o mesmo SQL vai pelo psql do container, em ON_ERROR_STOP.
function aplicarSql(sql) {
  if (!ENSAIO) return consultar(sql);
  execFileSync('docker', ['exec', '-i', 'supabase_db_envase', 'psql', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' });
  return [];
}

// O que cada versão tem de deixar em produção.
const ESPERADO = {
  '20261013000001': { funcoes: [], indices: [], tabelas: [], extra: 'fuso' },
  '20261019000001': { funcoes: ['painel_televisao_empilha()'], indices: ['idx_empilha_programacoes_data', 'idx_empilha_linhas_programacao', 'idx_empilha_ocorrencias_data'], tabelas: [] },
  '20261019000002': { funcoes: ['painel_televisao()'], indices: ['idx_envase_records_data', 'idx_checkout_programacoes_data', 'idx_checkout_itens_programacao', 'idx_empilhadeira_paradas_data'], tabelas: [] },
  '20261019000003': { funcoes: ['painel_geral()'], indices: ['idx_limpeza_programacoes_data', 'idx_recebimentos_status', 'idx_recebimento_participantes_recebimento'], tabelas: [] },
  '20261019000004': { funcoes: ['indicadores_empilhadeira(de date, ate date)'], indices: [], tabelas: [] },
  '20261019000005': { funcoes: ['indicadores_recebimento(de date, ate date)'], indices: ['idx_recebimento_ocorrencias_recebimento', 'idx_checklist_recebimentos_entrega'], tabelas: [] },
  '20261019000006': { funcoes: ['metas_do_dia(dia date)', 'painel_televisao_empilha()', 'painel_televisao()'], indices: ['uq_metas_item_vigencia'], tabelas: ['metas_diarias'], extra: 'metas' },
  '20261019000007': { funcoes: [], indices: [], tabelas: [], extra: 'status' },
  '20261019000008': { funcoes: [], indices: [], tabelas: [], extra: 'privilegios' },
  '20261020000001': { funcoes: [], indices: ['idx_auditoria_usuarios_criado_em', 'idx_auditoria_usuarios_ator_criado'], tabelas: [], extra: 'gestao' },
}[versao];

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

console.log('='.repeat(76));
console.log(`${ENSAIO ? 'ENSAIO no banco LOCAL' : `PRODUÇÃO ${REF}`} — ${arquivo}`);
console.log('='.repeat(76));

// 1. Ordem e histórico
const hist = consultar('select version from supabase_migrations.schema_migrations order by 1').map((r) => r.version);
if (hist.includes(versao)) { console.error(`Recusado: ${versao} já está no histórico de produção`); process.exit(2); }
const anteriores = fs.readdirSync('supabase/migrations').map((f) => f.slice(0, 14)).filter((v) => v < versao);
const faltando = anteriores.filter((v) => !hist.includes(v));
if (faltando.length) { console.error(`Recusado: faltam em produção as anteriores ${faltando.join(', ')}`); process.exit(2); }
console.log(`\n1. Histórico: ${hist.length} versões, todas as anteriores presentes; ${versao} ausente.`);

// 2. Aplicar + registrar, numa transação
console.log('\n2. Aplicando (uma transação: migration + registro no histórico)');
const t0 = Date.now();
aplicarSql(`BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
${sqlMigration}
;
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('${versao}', '${nome}', ARRAY[${dolar(sqlMigration)}]);
COMMIT;`);
console.log(`  aplicada em ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// 3. Verificar
console.log('\n3. Verificação');
const h2 = consultar(`select count(*)::int as n from supabase_migrations.schema_migrations where version = '${versao}' and name = '${nome}'`);
ok(h2[0]?.n === 1, `registrada no histórico como ${versao} ${nome}`);

for (const f of ESPERADO.funcoes) {
  const [fn] = f.split('(');
  const r = consultar(`select p.provolatile::text as vol, p.prosecdef as sd,
      coalesce(array_to_string(p.proconfig, ','), '') as cfg,
      coalesce((select string_agg(a, ',' order by a) from unnest(p.proacl::text[]) a), '') as acl,
      pg_get_function_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '${fn}'`);
  const x = r[0];
  ok(!!x, `função ${f} existe`);
  if (!x) continue;
  ok(x.vol === 's', `  ${fn}: STABLE`);
  ok(x.sd === false, `  ${fn}: sem SECURITY DEFINER (direitos do invocador)`);
  ok(x.cfg === 'search_path=public, pg_temp', `  ${fn}: search_path fixo (${x.cfg})`);
  const ent = x.acl.split(',').filter(Boolean);
  ok(!ent.some((e) => e.startsWith('anon=') || e.startsWith('=')), `  ${fn}: nada para anon nem PUBLIC (${x.acl})`);
  ok(ent.some((e) => e.startsWith('authenticated=X')), `  ${fn}: EXECUTE para authenticated`);
}
for (const i of ESPERADO.indices) {
  const r = consultar(`select count(*)::int as n from pg_indexes where schemaname = 'public' and indexname = '${i}'`);
  ok(r[0]?.n === 1, `índice ${i} existe`);
}
for (const t of ESPERADO.tabelas) {
  const r = consultar(`select c.relrowsecurity as rls,
      coalesce((select string_agg(a, ',' order by a) from unnest(c.relacl::text[]) a), '') as acl,
      (select count(*)::int from pg_policies where schemaname = 'public' and tablename = '${t}') as politicas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = '${t}'`);
  const x = r[0];
  ok(!!x && x.rls === true, `tabela ${t}: existe, RLS ativa`);
  const ent = (x?.acl || '').split(',').filter(Boolean);
  ok(!ent.some((e) => e.startsWith('anon=')), `  ${t}: anon sem nenhum privilégio`);
  const auth = ent.find((e) => e.startsWith('authenticated=')) || '';
  ok(/^authenticated=arwd\//.test(auth), `  ${t}: authenticated só SELECT/INSERT/UPDATE/DELETE, sem TRUNCATE (${auth})`);
  ok(x?.politicas === 4, `  ${t}: 4 políticas (${x?.politicas})`);
}
if (ESPERADO.extra === 'fuso') {
  const r = consultar(`select position('America/Sao_Paulo' in pg_get_functiondef('public.gerar_protocolo(text,text)'::regprocedure)) > 0 as funcao,
      (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'nota_fiscal_arquivos' and column_name = 'data_arquivo') as padrao,
      coalesce((select string_agg(a, ',' order by a) from unnest((select proacl from pg_proc where oid = 'public.gerar_protocolo(text,text)'::regprocedure)::text[]) a), '') as acl`);
  ok(r[0]?.funcao === true, 'gerar_protocolo: o ano é o de America/Sao_Paulo');
  ok(/Sao_Paulo/.test(r[0]?.padrao || ''), `data_arquivo: padrão no fuso de Brasília (${r[0]?.padrao})`);
  ok(!/(^|,)anon=|(^|,)=X/.test(r[0]?.acl || ''), `gerar_protocolo: nada para anon nem PUBLIC (${r[0]?.acl})`);
}
if (ESPERADO.extra === 'status') {
  const r = consultar(`select (select count(*)::int from pg_trigger where not tgisinternal and tgname in
        ('trg_empilha_linhas_status_completo','trg_limpeza_prog_status_completo','trg_recebimentos_status_completo')) as gatilhos,
      p.prosecdef as sd, coalesce(array_to_string(p.proconfig, ','), '') as cfg,
      coalesce(array_to_string(p.proacl::text[], ','), '') as acl
    from pg_proc p where p.oid = 'public.protect_status_completo()'::regprocedure`);
  ok(r[0]?.gatilhos === 3, `os 3 gatilhos de status Completo existem (${r[0]?.gatilhos})`);
  ok(r[0]?.sd === false && r[0]?.cfg === 'search_path=public, pg_temp', 'protect_status_completo: invoker, search_path fixo');
  ok(!/(^|,)(anon|authenticated)=|(^|,)=X/.test(r[0]?.acl || ''), `protect_status_completo: EXECUTE para ninguém além do dono (${r[0]?.acl})`);
}
if (ESPERADO.extra === 'privilegios') {
  const r = consultar(`select count(*)::int as tabelas,
      count(*) filter (where (select a from unnest(c.relacl::text[]) a where a like 'authenticated=%') ~ '^authenticated=arwd/')::int as auth_ok,
      count(*) filter (where exists (select 1 from unnest(c.relacl::text[]) a where a like 'anon=%'))::int as com_anon
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`);
  const x = r[0];
  ok(x.auth_ok === x.tabelas, `authenticated só arwd (SELECT/INSERT/UPDATE/DELETE) em ${x.auth_ok} de ${x.tabelas} tabelas`);
  ok(x.com_anon === 0, `anon sem privilégio em tabela nenhuma (${x.com_anon})`);
  const d = consultar(`select coalesce((select a from unnest(defaclacl::text[]) a where a like 'authenticated=%'), '') as auth,
      coalesce((select a from unnest(defaclacl::text[]) a where a like 'anon=%'), '') as anon
    from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r'`);
  ok(/^authenticated=arwd\//.test(d[0]?.auth || ''), `tabela futura (migration): authenticated nasce só arwd (${d[0]?.auth})`);
  ok(!d[0]?.anon, `tabela futura (migration): anon nasce sem nada (${d[0]?.anon || 'vazio'})`);
}
if (ESPERADO.extra === 'gestao') {
  const t = consultar(`select c.relrowsecurity as rls,
      coalesce((select string_agg(a, ',' order by a) from unnest(c.relacl::text[]) a), '') as acl,
      (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'auditoria_usuarios') as politicas
    from pg_class c where c.oid = 'public.auditoria_usuarios'::regclass`)[0];
  const ent = (t?.acl || '').split(',').filter(Boolean);
  ok(t?.rls === true, 'auditoria_usuarios: existe, RLS ativa');
  ok(!ent.some((e) => e.startsWith('anon=') || e.startsWith('=')), `  anon e PUBLIC sem nada (${t?.acl})`);
  ok(ent.some((e) => e.startsWith('authenticated=r/')), '  authenticated só SELECT (o RLS deixa só o admin ver)');
  ok(ent.some((e) => e.startsWith('service_role=ar/')), '  service_role só SELECT e INSERT (sem UPDATE/DELETE/TRUNCATE)');
  ok(t?.politicas === 1, `  1 política, de leitura para admin (${t?.politicas})`);
  const g = consultar(`select string_agg(tgname, ',' order by tgname) as nomes from pg_trigger
    where not tgisinternal and tgname in ('trg_auditoria_usuarios_imutavel', 'trg_auditoria_usuarios_sem_truncate', 'trg_proteger_ultimo_admin')`)[0];
  ok(g?.nomes === 'trg_auditoria_usuarios_imutavel,trg_auditoria_usuarios_sem_truncate,trg_proteger_ultimo_admin', `3 gatilhos (${g?.nomes})`);
  const f = consultar(`select p.proname, p.prosecdef as sd, coalesce(array_to_string(p.proconfig, ','), '') as cfg,
      coalesce((select string_agg(a, ',' order by a) from unnest(p.proacl::text[]) a), '') as acl
    from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('encerrar_sessoes', 'proteger_ultimo_admin', 'auditoria_usuarios_imutavel') order by 1`);
  ok(f.length === 3, `3 funções (${f.map((x) => x.proname).join(', ')})`);
  for (const x of f) {
    const e = x.acl.split(',').filter(Boolean);
    ok(x.cfg === 'search_path=public, pg_temp', `  ${x.proname}: search_path fixo`);
    ok(!e.some((a) => a.startsWith('anon=') || a.startsWith('authenticated=') || a.startsWith('=')), `  ${x.proname}: nada para anon, authenticated nem PUBLIC (${x.acl})`);
    if (x.proname === 'encerrar_sessoes') {
      ok(x.sd === true && e.some((a) => a.startsWith('service_role=X')), '  encerrar_sessoes: SECURITY DEFINER e só a service_role executa');
    } else {
      ok(x.sd === false, `  ${x.proname}: sem SECURITY DEFINER`);
    }
  }
  const a = consultar("select count(*)::int as n from public.user_profiles where role = 'admin'")[0];
  console.log(`  (admins no momento: ${a?.n})`);
}
if (ESPERADO.extra === 'metas') {
  const r = consultar(`select position('metas_do_dia' in pg_get_functiondef('public.painel_televisao()'::regprocedure)) > 0 as tv,
      position('metas_do_dia' in pg_get_functiondef('public.painel_televisao_empilha()'::regprocedure)) > 0 as emp,
      (select count(*)::int from public.metas_diarias) as metas`);
  ok(r[0]?.tv && r[0]?.emp, 'os dois painéis das TVs leem metas_do_dia');
  if (!ENSAIO) ok(r[0]?.metas === 0, `nenhuma meta lançada ainda (${r[0]?.metas}) — as TVs seguem como antes`);
}

console.log('\n' + '='.repeat(76));
console.log(falhas ? `${falhas} FALHA(S) — PARAR` : `TUDO OK — ${versao} aplicada e verificada`);
process.exit(falhas ? 1 : 0);
