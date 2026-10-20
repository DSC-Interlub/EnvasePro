/**
 * scripts/test-inactivity-timeout.js — admin cai por inatividade, TV não.
 * Interface real (Playwright) contra o app LOCAL, com RELÓGIO SIMULADO.
 *
 * REESCRITO em 20/10/2026. A versão anterior:
 *  - subia o próprio `vite preview` na 4173, servindo a pasta dist/ como
 *    estivesse (podia ser um build antigo — estava: de 19/10 08:34);
 *  - não terminava: no Windows, `preview.kill()` mata o shell e deixa o Vite
 *    vivo segurando o Node (saída 124, morto pelo timeout);
 *  - só falsificava o horário guardado e recarregava a página.
 *
 * O que prova agora, com o relógio do Playwright (page.clock):
 *  1. ADMIN parado por 61 minutos, SEM recarregar nada: a checagem
 *     periódica derruba a sessão e a tela de login aparece com o aviso
 *     "Sessão encerrada por inatividade".
 *  2. ADMIN parado por 59 minutos: continua logado (o limite é 60).
 *  3. ADMIN que volta à aba depois de 65 minutos (o caso da recarga): cai.
 *  4. TV parada por 10 horas: continua logada, sem tela de login, com o
 *     painel no ar.
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

/**
 * Login com o relógio NORMAL (o relógio simulado instalado antes travava o
 * próprio formulário); depois instala o relógio simulado. Cada teste navega
 * em seguida, e o app reinicia já com os temporizadores sob controle — a
 * sessão continua no navegador.
 */
async function sessaoComRelogio(email, senha) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (!(await login(page, { email, senha }))) throw new Error(`${email} não entrou`);
  await page.clock.install();
  return { ctx, page };
}

try {
  console.log('1. Admin parado 61 minutos (sem recarregar)');
  {
    const { ctx, page } = await sessaoComRelogio(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
    await page.goto(`${APP}/Dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    ok(await logado(page), 'admin entra e a sessão existe');
    await page.clock.fastForward(61 * 60000);
    await page.clock.runFor(31000); // a checagem roda a cada 30 s
    // O app abre o login logo depois de CHAMAR o logout, sem esperar o signOut
    // apagar o token: as duas condições são esperadas juntas (antes era corrida).
    const caiu = await esperarPor(async () => (await page.locator('#email').count()) > 0 && !(await logado(page)), 30000);
    ok(caiu, 'a sessão é derrubada e a tela de login aparece');
    ok(await page.getByText(/Sessão encerrada por inatividade/).count() > 0, 'com o aviso "Sessão encerrada por inatividade"');
    await page.screenshot({ path: `${SAIDA}/1-admin-caiu.png` });
    await ctx.close();
  }

  console.log('\n2. Admin parado 59 minutos');
  {
    const { ctx, page } = await sessaoComRelogio(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
    await page.goto(`${APP}/Dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.clock.fastForward(59 * 60000);
    await page.clock.runFor(31000);
    await page.waitForTimeout(2000);
    ok(await logado(page) && (await page.locator('#email').count()) === 0, 'continua logado (o limite é 60 minutos)');
    await ctx.close();
  }

  console.log('\n3. Admin volta à aba depois de 65 minutos (recarga)');
  {
    const { ctx, page } = await sessaoComRelogio(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
    await page.goto(`${APP}/Dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => localStorage.setItem('envase_last_activity', String(Date.now() - 65 * 60000)));
    await page.reload({ waitUntil: 'domcontentloaded' });
    // O app abre o login logo depois de CHAMAR o logout, sem esperar o signOut
    // apagar o token: as duas condições são esperadas juntas (antes era corrida).
    const caiu = await esperarPor(async () => (await page.locator('#email').count()) > 0 && !(await logado(page)), 30000);
    ok(caiu, 'ao reabrir, a sessão é derrubada');
    await ctx.close();
  }

  console.log('\n4. TV parada 10 horas');
  {
    const { ctx, page } = await sessaoComRelogio(process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD);
    await page.goto(`${APP}/Televisao`, { waitUntil: 'domcontentloaded' });
    await esperarPor(async () => (await page.locator('[data-tv-atualizacao]').count()) > 0, 30000);
    await page.clock.fastForward(10 * 3600000);
    await page.clock.runFor(31000);
    await page.waitForTimeout(3000);
    ok(await logado(page), 'a sessão da TV continua');
    ok((await page.locator('#email').count()) === 0, 'sem tela de login');
    ok(await page.locator('[data-tv-atualizacao]').count() > 0, 'o painel continua no ar');
    await page.screenshot({ path: `${SAIDA}/4-tv-10h.png` });
    await ctx.close();
  }
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
