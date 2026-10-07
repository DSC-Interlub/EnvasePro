/**
 * Script para provisionar as contas iniciais no Supabase Auth
 * Utiliza a SUPABASE_SERVICE_ROLE_KEY para criar ou atualizar as credenciais.
 * 
 * Regras de Segurança:
 * - Senhas lidas estritamente de variáveis de ambiente (sem valores padrão no código).
 * - O papel (role) NÃO é gravado em user_metadata.
 * - O papel é definido diretamente via UPDATE em public.user_profiles usando o cliente service_role.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('setup-auth-users');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  process.exit(1);
}

// Validação estrita de variáveis de ambiente para senhas
const OPERATOR_INITIAL_PASSWORD = process.env.OPERATOR_INITIAL_PASSWORD;
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;
const DEV_INITIAL_PASSWORD = process.env.DEV_INITIAL_PASSWORD;

const missingPasswords = [];
if (!OPERATOR_INITIAL_PASSWORD) missingPasswords.push('OPERATOR_INITIAL_PASSWORD');
if (!ADMIN_INITIAL_PASSWORD) missingPasswords.push('ADMIN_INITIAL_PASSWORD');
if (!DEV_INITIAL_PASSWORD) missingPasswords.push('DEV_INITIAL_PASSWORD');

if (missingPasswords.length > 0) {
  console.error(`❌ ERRO DE CONFIGURAÇÃO: As seguintes variáveis de ambiente de senha estão ausentes:\n   - ${missingPasswords.join('\n   - ')}\nDefina-as no arquivo .env.local ou nas variáveis do sistema.`);
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const USUARIOS_INICIAIS = [
  {
    email: 'operacoes.equipe@interlub.com',
    password: OPERATOR_INITIAL_PASSWORD,
    full_name: 'Equipe de Operações (Chão de Fábrica)',
    role: 'operator'
  },
  {
    email: 'pcp-brasil@interlub.com',
    password: ADMIN_INITIAL_PASSWORD,
    full_name: 'PCP Brasil (Administração)',
    role: 'admin'
  },
  {
    email: 'lauremank622@gmail.com',
    password: DEV_INITIAL_PASSWORD,
    full_name: 'Admin / Desenvolvedor',
    role: 'admin'
  }
];

async function setupUsers() {
  console.log('='.repeat(70));
  console.log('👥 PROVISIONANDO CONTAS DO SUPABASE AUTH...');
  console.log('='.repeat(70));

  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    throw new Error(`Erro ao listar usuários: ${listError.message}`);
  }

  const mapaExistentes = new Map(users.map(u => [u.email.toLowerCase(), u]));

  for (const cad of USUARIOS_INICIAIS) {
    const emailNorm = cad.email.toLowerCase();
    if (mapaExistentes.has(emailNorm)) {
      const user = mapaExistentes.get(emailNorm);
      console.log(`ℹ️ Conta já existente no Auth: "${cad.email}" (ID: ${user.id}). Atualizando senha/dados...`);
      
      // Atualiza senha e apenas full_name no metadata (NUNCA role em user_metadata)
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: cad.password,
        user_metadata: {
          full_name: cad.full_name
        },
        email_confirm: true
      });
      if (updErr) {
        console.error(`   ❌ Erro ao atualizar Auth de ${cad.email}:`, updErr.message);
      } else {
        console.log(`   ✅ Credenciais no Auth atualizadas com sucesso!`);
      }

      // Define role e perfil exclusivamente via UPDATE em public.user_profiles usando service_role
      const { error: profErr } = await supabaseAdmin
        .from('user_profiles')
        .update({
          full_name: cad.full_name,
          role: cad.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (profErr) {
        console.error(`   ❌ Erro ao atualizar user_profiles para ${cad.email}:`, profErr.message);
      } else {
        console.log(`   ✅ Perfil em user_profiles atualizado para [role: ${cad.role}]!`);
      }
    } else {
      console.log(`➕ Criando nova conta no Auth: "${cad.email}"...`);
      // Cria usuário no Auth SEM role no metadata (handle_new_user definirá role='operator')
      const { data: novo, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: cad.email,
        password: cad.password,
        email_confirm: true,
        user_metadata: {
          full_name: cad.full_name
        }
      });

      if (createErr) {
        console.error(`   ❌ Erro ao criar ${cad.email}:`, createErr.message);
      } else {
        console.log(`   ✅ Conta criada no Auth com sucesso! (ID: ${novo.user.id})`);

        // Define explicitamente o role em user_profiles com cliente service_role
        const { error: updRoleErr } = await supabaseAdmin
          .from('user_profiles')
          .update({
            full_name: cad.full_name,
            role: cad.role,
            updated_at: new Date().toISOString()
          })
          .eq('id', novo.user.id);

        if (updRoleErr) {
          console.error(`   ❌ Erro ao definir role em user_profiles para ${cad.email}:`, updRoleErr.message);
        } else {
          console.log(`   ✅ Role [${cad.role}] definido com sucesso em user_profiles via service_role!`);
        }
      }
    }
  }

  console.log('\n📊 CONSULTANDO TABELA public.user_profiles:');
  const { data: perfis, error: errProf } = await supabaseAdmin
    .from('user_profiles')
    .select('id, email, full_name, role, created_at');

  if (errProf) console.error('Erro ao consultar user_profiles:', errProf);
  else console.table(perfis);

  console.log('='.repeat(70));
  console.log('✨ CONTAS DE USUÁRIO CONFIGURADAS COM SUCESSO!');
  console.log('='.repeat(70));
}

setupUsers().catch(err => {
  console.error('❌ Falha ao provisionar usuários:', err);
  process.exit(1);
});
