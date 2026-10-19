/**
 * scripts/test-fuso-banco.js
 *
 * Testa a migration 20261013000001: "hoje" no banco e o dia de Brasilia.
 *
 * COMO SE TESTA SEM ESPERAR 31/12 AS 22H
 *
 * `CURRENT_DATE` segue o fuso da SESSAO. Logo nao e preciso esperar a virada:
 * basta pedir a mesma coisa com a sessao em dois fusos. Num fuso adiantado o
 * jeito antigo responde "amanha" (e, em 31/12, "ano que vem"); o corrigido
 * nao se move.
 *
 * Para o caso de 31/12 as 22h BRT, o teste avalia as DUAS expressoes sobre um
 * instante fixo (2027-01-01 01:00 UTC = 2026-12-31 22:00 BRT), o que mostra o
 * ano exato que cada uma produziria naquele momento.
 *
 * Uso: node scripts/test-fuso-banco.js
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-fuso-banco');

const MIGRATION = 'supabase/migrations/20261013000001_fuso_brasilia_no_banco.sql';

let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

/**
 * Roda SQL no banco local e devolve a ULTIMA linha da saida.
 *
 * A ultima, e nao tudo: quando a consulta vem depois de um `SET TIME ZONE`,
 * o psql imprime "SET" antes do resultado, e isso entrava no valor medido.
 */
/**
 * Rotulos que o psql imprime por comando executado, e que NAO sao resultado.
 *
 * Precisa existir porque varias consultas aqui vem depois de um
 * `SET TIME ZONE`, e uma delas e um INSERT ... RETURNING: a saida traz
 * "SET", a linha devolvida e "INSERT 0 1". Pegar a ultima linha sem filtrar
 * media o rotulo em vez do valor.
 */
const ROTULOS_DO_PSQL = /^(SET|BEGIN|COMMIT|ROLLBACK|COMMENT|GRANT|REVOKE|ALTER \w+.*|CREATE \w+.*|DROP \w+.*|(INSERT|UPDATE|DELETE|SELECT|COPY|MOVE|FETCH)( \d+)+)$/i;

const psql = (sql) => {
  const saida = execFileSync('docker',
    ['exec', '-i', 'supabase_db_envase', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', sql],
    { encoding: 'utf8' }).trim();
  const linhas = saida.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !ROTULOS_DO_PSQL.test(l));
  return linhas.length ? linhas[linhas.length - 1] : '';
};

console.log('='.repeat(72));
console.log('FUSO NO BANCO — migration 20261013000001');
console.log('='.repeat(72));

// ------------------------------------------------ 1. o levantamento esta limpo
console.log('\n[1] nao sobrou CURRENT_DATE onde importa');

const funcoesRuins = psql(
  `select coalesce(string_agg(p.proname, ', '), '') from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and regexp_replace(pg_get_functiondef(p.oid), '--[^
]*', '', 'g')
           ~* '(current_date|localtimestamp)'`);
// Os comentarios SQL sao removidos antes de procurar: o comentario que
// EXPLICA a troca cita "CURRENT_DATE" de proposito, e contava como ocorrencia.
checar('nenhuma funcao de public usa CURRENT_DATE em codigo', funcoesRuins === '', funcoesRuins);

const defaultsRuins = psql(
  `select coalesce(string_agg(table_name || '.' || column_name, ', '), '')
   from information_schema.columns
   where table_schema = 'public'
     and column_default ~* '(current_date|localtimestamp)'`);
checar('nenhum DEFAULT de coluna usa CURRENT_DATE', defaultsRuins === '', defaultsRuins);

const comBrt = psql(
  `select coalesce(string_agg(p.proname, ', ' order by p.proname), '') from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ~ 'America/Sao_Paulo'`);
checar(`as funcoes de data usam America/Sao_Paulo (${comBrt})`,
  comBrt.includes('gerar_protocolo') && comBrt.includes('contadores_do_menu'), comBrt);

const padrao = psql(
  `select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'nota_fiscal_arquivos'
     and column_name = 'data_arquivo'`);
checar('o DEFAULT de data_arquivo usa a zona NOMEADA', /America\/Sao_Paulo/.test(padrao), padrao);

// -------------------------------- 2. a sessao em outro fuso nao muda o resultado
console.log('\n[2] com a sessao em outro fuso, o resultado NAO muda');

const anoCom = (tz) => psql(
  `SET TIME ZONE '${tz}'; SELECT public.gerar_protocolo('TESTE', 'public.seq_envase_protocolo');`
).split('-')[1];

const anoUtc = anoCom('UTC');
const anoMais14 = anoCom('Pacific/Kiritimati');  // UTC+14
const anoMenos11 = anoCom('Pacific/Niue');       // UTC-11
checar(`gerar_protocolo da o mesmo ano nos 3 fusos (${anoUtc})`,
  anoUtc === anoMais14 && anoUtc === anoMenos11,
  `UTC=${anoUtc} +14=${anoMais14} -11=${anoMenos11}`);

const anoBrt = psql(`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY')`);
checar(`e o ano certo e o de Brasilia (${anoBrt})`, anoUtc === anoBrt);

// o jeito ANTIGO, para o teste nao ser vazio
const antigoCom = (tz) => psql(`SET TIME ZONE '${tz}'; SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD');`);
const antigoUtc = antigoCom('UTC');
const antigoMais14 = antigoCom('Pacific/Kiritimati');
checar('o jeito ANTIGO (CURRENT_DATE) muda conforme o fuso — o defeito existia',
  antigoUtc !== antigoMais14, `UTC=${antigoUtc} +14=${antigoMais14}`);

// ------------------------- 3. 31/12 as 22h de Brasilia: o ano que cada um daria
console.log('\n[3] 31/12/2026 as 22h de Brasilia (= 01h UTC de 01/01/2027)');

const INSTANTE = "timestamptz '2027-01-01 01:00:00+00'";
const linha = psql(
  `select to_char((${INSTANTE} at time zone 'UTC')::date, 'YYYY') || '|' ||
          to_char((${INSTANTE} at time zone 'America/Sao_Paulo')::date, 'YYYY') || '|' ||
          to_char((${INSTANTE} at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`);
const [anoAntigo, anoNovo, diaNovo] = linha.split('|');
checar(`o jeito antigo daria o ano ${anoAntigo} — ERRADO`, anoAntigo === '2027');
checar(`o corrigido da ${anoNovo}, dia ${diaNovo}`, anoNovo === '2026' && diaNovo === '2026-12-31');
checar('naquele instante os dois divergem em um ANO inteiro', anoAntigo !== anoNovo);

// ---------------------------- 4. a janela exata, hora a hora, na virada do ano
console.log('\n[4] a janela da divergencia na virada do ano');

const janela = psql(`
  select string_agg(rotulo || '=' || antigo || '/' || novo, '  ' order by t)
  from (
    select '20h' as rotulo, timestamptz '2026-12-31 23:00:00+00' as t
    union all select '21h', timestamptz '2027-01-01 00:00:00+00'
    union all select '22h', timestamptz '2027-01-01 01:00:00+00'
    union all select '23h', timestamptz '2027-01-01 02:00:00+00'
    union all select '00h', timestamptz '2027-01-01 03:00:00+00'
  ) i,
  lateral (
    select to_char((i.t at time zone 'UTC')::date, 'YYYY') as antigo,
           to_char((i.t at time zone 'America/Sao_Paulo')::date, 'YYYY') as novo
  ) x`);
console.log(`        hora BRT = ano antigo / ano novo:   ${janela}`);
checar('as 20h BRT os dois concordam', /20h=2026\/2026/.test(janela), janela);
checar('das 21h as 23h59 o antigo erra o ANO',
  /21h=2027\/2026/.test(janela) && /22h=2027\/2026/.test(janela) && /23h=2027\/2026/.test(janela),
  janela);
checar('a partir de 00h os dois voltam a concordar', /00h=2027\/2027/.test(janela), janela);

// --------------------------- 5. o DEFAULT de data_arquivo, inserindo de verdade
console.log('\n[5] o DEFAULT de data_arquivo, com a sessao em UTC+14');

const MARCA = 'ZZTESTE-FUSO';
const limpar = () => psql(
  `delete from nota_fiscal_arquivos where protocolo_arquivo like '${MARCA}%';`);
limpar();
try {
  const r = psql(
    `SET TIME ZONE 'Pacific/Kiritimati';
     insert into nota_fiscal_arquivos (protocolo_arquivo, numero_nf, arquivo_url, arquivo_nome)
     values ('${MARCA}-1', '${MARCA}-NF', 'teste://fuso', 'teste.pdf')
     returning data_arquivo::text || '|' || data_expiracao_legal::text;`);
  const [dataArquivo, expiracao] = r.split('|');
  const hojeBrt = psql(`select (now() at time zone 'America/Sao_Paulo')::date::text`);
  const diaDaSessao = psql(`SET TIME ZONE 'Pacific/Kiritimati'; select current_date::text`);

  checar(`data_arquivo = ${dataArquivo}, o dia de Brasilia`,
    dataArquivo === hojeBrt, `esperado ${hojeBrt}; a sessao diria ${diaDaSessao}`);
  checar(`a retencao legal deriva dela: expira ${expiracao.slice(0, 10)}`,
    expiracao.startsWith(String(Number(hojeBrt.slice(0, 4)) + 5)), expiracao);
} finally {
  limpar();
}

// ----------------------------------------------------------- 6. idempotencia
console.log('\n[6] a migration pode rodar de novo');

const assinatura = () => psql(
  `select md5(pg_get_functiondef(p.oid)) || '|' || coalesce((
     select column_default from information_schema.columns
     where table_schema='public' and table_name='nota_fiscal_arquivos'
       and column_name='data_arquivo'), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gerar_protocolo'`);

const antes = assinatura();
execFileSync('docker',
  ['exec', '-i', 'supabase_db_envase', 'psql', '-U', 'postgres', '-d', 'postgres',
   '-v', 'ON_ERROR_STOP=1'],
  { input: fs.readFileSync(MIGRATION, 'utf8'), encoding: 'utf8' });
const depois = assinatura();
checar('rodar a migration duas vezes da o mesmo estado', antes === depois,
  `${antes} != ${depois}`);

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
