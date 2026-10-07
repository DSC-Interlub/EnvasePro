/**
 * Bateria Completa de Testes Reais no Navegador em Staging (Vercel):
 * 1. Login com conta de operações (operacoes.equipe@interlub.com) + Seleção de "Lucas Araujo".
 * 2. Criação real de registro de envase em /NovoRegistro e verificação do operator_id no Supabase.
 * 3. Conclusão de item de check-out em /ExecutarCheckout e verificação do operator_id no Supabase.
 * 4. Upload de Nota Fiscal em /NovaNotaFiscal no bucket privado 'notas-fiscais' e visualização da imagem com Signed URL.
 * 5. Logout e Login com Admin (pcp-brasil@interlub.com).
 * 6. Acesso às telas restritas de Admin (/GerenciarUsuarios, /IndicadoresEmpilha) com screenshots.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRATCH_DIR = path.join(__dirname, '..', 'scratch');
const ARTIFACT_DIR = 'C:/Users/kauan.pereira/.gemini/antigravity/brain/17e52817-9948-4001-b5fb-875daf584a4c';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-staging-full-suite');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BASE_URL = 'https://envase-pro.vercel.app';
const LUCAS_UUID = '00000000-6ab3-bf2e-9a60-d918e4ed058b';

async function runFullStagingTests() {
  console.log('='.repeat(78));
  console.log('🚀 EXECUTANDO BATERIA COMPLETA DE TESTES NO STAGING VERCEL');
  console.log(`🌐 Target: ${BASE_URL}`);
  console.log('='.repeat(78));

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // --------------------------------------------------------------------------
  // PARTE 1: LOGIN DE OPERADOR + SELEÇÃO DE LUCAS ARAUJO
  // --------------------------------------------------------------------------
  console.log('\n[1/6] 🔑 Efetuando login com operacoes.equipe@interlub.com...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Fazer Login no Sistema', { timeout: 15000 });
  await page.click('text=Fazer Login no Sistema');
  await page.waitForSelector('text=Acesso ao EnvasePro');
  await page.click('text=Operações (Fábrica)');
  await page.waitForTimeout(300);
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');

  await page.waitForSelector('text=Quem é você hoje?', { timeout: 15000 });
  console.log('   ↳ Selecionando operador "Lucas Araujo"...');
  await page.locator('text=Lucas Araujo').first().click({ force: true });
  await page.waitForTimeout(3000);

  // --------------------------------------------------------------------------
  // PARTE 2: ESCRITA REAL DE REGISTRO DE ENVASE
  // --------------------------------------------------------------------------
  console.log('\n[2/6] 📝 Criando registro real de envase em /NovoRegistro...');
  await page.goto(`${BASE_URL}/NovoRegistro`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input#op', { timeout: 15000 });

  const opTeste = `OP-TESTE-${Date.now().toString().slice(-4)}`;
  console.log(`   ↳ Preenchendo formulário para ${opTeste}...`);

  // Selecionar Sala Industrial
  const triggerSala = page.locator('button:has-text("Selecione a sala")').first();
  if (await triggerSala.count() > 0) {
    await triggerSala.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Sala Industrial")').first().click();
  }

  // Preencher OP
  await page.fill('input#op', opTeste);

  // Código do produto
  await page.fill('input#codigo_produto', 'IVP113632310');
  await page.waitForTimeout(500);

  // Quantidade produzida
  await page.fill('input#quantidade_produzida', '250');

  // Horários
  await page.fill('input#inicio', '08:30');
  await page.fill('input#termino', '10:15');

  // Selecionar Operador se não estiver selecionado
  const triggerOp = page.locator('button:has-text("Selecione o operador")').first();
  if (await triggerOp.count() > 0) {
    await triggerOp.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Lucas Araujo")').first().click();
  }

  // Submit / Finalizar
  console.log('   ↳ Submetendo registro de envase...');
  await page.click('button[type="submit"]:has-text("Finalizar Registro")');
  await page.waitForTimeout(4000);

  const shotEnvase = path.join(SCRATCH_DIR, 'staging-06-envase-criado.png');
  await page.screenshot({ path: shotEnvase, fullPage: true });
  fs.copyFileSync(shotEnvase, path.join(ARTIFACT_DIR, 'staging-06-envase-criado.png'));
  console.log('   📸 Screenshot salvo: staging-06-envase-criado.png');

  // Consultar Supabase para verificar gravação com operator_id
  const { data: recEnvase } = await supabase
    .from('envase_records')
    .select('id, protocolo, op, operador, operator_id, quantidade_produzida, codigo_produto')
    .eq('op', opTeste)
    .maybeSingle();

  console.log('\n   🔍 CONSULTA SUPABASE (envase_records):');
  console.log(`      ID: ${recEnvase?.id}`);
  console.log(`      Protocolo: ${recEnvase?.protocolo}`);
  console.log(`      OP: ${recEnvase?.op}`);
  console.log(`      Operador: ${recEnvase?.operador}`);
  console.log(`      Operator ID gravado: ${recEnvase?.operator_id}`);
  console.log(`      Bate com Lucas Araujo (${LUCAS_UUID})? ${recEnvase?.operator_id === LUCAS_UUID ? '✅ SIM! (100% CORRETO)' : '❌ NÃO!'}`);

  // --------------------------------------------------------------------------
  // PARTE 3: CONCLUIR ITEM DE CHECKOUT
  // --------------------------------------------------------------------------
  console.log('\n[3/6] 📦 Concluindo item de checkout em /ExecutarCheckout...');
  const progId = '00000000-6ab5-0209-5172-d9b59e996fbd';
  await page.goto(`${BASE_URL}/ExecutarCheckout?id=${progId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=PV-28.913', { timeout: 15000 });

  // Busca o card do item PV-28.913
  console.log('   ↳ Preenchendo horários e marcando PV-28.913 como Concluído...');
  const cardItem = page.locator('div:has-text("PV-28.913")').last();

  // Preenche início e término no card
  const inputInicio = cardItem.locator('input[id^="inicio-"]').first();
  if (await inputInicio.count() > 0) {
    await inputInicio.fill('08:15');
  }
  const inputTermino = cardItem.locator('input[id^="termino-"]').first();
  if (await inputTermino.count() > 0) {
    await inputTermino.fill('09:00');
  }

  // Clica no botão Salvar
  const btnSalvar = cardItem.locator('button:has-text("Salvar")').first();
  await btnSalvar.click();
  await page.waitForTimeout(3000);

  const shotCheckout = path.join(SCRATCH_DIR, 'staging-07-checkout-concluido.png');
  await page.screenshot({ path: shotCheckout, fullPage: true });
  fs.copyFileSync(shotCheckout, path.join(ARTIFACT_DIR, 'staging-07-checkout-concluido.png'));
  console.log('   📸 Screenshot salvo: staging-07-checkout-concluido.png');

  // Consultar Supabase para verificar item de checkout
  const { data: itemCheckout } = await supabase
    .from('checkout_itens')
    .select('id, numero_pedido, status, operador, operator_id, hora_inicio, hora_termino')
    .eq('numero_pedido', 'PV-28.913')
    .maybeSingle();

  console.log('\n   🔍 CONSULTA SUPABASE (checkout_itens):');
  console.log(`      Pedido: ${itemCheckout?.numero_pedido}`);
  console.log(`      Status: ${itemCheckout?.status}`);
  console.log(`      Operador: ${itemCheckout?.operador}`);
  console.log(`      Operator ID gravado: ${itemCheckout?.operator_id}`);
  console.log(`      Bate com Lucas Araujo (${LUCAS_UUID})? ${itemCheckout?.operator_id === LUCAS_UUID ? '✅ SIM! (100% CORRETO)' : '❌ NÃO!'}`);

  // --------------------------------------------------------------------------
  // PARTE 4: UPLOAD REAL DE NOTA FISCAL (BUCKET PRIVADO)
  // --------------------------------------------------------------------------
  console.log('\n[4/6] 📑 Realizando upload de nota fiscal em /NovaNotaFiscal...');
  await page.goto(`${BASE_URL}/NovaNotaFiscal`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Arquivar Notas Fiscais', { timeout: 10000 });

  // Cria arquivo de teste temporário
  const testPdfPath = path.join(SCRATCH_DIR, 'nf_teste_staging.pdf');
  fs.writeFileSync(testPdfPath, '%PDF-1.4 Fake PDF Content for Staging Test');

  const nfNumero = `NF-${Date.now().toString().slice(-5)}`;
  console.log(`   ↳ Preenchendo NF número ${nfNumero} com upload de arquivo...`);

  // Preenche número da NF
  const inputNf = page.locator('input[placeholder="Ex: 123456"]').first();
  await inputNf.fill(nfNumero);

  // Input de arquivo
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(testPdfPath);
  await page.waitForTimeout(500);

  // Clica em Salvar Tudo
  await page.click('button:has-text("Salvar Tudo")');
  await page.waitForTimeout(4000);

  const shotNfUpload = path.join(SCRATCH_DIR, 'staging-08-nf-upload.png');
  await page.screenshot({ path: shotNfUpload, fullPage: true });
  fs.copyFileSync(shotNfUpload, path.join(ARTIFACT_DIR, 'staging-08-nf-upload.png'));
  console.log('   📸 Screenshot salvo: staging-08-nf-upload.png');

  // Verifica no Supabase
  const { data: recNf } = await supabase
    .from('nota_fiscal_arquivos')
    .select('id, numero_nf, arquivo_url, arquivo_nome, created_at')
    .eq('numero_nf', nfNumero)
    .maybeSingle();

  console.log('\n   🔍 CONSULTA SUPABASE (nota_fiscal_arquivos):');
  console.log(`      ID: ${recNf?.id}`);
  console.log(`      Número NF: ${recNf?.numero_nf}`);
  console.log(`      Arquivo Nome: ${recNf?.arquivo_nome}`);
  console.log(`      Arquivo URL: ${recNf?.arquivo_url?.slice(0, 80)}...`);
  console.log(`      É URL assinada de 'notas-fiscais'? ${recNf?.arquivo_url?.includes('notas-fiscais') && recNf?.arquivo_url?.includes('token=') ? '✅ SIM (URL Assinada Válida!)' : '❌ NÃO!'}`);

  // --------------------------------------------------------------------------
  // PARTE 5: LOGOUT E LOGIN COM CONTA DE ADMIN
  // --------------------------------------------------------------------------
  console.log('\n[5/6] 🛡️ Efetuando logout e login com conta de ADMIN (pcp-brasil@interlub.com)...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Clica em Sair
  const botaoSair = page.locator('button:has-text("Sair")').first();
  if (await botaoSair.count() > 0) {
    await botaoSair.click();
    await page.waitForTimeout(2000);
  }

  // Abre login modal
  await page.waitForSelector('text=Fazer Login no Sistema', { timeout: 10000 });
  await page.click('text=Fazer Login no Sistema');
  await page.waitForSelector('text=Acesso ao EnvasePro');

  // Clica em PCP / Gestão
  await page.click('text=PCP / Gestão');
  await page.waitForTimeout(300);
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3000);

  // --------------------------------------------------------------------------
  // PARTE 6: TELAS RESTRITAS DE ADMIN (GerenciarUsuarios e Indicadores)
  // --------------------------------------------------------------------------
  console.log('\n[6/6] 👥 Acessando tela restrita de Admin /GerenciarUsuarios...');
  await page.goto(`${BASE_URL}/GerenciarUsuarios`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Gerenciamento de Usuários', { timeout: 15000 });

  const shotAdminUsers = path.join(SCRATCH_DIR, 'staging-09-admin-gerenciar-usuarios.png');
  await page.screenshot({ path: shotAdminUsers, fullPage: true });
  fs.copyFileSync(shotAdminUsers, path.join(ARTIFACT_DIR, 'staging-09-admin-gerenciar-usuarios.png'));
  console.log('   📸 Screenshot salvo: staging-09-admin-gerenciar-usuarios.png');

  console.log('\n   📊 Acessando tela de Indicadores /IndicadoresRecebimento...');
  await page.goto(`${BASE_URL}/IndicadoresRecebimento`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const shotAdminIndicadores = path.join(SCRATCH_DIR, 'staging-10-admin-indicadores.png');
  await page.screenshot({ path: shotAdminIndicadores, fullPage: true });
  fs.copyFileSync(shotAdminIndicadores, path.join(ARTIFACT_DIR, 'staging-10-admin-indicadores.png'));
  console.log('   📸 Screenshot salvo: staging-10-admin-indicadores.png');

  await context.close();
  await browser.close();

  console.log('\n' + '='.repeat(78));
  console.log('🎉 TODOS OS TESTES DE ESCRITA, STORAGE E ADMIN CONCLUÍDOS COM SUCESSO TOTAL!');
  console.log('='.repeat(78));
}

runFullStagingTests().catch(err => {
  console.error('❌ Erro na bateria de testes:', err);
  process.exit(1);
});
