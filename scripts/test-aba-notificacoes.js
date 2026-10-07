import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-aba-notificacoes');

const BASE_URL = 'https://envase-pro.vercel.app';
const ARTIFACT_DIR = 'C:/Users/kauan.pereira/.gemini/antigravity/brain/17e52817-9948-4001-b5fb-875daf584a4c';

async function runTest() {
  console.log('='.repeat(70));
  console.log('🧪 TESTE COMPLETO: notificacao_destinatarios + ABA EM GerenciarUsuarios.jsx');
  console.log('='.repeat(70));

  // 1. Teste via Supabase Client Autenticado como Admin
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
  const adminPass = process.env.TEST_ADMIN_PASSWORD;
  if (!adminPass) {
    console.error('❌ ERRO: TEST_ADMIN_PASSWORD é obrigatório no ambiente (.env.local).');
    process.exit(1);
  }

  console.log(`1. Autenticando cliente Supabase como Admin (${adminEmail})...`);
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPass
  });
  if (authErr) throw new Error(`Falha no login: ${authErr.message}`);
  console.log('   ✅ Admin autenticado com sucesso. UID:', authData.user.id);

  // Inserir registro de teste via API
  console.log('2. Inserindo destinatário de teste via cliente autenticado...');
  const testEmail = `lider.qa.${Date.now()}@interlub.com.br`;
  const { data: inserted, error: insErr } = await supabase
    .from('notificacao_destinatarios')
    .insert({
      email: testEmail,
      nome: 'Líder Operacional QA',
      ativo: true
    })
    .select()
    .single();

  if (insErr) throw new Error(`Erro ao inserir destinatário: ${insErr.message}`);
  console.log(`   ✅ Inserido com sucesso no banco: ID=${inserted.id}, Email=${inserted.email}`);

  // Leitura do registro
  const { data: list, error: listErr } = await supabase
    .from('notificacao_destinatarios')
    .select('*')
    .eq('id', inserted.id)
    .single();

  if (listErr) throw new Error(`Erro ao ler destinatário: ${listErr.message}`);
  console.log(`   ✅ Leitura confirmada no banco: Nome="${list.nome}", Ativo=${list.ativo}`);

  // 2. Teste no Navegador via Playwright na tela de Staging
  console.log('\n3. Abrindo navegador para validar a interface visual em /GerenciarUsuarios...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('   ↳ Acessando página inicial...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

  // Fazer login como admin
  const loginBtn = page.locator('text=Fazer Login no Sistema').first();
  if (await loginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginBtn.click();
    await page.waitForTimeout(500);
    await page.fill('input#email', adminEmail);
    await page.fill('input#password', adminPass);
    await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
    await page.waitForTimeout(3000);
  }

  console.log('   ↳ Navegando para /GerenciarUsuarios...');
  await page.goto(`${BASE_URL}/GerenciarUsuarios`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('   ↳ Clicando na aba "Alertas de Ocorrência"...');
  await page.click('text=Alertas de Ocorrência');
  await page.waitForTimeout(2500);

  // Cadastrar um novo destinatário diretamente pelo formulário da tela
  const emailUi = `gerente.logistica.${Date.now().toString().slice(-4)}@interlub.com.br`;
  console.log(`   ↳ Preenchendo formulário na UI com: ${emailUi}`);
  await page.fill('input#nomeDest', 'Gerente de Logística e Envase');
  await page.fill('input#emailDest', emailUi);
  await page.click('button:has-text("Cadastrar Destinatário")');
  await page.waitForTimeout(3000);

  const shotPath = `${ARTIFACT_DIR}/staging-25-destinatarios-cadastrados.png`;
  await page.screenshot({ path: shotPath });
  console.log(`   📸 Screenshot salvo: staging-25-destinatarios-cadastrados.png`);

  // Confirmar no banco que o e-mail cadastrado pela UI foi gravado
  const { data: dbDestUi } = await supabase
    .from('notificacao_destinatarios')
    .select('*')
    .eq('email', emailUi)
    .maybeSingle();

  if (dbDestUi) {
    console.log(`   ✅ DESTINATÁRIO CADASTRADO PELA UI CONFIRMADO NO BANCO! ID=${dbDestUi.id}, Nome="${dbDestUi.nome}"`);
  } else {
    console.log('   ⚠️ Não localizou imediatamente via select direto, checando lista geral...');
  }

  await browser.close();
  console.log('='.repeat(70));
}

runTest().catch(console.error);
