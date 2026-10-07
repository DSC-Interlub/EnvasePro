import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('listar-usuarios');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkUsers() {
  const { data: { users }, error: errUsers } = await supabase.auth.admin.listUsers();
  if (errUsers) {
    console.error('Erro ao listar auth.users:', errUsers);
    return;
  }

  const { data: profiles, error: errProf } = await supabase.from('user_profiles').select('*');
  if (errProf) {
    console.error('Erro ao listar user_profiles:', errProf);
    return;
  }

  console.log('='.repeat(70));
  console.log('👥 USUÁRIOS NO SUPABASE AUTH E USER_PROFILES:');
  console.log('='.repeat(70));

  users.forEach(u => {
    const prof = profiles.find(p => p.id === u.id || p.email === u.email);
    console.log(`- Email: ${u.email}`);
    console.log(`  ID: ${u.id}`);
    console.log(`  Email Confirmado: ${u.email_confirmed_at ? 'Sim' : 'Não'}`);
    console.log(`  Role no user_profiles: ${prof?.role || 'NÃO ENCONTRADO NO PROFILES'}`);
    console.log(`  Nome no user_profiles: ${prof?.full_name || '—'}`);
    console.log('');
  });
}
checkUsers();
