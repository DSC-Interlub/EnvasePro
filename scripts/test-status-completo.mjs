/**
 * scripts/test-status-completo.mjs — 20261019000007: só admin leva
 * status_assinatura a 'Completo', nas três tabelas, por UPDATE e por INSERT.
 *
 * JWT real de operador e de admin (banco LOCAL). Cria e apaga os próprios
 * registros (marcados TESTE-STATUS).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-status-completo');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
async function entrar(email, senha) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return c;
}
const op = await entrar(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
const adm = await entrar(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);

const criados = [];
const { data: emp } = await svc.from('empilhadeira_configs').select('id').limit(1).single();
const { data: prog } = await svc.from('empilha_programacoes').insert({ data_programada: '2026-10-01', empilhadeira_id: emp.id, observacoes: 'TESTE-STATUS' }).select('id').single();
const { data: local } = await svc.from('limpeza_locais').select('id, nome').limit(1).single();

const TABELAS = {
  empilha_linhas: () => ({ programacao_id: prog.id, tipo_linha: 'Normal', status: 'Pendente', numero_item: 'TESTE-STATUS' }),
  limpeza_programacoes: () => ({ local_id: local.id, local_nome: local.nome, data_prevista: '2026-10-01', observacoes: 'TESTE-STATUS' }),
  recebimentos: () => ({ tipo: 'Nacional', numero_documento: 'TESTE-STATUS' }),
};

console.log('='.repeat(72));
console.log('status_assinatura = Completo — só admin');
console.log('='.repeat(72));
try {
  for (const [t, base] of Object.entries(TABELAS)) {
    console.log(`\n${t}`);
    const { data: linha, error: e0 } = await svc.from(t).insert(base()).select('id').single();
    if (e0) throw new Error(`${t}: ${e0.message}`);
    criados.push([t, linha.id]);

    const r1 = await op.from(t).update({ status_assinatura: 'Parcial' }).eq('id', linha.id).select('id');
    ok(!r1.error && r1.data?.length === 1, 'operador leva a Parcial (fluxo normal)');
    const r2 = await op.from(t).update({ status_assinatura: 'Completo' }).eq('id', linha.id).select('id');
    ok(r2.error?.code === '42501', `operador NÃO leva a Completo (${r2.error?.code || 'PASSOU'})`);
    const r3 = await op.from(t).insert({ ...base(), status_assinatura: 'Completo' }).select('id');
    ok(r3.error?.code === '42501', `operador NÃO cria já Completo (${r3.error?.code || 'CRIOU'})`);
    if (r3.data?.[0]) criados.push([t, r3.data[0].id]);
    const r4 = await adm.from(t).update({ status_assinatura: 'Completo' }).eq('id', linha.id).select('id');
    ok(!r4.error && r4.data?.length === 1, 'admin leva a Completo (assinatura do líder)');
    const r5 = await op.from(t).update({ status_assinatura: 'Parcial' }).eq('id', linha.id).select('id');
    ok(!!r5.error, 'operador NÃO reverte Completo (trava da reconciliação, intacta)');
  }
} finally {
  for (const [t, id] of criados.reverse()) await svc.from(t).delete().eq('id', id);
  await svc.from('empilha_programacoes').delete().eq('id', prog.id);
}
console.log('\n' + '='.repeat(72));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
