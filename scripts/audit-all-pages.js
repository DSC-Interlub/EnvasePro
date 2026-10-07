import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('audit-all-pages');

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

async function runAudit() {
  console.log('='.repeat(78));
  console.log(`🔍 AUDITORIA COMPLETA DE UX E FUNCIONALIDADE: 32 PÁGINAS`);
  console.log(`🌐 Alvo: ${BASE_URL}`);
  console.log('='.repeat(78));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Login inicial como Administrador (para validar rotas protegidas)
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
  const adminPass = process.env.TEST_ADMIN_PASSWORD;
  if (!adminPass) {
    console.error('❌ ERRO: TEST_ADMIN_PASSWORD é obrigatório no ambiente (.env.local).');
    process.exit(1);
  }

  console.log(`Efetuando login como Administrador (${adminEmail})...`);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Fazer Login no Sistema', { timeout: 15000 });
  await page.click('text=Fazer Login no Sistema');
  await page.waitForSelector('text=Acesso ao EnvasePro');
  await page.fill('input#email', adminEmail);
  await page.fill('input#password', adminPass);
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3000);

  const resultados = [];

  for (let i = 0; i < PAGINAS.length; i++) {
    const item = PAGINAS[i];
    const errors = [];
    const onConsole = msg => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        // ignora favicon ou 404 intencional
        if (!txt.includes('favicon') && !txt.includes('404')) {
          errors.push(txt.slice(0, 100));
        }
      }
    };
    const onPageError = err => errors.push(err.message.slice(0, 100));

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    const start = Date.now();
    try {
      const resp = await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'networkidle', timeout: 20000 });
      const statusHttp = resp?.status() || 200;
      await page.waitForTimeout(1000);
      const dur = ((Date.now() - start) / 1000).toFixed(2);

      let statusUi = 'OK';
      let obs = `Carregamento em ${dur}s`;

      if (parseFloat(dur) > 5.0) {
        statusUi = 'LENTO';
        obs = `Tempo elevado (${dur}s)`;
      }

      if (errors.length > 0) {
        statusUi = 'QUEBRADO';
        obs = `Erro de console: ${errors[0]}`;
      }

      console.log(`[${(i + 1).toString().padStart(2)}/32] ${item.path.padEnd(28)} | ${statusUi.padEnd(8)} | ${obs}`);
      resultados.push({
        numero: i + 1,
        modulo: item.mod,
        pagina: item.nome,
        rota: item.path,
        status: statusUi,
        tempo: `${dur}s`,
        observacao: obs
      });
    } catch (e) {
      console.log(`[${(i + 1).toString().padStart(2)}/32] ${item.path.padEnd(28)} | FALHA    | ${e.message}`);
      resultados.push({
        numero: i + 1,
        modulo: item.mod,
        pagina: item.nome,
        rota: item.path,
        status: 'QUEBRADO',
        tempo: '> 20s',
        observacao: `Timeout ou falha de navegação: ${e.message.slice(0, 80)}`
      });
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    }
  }

  await browser.close();

  console.log('\n' + '='.repeat(78));
  console.log('📋 RESULTADO DA AUDITORIA TELA POR TELA:');
  console.log('='.repeat(78));
  console.table(resultados);
}

runAudit().catch(err => {
  console.error('Falha na auditoria:', err);
  process.exit(1);
});
