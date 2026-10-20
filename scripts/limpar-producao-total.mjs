/**
 * scripts/limpar-producao-total.mjs — esvazia o banco de PRODUÇÃO, inclusive as contas.
 *
 * Autorizado pelo dono por escrito em 20/10/2026 ("excluir absolutamente tudo,
 * tudo mesmo, inclusive os usuários; os dados são de teste"). Não reaproveitar
 * sem nova autorização.
 *
 * O que faz, numa transação só:
 *   1. TRUNCATE ... RESTART IDENTITY CASCADE em TODAS as tabelas de public;
 *   2. reinicia as 6 sequences de protocolo (as da lista de gerar_protocolo);
 *   3. DELETE FROM auth.users (identities, sessions, refresh tokens, fatores
 *      MFA e o resto saem pelas chaves estrangeiras ON DELETE CASCADE);
 *   4. confere, dentro da mesma transação, que tudo ficou em zero.
 *
 * O que NÃO faz: não mexe em esquema, funções, RLS, GRANTs, migrations,
 * histórico, buckets nem nas políticas. O Storage não se apaga por SQL: o
 * script recusa se houver objeto (aí o caminho é a API de Storage).
 *
 * Por que os gatilhos de imutabilidade não bloqueiam: são todos por LINHA
 * (BEFORE UPDATE / BEFORE DELETE). TRUNCATE não dispara gatilho por linha, só
 * gatilho ON TRUNCATE, e não existe nenhum em public (conferido antes).
 * Os gatilhos continuam lá, intactos.
 *
 * Padrão: ENSAIO. Roda tudo e termina com RAISE EXCEPTION levando as
 * contagens, o que desfaz a transação inteira. Só grava com --commit.
 *
 * Usa o login da CLI do Supabase (supabase db query --linked), nunca a
 * service key.
 *
 * Uso:
 *   node scripts/limpar-producao-total.mjs --allow-production --confirm-ref=xifzjpbkpxislqrowswd [--commit]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REF = 'xifzjpbkpxislqrowswd';
if (!process.argv.includes('--allow-production') || !process.argv.includes(`--confirm-ref=${REF}`)) {
  console.error('Recusado: produção exige --allow-production e --confirm-ref=' + REF);
  process.exit(2);
}
const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
if (ref !== REF) { console.error(`Recusado: o projeto vinculado é ${ref}, não ${REF}`); process.exit(2); }
const COMMIT = process.argv.includes('--commit');

function rodar(sql) {
  const tmp = path.join(os.tmpdir(), `limpeza-${Date.now()}.sql`);
  fs.writeFileSync(tmp, sql);
  try {
    const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['supabase', 'db', 'query', '--linked', '-o', 'json', '-f', tmp], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.slice(out.indexOf('{'))).rows ?? [];
  } catch (e) {
    return { erro: String(e.stderr || e.stdout || e.message) };
  } finally { fs.rmSync(tmp, { force: true }); }
}

const SEQS = ['seq_checklist_recebimento', 'seq_recebimento_protocolo', 'seq_envase_protocolo',
  'seq_checkout_prog', 'seq_empilha_prog', 'seq_nf_arquivo_protocolo'];

// Contagem exata de cada tabela de public, das tabelas do auth e do storage.
const SQL_CONTAGENS = `
select json_build_object(
  'public', (select json_object_agg(t, n) from (
      select c.relname as t,
             (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as n
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')) x),
  'auth', json_build_object('users', (select count(*) from auth.users), 'identities', (select count(*) from auth.identities),
      'sessions', (select count(*) from auth.sessions), 'refresh_tokens', (select count(*) from auth.refresh_tokens),
      'mfa_factors', (select count(*) from auth.mfa_factors), 'one_time_tokens', (select count(*) from auth.one_time_tokens)),
  'storage_objetos', (select count(*) from storage.objects),
  'sequences', (select json_object_agg(sequencename, last_value) from pg_sequences where schemaname = 'public')
) as r`;

const contagemEmJson = `json_build_object(
      'public', (select json_object_agg(t, n) from (
          select c.relname as t,
                 (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as n
            from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')) x),
      'auth', json_build_object('users', (select count(*) from auth.users), 'identities', (select count(*) from auth.identities),
          'sessions', (select count(*) from auth.sessions), 'refresh_tokens', (select count(*) from auth.refresh_tokens)),
      'sequences', (select json_object_agg(sequencename, last_value) from pg_sequences where schemaname = 'public'))`;

const SQL_LIMPEZA = `
do $limpeza$
declare
  lista text;
  restante bigint;
  depois json;
begin
  if (select count(*) from storage.objects) > 0 then
    raise exception 'ABORTADO: há objetos no Storage; apague pela API de Storage primeiro';
  end if;

  select string_agg(format('public.%I', c.relname), ', ' order by c.relname) into lista
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p');
  execute 'truncate table ' || lista || ' restart identity cascade';

  -- setval NÃO é transacional: o ROLLBACK do ensaio não o desfaz. Por isso só
  -- roda com --commit. (O primeiro ensaio, em 20/10/2026, chamava setval e
  -- deixou seq_envase_protocolo zerada antes da hora; a limpeza real veio logo
  -- em seguida e a zera de qualquer forma.)
  ${COMMIT ? SEQS.map((s) => `perform setval('public.${s}', 1, false);`).join('\n  ') : '-- (ensaio: sequences não tocadas)'}

  delete from auth.users;

  -- Conferência dentro da transação: se sobrou qualquer linha, nada é gravado.
  select coalesce(sum((xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::bigint), 0)
    into restante from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p');
  if restante <> 0 then raise exception 'ABORTADO: sobraram % linhas em public', restante; end if;
  if (select count(*) from auth.users) <> 0 then raise exception 'ABORTADO: sobraram contas em auth.users'; end if;
  if (select count(*) from auth.sessions) + (select count(*) from auth.refresh_tokens) + (select count(*) from auth.identities) <> 0 then
    raise exception 'ABORTADO: sobraram sessões, tokens ou identidades';
  end if;

  depois := ${contagemEmJson};
  ${COMMIT ? "raise notice 'LIMPEZA_OK %', depois;" : "raise exception 'ENSAIO_OK %', depois;"}
end
$limpeza$;
`;

console.log('='.repeat(78));
console.log(`LIMPEZA TOTAL DE PRODUÇÃO (${REF}) — ${COMMIT ? 'COMMIT (grava)' : 'ENSAIO (desfaz tudo)'}`);
console.log('='.repeat(78));

const antes = rodar(SQL_CONTAGENS);
if (antes.erro) { console.error('Falhou ao contar ANTES:', antes.erro.slice(0, 500)); process.exit(1); }
console.log('\nANTES:', JSON.stringify(antes[0].r));

const r = rodar(SQL_LIMPEZA);
if (COMMIT) {
  if (r.erro) { console.error('\nFALHOU — nada foi gravado (a transação desfaz):', r.erro.slice(0, 800)); process.exit(1); }
  const depois = rodar(SQL_CONTAGENS);
  console.log('\nDEPOIS (relido):', JSON.stringify(depois[0]?.r ?? depois));
} else {
  const m = /ENSAIO_OK (\{.*\})/s.exec(r.erro || '');
  if (!m) { console.error('\nENSAIO FALHOU:', (r.erro || JSON.stringify(r)).slice(0, 800)); process.exit(1); }
  console.log('\nDENTRO DA TRANSAÇÃO, ANTES DO ROLLBACK:', m[1].replace(/\\"/g, '"'));
  const relido = rodar(SQL_CONTAGENS);
  console.log('\nRELIDO DEPOIS DO ROLLBACK (tem de ser igual ao ANTES):', JSON.stringify(relido[0]?.r ?? relido));
  console.log(`\nIgual ao ANTES: ${JSON.stringify(relido[0]?.r) === JSON.stringify(antes[0].r)}`);
}
