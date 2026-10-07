import { chromium } from 'playwright';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-inactivity-timeout');

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runInactivityTests() {
  console.log('='.repeat(78));
  console.log('🧪 TESTE AUTOMATIZADO: TIMEOUT DE INATIVIDADE POR PAPEL (ADMIN vs TV)');
  console.log(`🌐 Alvo Local: ${BASE_URL} (Vite Preview)`);
  console.log('='.repeat(78));

  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
  const adminPass = process.env.TEST_ADMIN_PASSWORD;
  const tvEmail = process.env.TEST_TV_EMAIL || 'tv-fabrica@interlub.com';
  const tvPass = process.env.TEST_TV_PASSWORD;

  if (!adminPass || !tvPass) {
    console.error('❌ ERRO: TEST_ADMIN_PASSWORD e TEST_TV_PASSWORD são obrigatórios no ambiente (.env.local).');
    process.exit(1);
  }

  // Inicia vite preview
  console.log('\n[0/4] 🚀 Iniciando servidor local Vite Preview na porta 4173...');
  const preview = spawn('npx.cmd', ['vite', 'preview', '--port', String(PORT)], {
    stdio: 'pipe',
    shell: true
  });

  preview.stdout.on('data', data => {
    // console.log('[preview]', data.toString().trim());
  });

  // Aguarda servidor subir
  await sleep(3000);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  try {
    // ------------------------------------------------------------------------
    // TESTE 1: ADMIN (pcp-brasil@interlub.com) - DEVE DESLOGAR COM 60+ MIN INATIVO
    // ------------------------------------------------------------------------
    console.log(`\n[1/4] 👤 Testando Conta ADMIN: Login com ${adminEmail}...`);
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    let adminWarnLog = null;
    adminPage.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('[AuthContext]')) {
        adminWarnLog = txt;
        console.log('   📢 Console Auth:', txt);
      }
    });

    await adminPage.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Clica em login se botão estiver visível
    const loginBtn = adminPage.locator('button:has-text("Fazer Login no Sistema")').first();
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await sleep(500);
    }

    await adminPage.fill('input#email', adminEmail);
    await adminPage.fill('input#password', adminPass);
    await adminPage.click('button[type="submit"]:has-text("Entrar no Sistema")');
    await sleep(3000);

    // Confirma que está logado como admin
    const adminRole = await adminPage.evaluate(() => {
      const raw = localStorage.getItem('envase_last_activity');
      return {
        hasLastActivity: !!raw,
        lastActivity: raw
      };
    });
    console.log('   ✅ Admin logado com sucesso. envase_last_activity inicial:', adminRole.lastActivity);

    // Simula inatividade de 65 minutos (ultrapassando os 60 min de limite)
    console.log('\n[2/4] ⏳ Simulando 65 minutos de inatividade para o ADMIN...');
    await adminPage.evaluate(() => {
      const sessentaCincoMinAtras = Date.now() - (65 * 60 * 1000);
      localStorage.setItem('envase_last_activity', sessentaCincoMinAtras.toString());
    });

    // Recarrega a página simulando o admin voltando à aba
    console.log('   🔄 Admin reabre/recarrega a aba após 65 min de inatividade...');
    await adminPage.reload({ waitUntil: 'networkidle' });
    await sleep(2500);

    // Verifica se foi deslogado automaticamente
    const adminStatusDepois = await adminPage.evaluate(() => {
      const token = Object.keys(localStorage).find(k => k.includes('auth-token'));
      return {
        hasToken: !!token,
        tokenVal: token ? localStorage.getItem(token) : null,
        url: window.location.pathname
      };
    });

    const telaLoginVisivel = await adminPage.locator('button:has-text("Fazer Login no Sistema")').isVisible();
    const modalLoginVisivel = await adminPage.locator('input#password').isVisible();

    if (!adminStatusDepois.hasToken || telaLoginVisivel || modalLoginVisivel) {
      console.log('   🎉 SUCESSO: ADMIN DESLOGADO AUTOMATICAMENTE POR INATIVIDADE!');
      console.log(`   - Tela de login ativa: ${telaLoginVisivel || modalLoginVisivel}`);
      console.log(`   - Log capturado: ${adminWarnLog}`);
    } else {
      throw new Error('FALHA: Admin permaneceu logado após 65 minutos de inatividade simulada!');
    }

    await adminContext.close();

    // ------------------------------------------------------------------------
    // TESTE 2: TV FÁBRICA (tv-fabrica@interlub.com) - NUNCA DEVE DESLOGAR
    // ------------------------------------------------------------------------
    console.log('\n[3/4] 📺 Testando Conta TV FÁBRICA: Login com tv-fabrica@interlub.com...');
    const tvContext = await browser.newContext();
    const tvPage = await tvContext.newPage();

    let tvWarnLog = null;
    tvPage.on('console', msg => {
      const txt = msg.text();
      if (txt.includes('[AuthContext]')) {
        tvWarnLog = txt;
        console.log('   📢 Console TV:', txt);
      }
    });

    await tvPage.goto(BASE_URL, { waitUntil: 'networkidle' });

    const tvLoginBtn = tvPage.locator('button:has-text("Fazer Login no Sistema")').first();
    if (await tvLoginBtn.isVisible()) {
      await tvLoginBtn.click();
      await sleep(500);
    }

    await tvPage.fill('input#email', tvEmail);
    await tvPage.fill('input#password', tvPass);
    await tvPage.click('button[type="submit"]:has-text("Entrar no Sistema")');
    await sleep(3000);

    console.log('   ✅ TV logada com sucesso.');

    // Simula 10 horas sem nenhuma interação física (display rodando a noite toda)
    console.log('\n[4/4] ⏳ Simulando 10 HORAS sem interação para a TV...');
    await tvPage.evaluate(() => {
      const dezHorasAtras = Date.now() - (10 * 3600 * 1000);
      localStorage.setItem('envase_last_activity', dezHorasAtras.toString());
    });

    // Navega para /Televisao e depois /TelevisaoEmpilha
    console.log('   🔄 Navegando para /Televisao e /TelevisaoEmpilha...');
    await tvPage.goto(`${BASE_URL}/Televisao`, { waitUntil: 'networkidle' });
    await sleep(3000);

    const tvEnvaseAtiva = await tvPage.evaluate(() => {
      const token = Object.keys(localStorage).find(k => k.includes('auth-token'));
      return {
        hasToken: !!token,
        bodyText: document.body.innerText.substring(0, 200)
      };
    });

    if (!tvEnvaseAtiva.hasToken) {
      throw new Error('FALHA: TV perdeu a sessão ao simular horas sem interação!');
    }
    console.log('   ✅ /Televisao funcionando normalmente com sessão ativa.');

    await tvPage.goto(`${BASE_URL}/TelevisaoEmpilha`, { waitUntil: 'networkidle' });
    await sleep(3000);

    const tvEmpilhaAtiva = await tvPage.evaluate(() => {
      const token = Object.keys(localStorage).find(k => k.includes('auth-token'));
      return {
        hasToken: !!token,
        bodyText: document.body.innerText.substring(0, 200)
      };
    });

    if (!tvEmpilhaAtiva.hasToken) {
      throw new Error('FALHA: TV Empilhadeira perdeu a sessão!');
    }
    console.log('   ✅ /TelevisaoEmpilha funcionando normalmente com sessão ativa.');

    console.log('\n' + '='.repeat(78));
    console.log('🏆 RESULTADO FINAL: TODOS OS TESTES PASSARAM COM SUCESSO!');
    console.log('1. Admin inativo > 60 min: DESLOGA IMEDIATAMENTE (Sessão limpa no cliente).');
    console.log('2. TV sem interação (10h simuladas): PERMANECE LOGADA E FUNCIONAL 24/7.');
    console.log('='.repeat(78));

    await tvContext.close();
  } finally {
    if (browser) await browser.close();
    preview.kill();
  }
}

runInactivityTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
