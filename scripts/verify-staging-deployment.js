import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('verify-staging-deployment');

const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
const adminPass = process.env.TEST_ADMIN_PASSWORD;

if (!adminPass) {
  console.error('❌ ERRO: TEST_ADMIN_PASSWORD é obrigatório no ambiente (.env.local).');
  process.exit(1);
}

async function verify() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log(`1. Efetuando login como Admin (${adminEmail}) pela raiz...`);
  await page.goto('https://envase-pro.vercel.app/', { waitUntil: 'networkidle' });

  const loginBtn = page.locator('text=Fazer Login no Sistema').first();
  if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginBtn.click();
    await page.waitForTimeout(500);
    await page.fill('input[type="email"]', adminEmail);
    await page.fill('input[type="password"]', adminPass);
    await page.click('button:has-text("Entrar")');
    await page.waitForTimeout(3000);
  }

  console.log('2. Acessando /GerenciarUsuarios...');
  await page.goto('https://envase-pro.vercel.app/GerenciarUsuarios', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const tabs = await page.locator('button[role="tab"]').allTextContents();
  console.log('Abas encontradas em /GerenciarUsuarios:', tabs);

  await page.waitForSelector('text=Alertas de Ocorrência', { timeout: 10000 });
  console.log('✅ Aba "Alertas de Ocorrência" encontrada no staging Vercel!');

  // Clica na aba
  await page.click('text=Alertas de Ocorrência');
  await page.waitForTimeout(2000);

  const shotPath = 'C:/Users/kauan.pereira/.gemini/antigravity/brain/17e52817-9948-4001-b5fb-875daf584a4c/staging-24-aba-alertas-ocorrencia.png';
  await page.screenshot({ path: shotPath });
  console.log('📸 Screenshot salvo:', shotPath);

  await browser.close();
}

verify().catch(console.error);
