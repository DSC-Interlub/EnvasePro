/**
 * Script para provisionar as contas iniciais no Supabase Auth
 * Utiliza a SUPABASE_SERVICE_ROLE_KEY local para criar ou atualizar as credenciais.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const USUARIOS_INICIAIS = [
  {
    email: 'operacoes.equipe@interlub.com',
    password: process.env.OPERATOR_INITIAL_PASSWORD || 'Interlub@Operacoes2026',
    full_name: 'Equipe de Operações (Chão de Fábrica)',
    role: 'operator'
  },
  {
    email: 'pcp-brasil@interlub.com',
    password: process.env.ADMIN_INITIAL_PASSWORD || 'Interlub@Pcp2026!',
    full_name: 'PCP Brasil (Administração)',
    role: 'admin'
  },
  {
    email: 'lauremank622@gmail.com',
    password: process.env.DEV_INITIAL_PASSWORD || 'Interlub@DevAdmin2026!',
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
      console.log(`ℹ️ Conta já existente no Auth: "${cad.email}" (ID: ${user.id}). Atualizando metadata/senha...`);
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: cad.password,
        user_metadata: {
          full_name: cad.full_name,
          role: cad.role
        },
        email_confirm: true
      });
      if (updErr) console.error(`   ❌ Erro ao atualizar ${cad.email}:`, updErr.message);
      else console.log(`   ✅ Conta atualizada com sucesso!`);

      // Garante sincronização em user_profiles
      await supabaseAdmin.from('user_profiles').upsert({
        id: user.id,
        email: cad.email,
        full_name: cad.full_name,
        role: cad.role
      });
    } else {
      console.log(`➕ Criando nova conta no Auth: "${cad.email}" [Papel: ${cad.role}]...`);
      const { data: novo, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: cad.email,
        password: cad.password,
        email_confirm: true,
        user_metadata: {
          full_name: cad.full_name,
          role: cad.role
        }
      });
      if (createErr) {
        console.error(`   ❌ Erro ao criar ${cad.email}:`, createErr.message);
      } else {
        console.log(`   ✅ Conta criada com sucesso! (ID: ${novo.user.id})`);
        // Garante sincronização em user_profiles
        await supabaseAdmin.from('user_profiles').upsert({
          id: novo.user.id,
          email: cad.email,
          full_name: cad.full_name,
          role: cad.role
        });
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
