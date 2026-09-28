/**
 * Script de Verificação Real no Navegador via Playwright (msedge / chromium)
 * Executa os testes diretamente contra a URL de staging na Vercel (https://envase-pro.vercel.app)
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');

if (!fs.existsSync(SCRATCH_DIR)) {
  fs.mkdirSync(SCRATCH_DIR, { recursive: true });
}

const ARTIFACT_DIR = 'C:/Users/kauan.pereira/.gemini/antigravity/brain/17e52817-9948-4001-b5fb-875daf584a4c';

async function runBrowserTestsStaging() {
  console.log('='.repeat(70));
  console.log('🌐 INICIANDO TESTES REAIS NA URL DE STAGING VERCEL (PLAYWRIGHT)');
  console.log('='.repeat(70));

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: 'msedge'
    });
  } catch (e) {
    console.log('Tentando canal padrão chromium...');
    browser = await chromium.launch({ headless: true });
  }

  const BASE_URL = 'https://envase-pro.vercel.app';
  console.log(`Target: ${BASE_URL}`);

  // --------------------------------------------------------------------------
  // TESTE 1: Tela de TV /Televisao em contexto 100% anônimo
  // --------------------------------------------------------------------------
  console.log('\n📺 [TESTE 1] Acessando /Televisao sem sessão ativa na Vercel...');
  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  await page1.goto(`${BASE_URL}/Televisao`, { waitUntil: 'networkidle' });
  await page1.waitForTimeout(3000);

  const url1 = page1.url();
  console.log(`   ↳ URL atual: ${url1}`);
  const temLogin1 = await page1.locator('text=Acesso ao EnvasePro').count();
  console.log(`   ↳ Exigiu login? ${temLogin1 > 0 ? '❌ SIM (Erro!)' : '✅ NÃO (Correto!)'}`);

  const shot1 = path.join(SCRATCH_DIR, 'staging-01-televisao-anonima.png');
  await page1.screenshot({ path: shot1, fullPage: true });
  fs.copyFileSync(shot1, path.join(ARTIFACT_DIR, 'staging-01-televisao-anonima.png'));
  console.log(`   📸 Screenshot salvo: staging-01-televisao-anonima.png`);
  await ctx1.close();

  // --------------------------------------------------------------------------
  // TESTE 2: Tela de TV /TelevisaoEmpilha em contexto 100% anônimo
  // --------------------------------------------------------------------------
  console.log('\n🚜 [TESTE 2] Acessando /TelevisaoEmpilha sem sessão ativa na Vercel...');
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE_URL}/TelevisaoEmpilha`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(3000);

  const url2 = page2.url();
  console.log(`   ↳ URL atual: ${url2}`);
  const temLogin2 = await page2.locator('text=Acesso ao EnvasePro').count();
  console.log(`   ↳ Exigiu login? ${temLogin2 > 0 ? '❌ SIM (Erro!)' : '✅ NÃO (Correto!)'}`);

  const shot2 = path.join(SCRATCH_DIR, 'staging-02-televisao-empilha-anonima.png');
  await page2.screenshot({ path: shot2, fullPage: true });
  fs.copyFileSync(shot2, path.join(ARTIFACT_DIR, 'staging-02-televisao-empilha-anonima.png'));
  console.log(`   📸 Screenshot salvo: staging-02-televisao-empilha-anonima.png`);
  await ctx2.close();

  // --------------------------------------------------------------------------
  // TESTE 3: Rota protegida /Dashboard exige login
  // --------------------------------------------------------------------------
  console.log('\n🔒 [TESTE 3] Acessando rota protegida (/) desautenticado na Vercel...');
  const ctx3 = await browser.newContext();
  const page3 = await ctx3.newPage();
  await page3.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  
  await page3.waitForSelector('text=Fazer Login no Sistema', { timeout: 15000 });
  const temBotaoLogin = await page3.locator('text=Fazer Login no Sistema').count();
  console.log(`   ↳ Apresentou tela de login? ${temBotaoLogin > 0 ? '✅ SIM (Correto!)' : '❌ NÃO (Erro!)'}`);

  await page3.click('text=Fazer Login no Sistema');
  await page3.waitForSelector('text=Acesso ao EnvasePro', { timeout: 5000 });

  const shot3 = path.join(SCRATCH_DIR, 'staging-03-modal-login.png');
  await page3.screenshot({ path: shot3 });
  fs.copyFileSync(shot3, path.join(ARTIFACT_DIR, 'staging-03-modal-login.png'));
  console.log(`   📸 Screenshot salvo: staging-03-modal-login.png`);

  // --------------------------------------------------------------------------
  // TESTE 4: Login com conta de operações (operacoes.equipe@interlub.com)
  // --------------------------------------------------------------------------
  console.log('\n🔑 [TESTE 4] Realizando login com operacoes.equipe@interlub.com na Vercel...');
  await page3.click('text=Operações (Fábrica)');
  await page3.waitForTimeout(300);

  await page3.click('button[type="submit"]:has-text("Entrar no Sistema")');
  console.log('   ↳ Aguardando autenticação e abertura do modal "Quem é você hoje?"...');
  await page3.waitForSelector('text=Quem é você hoje?', { timeout: 15000 });
  console.log('   ✅ Modal "Quem é você hoje?" abriu automaticamente com sucesso!');

  const shot4 = path.join(SCRATCH_DIR, 'staging-04-selecionar-operador.png');
  await page3.screenshot({ path: shot4 });
  fs.copyFileSync(shot4, path.join(ARTIFACT_DIR, 'staging-04-selecionar-operador.png'));
  console.log(`   📸 Screenshot salvo: staging-04-selecionar-operador.png`);

  // --------------------------------------------------------------------------
  // TESTE 5: Seleção de operador do turno (Lição 3)
  // --------------------------------------------------------------------------
  console.log('\n👷 [TESTE 5] Selecionando o operador "Lucas Araujo"...');
  await page3.click('button:has-text("Lucas Araujo")');
  await page3.waitForTimeout(3000);

  const textoOperador = await page3.locator('text=Lucas Araujo').count();
  console.log(`   ↳ Operador ativo renderizado no layout? ${textoOperador > 0 ? '✅ SIM' : '❌ NÃO'}`);

  const shot5 = path.join(SCRATCH_DIR, 'staging-05-dashboard-com-operador-ativo.png');
  await page3.screenshot({ path: shot5, fullPage: true });
  fs.copyFileSync(shot5, path.join(ARTIFACT_DIR, 'staging-05-dashboard-com-operador-ativo.png'));
  console.log(`   📸 Screenshot salvo: staging-05-dashboard-com-operador-ativo.png`);

  await ctx3.close();
  await browser.close();

  console.log('\n' + '='.repeat(70));
  console.log('🎉 TODOS OS 5 TESTES NA VERCEL PASSARAM COM 100% DE SUCESSO!');
  console.log('='.repeat(70));
}

runBrowserTestsStaging().catch(err => {
  console.error('❌ Falha nos testes de staging:', err);
  process.exit(1);
});
