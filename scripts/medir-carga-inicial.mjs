/**
 * scripts/medir-carga-inicial.mjs
 *
 * Mede o que o navegador REALMENTE baixa na primeira carga, e quanto tempo
 * leva, numa CPU desacelerada para simular o tablet da fabrica.
 *
 * Nao e a soma dos arquivos da pasta dist: a fonte mono so baixa se houver
 * codigo na tela, e os pedacos de pagina sao carregados sob demanda. O que
 * importa para o dono e o tempo ate a tela ficar util.
 *
 * Uso: node scripts/medir-carga-inicial.mjs <saida.json> [desaceleracao]
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('medir-carga-inicial');

const APP = 'http://127.0.0.1:4173';   // build de producao servida, nao o dev
const saida = process.argv[2] || 'scratch/desempenho/carga.json';
const LENTIDAO = Number(process.argv[3] || 4);

const TELAS = [
  ['admin', 'Dashboard'],
  ['admin', 'NovoRegistro'],
  ['admin', 'NovoChecklist'],
  ['admin', 'Painel'],
];
const CONTAS = {
  admin: [process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD],
};

const nav = await chromium.launch({ headless: true });

async function entrar(page, [email, senha]) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  const b = page.getByRole('button', { name: /fazer login/i });
  await Promise.race([
    b.first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
    page.locator('#email').waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
  ]);
  if (await b.count()) await b.first().click();
  await page.locator('#email').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(senha);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(() => !document.querySelector('#email'), null, { timeout: 90000 });
}

const ctx0 = await nav.newContext({ viewport: { width: 820, height: 1180 } });
const p0 = await ctx0.newPage();
await entrar(p0, CONTAS.admin);
const estado = await ctx0.storageState();
await ctx0.close();

const relatorio = {};

for (const [papel, tela] of TELAS) {
  // contexto novo = cache frio, que e o que a primeira carga enfrenta
  const ctx = await nav.newContext({ viewport: { width: 820, height: 1180 }, storageState: estado });
  const page = await ctx.newPage();

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: LENTIDAO });

  const porTipo = {};
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.startsWith(APP)) return;
    let tipo = 'outro';
    if (/\.js(\?|$)/.test(u)) tipo = 'js';
    else if (/\.css(\?|$)/.test(u)) tipo = 'css';
    else if (/\.woff2?(\?|$)/.test(u)) tipo = 'fonte';
    else if (/\.(png|svg|jpg|webp)(\?|$)/.test(u)) tipo = 'imagem';
    else if (u === APP + '/' || /\/[A-Za-z]*$/.test(new URL(u).pathname)) tipo = 'html';
    let bytes = 0;
    try { bytes = (await r.body()).length; } catch { /* sem corpo */ }
    porTipo[tipo] = porTipo[tipo] || { n: 0, bytes: 0 };
    porTipo[tipo].n += 1;
    porTipo[tipo].bytes += bytes;
  });

  const t0 = Date.now();
  await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
  const tDom = Date.now() - t0;
  // "util" = a tela pintou algo de verdade, nao so a moldura
  await page.waitForFunction(
    () => document.querySelectorAll('button, input, h1, h2').length > 3,
    null, { timeout: 90000 }).catch(() => {});
  const tUtil = Date.now() - t0;
  await page.waitForLoadState('networkidle').catch(() => {});
  const tRede = Date.now() - t0;

  const metricas = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    const pintura = p.find((x) => x.name === 'first-contentful-paint');
    return { fcp: pintura ? Math.round(pintura.startTime) : null };
  });

  const bytes = Object.values(porTipo).reduce((s, x) => s + x.bytes, 0);
  relatorio[`${papel}/${tela}`] = {
    cpu: `${LENTIDAO}x mais lenta`,
    ms_dom: tDom, ms_util: tUtil, ms_rede_parada: tRede, ms_fcp: metricas.fcp,
    kb_total: +(bytes / 1024).toFixed(1),
    por_tipo: Object.fromEntries(Object.entries(porTipo)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([k, v]) => [k, `${v.n}x / ${(v.bytes / 1024).toFixed(1)} KB`])),
  };

  const r = relatorio[`${papel}/${tela}`];
  console.log(`\n${papel}/${tela}  (CPU ${LENTIDAO}x mais lenta)`);
  console.log(`  primeira pintura ${r.ms_fcp} ms | tela util ${r.ms_util} ms | rede parada ${r.ms_rede_parada} ms`);
  console.log(`  ${r.kb_total} KB baixados`);
  for (const [t, v] of Object.entries(r.por_tipo)) console.log(`    ${t.padEnd(8)} ${v}`);

  await ctx.close();
}

await nav.close();
fs.mkdirSync(saida.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(saida, JSON.stringify(relatorio, null, 2));
console.log(`\n-> ${saida}`);
