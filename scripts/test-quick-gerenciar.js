import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-quick-gerenciar');

const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
const adminPass = process.env.TEST_ADMIN_PASSWORD;

if (!adminPass) {
  console.error('❌ ERRO: TEST_ADMIN_PASSWORD é obrigatório no ambiente (.env.local).');
  process.exit(1);
}

async function testGerenciar() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://envase-pro.vercel.app/');
  await page.click('text=Fazer Login no Sistema');
  await page.fill('input#email', adminEmail);
  await page.fill('input#password', adminPass);
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3000);
  await page.goto('https://envase-pro.vercel.app/GerenciarUsuarios');
  await page.waitForTimeout(4000);
  const text = await page.textContent('body');
  console.log('Tem tv-fabrica?', text.includes('tv-fabrica@interlub.com'));
  console.log('Tem operacoes.equipe?', text.includes('operacoes.equipe@interlub.com'));
  console.log('HTML snippet:', (await page.locator('div.divide-y').innerHTML().catch(() => 'nao achou divide-y')));
  await browser.close();
}

testGerenciar().catch(console.error);
