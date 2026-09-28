import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Script para convidar novos usuários por e-mail no Supabase Auth.
 * Cada usuário recebe um e-mail de convite para definir sua própria senha de forma segura.
 * Nenhuma senha transita pelo chat ou pelo terminal.
 */
export async function convidarUsuario(email, fullName, role = 'operator') {
  console.log(`Enviando convite para ${email} (${fullName}) [role: ${role}]...`);

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: process.env.APP_BASE_URL || 'https://envase.interlub.com.br'
  });

  if (error) {
    console.error(`❌ Erro ao convidar ${email}:`, error.message);
    return { success: false, error: error.message };
  }

  // Atualiza ou insere o perfil no user_profiles
  const { error: errProfile } = await supabase
    .from('user_profiles')
    .upsert({
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
      role: role
    });

  if (errProfile) {
    console.error(`⚠️ Erro ao definir perfil no user_profiles para ${email}:`, errProfile.message);
  } else {
    console.log(`✅ Convite enviado com sucesso para ${email}! Perfil configurado como ${role}.`);
  }

  return { success: true, user: data.user };
}
