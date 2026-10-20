/**
 * scripts/test-browser.js — navegador real (Playwright), regras v2 de acesso.
 *
 * REESCRITO em 20/10/2026. A versão anterior afirmava o comportamento ANTIGO
 * ("TVs funcionando 100% sem login") — removido de propósito: desde a
 * remove_anon_rls e a reconcile_security, o anon não lê nada, então a TV
 * precisa de sessão (GO-LIVE (f)). Ela só "passava" porque procurava um
 * texto ("Acesso ao EnvasePro") que nem existe mais, e saía com 0 mesmo
 * quebrando. Usava ainda o atalho de e-mail removido no PR #25 e um operador
 * de produção ("Lucas Araujo").
 *
 * O que prova agora:
 *  1. /Televisao e /TelevisaoEmpilha SEM sessão mostram o formulário de
 *     login e NÃO pedem dado nenhum ao banco.
 *  2. A rota raiz sem sessão mostra o formulário de login.
 *  3. Login com a conta de operador (senha do .env.local) abre o modal
 *     "Quem é você hoje?".
 *  4. Escolher o operador fecha o modal e o nome aparece como operador do turno.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-browser');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const SAIDA = 'scratch/browser';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

const nav = await chromium.launch({ headless: true });
try {
  console.log('1. TVs sem sessão');
  for (const rota of ['Televisao', 'TelevisaoEmpilha']) {
    const ctx = await nav.newContext();
    const page = await ctx.newPage();
    const pedidos = [];
    page.on('request', (r) => { if (/\/rest\/v1\//.test(r.url())) pedidos.push(r.url()); });
    await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
    const pediuLogin = await esperarPor(async () => (await page.locator('#email').count()) > 0, 20000);
    await page.waitForTimeout(1500);
    ok(pediuLogin, `/${rota} sem sessão mostra o formulário de login`);
    ok(pedidos.length === 0, `/${rota} sem sessão não pede dado nenhum ao banco (${pedidos.length} pedido(s))`);
    await page.screenshot({ path: `${SAIDA}/1-${rota}-sem-sessao.png` });
    await ctx.close();
  }

  console.log('\n2. Rota raiz sem sessão');
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  ok(await esperarPor(async () => (await page.locator('#email').count()) > 0, 20000), 'a raiz sem sessão mostra o formulário de login');

  console.log('\n3. Login de operador');
  await page.locator('#email').fill(process.env.TEST_OPERATOR_EMAIL);
  await page.locator('#password').fill(process.env.TEST_OPERATOR_PASSWORD);
  await page.locator('button[type="submit"]').click();
  const modal = page.getByText(/Quem é você hoje/i);
  ok(await esperarPor(async () => (await modal.count()) > 0, 20000), 'o modal "Quem é você hoje?" abre depois do login');
  await page.screenshot({ path: `${SAIDA}/3-quem-e-voce.png` });

  console.log('\n4. Escolha do operador do turno');
  const cartao = page.locator('button').filter({ hasText: /SEED-/ }).first();
  await esperarPor(async () => (await cartao.count()) > 0, 15000);
  const nome = ((await cartao.innerText()).match(/SEED-[^\n]+/) || [''])[0].trim();
  await cartao.click({ force: true });
  ok(await esperarPor(async () => (await modal.count()) === 0, 15000), 'o modal fecha depois da escolha');
  const gravado = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('envase_current_operator') || 'null'); } catch { return null; } });
  ok(gravado?.nome === nome, `o operador do turno fica gravado (${gravado?.nome})`);
  ok(await page.getByText(nome).count() > 0, `"${nome}" aparece na tela como operador do turno`);
  await page.screenshot({ path: `${SAIDA}/4-operador-do-turno.png`, fullPage: true });
  await ctx.close();
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
