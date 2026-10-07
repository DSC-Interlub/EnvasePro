/**
 * scripts/seed-local-auth.js
 *
 * Cria as contas de teste no Supabase **LOCAL** para os testes Playwright
 * (CLAUDE.md Fase 0, item 0.7). Complementa `supabase/seed.sql`, que cuida
 * apenas dos dados e nao contem segredo nenhum.
 *
 * As senhas sao lidas ESTRITAMENTE de variavel de ambiente (.env.local).
 * Nao existe senha padrao no codigo: faltando a variavel, o script aborta.
 *
 * O papel (role) e gravado em public.user_profiles, NUNCA em user_metadata
 * (que o proprio usuario consegue editar — ver CLAUDE.md Fase 3).
 *
 * O UPDATE em user_profiles passa pelo psql do container local, e nao pela
 * API REST, porque um banco construido somente pelas migrations do repo nao
 * concede DML a service_role (ver o achado da Fase 0 sobre pg_default_acl).
 *
 * Uso: npm run seed:local-auth
 */

import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('seed-local-auth');

const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_envase';

const CONTAS = [
  { chave: 'admin',    email: process.env.TEST_ADMIN_EMAIL,    senhaVar: 'TEST_ADMIN_PASSWORD',    role: 'admin',    nome: 'PCP Brasil (SEED local)' },
  { chave: 'operador', email: process.env.TEST_OPERATOR_EMAIL, senhaVar: 'TEST_OPERATOR_PASSWORD', role: 'operator', nome: 'Operacoes Equipe (SEED local)' },
  { chave: 'tv',       email: process.env.TEST_TV_EMAIL,       senhaVar: 'TEST_TV_PASSWORD',       role: 'operator', nome: 'TV Fabrica (SEED local)' },
];

function abortar(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  abortar('VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios (.env.local).');
}

for (const c of CONTAS) {
  if (!c.email) abortar(`E-mail da conta "${c.chave}" nao definido no ambiente.`);
  if (!process.env[c.senhaVar]) abortar(`${c.senhaVar} nao definida. Senhas vem do ambiente; nao ha padrao no codigo.`);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Executa SQL no Postgres local via psql do container. Nunca recebe senha. */
function sqlLocal(sql) {
  return execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', sql],
    { encoding: 'utf8' }
  ).trim();
}

async function acharUsuarioPorEmail(email) {
  // listUsers pagina; as contas de seed sao poucas, mas nao assuma a 1a pagina.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const achado = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (achado) return achado;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log('='.repeat(78));
  console.log(`SEED DE CONTAS — Supabase LOCAL (${SUPABASE_URL})`);
  console.log('='.repeat(78));

  try {
    sqlLocal('select 1');
  } catch {
    abortar(`Nao consegui falar com o container "${DB_CONTAINER}" via docker exec. O stack local esta de pe? (npx supabase start)`);
  }

  for (const c of CONTAS) {
    const senha = process.env[c.senhaVar];
    const existente = await acharUsuarioPorEmail(c.email);

    let id;
    if (existente) {
      const { data, error } = await admin.auth.admin.updateUserById(existente.id, {
        password: senha,
        email_confirm: true,
      });
      if (error) abortar(`Falha ao atualizar ${c.email}: ${error.message}`);
      id = data.user.id;
      console.log(`  ~ ${c.email.padEnd(32)} atualizada   uid=${id}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: c.email,
        password: senha,
        email_confirm: true,
        // Nada de role aqui de proposito: user_metadata e editavel pelo usuario.
        user_metadata: { full_name: c.nome },
      });
      if (error) abortar(`Falha ao criar ${c.email}: ${error.message}`);
      id = data.user.id;
      console.log(`  + ${c.email.padEnd(32)} criada       uid=${id}`);
    }

    // handle_new_user forca role='operator'; o papel real vem daqui.
    const esc = (v) => String(v).replace(/'/g, "''");
    sqlLocal(
      `insert into public.user_profiles (id, email, full_name, role)
         values ('${esc(id)}', '${esc(c.email)}', '${esc(c.nome)}', '${esc(c.role)}'::user_role)
       on conflict (id) do update
         set email = excluded.email,
             full_name = excluded.full_name,
             role = excluded.role,
             updated_at = now();`
    );
  }

  console.log('-'.repeat(78));
  console.log('Papeis em public.user_profiles:');
  console.log(sqlLocal("select email||' -> '||role from public.user_profiles order by email;"));
  console.log('-'.repeat(78));
  console.log('Senhas: veja as variaveis TEST_*_PASSWORD do .env.local (nao sao impressas).');
}

main().catch((e) => abortar(e.message || String(e)));
