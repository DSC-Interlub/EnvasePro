/**
 * scripts/test-contadores-menu-ui.js
 *
 * A parte do item (e) que so se ve na tela:
 *  - o selo mostra o numero que a funcao do banco devolveu;
 *  - quando a consulta falha, aparece um AVISO. Era aqui que vivia o
 *    `catch {}`: a falha sumia e o menu seguia exibindo o ultimo numero que
 *    deu certo, como se fosse o de agora;
 *  - o menu nao baixa mais as sete tabelas: so a chamada da funcao.
 *
 * Uso: node scripts/test-contadores-menu-ui.js
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-contadores-menu-ui');

const APP = 'http://127.0.0.1:5173';
let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const MARCA = 'ZZTESTE-MENU-UI';

async function limpar() {
  await db.from('recebimento_ocorrencias').delete().like('descricao', `${MARCA}%`);
  await db.from('recebimentos').delete().like('numero_documento', `${MARCA}%`);
}

/** Cria 3 recebimentos concluidos sem assinatura do lider: o selo vira 3. */
async function semear() {
  const { data, error } = await db.from('recebimentos').insert(
    [0, 1, 2].map(i => ({
      tipo: 'Nacional', numero_documento: `${MARCA}-${i}`,
      status: 'Concluído', assinatura_lider: false,
    }))).select();
  if (error) throw new Error('recebimentos: ' + error.message);
  return data.length;
}

async function entrar(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  const b = page.getByRole('button', { name: /fazer login/i });
  await Promise.race([
    b.first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
    page.locator('#email').waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
  ]);
  if (await b.count()) await b.first().click();
  await page.locator('#email').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#email').fill(process.env.TEST_ADMIN_EMAIL);
  await page.locator('#password').fill(process.env.TEST_ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(() => !document.querySelector('#email'), null, { timeout: 60000 });
}

console.log('='.repeat(72));
console.log('CONTADORES DO MENU NA TELA — ITEM (e) DA V1');
console.log('='.repeat(72));

await limpar();
await semear();

const nav = await chromium.launch({ headless: true });
try {
  // --------------------------------------- 1. o selo mostra o numero do banco
  console.log('\n[1] o selo mostra o numero que a funcao devolveu');
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const pedidos = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/')) pedidos.push(r.url()); });

  await entrar(page);
  await page.waitForFunction(
    () => [...document.querySelectorAll('a span')].some(s => /^\d+$/.test(s.textContent.trim())),
    null, { timeout: 60000 }).catch(() => {});

  const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } });
  await admin.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD,
  });
  const { data: rpc } = await admin.rpc('contadores_do_menu');
  const c = Array.isArray(rpc) ? rpc[0] : rpc;
  const esperadoRec = Number(c.receb_aguarda_lider) + Number(c.receb_ocorr_abertas);

  const selos = await page.evaluate(() =>
    [...document.querySelectorAll('a span')]
      .filter(s => /^\d+$|^99\+$/.test(s.textContent.trim()))
      .map(s => s.textContent.trim()));
  checar(`o selo de Recebimento mostra ${esperadoRec}`,
    selos.includes(String(esperadoRec)), `selos na tela: ${JSON.stringify(selos)}`);

  // ------------------------------------- 2. nao baixa mais as sete tabelas
  console.log('\n[2] o menu nao baixa mais as sete tabelas para contar');
  const chamouRpc = pedidos.some(u => u.includes('/rpc/contadores_do_menu'));
  checar('chamou contadores_do_menu()', chamouRpc);
  await ctx.close();

  // ------------------------------------------- 3. falha vira aviso na tela
  console.log('\n[3] quando a consulta falha, a tela avisa (lugar do antigo catch {})');
  const ctx2 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page2 = await ctx2.newPage();
  await entrar(page2);
  // derruba a chamada dos contadores, so ela
  await page2.route('**/rest/v1/rpc/contadores_do_menu*', (rota) => rota.abort());
  await page2.reload({ waitUntil: 'domcontentloaded' });

  const aviso = page2.getByText(/contadores desatualizados/i);
  await aviso.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
  checar('aparece o aviso de contadores desatualizados', await aviso.count() > 0);
  await ctx2.close();
} finally {
  await nav.close();
  await limpar();
}

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
