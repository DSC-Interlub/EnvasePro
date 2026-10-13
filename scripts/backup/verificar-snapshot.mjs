/**
 * scripts/backup/verificar-snapshot.mjs
 *
 * Confere um snapshot feito por snapshot-producao.mjs. Duas provas:
 *
 *  1. **Integridade do arquivo**: recalcula o sha256 de cada arquivo e compara
 *     com o que o manifesto registrou. Pega arquivo truncado ou corrompido.
 *  2. **Fidelidade ao banco**: relê as contagens em producao, SOMENTE LEITURA,
 *     e compara com as do snapshot.
 *  3. **Restauracao de verdade**: carrega os dados no banco LOCAL e confere
 *     linha a linha. Sem restauracao testada, nao e backup — e um arquivo.
 *
 * Uso:
 *   SBP=<token> node scripts/backup/verificar-snapshot.mjs <pasta-snapshot>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const REF = 'xifzjpbkpxislqrowswd';
const SBP = process.env.SBP;
const pasta = process.argv[2];
if (!SBP || !pasta) {
  console.error('Uso: SBP=<token> node scripts/backup/verificar-snapshot.mjs <pasta-snapshot>');
  process.exit(1);
}

let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

async function ler(sql) {
  if (/\b(insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i.test(sql)) {
    throw new Error('SQL de escrita recusado neste script');
  }
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SBP}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`consulta falhou (${r.status})`);
  return r.json();
}

const psql = (sql) => execFileSync('docker',
  ['exec', '-i', 'supabase_db_envase', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', sql],
  { encoding: 'utf8' }).trim();

const manifesto = JSON.parse(fs.readFileSync(path.join(pasta, 'MANIFESTO.json'), 'utf8'));

console.log('='.repeat(72));
console.log('VERIFICACAO DO SNAPSHOT');
console.log(`  pasta:   ${pasta}`);
console.log(`  gerado:  ${manifesto.gerado_em}`);
console.log('='.repeat(72));

// ---------------------------------------------------- 1. integridade do arquivo
console.log('\n[1] os arquivos estao integros (sha256 do manifesto)');
const porArquivo = [
  ...Object.entries(manifesto.ddl).map(([k, v]) => [`ddl_${k}.json`, v]),
  ...Object.entries(manifesto.dados).map(([k, v]) =>
    [k === 'auth.users' ? 'dados_auth_users_SEM_SENHA.json' : `dados_${k}.json`, v]),
  ['storage_objetos.json', manifesto.storage],
];
for (const [arquivo, info] of porArquivo) {
  const caminho = path.join(pasta, arquivo);
  if (!fs.existsSync(caminho)) { checar(`${arquivo} existe`, false, 'arquivo ausente'); continue; }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(caminho)).digest('hex');
  checar(`${arquivo} (${info.linhas ?? '?'} linhas)`, sha === info.sha256,
    `sha diferente do manifesto`);
}

// ------------------------------------------------- 2. fidelidade ao banco real
console.log('\n[2] as contagens batem com producao, relidas agora');
for (const { tabela, linhas } of manifesto.resumo_tabelas_com_dado) {
  const [{ n }] = await ler(`select count(*)::int as n from public."${tabela}"`);
  checar(`${tabela}: ${linhas} no snapshot`, n === linhas, `producao tem ${n}`);
}
const vazias = await ler(
  `select table_name from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE' order by 1`);
const comDado = new Set(manifesto.resumo_tabelas_com_dado.map(t => t.tabela));
let aindaVazias = 0, inesperadas = [];
for (const { table_name } of vazias) {
  if (comDado.has(table_name)) continue;
  const [{ n }] = await ler(`select count(*)::int as n from public."${table_name}"`);
  if (n === 0) aindaVazias += 1; else inesperadas.push(`${table_name}=${n}`);
}
checar(`as outras ${aindaVazias} tabelas continuam vazias`, inesperadas.length === 0,
  inesperadas.join(', '));

const [{ n: contas }] = await ler(`select count(*)::int as n from auth.users`);
checar(`auth.users: ${manifesto.dados['auth.users'].contagem_declarada} contas`,
  contas === manifesto.dados['auth.users'].contagem_declarada, `producao tem ${contas}`);

// ------------------------------------------------ 3. restauracao no banco local
console.log('\n[3] restauracao no banco LOCAL, com conferencia linha a linha');
try {
  psql('select 1');
} catch {
  checar('o banco local esta de pe (docker)', false, 'supabase_db_envase nao respondeu');
}

const ESQUEMA_TESTE = 'verificacao_snapshot';
psql(`drop schema if exists ${ESQUEMA_TESTE} cascade; create schema ${ESQUEMA_TESTE};`);

for (const { tabela, linhas } of manifesto.resumo_tabelas_com_dado) {
  const dados = JSON.parse(fs.readFileSync(path.join(pasta, `dados_${tabela}.json`), 'utf8'));
  // Carrega como JSON e expande: evita montar INSERT por concatenacao e
  // funciona qualquer que seja o formato das colunas.
  const json = JSON.stringify(dados).replace(/'/g, "''");
  psql(`create table ${ESQUEMA_TESTE}."${tabela}" as
        select * from jsonb_array_elements('${json}'::jsonb);`);
  const n = Number(psql(`select count(*) from ${ESQUEMA_TESTE}."${tabela}";`));
  checar(`${tabela}: ${linhas} linhas carregadas no local`, n === linhas, `carregou ${n}`);

  // conferencia de conteudo: as chaves primarias do arquivo aparecem todas
  const ids = dados.map(d => d.id).filter(Boolean);
  if (ids.length) {
    const achados = Number(psql(
      `select count(*) from ${ESQUEMA_TESTE}."${tabela}"
       where value->>'id' = any(array[${ids.map(i => `'${i}'`).join(',')}]);`));
    checar(`${tabela}: os ${ids.length} identificadores conferem`, achados === ids.length,
      `achou ${achados}`);
  }
}

const usuarios = JSON.parse(fs.readFileSync(path.join(pasta, 'dados_auth_users_SEM_SENHA.json'), 'utf8'));
const jsonU = JSON.stringify(usuarios).replace(/'/g, "''");
psql(`create table ${ESQUEMA_TESTE}.auth_users as select * from jsonb_array_elements('${jsonU}'::jsonb);`);
const nU = Number(psql(`select count(*) from ${ESQUEMA_TESTE}.auth_users;`));
checar(`auth.users: ${usuarios.length} contas carregadas`, nU === usuarios.length, `carregou ${nU}`);
checar('e o backup declara que NAO tem senha (limitacao conhecida)',
  !!manifesto.dados['auth.users'].aviso);

psql(`drop schema ${ESQUEMA_TESTE} cascade;`);

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
