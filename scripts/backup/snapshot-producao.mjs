/**
 * scripts/backup/snapshot-producao.mjs
 *
 * Snapshot SOMENTE LEITURA de producao: a DDL inteira (funcoes, gatilhos,
 * politicas, GRANTs, restricoes, colunas, buckets, historico de migrations)
 * e os dados de TODA tabela que tiver linha.
 *
 * Nao escreve nada em producao. Toda consulta e SELECT.
 *
 * A chave de servico e obtida pela Management API, usada em memoria e nunca
 * gravada nem impressa.
 *
 * Uso:
 *   SBP=<token de conta> node scripts/backup/snapshot-producao.mjs <pasta-destino>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REF = 'xifzjpbkpxislqrowswd';
const SBP = process.env.SBP;
const destino = process.argv[2];

if (!SBP) { console.error('Falta a variavel SBP (token de conta do Supabase).'); process.exit(1); }
if (!destino) { console.error('Uso: node scripts/backup/snapshot-producao.mjs <pasta-destino>'); process.exit(1); }

/** Executa SQL de leitura em producao pela Management API. */
async function consultar(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SBP}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`consulta falhou (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/**
 * Recusa qualquer SQL que nao seja leitura.
 *
 * O script so monta SELECTs, mas a trava existe para que uma edicao futura
 * nao transforme um script de backup num script de escrita sem ninguem notar.
 */
function somenteLeitura(sql) {
  const proibido = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i;
  if (proibido.test(sql)) throw new Error('SQL de escrita recusado neste script: ' + sql.slice(0, 80));
  return sql;
}
const ler = (sql) => consultar(somenteLeitura(sql));

fs.mkdirSync(destino, { recursive: true });
const salvar = (nome, dados) => {
  const texto = JSON.stringify(dados, null, 2);
  fs.writeFileSync(path.join(destino, nome), texto);
  return { linhas: Array.isArray(dados) ? dados.length : null, bytes: Buffer.byteLength(texto),
           sha256: crypto.createHash('sha256').update(texto).digest('hex') };
};

console.log(`Snapshot de ${REF} -> ${destino}\n`);

// ------------------------------------------------------------------- DDL ----
const DDL = {
  migrations: `select version, name from supabase_migrations.schema_migrations order by version`,
  funcoes: `select n.nspname as esquema, p.proname as nome,
              case p.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end as volatilidade,
              p.prosecdef as security_definer,
              array_to_string(p.proconfig, ', ') as config,
              pg_get_functiondef(p.oid) as definicao
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' order by p.proname`,
  gatilhos: `select c.relname as tabela, t.tgname as gatilho, pg_get_triggerdef(t.oid) as definicao
             from pg_trigger t join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
             where not t.tgisinternal and n.nspname = 'public' order by 1, 2`,
  politicas: `select schemaname, tablename, policyname, cmd, roles::text, qual, with_check
              from pg_policies where schemaname in ('public','storage') order by 1,2,3`,
  privilegios_tabela: `select grantee, table_name,
              string_agg(distinct privilege_type, ',' order by privilege_type) as privilegios
            from information_schema.table_privileges
            where table_schema = 'public' and grantee in ('anon','authenticated','service_role')
            group by grantee, table_name order by table_name, grantee`,
  privilegios_funcao: `select grantee, routine_name, privilege_type
            from information_schema.routine_privileges
            where routine_schema = 'public' order by routine_name, grantee`,
  restricoes: `select c.conrelid::regclass::text as tabela, c.conname as nome,
              c.contype as tipo, c.convalidated as validada, pg_get_constraintdef(c.oid) as definicao
            from pg_constraint c join pg_namespace n on n.oid = c.connamespace
            where n.nspname = 'public' order by 1, 2`,
  colunas: `select table_name, column_name, data_type, udt_name, is_nullable,
              column_default, is_generated
            from information_schema.columns where table_schema = 'public'
            order by table_name, ordinal_position`,
  rls: `select c.relname as tabela, c.relrowsecurity as rls_ligado, c.relforcerowsecurity as rls_forcado
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 1`,
  sequences: `select sequencename, last_value from pg_sequences where schemaname = 'public' order by 1`,
  buckets: `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`,
  enums: `select t.typname as tipo, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as valores
          from pg_type t join pg_enum e on e.enumtypid = t.oid
          group by t.typname order by 1`,
  donos_tabela: `select tablename, tableowner from pg_tables where schemaname = 'public' order by 1`,
  default_acl: `select pg_get_userbyid(defaclrole) as concedente,
              defaclnamespace::regnamespace::text as esquema,
              defaclobjtype as tipo, defaclacl::text as acl from pg_default_acl order by 1,2`,
};

const manifesto = { projeto: REF, gerado_em: new Date().toISOString(), ddl: {}, dados: {}, storage: {} };

for (const [nome, sql] of Object.entries(DDL)) {
  const dados = await ler(sql);
  manifesto.ddl[nome] = salvar(`ddl_${nome}.json`, dados);
  console.log(`  DDL  ${nome.padEnd(20)} ${String(dados.length).padStart(5)} linhas`);
}

// ----------------------------------------------------------------- dados ----
const tabelas = (await ler(
  `select table_name from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`)).map(t => t.table_name);

console.log('');
const comDado = [];
for (const t of tabelas) {
  const [{ n }] = await ler(`select count(*)::int as n from public."${t}"`);
  if (n === 0) { console.log(`  --   ${t.padEnd(28)} vazia`); continue; }
  const linhas = await ler(`select * from public."${t}"`);
  const info = salvar(`dados_${t}.json`, linhas);
  manifesto.dados[t] = { ...info, contagem_declarada: n };
  comDado.push({ tabela: t, linhas: n });
  console.log(`  **   ${t.padEnd(28)} ${String(n).padStart(5)} linhas  -> dados_${t}.json`);
}

// contas de auth (sem senha — a Management API nao expoe hash)
const usuarios = await ler(
  `select id, email, created_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data
   from auth.users order by email`);
manifesto.dados['auth.users'] = { ...salvar('dados_auth_users_SEM_SENHA.json', usuarios),
  contagem_declarada: usuarios.length,
  aviso: 'SEM senha nem hash: a Management API nao os expoe. Numa restauracao real as contas precisam ser recriadas.' };
console.log(`  **   ${'auth.users'.padEnd(28)} ${String(usuarios.length).padStart(5)} contas (SEM SENHA)`);

// objetos do storage (metadados; os bytes ficam para baixar-storage-producao.mjs)
const objetos = await ler(
  `select bucket_id, name, metadata from storage.objects order by bucket_id, name`);
manifesto.storage = { ...salvar('storage_objetos.json', objetos), total: objetos.length };
console.log(`  **   ${'storage.objects'.padEnd(28)} ${String(objetos.length).padStart(5)} objetos`);

manifesto.resumo_tabelas_com_dado = comDado;
fs.writeFileSync(path.join(destino, 'MANIFESTO.json'), JSON.stringify(manifesto, null, 2));

console.log(`\nTabelas com dado: ${comDado.length}`);
comDado.forEach(c => console.log(`  ${c.tabela}: ${c.linhas}`));
console.log(`\nManifesto: ${path.join(destino, 'MANIFESTO.json')}`);
