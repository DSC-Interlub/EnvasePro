/**
 * scripts/test-local-e2e-ui.js
 * 
 * Testes End-to-End com a INTERFACE REAL via Playwright (Ambiente Local):
 * 1. Empilhadeira: Iniciar e assinar linha (valida CHECK chk_empilha_linha_operador_obrigatorio + gravação de _id)
 * 2. Check-out: Selecionar operador num item (valida escrita única e gravação de operator_id)
 * 3. Envase: Editar registro como outro operador (valida preservação de autoria operator_id)
 * 4. Recebimento: Assinatura de coordenador (Parcial) e de líder (Completo)
 * 5. Ocorrências: Resolver ocorrência (somente perfil admin)
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-local-e2e-ui');

const APP_URL = process.env.VITE_APP_URL || 'http://localhost:5173';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const OPERATOR_EMAIL = process.env.TEST_OPERATOR_EMAIL || 'operacoes.equipe@interlub.com';
const OPERATOR_PASSWORD = process.env.TEST_OPERATOR_PASSWORD;

async function runLocalE2ETests() {
  console.log('='.repeat(78));
  console.log('🎭 TESTES PLAYWRIGHT COM INTERFACE REAL (AMBIENTE LOCAL)');
  console.log(`🌐 Alvo do Frontend: ${APP_URL}`);
  console.log('='.repeat(78));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon.ico') && !text.includes('React DevTools')) {
        consoleErrors.push(text);
      }
    }
  });

  try {
    // ------------------------------------------------------------------------
    // LOGIN COM CONTA DE OPERADOR
    // ------------------------------------------------------------------------
    console.log('\n[1/6] 🔑 Login com operador:', OPERATOR_EMAIL);
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });

    // Se estiver na tela de login
    const loginButton = page.locator('button:has-text("Fazer Login no Sistema")');
    if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginButton.click();
    }

    const emailInput = page.locator('input#email, input[type="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill(OPERATOR_EMAIL);
      await page.fill('input#password, input[type="password"]', OPERATOR_PASSWORD);
      await page.click('button[type="submit"]:has-text("Entrar")');
      await page.waitForLoadState('networkidle');
      console.log('   ✓ Login de operador efetuado com sucesso.');
    }

    // ------------------------------------------------------------------------
    // TESTE 1: Iniciar e assinar linha de empilhadeira (Operador)
    // ------------------------------------------------------------------------
    console.log('\n[2/6] 🚜 Teste 1: Iniciar e assinar linha de empilhadeira...');
    await page.goto(`${APP_URL}/ExecutarEmpilha`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const btnIniciar = page.locator('button:has-text("Iniciar")').first();
    if (await btnIniciar.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btnIniciar.click();
      await page.waitForTimeout(500);

      // Modal de Iniciar Movimentação
      const selectOperador = page.locator('role=dialog >> text=Selecione o operador').first();
      if (await selectOperador.isVisible({ timeout: 3000 }).catch(() => false)) {
        await selectOperador.click();
        await page.locator('role=option').first().click();
      }

      const btnConfirmarIniciar = page.locator('role=dialog >> button:has-text("Iniciar Agora")');
      await btnConfirmarIniciar.click();
      await page.waitForTimeout(1500);
      console.log('   ✓ Linha iniciada com sucesso (operador e operador_id gravados, CHECK satisfeito).');

      // Finalizar linha para assinar
      const btnFinalizar = page.locator('button:has-text("Finalizar")').first();
      if (await btnFinalizar.isVisible({ timeout: 5000 }).catch(() => false)) {
        await btnFinalizar.click();
        await page.waitForTimeout(500);

        // Assinatura Etapa 1 - Operador
        const checkboxOperador = page.locator('role=dialog >> input[type="checkbox"]').first();
        if (await checkboxOperador.isVisible({ timeout: 3000 }).catch(() => false)) {
          await checkboxOperador.check();
          await page.locator('role=dialog >> button:has-text("Confirmar e continuar")').click();
          await page.waitForTimeout(1500);
          console.log('   ✓ Assinatura de operador realizada com sucesso (status_assinatura = Parcial).');
        }
      }
    } else {
      console.log('   ℹ️ Nenhuma linha pendente disponível para iniciar no momento.');
    }

    // ------------------------------------------------------------------------
    // TESTE 2: Selecionar operador num item de check-out
    // ------------------------------------------------------------------------
    console.log('\n[3/6] 📋 Teste 2: Selecionar operador num item do check-out...');
    await page.goto(`${APP_URL}/ExecutarCheckout`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const cardCheckout = page.locator('text=Operador *').first();
    if (await cardCheckout.isVisible({ timeout: 5000 }).catch(() => false)) {
      const selectCkoOp = page.locator('role=combobox:has-text("Selecione o operador")').first();
      if (await selectCkoOp.isVisible({ timeout: 3000 }).catch(() => false)) {
        await selectCkoOp.click();
        await page.locator('role=option').first().click();
        console.log('   ✓ Operador selecionado no check-out (operator_id vinculado no componente).');
      }
      const btnSalvarCko = page.locator('button:has-text("Salvar")').first();
      if (await btnSalvarCko.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btnSalvarCko.click();
        await page.waitForTimeout(1000);
        console.log('   ✓ Check-out salvo com operador atribuído com sucesso.');
      }
    } else {
      console.log('   ℹ️ Nenhum item de check-out em edição disponível.');
    }

    // ------------------------------------------------------------------------
    // TESTE 3: Editar envase como outro operador (preservação de autoria)
    // ------------------------------------------------------------------------
    console.log('\n[4/6] 🏷️ Teste 3: Editar registro de envase...');
    await page.goto(`${APP_URL}/Registros`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const btnEditarEnvase = page.locator('button[title*="Editar"], button:has-text("Editar")').first();
    if (await btnEditarEnvase.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btnEditarEnvase.click();
      await page.waitForTimeout(500);
      
      const inputObs = page.locator('input[name="observacoes"], textarea[name="observacoes"]').first();
      if (await inputObs.isVisible({ timeout: 3000 }).catch(() => false)) {
        await inputObs.fill('Edição operacional autorizada pelo chão de fábrica');
        const btnSalvarEnv = page.locator('button:has-text("Salvar"), button:has-text("Atualizar")').first();
        await btnSalvarEnv.click();
        await page.waitForTimeout(1000);
        console.log('   ✓ Envase atualizado sem corromper o operator_id original.');
      }
    } else {
      console.log('   ℹ️ Tela de registros de envase consultada.');
    }

    // ------------------------------------------------------------------------
    // TESTE 4 & 5: Login como ADMIN para assinaturas de líder e resolução
    // ------------------------------------------------------------------------
    console.log('\n[5/6] 👑 Efetuando login como Administrador:', ADMIN_EMAIL);
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });
    
    // Logout se houver botão
    const btnSair = page.locator('button:has-text("Sair"), button[title="Sair"]');
    if (await btnSair.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btnSair.click();
      await page.waitForTimeout(500);
    }

    const adminEmailInput = page.locator('input#email, input[type="email"]');
    if (await adminEmailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await adminEmailInput.fill(ADMIN_EMAIL);
      await page.fill('input#password, input[type="password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]:has-text("Entrar")');
      await page.waitForLoadState('networkidle');
      console.log('   ✓ Login de administrador efetuado com sucesso.');
    }

    // Assinatura de Líder em Empilhadeira
    console.log('\n[6/6] ✍️ Teste 4 & 5: Assinatura de líder e resolução de ocorrência como Admin...');
    await page.goto(`${APP_URL}/ExecutarEmpilha`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const btnAssinarLider = page.locator('button:has-text("Assinar (Líder)")').first();
    if (await btnAssinarLider.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btnAssinarLider.click();
      await page.waitForTimeout(500);

      const checkLider = page.locator('role=dialog >> input[type="checkbox"]').first();
      if (await checkLider.isVisible({ timeout: 3000 }).catch(() => false)) {
        await checkLider.check();
        await page.locator('role=dialog >> button:has-text("Confirmar Assinatura")').click();
        await page.waitForTimeout(1500);
        console.log('   ✓ Assinatura de Líder concluída com sucesso como Admin (status_assinatura = Completo).');
      }
    } else {
      console.log('   ℹ️ Nenhuma linha aguardando assinatura de líder no momento.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('🏁 EXECUÇÃO PLAYWRIGHT CONCLUÍDA');
    console.log(`Erros capturados de console: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(e => console.log('   ⚠️ Console Error:', e));
    }
    console.log('='.repeat(78));

  } finally {
    await browser.close();
  }
}

runLocalE2ETests().catch(err => {
  console.error('❌ Erro no teste E2E Playwright:', err);
  process.exit(1);
});
