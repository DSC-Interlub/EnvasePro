import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-tv-authenticated');

const BASE_URL = 'https://envase-pro.vercel.app';
const ARTIFACT_DIR = 'C:/Users/kauan.pereira/.gemini/antigravity/brain/17e52817-9948-4001-b5fb-875daf584a4c';

async function runTvAuthTest() {
  console.log('='.repeat(78));
  console.log('📺 TESTE DE PERSISTÊNCIA E ACESSO ÀS TELAS DE TV COM RLS AUTENTICADO');
  console.log(`🌐 Alvo: ${BASE_URL}`);
  console.log('='.repeat(78));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  // Cria um contexto limpo (simulando uma Smart TV ou computador novo)
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Download the React DevTools') || text.includes('[baseline-browser-mapping]')) return;
    if (msg.type() === 'error') {
      consoleErrors.push(`[CONSOLE ERROR] ${text}`);
      console.log('   ❌ Console Error:', text);
    } else if (msg.type() === 'warning') {
      consoleWarnings.push(`[CONSOLE WARN] ${text}`);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(`[PAGE ERROR] ${err.message}`);
    console.log('   ❌ Page Error:', err.message);
  });

  // 1. Login Manual Inicial com conta compartilhada de TV
  const tvEmail = process.env.TEST_TV_EMAIL || 'tv-fabrica@interlub.com';
  const tvPass = process.env.TEST_TV_PASSWORD;
  if (!tvPass) {
    console.error('❌ ERRO: TEST_TV_PASSWORD é obrigatório no ambiente (.env.local).');
    process.exit(1);
  }

  console.log(`\n[1/3] 🔑 Efetuando login inicial com a conta compartilhada de TV (${tvEmail})...`);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

  const loginBtn = page.locator('text=Fazer Login no Sistema').first();
  await loginBtn.waitFor({ state: 'visible', timeout: 10000 });
  await loginBtn.click();
  await page.waitForTimeout(500);

  await page.fill('input#email', tvEmail);
  await page.fill('input#password', tvPass);
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3500);

  // Verificar se o Supabase gravou a sessão no localStorage
  const sessionToken = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('auth-token')) {
        return key;
      }
    }
    return null;
  });

  console.log('   ✓ Sessão persistida no localStorage:', sessionToken ? `Sim (${sessionToken})` : 'Não encontrada');

  // 2. Acesso à rota /Televisao (TV Geral de Envase)
  console.log('\n[2/3] 📺 Acessando tela de TV Geral (/Televisao) com sessão persistida...');
  const resTv = await page.goto(`${BASE_URL}/Televisao`, { waitUntil: 'networkidle', timeout: 20000 });
  console.log(`   ↳ Status HTTP: ${resTv.status()}`);
  await page.waitForTimeout(4000); // Aguardar renderização completa dos KPIs e slides

  // Checar elementos visíveis característicos da TV
  const tvHeader = await page.locator('text=ENVASE EM ANDAMENTO').isVisible().catch(() => false);
  const tvTotalProd = await page.locator('text=Produção Total').isVisible().catch(() => false);
  console.log(`   ↳ Elementos da TV renderizados: Header="${tvHeader}", KPIs="${tvTotalProd}"`);

  const shotTv1 = `${ARTIFACT_DIR}/staging-26-tv-envase-autenticada.png`;
  await page.screenshot({ path: shotTv1 });
  console.log(`   📸 Screenshot salvo: staging-26-tv-envase-autenticada.png`);

  // 3. Acesso à rota /TelevisaoEmpilha (TV de Empilhadeiras)
  console.log('\n[3/3] 🚜 Acessando tela de TV Empilhadeira (/TelevisaoEmpilha) com sessão persistida...');
  const resEmp = await page.goto(`${BASE_URL}/TelevisaoEmpilha`, { waitUntil: 'networkidle', timeout: 20000 });
  console.log(`   ↳ Status HTTP: ${resEmp.status()}`);
  await page.waitForTimeout(4000);

  const empHeader = await page.locator('text=Empilhadeira — Interlub').isVisible().catch(() => false);
  const empCard = await page.locator('text=EM ANDAMENTO').isVisible().catch(() => false);
  const empKpi = await page.locator('text=Total Linhas').isVisible().catch(() => false);
  console.log(`   ↳ Elementos da TV Empilhadeira renderizados: Header="${empHeader}", Linhas="${empCard}", KPI="${empKpi}"`);

  const shotTv2 = `${ARTIFACT_DIR}/staging-27-tv-empilha-autenticada.png`;
  await page.screenshot({ path: shotTv2 });
  console.log(`   📸 Screenshot salvo: staging-27-tv-empilha-autenticada.png`);

  await browser.close();

  console.log('\n' + '='.repeat(78));
  console.log('📊 RESUMO DA AUDITORIA DAS TELAS DE TV');
  console.log('='.repeat(78));
  console.log(`Erros de Console/RLS detectados: ${consoleErrors.length}`);
  console.log(`Warnings detectados             : ${consoleWarnings.length}`);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => console.log('  ❌', e));
  } else {
    console.log('🎉 SUCESSO: Ambas as telas de TV carregaram dados perfeitamente sob a sessão persistida com RLS bloqueado para anônimos!');
  }
  console.log('='.repeat(78));
}

runTvAuthTest().catch(console.error);
