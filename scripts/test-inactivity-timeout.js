/**
 * scripts/test-inactivity-timeout.js — NINGUÉM é deslogado por inatividade.
 *
 * Decisão do dono, 20/10/2026: o logout por inatividade (item 14 da auditoria,
 * que derrubava o admin aos 60 min) foi REMOVIDO para todos os papéis. A
 * sessão continua enquanto a aba estiver aberta, renovada pelo refresh normal
 * do Supabase. Este teste prova isso com o relógio simulado do Playwright:
 *
 *  1. admin, operador e TV parados 3 horas (sem recarregar): continuam
 *     logados, sem tela de login e sem aviso de "inatividade";
 *  2. com o relógio real, um token a 20 s de vencer é renovado sozinho, sem
 *     sair (é o refresh normal do Supabase que mantém a aba aberta logada);
 *  3. recarregar a página depois das 3 horas continua logado;
 *  4. a chave antiga "envase_last_activity" é apagada pelo app.
 *
 * Uso: node scripts/test-inactivity-timeout.js   (precisa do `vite` em 5173)
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-inactivity-timeout');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP)) {
  console.error(`Recusado: este teste só roda contra o app local (APP_BASE_URL=${APP})`);
  process.exit(2);
}
const SAIDA = 'scratch/inatividade';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const { login } = criarAjudantes({ app: APP });
const logado = (page) => page.evaluate(() => !!Object.keys(localStorage).find((k) => k.includes('auth-token')));

const nav = await chromium.launch({ headless: true });

/** Login com o relógio normal; depois o relógio simulado assume. */
async function sessaoComRelogio(email, senha) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (!(await login(page, { email, senha }))) throw new Error(`${email} não entrou`);
  await page.clock.install();
  return { ctx, page };
}

const CASOS = [
  ['admin', process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD, 'Dashboard'],
  ['operador', process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD, 'Registros'],
  ['TV', process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD, 'Televisao'],
];

try {
  for (const [papel, email, senha, rota] of CASOS) {
    console.log(`\n${papel} parado 3 horas`);
    const { ctx, page } = await sessaoComRelogio(email, senha);
    await page.evaluate(() => localStorage.setItem('envase_last_activity', String(Date.now() - 5 * 3600000)));
    await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
    await esperarPor(async () => (await page.locator('button,a').count()) > 3, 30000);
    // Três horas, em passos de 10 min, para os temporizadores (inclusive o de
    // renovação do token) rodarem no caminho, como numa aba aberta de verdade.
    for (let i = 0; i < 18; i += 1) {
      await page.clock.fastForward(10 * 60000);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(3000);
    ok(await logado(page), `${papel}: a sessão continua`);
    ok((await page.locator('#email').count()) === 0, `${papel}: sem tela de login`);
    ok((await page.getByText(/inatividade/i).count()) === 0, `${papel}: nenhum aviso de inatividade`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    ok(await logado(page) && (await page.locator('#email').count()) === 0, `${papel}: recarregar depois de 3 h continua logado`);
    ok((await page.evaluate(() => localStorage.getItem('envase_last_activity'))) === null, `${papel}: a chave antiga "envase_last_activity" foi apagada`);
    await page.screenshot({ path: `${SAIDA}/${papel}-3h.png` });
    await ctx.close();

    // Renovação, com o relógio REAL: o relógio simulado trava a renovação do
    // Supabase (ela espera por temporizadores), então aqui o token é posto a
    // 20 s de vencer e o app tem de renová-lo sozinho, sem ninguém mexer.
    const ctx2 = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx2.newPage();
    if (!(await login(p2, { email, senha }))) throw new Error(`${email} não entrou`);
    await p2.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(2000);
    await p2.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
      const sessao = JSON.parse(localStorage.getItem(k));
      sessao.expires_at = Math.floor(Date.now() / 1000) + 20;
      localStorage.setItem(k, JSON.stringify(sessao));
    });
    await p2.reload({ waitUntil: 'domcontentloaded' });
    const renovou = await esperarPor(() => p2.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
      const sessao = JSON.parse(localStorage.getItem(k) || '{}');
      return sessao.expires_at * 1000 - Date.now() > 30 * 60000;
    }), 60000, 1000);
    ok(renovou && (await p2.locator('#email').count()) === 0, `${papel}: o token perto de vencer é renovado sozinho, sem sair`);
    await ctx2.close();

  }
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
