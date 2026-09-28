import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createOperacoesUser() {
  const email = 'operacoes@interlub.com';
  const password = 'Interlub@Operacoes2026';
  const fullName = 'Operações Interlub (Geral)';
  const role = 'operator';

  console.log(`Criando conta ${email}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role: role
    }
  });

  if (error) {
    if (error.message.includes('already registered')) {
      console.log('Conta já existe.');
    } else {
      console.error('Erro ao criar usuário:', error);
      return;
    }
  } else {
    console.log('Usuário criado no Auth com ID:', data.user.id);
  }

  // Garante registro em public.user_profiles
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === email);
  if (user) {
    const { error: profErr } = await supabase.from('user_profiles').upsert({
      id: user.id,
      email: email,
      full_name: fullName,
      role: role
    });
    if (profErr) {
      console.error('Erro ao salvar profile:', profErr);
    } else {
      console.log('Perfil user_profiles atualizado com sucesso!');
    }
  }
}

createOperacoesUser();
