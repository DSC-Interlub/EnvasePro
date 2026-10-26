/**
 * scripts/test-checkout-excluir-pendente.mjs — pedido de check-out cancelado
 * (migration 20261026000001).
 *
 * Banco LOCAL, sessões REAIS (operador e admin), sem service key:
 *   1. banco: o operador exclui item 'Pendente'; NÃO exclui 'Em Andamento' nem
 *      'Concluído'; o admin exclui qualquer um;
 *   2. tela (como operador): o botão "Excluir o pedido" aparece só no pedido
 *      pendente; excluir o pedido cancelado fecha a programação como "Concluído".
 *
 * Uso: node scripts/test-checkout-excluir-pendente.mjs [--app=http://127.0.0.1:4180]
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-checkout-excluir-pendente');
const APP = (process.argv.find((a) => a.startsWith('--app=')) || '--app=http://127.0.0.1:4180').slice(6);
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: app não é local (${APP})`); process.exit(2); }
const o = { auth: { persistSession: false, autoRefreshToken: false } };
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
async function sessao(email, senha) {
  const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, o);
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}
const op = await sessao(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
const adm = await sessao(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
const M = `EXC${Date.now().toString().slice(-6)}`;
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const { data: [operador] } = await op.from('operators').select('id, nome').eq('ativo', true).limit(1);

async function programacaoCom(itens) {
  const { data: prog, error } = await op.from('checkout_programacoes')
    .insert({ data_programada: hoje, status: 'Em Andamento', total_pedidos: itens.length, pedidos_concluidos: 0, observacoes: `${M} teste` })
    .select().single();
  if (error) throw error;
  const linhas = itens.map(([status, n]) => ({
    programacao_id: prog.id, numero_pedido: `${M}-${n}`, cliente: `${M} cliente`, status, critico: false, finalizado_fora_do_prazo: false,
    ...(status !== 'Pendente' ? { operator_id: operador.id, operador: operador.nome, hora_inicio: '08:00' } : {}),
    ...(status === 'Concluído' ? { hora_termino: '08:10' } : {}),
  }));
  const { data, error: e2 } = await op.from('checkout_itens').insert(linhas).select();
  if (e2) throw e2;
  return { prog, itens: Object.fromEntries(data.map((d) => [d.numero_pedido.split('-').pop(), d])) };
}
const existe = async (id) => ((await adm.from('checkout_itens').select('id').eq('id', id)).data || []).length === 1;

console.log('\n1. BANCO — quem exclui o quê');
const b = await programacaoCom([['Pendente', 'P'], ['Em Andamento', 'A'], ['Concluído', 'C']]);
await op.from('checkout_itens').delete().eq('id', b.itens.P.id);
ok(!(await existe(b.itens.P.id)), 'operador exclui o pedido PENDENTE');
await op.from('checkout_itens').delete().eq('id', b.itens.A.id);
ok(await existe(b.itens.A.id), 'operador NÃO exclui o pedido EM ANDAMENTO');
await op.from('checkout_itens').delete().eq('id', b.itens.C.id);
ok(await existe(b.itens.C.id), 'operador NÃO exclui o pedido CONCLUÍDO');
await adm.from('checkout_itens').delete().eq('id', b.itens.C.id);
ok(!(await existe(b.itens.C.id)), 'admin exclui o pedido concluído');
await adm.from('checkout_programacoes').delete().eq('id', b.prog.id);

console.log('\n2. TELA — operador exclui o pedido cancelado e a programação fecha');
const t = await programacaoCom([['Concluído', '1'], ['Concluído', '2'], ['Pendente', '3']]);
const nav = await chromium.launch();
try {
  const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && /rest\/v1/.test(r.url())) erros.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
  page.on('dialog', (d) => d.accept()); // o "Tem certeza que deseja excluir o pedido...?"
  const { login } = criarAjudantes({ app: APP });
  await login(page, { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD });
  await page.goto(`${APP}/ExecutarCheckout?id=${t.prog.id}`);
  await page.getByText(`${M}-3`).first().waitFor({ timeout: 30000 });
  const botao = (n) => page.getByRole('button', { name: `Excluir o pedido ${M}-${n}` });
  ok((await botao('3').count()) === 1, 'o pedido pendente tem o botão "Excluir"');
  ok((await botao('1').count()) === 0 && (await botao('2').count()) === 0, 'os pedidos concluídos NÃO têm o botão');
  await page.screenshot({ path: 'scratch/checkout-excluir-antes.png', fullPage: true });
  await botao('3').click();
  ok(await esperarPor(async () => (await page.getByText(`${M}-3`).count()) === 0, 15000), 'o pedido excluído some da tela');
  ok(!(await existe(t.itens['3'].id)), 'e some do banco');
  // A tela recalcula a programação (2 s depois da mudança).
  const fechou = await esperarPor(async () => {
    const { data } = await adm.from('checkout_programacoes').select('status, total_pedidos, pedidos_concluidos').eq('id', t.prog.id).single();
    return data.status === 'Concluído' && data.total_pedidos === 2 && data.pedidos_concluidos === 2;
  }, 20000);
  ok(fechou, 'a programação fecha: "Concluído", 2 de 2 pedidos');
  await page.goto(`${APP}/Checkout`);
  const linha = page.locator('li').filter({ hasText: `${M} teste` }).first();
  await linha.waitFor({ timeout: 20000 });
  ok(/Concluído/.test(await linha.innerText()), 'a lista de check-out mostra a programação como "Concluído"');
  await page.screenshot({ path: 'scratch/checkout-excluir-depois.png', fullPage: true });
  ok(erros.length === 0, `nenhum erro na tela (${erros.join(' | ') || '0'})`);
} finally {
  await nav.close();
  await adm.from('checkout_itens').delete().like('numero_pedido', `${M}-%`);
  await adm.from('checkout_programacoes').delete().like('observacoes', `${M}%`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
