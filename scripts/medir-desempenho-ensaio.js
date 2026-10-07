import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { enforceNonProductionGuard } from './lib/db-guard.js';
// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('medir-desempenho-ensaio');
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_URL = 'https://envase-pro.vercel.app';

async function medir() {
  console.log('='.repeat(78));
  console.log('📊 MEDINDO DESEMPENHO E TRÁFEGO DE REDE COM VOLUME REAL NO STAGING');
  console.log(`🌐 URL: ${BASE_URL}`);
  console.log('='.repeat(78));

  // Confere contagens no Supabase
  const { count: cEnv } = await supabase.from('envase_records').select('*', { count: 'exact', head: true });
  const { count: cChk } = await supabase.from('checkout_itens').select('*', { count: 'exact', head: true });
  console.log(`Total no banco: ${cEnv} envases | ${cChk} itens de checkout`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // Função para monitorar requisições para o Supabase
  function monitorarTrafego() {
    let reqCount = 0;
    let totalBytes = 0;
    let postgrestCalls = [];

    const onResponse = async (response) => {
      const url = response.url();
      if (url.includes('.supabase.co/rest/v1/')) {
        reqCount++;
        try {
          const body = await response.text();
          const bytes = Buffer.byteLength(body, 'utf8');
          totalBytes += bytes;
          let rowCount = null;
          try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed)) rowCount = parsed.length;
          } catch {}
          
          postgrestCalls.push({
            endpoint: url.split('/rest/v1/')[1],
            status: response.status(),
            bytes,
            rowCount
          });
        } catch {}
      }
    };

    page.on('response', onResponse);

    return {
      finalizar: () => {
        page.off('response', onResponse);
        return { reqCount, totalBytes, postgrestCalls };
      }
    };
  }

  // 1. LOGIN
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
  const adminPass = process.env.TEST_ADMIN_PASSWORD;
  if (!adminPass) {
    console.error('❌ ERRO: TEST_ADMIN_PASSWORD é obrigatório no ambiente (.env.local).');
    process.exit(1);
  }

  console.log(`\n[1/5] Realizando login como PCP/Admin (${adminEmail})...`);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Fazer Login no Sistema', { timeout: 15000 });
  await page.click('text=Fazer Login no Sistema');
  await page.waitForSelector('text=Acesso ao EnvasePro');
  await page.fill('input#email', adminEmail);
  await page.fill('input#password', adminPass);
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3000);

  // 2. TESTE EM REGISTROS.JSX (Mede contagem de linhas e tempo de carregamento)
  console.log('\n[2/5] 📄 Testando Registros.jsx (esperado: 5.884 linhas)...');
  const tEnv = monitorarTrafego();
  const startReg = Date.now();
  await page.goto(`${BASE_URL}/Registros`, { waitUntil: 'networkidle' });
  // Aguarda carregar dados
  await page.waitForTimeout(4000);
  const durReg = ((Date.now() - startReg) / 1000).toFixed(2);
  const statsReg = tEnv.finalizar();

  // Verifica na UI quantas linhas aparecem ou no DOM
  const tableRows = await page.locator('tbody tr').count();
  // Busca badge ou texto de contagem
  const pageText = await page.locator('body').innerText();
  console.log(`   ⏱️ Tempo de carregamento: ${durReg}s`);
  console.log(`   📡 Requisições PostgREST: ${statsReg.reqCount}`);
  console.log(`   📦 Volume transferido: ${(statsReg.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  const envaseCalls = statsReg.postgrestCalls.filter(c => c.endpoint.startsWith('envase_records'));
  const totalLinhasEnvase = envaseCalls.reduce((s, c) => s + (c.rowCount || 0), 0);
  console.log(`   🔢 Linhas de envase baixadas pelo adaptador: ${totalLinhasEnvase} linhas (em ${envaseCalls.length} lotes de paginação)`);
  console.log(`   📊 Linhas renderizadas na tabela: ${tableRows}`);

  // Screenshot de Registros
  await page.screenshot({ path: 'C:/Users/kauan.pereira/.gemini/antigravity/brain/17e52817-9948-4001-b5fb-875daf584a4c/staging-12-registros-5884-linhas.png', fullPage: false });

  // 3. TESTE EM DASHBOARD
  console.log('\n[3/5] 📊 Testando Dashboard (/Dashboard)...');
  const tDash = monitorarTrafego();
  const startDash = Date.now();
  await page.goto(`${BASE_URL}/Dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const durDash = ((Date.now() - startDash) / 1000).toFixed(2);
  const statsDash = tDash.finalizar();

  console.log(`   ⏱️ Tempo de carregamento Dashboard: ${durDash}s`);
  console.log(`   📡 Requisições PostgREST: ${statsDash.reqCount}`);
  console.log(`   📦 Volume transferido: ${(statsDash.totalBytes / 1024 / 1024).toFixed(2)} MB`);
  const dashEnvaseCalls = statsDash.postgrestCalls.filter(c => c.endpoint.startsWith('envase_records'));
  console.log(`   🔢 Linhas trafegadas de envase_records no Dashboard: ${dashEnvaseCalls.reduce((s, c) => s + (c.rowCount || 0), 0)}`);

  // 4. TESTE EM PAINEL GERAL
  console.log('\n[4/5] 🧭 Testando Painel Geral (/Painel)...');
  const tPainel = monitorarTrafego();
  const startPainel = Date.now();
  await page.goto(`${BASE_URL}/Painel`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const durPainel = ((Date.now() - startPainel) / 1000).toFixed(2);
  const statsPainel = tPainel.finalizar();

  console.log(`   ⏱️ Tempo de carregamento Painel: ${durPainel}s`);
  console.log(`   📡 Requisições PostgREST: ${statsPainel.reqCount}`);
  console.log(`   📦 Volume transferido: ${(statsPainel.totalBytes / 1024).toFixed(2)} KB`);
  const totalLinhasPainel = statsPainel.postgrestCalls.reduce((s, c) => s + (c.rowCount || 0), 0);
  console.log(`   🔢 Linhas totais trafegadas no Painel: ${totalLinhasPainel}`);

  // 5. TESTE NAS TELAS DE TV (/Televisao e /TelevisaoEmpilha)
  console.log('\n[5/5] 📺 Testando telas de TV e medindo ciclo de atualização...');
  
  // TV Televisao
  const tTv = monitorarTrafego();
  await page.goto(`${BASE_URL}/Televisao`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const statsTv = tTv.finalizar();
  console.log(`   📺 /Televisao (Carga Inicial):`);
  console.log(`      - Requisições: ${statsTv.reqCount}`);
  console.log(`      - Volume: ${(statsTv.totalBytes / 1024).toFixed(2)} KB`);
  console.log(`      - Linhas trafegadas: ${statsTv.postgrestCalls.reduce((s, c) => s + (c.rowCount || 0), 0)}`);

  // TV TelevisaoEmpilha
  const tTvEmp = monitorarTrafego();
  await page.goto(`${BASE_URL}/TelevisaoEmpilha`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const statsTvEmp = tTvEmp.finalizar();
  console.log(`   🚜 /TelevisaoEmpilha (Carga Inicial):`);
  console.log(`      - Requisições: ${statsTvEmp.reqCount}`);
  console.log(`      - Volume: ${(statsTvEmp.totalBytes / 1024).toFixed(2)} KB`);
  console.log(`      - Linhas trafegadas: ${statsTvEmp.postgrestCalls.reduce((s, c) => s + (c.rowCount || 0), 0)}`);

  await browser.close();
}

medir().catch(err => {
  console.error('Erro na medição:', err);
  process.exit(1);
});
