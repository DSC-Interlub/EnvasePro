import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('audit-32-pages-roles');

const BASE_URL = 'https://envase-pro.vercel.app';

const PAGINAS = [
  { path: '/Dashboard', nome: 'Dashboard Principal', mod: 'Geral' },
  { path: '/Painel', nome: 'Painel Geral ao Vivo', mod: 'Geral' },
  { path: '/Televisao', nome: 'TV Envase / Produção', mod: 'TV' },
  { path: '/TelevisaoEmpilha', nome: 'TV Empilhadeira', mod: 'TV' },
  { path: '/NovoRegistro', nome: 'Novo Registro de Envase', mod: 'Envase' },
  { path: '/Registros', nome: 'Todos os Registros de Envase', mod: 'Envase' },
  { path: '/Produtos', nome: 'Catálogo de Produtos', mod: 'Cadastros' },
  { path: '/Embalagens', nome: 'Catálogo de Embalagens', mod: 'Cadastros' },
  { path: '/Operadores', nome: 'Cadastro de Operadores', mod: 'Cadastros' },
  { path: '/Checkout', nome: 'Módulo Check-out', mod: 'Checkout' },
  { path: '/NovaProgramacaoCheckout', nome: 'Nova Prog. Check-out', mod: 'Checkout' },
  { path: '/ExecutarCheckout', nome: 'Executar Check-out', mod: 'Checkout' },
  { path: '/Empilhadeira', nome: 'Módulo Empilhadeira', mod: 'Empilhadeira' },
  { path: '/NovaEmpilhaProgramacao', nome: 'Nova Prog. Empilhadeira', mod: 'Empilhadeira' },
  { path: '/ExecutarEmpilha', nome: 'Executar Empilhadeira', mod: 'Empilhadeira' },
  { path: '/EmpilhadeiraConfig', nome: 'Configuração de Empilhadeiras', mod: 'Empilhadeira' },
  { path: '/IndicadoresEmpilha', nome: 'Indicadores de Empilhadeira', mod: 'Empilhadeira' },
  { path: '/Recebimento', nome: 'Módulo Recebimento', mod: 'Recebimento' },
  { path: '/ExecutarRecebimento', nome: 'Executar Recebimento', mod: 'Recebimento' },
  { path: '/IndicadoresRecebimento', nome: 'Indicadores de Recebimento', mod: 'Recebimento' },
  { path: '/ChecklistRecebimento', nome: 'Checklist de Recebimento', mod: 'Checklist' },
  { path: '/NovoChecklist', nome: 'Novo Checklist', mod: 'Checklist' },
  { path: '/ChecklistDetalhe', nome: 'Detalhe de Checklist', mod: 'Checklist' },
  { path: '/NotasFiscais', nome: 'Arquivo de Notas Fiscais', mod: 'Notas Fiscais' },
  { path: '/NovaNotaFiscal', nome: 'Arquivar Nova Nota Fiscal', mod: 'Notas Fiscais' },
  { path: '/NotaFiscalDetalhe', nome: 'Detalhe de Nota Fiscal', mod: 'Notas Fiscais' },
  { path: '/GerenciarUsuarios', nome: 'Gestão de Usuários (Admin)', mod: 'Admin' },
  { path: '/ImportarProdutos', nome: 'Importação de Produtos', mod: 'Importação' },
  { path: '/ImportarEmbalagens', nome: 'Importação de Embalagens', mod: 'Importação' },
  { path: '/ImportarCategorias', nome: 'Importação de Categorias', mod: 'Importação' },
  { path: '/', nome: 'Página Inicial (Raiz)', mod: 'Geral' },
  { path: '/pagina-inexistente-404', nome: 'Tratamento de 404', mod: 'Sistema' }
];

async function auditarComRole(roleName, userEmail, userPass) {
  console.log('\n' + '='.repeat(78));
  console.log(`👤 AUDITORIA COMPLETA COM ROLE: ${roleName.toUpperCase()} (${userEmail})`);
  console.log('='.repeat(78));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const relatorio = [];

  // 1. Login
  console.log(`Efetuando login como ${roleName}...`);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  try {
    const loginBtn = page.locator('text=Fazer Login no Sistema').first();
    if (await loginBtn.isVisible({ timeout: 5000 })) {
      await loginBtn.click();
      await page.waitForTimeout(500);
      await page.fill('input[type="email"]', userEmail);
      await page.fill('input[type="password"]', userPass);
      await page.click('button:has-text("Entrar")');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
      console.log(`✅ Login como ${roleName} realizado.`);
    }
  } catch (err) {
    console.warn(`Aviso no fluxo de login de ${roleName}:`, err.message);
  }

  // Se for operador, selecionar o operador no modal inicial se aparecer
  try {
    const operadorModal = page.locator('div[role="dialog"]:has-text("Selecione seu Operador")').first();
    if (await operadorModal.isVisible({ timeout: 3000 })) {
      await page.locator('div[role="dialog"] button[role="combobox"]').first().click();
      await page.waitForTimeout(300);
      await page.locator('[role="option"]').first().click();
      await page.waitForTimeout(300);
      await page.locator('div[role="dialog"] button:has-text("Confirmar")').first().click();
      await page.waitForTimeout(1000);
      console.log(`✅ Operador ativo selecionado no modal.`);
    }
  } catch (e) {}

  // 2. Iterar sobre as 32 páginas
  for (let i = 0; i < PAGINAS.length; i++) {
    const item = PAGINAS[i];
    const url = `${BASE_URL}${item.path}`;
    const pageErrors = [];
    const pageWarnings = [];

    const onConsole = (msg) => {
      const type = msg.type();
      const text = msg.text();
      // Filtrar mensagens benignas conhecidas de extensões ou baseline
      if (text.includes('Download the React DevTools') || text.includes('[baseline-browser-mapping]')) return;
      if (type === 'error') {
        pageErrors.push(text);
      } else if (type === 'warning') {
        pageWarnings.push(text);
      }
    };

    const onPageError = (err) => {
      pageErrors.push(`[UNCAUGHT] ${err.message}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    const start = Date.now();
    let statusHttp = 200;
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      statusHttp = res ? res.status() : 0;
      await page.waitForTimeout(1000); // Aguardar reatividade do React
    } catch (err) {
      pageErrors.push(`[NAVIGATION ERROR] ${err.message}`);
    }

    const elapsed = Date.now() - start;

    page.off('console', onConsole);
    page.off('pageerror', onPageError);

    const resultadoItem = {
      path: item.path,
      nome: item.nome,
      modulo: item.mod,
      statusHttp,
      tempoMs: elapsed,
      erros: pageErrors,
      warnings: pageWarnings,
    };
    relatorio.push(resultadoItem);

    const statusIcon = pageErrors.length === 0 ? '✅' : '❌';
    const warnBadge = pageWarnings.length > 0 ? ` ⚠️ (${pageWarnings.length} warns)` : '';
    console.log(` [${String(i + 1).padStart(2, '0')}/32] ${statusIcon} ${item.path.padEnd(28)} | ${elapsed}ms | HTTP ${statusHttp}${warnBadge}`);
    if (pageErrors.length > 0) {
      pageErrors.forEach(e => console.log(`       ❌ ERRO: ${e.slice(0, 140)}`));
    }
  }

  await browser.close();
  return relatorio;
}

async function main() {
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
  const adminPass = process.env.TEST_ADMIN_PASSWORD;
  const operatorEmail = process.env.TEST_OPERATOR_EMAIL || 'tv-fabrica@interlub.com';
  const operatorPass = process.env.TEST_OPERATOR_PASSWORD;

  if (!adminPass || !operatorPass) {
    console.error('❌ ERRO: TEST_ADMIN_PASSWORD e TEST_OPERATOR_PASSWORD são obrigatórios no ambiente (.env.local).');
    process.exit(1);
  }

  const relAdmin = await auditarComRole('admin', adminEmail, adminPass);
  const relOperator = await auditarComRole('operator', operatorEmail, operatorPass);

  const totalErrosAdmin = relAdmin.reduce((s, r) => s + r.erros.length, 0);
  const totalWarnsAdmin = relAdmin.reduce((s, r) => s + r.warnings.length, 0);
  const totalErrosOp = relOperator.reduce((s, r) => s + r.erros.length, 0);
  const totalWarnsOp = relOperator.reduce((s, r) => s + r.warnings.length, 0);

  console.log('\n' + '='.repeat(78));
  console.log('📊 RESUMO GERAL DA AUDITORIA NAS 32 PÁGINAS (ADMIN & OPERATOR)');
  console.log('='.repeat(78));
  console.log(`ADMIN    : 32 páginas testadas | ${totalErrosAdmin} erros encontrados | ${totalWarnsAdmin} warnings`);
  console.log(`OPERATOR : 32 páginas testadas | ${totalErrosOp} erros encontrados | ${totalWarnsOp} warnings`);

  const paginasComErro = [];
  relAdmin.forEach(r => {
    if (r.erros.length > 0) paginasComErro.push({ role: 'admin', ...r });
  });
  relOperator.forEach(r => {
    if (r.erros.length > 0) paginasComErro.push({ role: 'operator', ...r });
  });

  if (paginasComErro.length > 0) {
    console.log('\nDetalhamento de erros encontrados:');
    paginasComErro.forEach(p => {
      console.log(`- [${p.role}] ${p.path} (${p.nome}):`);
      p.erros.forEach(e => console.log(`    ↳ ${e}`));
    });
  } else {
    console.log('\n🎉 ZERO ERROS DE CONSOLE ENCONTRADOS EM TODAS AS 32 PÁGINAS PARA AMBOS OS PAPÉIS!');
  }
}

main();
