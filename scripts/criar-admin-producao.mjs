/**
 * scripts/criar-admin-producao.mjs — cria a PRIMEIRA conta administradora em
 * produção, depois da limpeza total (docs/LIMPEZA-PRODUCAO.md).
 *
 * Autorizado pelo dono por escrito em 20/10/2026: e-mail pcp-brasil@interlub.com,
 * senha temporária forte gerada aqui, e-mail já confirmado, troca obrigatória no
 * primeiro acesso, perfil admin gravado pela service_role (a trava de papel
 * aceita a service_role; nada é enfraquecido).
 *
 * Só roda se auth.users estiver VAZIO: não sobrescreve conta nenhuma.
 *
 * A chave de serviço vem da Management API (token da CLI, em $SBP), fica só em
 * memória e nunca é impressa. A senha temporária é impressa UMA vez, no fim,
 * para o relatório ao dono — não vai para arquivo nem log.
 *
 * Uso (pelo scratchpad com-token.ps1, que põe $SBP só na memória):
 *   node scripts/criar-admin-producao.mjs --allow-production --confirm-ref=xifzjpbkpxislqrowswd
 */
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { gerarSenhaTemporaria } from '../api/admin-usuarios.js';

const REF = 'xifzjpbkpxislqrowswd';
const EMAIL = 'pcp-brasil@interlub.com';
if (!process.argv.includes('--allow-production') || !process.argv.includes(`--confirm-ref=${REF}`)) {
  console.error('Recusado: produção exige --allow-production e --confirm-ref=' + REF);
  process.exit(2);
}
if (fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim() !== REF) { console.error('Recusado: projeto vinculado diferente'); process.exit(2); }
if (!process.env.SBP) { console.error('Falta $SBP (token da CLI do Supabase).'); process.exit(2); }

const rk = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${process.env.SBP}` } });
if (!rk.ok) { console.error(`Management API recusou (${rk.status})`); process.exit(1); }
const chaves = await rk.json();
const SERVICO = chaves.find((k) => k.name === 'service_role')?.api_key;
const ANON = chaves.find((k) => k.name === 'anon')?.api_key;
if (!SERVICO || !ANON) { console.error('Chaves não encontradas.'); process.exit(1); }
const URL = `https://${REF}.supabase.co`;
const o = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(URL, SERVICO, o);

const { data: lista, error: eLista } = await svc.auth.admin.listUsers({ perPage: 1000 });
if (eLista) { console.error('Não consegui listar as contas:', eLista.message); process.exit(1); }
if (lista.users.length > 0) {
  console.error(`Recusado: auth.users tem ${lista.users.length} conta(s). Este script só cria a primeira conta num sistema vazio.`);
  process.exit(1);
}

const senha = gerarSenhaTemporaria();
const { data: criado, error: eCriar } = await svc.auth.admin.createUser({
  email: EMAIL, password: senha, email_confirm: true,
  user_metadata: { full_name: 'PCP Brasil' },
  app_metadata: { trocar_senha: true, uso_tv: false },
});
if (eCriar) { console.error('Criação recusada:', eCriar.message); process.exit(1); }
const id = criado.user.id;

const { error: ePapel } = await svc.from('user_profiles').update({ role: 'admin', full_name: 'PCP Brasil' }).eq('id', id);
if (ePapel) {
  await svc.auth.admin.deleteUser(id).catch(() => {});
  console.error('Perfil admin recusado; a conta foi desfeita:', ePapel.message);
  process.exit(1);
}

// Conferência: um login REAL com a senha temporária, e a sessão aberta por ele
// é fechada na hora. Não toca em dado nenhum.
const anon = createClient(URL, ANON, o);
const { data: entrou, error: eLogin } = await anon.auth.signInWithPassword({ email: EMAIL, password: senha });
const { data: perfil } = await svc.from('user_profiles').select('role').eq('id', id).single();
if (entrou?.session) await svc.auth.admin.signOut(entrou.session.access_token, 'local').catch(() => {});

console.log(`conta criada: ${EMAIL} (id ${id})`);
console.log(`e-mail confirmado: ${Boolean(criado.user.email_confirmed_at)}`);
console.log(`trocar senha no primeiro acesso: ${criado.user.app_metadata?.trocar_senha === true}`);
console.log(`perfil: ${perfil?.role}`);
console.log(`login real com a senha temporária: ${entrou?.session ? 'OK' : `FALHOU (${eLogin?.message})`}`);
console.log(`SENHA TEMPORÁRIA (mostrada só agora): ${senha}`);
