import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('criar-operacoes-user');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPERATOR_PASSWORD = process.env.OPERATOR_INITIAL_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  process.exit(1);
}

if (!OPERATOR_PASSWORD) {
  console.error('❌ ERRO: OPERATOR_INITIAL_PASSWORD é obrigatório no ambiente (.env.local).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function createOperacoesUser() {
  const email = 'operacoes@interlub.com';
  const fullName = 'Operações Interlub (Geral)';
  const role = 'operator';

  console.log(`Criando conta ${email}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: OPERATOR_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: fullName
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

  // Garante registro em public.user_profiles via UPDATE/UPSERT com service_role
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
      console.error('Erro ao atualizar user_profiles:', profErr);
    } else {
      console.log('Perfil sincronizado em user_profiles com role:', role);
    }
  }
}

createOperacoesUser();
