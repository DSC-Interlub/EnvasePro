/**
 * scripts/test-tv-authenticated.js — a conta da TV, com sessão, na interface
 * real (Playwright, app LOCAL).
 *
 * REESCRITO em 20/10/2026. A versão anterior tinha o endereço de PRODUÇÃO
 * fixo no código (o guard só confere variáveis de ambiente e não a barrou):
 * rodada hoje, ela tentou logar no site de produção com a senha de teste
 * local, e produção recusou (HTTP 400). Também procurava textos de cabeçalho
 * que não existem mais, gravava capturas na pasta de outra ferramenta e saía
 * com 0 sempre.
 *
 * O que prova agora:
 *  1. a conta da TV entra e a sessão fica guardada no navegador;
 *  2. /Televisao, /TelevisaoEmpilha e /Painel abrem com dado e "atualizado
 *     às HH:MM", sem erro no console;
 *  3. recarregar a página (a TV reiniciando) NÃO pede login de novo.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-tv-authenticated');

// SEMPRE o app local. Nunca um endereço fixo de outro ambiente.
const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP)) {
  console.error(`Recusado: este teste só roda contra o app local (APP_BASE_URL=${APP})`);
  process.exit(2);
}
const SAIDA = 'scratch/tv-autenticada';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

const { login } = criarAjudantes({ app: APP });
const nav = await chromium.launch({ headless: true });
try {
  const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const erros = [];
  // O aviso do Vite em modo desenvolvimento (recarga automática por WebSocket)
  // não é erro da aplicação: não existe no build de produção.
  // Ruído SÓ do modo desenvolvimento (não existe no build de produção —
  // conferido: zero "data-source-location" no dist): a recarga automática do
  // Vite e o plugin de edição visual, que marca até React.Fragment.
  const doVite = (t) => /DevTools|\[vite\]|WebSocket connection to|WebSocket closed without opened|data-source-location/.test(t);
  page.on('console', (m) => { if (m.type() === 'error' && !doVite(m.text())) erros.push(m.text()); });
  page.on('pageerror', (e) => { if (!doVite(e.message)) erros.push(e.message); });

  console.log('1. Login da TV');
  ok(await login(page, { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD }), 'a conta da TV entra');
  const chave = await page.evaluate(() => Object.keys(localStorage).find((k) => k.includes('auth-token')) || null);
  ok(!!chave, `a sessão fica guardada no navegador (${chave})`);

  console.log('\n2. As telas de parede');
  for (const rota of ['Televisao', 'TelevisaoEmpilha', 'Painel']) {
    const antes = erros.length;
    await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
    const atualizou = await esperarPor(async () => (await page.locator('[data-tv-atualizacao="ok"]').count()) > 0, 30000);
    ok(atualizou, `/${rota}: carregou o painel e mostra "atualizado às"`);
    ok(await page.locator('#email').count() === 0, `/${rota}: não pediu login`);
    await page.waitForTimeout(1500);
    ok(erros.length === antes, `/${rota}: sem erro no console${erros.length > antes ? ` (${erros.slice(antes).join(' | ').slice(0, 160)})` : ''}`);
    await page.screenshot({ path: `${SAIDA}/${rota}.png` });
  }

  console.log('\n3. A TV reinicia');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const voltou = await esperarPor(async () => (await page.locator('[data-tv-atualizacao="ok"]').count()) > 0, 30000);
  ok(voltou && await page.locator('#email').count() === 0, 'depois de recarregar, a TV continua logada');
  await ctx.close();
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
