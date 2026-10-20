/**
 * scripts/capturar-telas.mjs
 *
 * Captura um conjunto ESCOLHIDO de telas nas 3 larguras. Serve para mostrar
 * antes/depois das telas mais afetadas por uma mudanca, sem rodar as 111.
 *
 * Uso: node scripts/capturar-telas.mjs <pasta> <papel> <Tela1,Tela2,...>
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('capturar-telas');

const APP = process.env.APP_CAPTURA || 'http://127.0.0.1:5173';
const [pasta, papel, lista] = process.argv.slice(2);
if (!pasta || !papel || !lista) {
  console.error('Uso: node scripts/capturar-telas.mjs <pasta> <papel> <Tela1,Tela2>');
  process.exit(1);
}
fs.mkdirSync(pasta, { recursive: true });

const CONTAS = {
  admin: [process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD],
  operador: [process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD],
};
const LARGURAS = [['celular', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]];

const nav = await chromium.launch({ headless: true });
const ctx0 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
const p0 = await ctx0.newPage();
await p0.goto(APP, { waitUntil: 'domcontentloaded' });
const b = p0.getByRole('button', { name: /fazer login/i });
await Promise.race([
  b.first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
  p0.locator('#email').waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
]);
if (await b.count()) await b.first().click();
await p0.locator('#email').waitFor({ state: 'visible', timeout: 60000 });
await p0.locator('#email').fill(CONTAS[papel][0]);
await p0.locator('#password').fill(CONTAS[papel][1]);
await p0.locator('button[type="submit"]').first().click();
await p0.waitForFunction(() => !document.querySelector('#email'), null, { timeout: 60000 });
const estado = await ctx0.storageState();
await ctx0.close();

for (const [nomeL, w, h] of LARGURAS) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, storageState: estado });
  const page = await ctx.newPage();
  for (const tela of lista.split(',')) {
   // Uma tela que falha não derruba as outras: fica registrada e segue.
   try {
    await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('button,a,input').length > 3,
      null, { timeout: 60000 }).catch(() => {});

    // O modal "Quem e voce hoje?" cobre a tela inteira enquanto nenhum operador
    // fisico estiver escolhido, e e isso que o operador de verdade ve primeiro.
    // Escolher o primeiro e exatamente o que ele faz; sem isso a captura
    // fotografa o modal, nao a tela.
    const modal = page.getByText(/Quem é você hoje/i);
    if (await modal.count()) {
      // O cartao comeca com as INICIAIS do avatar ("SE"), nao com o nome, entao
      // ancorar em /^SEED-/ nunca casa. Vale o nome em qualquer posicao.
      const cartao = page.locator('button').filter({ hasText: /SEED-/ });
      if (await cartao.count()) {
        await cartao.first().click({ force: true }); // a lista anima ao entrar
        await modal.first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      }
    }

    await page.waitForTimeout(3000);
    const arq = `${pasta}/${nomeL}_${tela}.png`;
    await page.screenshot({ path: arq, fullPage: true, animations: 'disabled', timeout: 60000 })
      .catch(() => page.screenshot({ path: arq, animations: 'disabled', timeout: 60000 }));
    console.log(`  ${arq}`);
   } catch (e) {
    console.log(`  FALHOU ${nomeL}_${tela}: ${String(e.message || e).split(String.fromCharCode(10))[0].slice(0, 160)}`);
   }
  }
  await ctx.close();
}
await nav.close();
