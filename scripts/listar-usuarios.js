import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
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
