/**
 * scripts/test-security-signup.js
 * Teste de segurança independente para verificar:
 * 1. Bloqueio de auto-atribuição de 'admin' no signUp público via metadata.
 * 2. Bloqueio de alteração de 'role' via UPDATE por usuário não-admin.
 * 3. Comportamento caso enable_signup=false esteja ativo no Auth.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_SIGNUP_PASSWORD = process.env.TEST_SIGNUP_PASSWORD || 'SecTest#2026!Aa1';

// Validação de variáveis obrigatórias
const missing = [];
if (!SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
if (!SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

if (missing.length > 0) {
  console.error(`❌ ERRO: Variáveis de ambiente obrigatórias ausentes:\n   - ${missing.join('\n   - ')}`);
  process.exit(1);
}

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runSecuritySignupTest() {
  console.log('='.repeat(78));
  console.log('🛡️  TESTE DE SEGURANÇA: SIGNUP PÚBLICO E ELEVAÇÃO DE PRIVILÉGIOS');
  console.log(`🌐 Alvo: ${SUPABASE_URL}`);
  console.log('='.repeat(78));

  const testEmail = `sec.audit.${Date.now()}@interlub.com`;
  console.log(`\n[PASSO 1] Tentando signUp público com payload malicioso:`);
  console.log(`   - Email: ${testEmail}`);
  console.log(`   - Payload metadata: { role: "admin", full_name: "Tentativa de Auto-Admin" }`);

  let createdUserId = null;

  try {
    const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
      email: testEmail,
      password: TEST_SIGNUP_PASSWORD,
      options: {
        data: {
          role: 'admin',
          full_name: 'Tentativa de Auto-Admin'
        }
      }
    });

    if (signUpError) {
      console.log(`\n   🔒 SUCESSO DO BLOQUEIO NO AUTH: O cadastro público foi rejeitado!`);
      console.log(`      Mensagem de erro: "${signUpError.message}" (Status: ${signUpError.status || 'N/A'})`);
      console.log(`      ✅ Resultado: Novos cadastros via signUp público estão categoricamente bloqueados no Supabase Auth.`);
      
      console.log(`\n[PASSO 2] Verificando se operador autenticado consegue auto-promoção para 'admin'...`);
      const opEmail = process.env.TEST_TV_EMAIL || 'tv-fabrica@interlub.com';
      const opPass = process.env.TEST_TV_PASSWORD || process.env.OPERATOR_INITIAL_PASSWORD;
      const opClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: opLogin, error: opLogErr } = await opClient.auth.signInWithPassword({
        email: opEmail,
        password: opPass
      });

      if (opLogErr) {
        console.log(`   ⚠️ Não foi possível autenticar operador (${opLogErr.message}).`);
      } else {
        const { data: updData, error: updErr } = await opClient
          .from('user_profiles')
          .update({ role: 'admin' })
          .eq('id', opLogin.user.id)
          .select();

        const { data: currentProf } = await adminClient
          .from('user_profiles')
          .select('role')
          .eq('id', opLogin.user.id)
          .single();

        if (updErr || !updData || updData.length === 0) {
          console.log(`      🔒 BLOQUEADO COM SUCESSO! RLS e triggers de user_profiles impediram a alteração.`);
          console.log(`      ✅ Role atual do usuário permanece inalterado: "${currentProf?.role}".`);
        } else if (currentProf?.role === 'admin') {
          console.log(`      ❌ VULNERABILIDADE: O operador conseguiu se auto-promover para admin!`);
        }
      }
      return;
    }

    createdUserId = signUpData?.user?.id;
    console.log(`\n   ⚠️  O signUp foi aceito pelo Auth. Usuário criado: ID=${createdUserId}`);
    console.log(`   [PASSO 2] Verificando como handle_new_user() gravou o perfil em public.user_profiles...`);

    // Consulta perfil com service_role
    const { data: profile, error: profErr } = await adminClient
      .from('user_profiles')
      .select('id, email, full_name, role')
      .eq('id', createdUserId)
      .single();

    if (profErr) {
      console.error(`   ❌ Erro ao consultar user_profiles:`, profErr.message);
    } else {
      console.log(`      ↳ Registro gravado no banco:`);
      console.log(`         - ID:        ${profile.id}`);
      console.log(`         - Email:     ${profile.email}`);
      console.log(`         - Nome:      ${profile.full_name}`);
      console.log(`         - Role real: "${profile.role}"`);

      if (profile.role === 'operator') {
        console.log(`      ✅ PROVA: O role "admin" enviado no metadata foi categoricamente IGNORADO!`);
        console.log(`         O sistema forçou o role seguro "operator".`);
      } else if (profile.role === 'admin') {
        console.log(`      ❌ VULNERABILIDADE DETECTADA: O usuário conseguiu se registrar como "admin"!`);
      } else {
        console.log(`      ℹ️ Role gravado: ${profile.role}`);
      }
    }

    // [PASSO 3] Tentativa de elevação de privilégio via UPDATE pelo próprio usuário
    console.log(`\n[PASSO 3] O usuário recém-criado tenta fazer UPDATE direto para role="admin"...`);
    
    // Autentica como o usuário de teste
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error: loginErr } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: TEST_SIGNUP_PASSWORD
    });

    if (loginErr) {
      console.log(`   ℹ️ Não foi possível autenticar o usuário de teste (${loginErr.message}).`);
    } else {
      const { data: updData, error: updErr } = await userClient
        .from('user_profiles')
        .update({ role: 'admin' })
        .eq('id', createdUserId)
        .select();

      if (updErr) {
        console.log(`      🔒 BLOQUEADO COM SUCESSO! Erro do banco: "${updErr.message}"`);
        console.log(`      ✅ Trigger protect_user_role_update / RLS impediu a elevação.`);
      } else {
        // Confere se alterou de fato
        const { data: checkProf } = await adminClient
          .from('user_profiles')
          .select('role')
          .eq('id', createdUserId)
          .single();
        if (checkProf?.role === 'admin') {
          console.log(`      ❌ VULNERABILIDADE: O usuário conseguiu alterar o próprio role para admin!`);
        } else {
          console.log(`      ✅ Operação ineficaz: role permanece "${checkProf?.role}".`);
        }
      }
    }

  } finally {
    // [PASSO 4] Limpeza automática do usuário de teste
    if (createdUserId) {
      console.log(`\n[PASSO 4] 🧹 Limpando conta de teste ID=${createdUserId}...`);
      const { error: delErr } = await adminClient.auth.admin.deleteUser(createdUserId);
      if (delErr) console.warn(`   ⚠️ Erro ao remover usuário de teste:`, delErr.message);
      else console.log(`   ✅ Conta de teste excluída com sucesso.`);
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log('🏁 TESTE DE SEGURANÇA CONCLUÍDO.');
  console.log('='.repeat(78));
}

runSecuritySignupTest().catch(err => {
  console.error('❌ Falha na execução do teste:', err);
  process.exit(1);
});
