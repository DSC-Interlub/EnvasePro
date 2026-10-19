/**
 * scripts/medir-trafego-tv.mjs
 *
 * Mede o que as telas de TV e de indicadores realmente pedem ao banco: quantas
 * requisicoes, quantos bytes e quais tabelas, durante uma janela de tempo.
 *
 * Serve de linha de base para a Etapa 2. Sem numero medido, "a TV baixa tabelas
 * inteiras" e so uma impressao.
 *
 * Uso: node scripts/medir-trafego-tv.mjs [segundos]
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('medir-trafego-tv');

const APP = process.env.APP_MEDIR || 'http://127.0.0.1:5173';
const JANELA = Number(process.argv[2] || 180) * 1000;
const SAIDA = process.argv[3] || 'scratch/etapa2/trafego-base.json';
const SO = (process.argv[4] || '').split(',').filter(Boolean);
// A carga inicial (login, primeira leitura de tudo) acontece uma vez; a TV
// fica ligada o dia inteiro. A meta do plano é sobre o REGIME — o que a tela
// pede por minuto depois que assentou. Os primeiros 20s ficam fora dele.
const ASSENTAR = 20000;

const TELAS = [
  ['tv', 'Televisao'],
  ['tv', 'TelevisaoEmpilha'],
  ['tv', 'Painel'],
  ['admin', 'IndicadoresEmpilha'],
  ['admin', 'IndicadoresRecebimento'],
  ['admin', 'Dashboard'],
];

const CONTAS = {
  admin: [process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD],
  tv: [process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD],
};

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
  await page.waitForFunction(() => !document.querySelector('#email'), null, { timeout: 60000 });
}

/** Extrai a tabela (ou a funcao) de uma URL do PostgREST. */
function alvoDaUrl(url) {
  const m = url.match(/\/rest\/v1\/(rpc\/)?([^?]+)/);
  if (!m) return null;
  return (m[1] ? 'rpc:' : '') + m[2];
}

const nav = await chromium.launch({ headless: true });
const relatorio = {};

for (const [papel, tela] of TELAS.filter(([, t]) => !SO.length || SO.includes(t))) {
  const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 } });
  const login = await ctx.newPage();
  await entrar(login, CONTAS[papel]);
  await login.close();

  const page = await ctx.newPage();
  const pedidos = [];

  page.on('response', async (r) => {
    const alvo = alvoDaUrl(r.url());
    if (!alvo) return;
    let bytes = 0;
    try {
      const corpo = await r.body();
      bytes = corpo.length;
    } catch { /* resposta sem corpo acessivel */ }
    pedidos.push({ alvo, bytes, quando: Date.now() });
  });

  const inicio = Date.now();
  await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(JANELA);
  const duracao = (Date.now() - inicio) / 1000;
  await ctx.close();

  const porTabela = {};
  for (const p of pedidos) {
    porTabela[p.alvo] = porTabela[p.alvo] || { n: 0, bytes: 0 };
    porTabela[p.alvo].n += 1;
    porTabela[p.alvo].bytes += p.bytes;
  }
  const total = pedidos.length;
  const bytes = pedidos.reduce((s, p) => s + p.bytes, 0);

  const regime = pedidos.filter((p) => p.quando - inicio >= ASSENTAR);
  const durRegime = Math.max(1, duracao - ASSENTAR / 1000);
  relatorio[`${papel}/${tela}`] = {
    segundos: Math.round(duracao),
    regime: {
      porMinuto: +(regime.length / durRegime * 60).toFixed(1),
      kbPorMinuto: +(regime.reduce((s, p) => s + p.bytes, 0) / 1024 / durRegime * 60).toFixed(1),
    },
    requisicoes: total,
    porMinuto: +(total / duracao * 60).toFixed(1),
    bytes,
    kbPorMinuto: +(bytes / 1024 / duracao * 60).toFixed(1),
    tabelas: Object.fromEntries(
      Object.entries(porTabela)
        .sort((a, b) => b[1].bytes - a[1].bytes)
        .map(([k, v]) => [k, `${v.n}x / ${(v.bytes / 1024).toFixed(1)} KB`])),
  };

  const r = relatorio[`${papel}/${tela}`];
  console.log(`\n${papel}/${tela}  (${r.segundos}s)`);
  console.log(`  ${r.requisicoes} requisicoes = ${r.porMinuto}/min | ` +
    `${(r.bytes / 1024).toFixed(1)} KB = ${r.kbPorMinuto} KB/min`);
  console.log(`  REGIME (apos ${ASSENTAR / 1000}s): ${r.regime.porMinuto} req/min | ${r.regime.kbPorMinuto} KB/min`);
  for (const [t, v] of Object.entries(r.tabelas)) console.log(`    ${t.padEnd(32)} ${v}`);
}

await nav.close();
fs.mkdirSync('scratch/etapa2', { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2));
console.log(`\n-> ${SAIDA}`);
