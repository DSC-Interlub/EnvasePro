import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { enforceNonProductionGuard } from './lib/db-guard.js';

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-functional-audit');

// Carrega .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      process.env[key.trim()] = vals.join('=').trim();
    }
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.APP_BASE_URL || 'https://envase-pro.vercel.app';
const ARTIFACT_DIR = 'C:\\Users\\kauan.pereira\\.gemini\\antigravity\\brain\\17e52817-9948-4001-b5fb-875daf584a4c';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function createSamplePngBuffer() {
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return Buffer.from(base64Png, 'base64');
}

async function runDefinitiveFunctionalAudit() {
  console.log('='.repeat(78));
  console.log('🚀 AUDITORIA FUNCIONAL DEFINITIVA: 8 TELAS OPERACIONAIS COM ESCRITA REAL');
  console.log(`🌐 Target: ${BASE_URL}`);
  console.log('='.repeat(78));

  const tmpImgPath = path.resolve(process.cwd(), 'temp-qa-test.png');
  fs.writeFileSync(tmpImgPath, createSamplePngBuffer());

  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('Erro') || msg.text().includes('atualizarRoleUsuario')) {
      console.log(`      [PAGE CONSOLE ${msg.type()}]:`, msg.text());
    }
  });

  // LOGIN ADMIN
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
  const adminPass = process.env.TEST_ADMIN_PASSWORD;
  if (!adminPass) {
    console.error('❌ ERRO: TEST_ADMIN_PASSWORD é obrigatório no ambiente (.env.local).');
    process.exit(1);
  }

  console.log(`\n[LOGIN] 🔑 Efetuando login como Admin (${adminEmail})...`);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Fazer Login no Sistema', { timeout: 15000 });
  await page.click('text=Fazer Login no Sistema');
  await page.waitForSelector('text=Acesso ao EnvasePro');
  await page.fill('input#email', adminEmail);
  await page.fill('input#password', adminPass);
  await page.click('button[type="submit"]:has-text("Entrar no Sistema")');
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    localStorage.setItem('envase_current_operator', JSON.stringify({
      id: '00000000-6ab3-bf2e-9a60-d918e4ed058b',
      nome: 'Lucas Araujo'
    }));
  });

  try {
    const opVisible = await page.locator('text=Quem é você hoje?').isVisible({ timeout: 3000 });
    if (opVisible) {
      await page.locator('text=Lucas Araujo').first().click({ force: true });
      await page.waitForTimeout(2000);
    }
  } catch {}
  console.log('   ✓ Logado com sucesso.');

  const results = {};

  // --------------------------------------------------------------------------
  // TELA 1: /NovoRegistro - Criar registro de envase completo
  // --------------------------------------------------------------------------
  console.log('\n[TELA 1/8] 📝 /NovoRegistro - Criando registro de envase completo...');
  try {
    await page.goto(`${BASE_URL}/NovoRegistro`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const testOp = `OP-QA-${Date.now().toString().slice(-6)}`;
    console.log(`   ↳ Preenchendo formulário com OP: ${testOp}`);

    const salaSelect = page.locator('button:has-text("Selecione a sala")').first();
    if (await salaSelect.count() > 0) {
      await salaSelect.click();
      await page.waitForTimeout(300);
      await page.locator('[role="option"]:has-text("Bio")').first().click();
    }

    await page.fill('input#op', testOp);
    await page.fill('input#codigo_produto', 'IVP074808060');
    await page.waitForTimeout(1000);
    await page.fill('input#quantidade_produzida', '150');
    await page.fill('input#inicio', '08:00');
    await page.fill('input#termino', '09:30');
    await page.fill('textarea#observacoes', 'Registro criado durante auditoria funcional automatizada QA');

    await page.locator('button:has-text("Finalizar Registro")').first().click();
    await page.waitForTimeout(4000);

    const shot1 = path.join(ARTIFACT_DIR, 'staging-13-novoregistro-criado.png');
    await page.screenshot({ path: shot1, fullPage: true });
    console.log(`   📸 Screenshot salvo: staging-13-novoregistro-criado.png`);

    const { data: dbEnvases } = await supabase
      .from('envase_records')
      .select('*')
      .eq('op', testOp)
      .order('created_at', { ascending: false })
      .limit(1);

    const dbEnvase = dbEnvases?.[0];
    console.log(`   ✅ Registro gravado no banco: ID=${dbEnvase.id}, Protocolo=${dbEnvase.protocolo}, Qtd=${dbEnvase.quantidade_produzida}`);
    results.novoRegistro = { success: !!dbEnvase, record: dbEnvase };
  } catch (err) {
    console.error('   ❌ Falha na tela NovoRegistro:', err.message);
    results.novoRegistro = { success: false, error: err.message };
  }

  // --------------------------------------------------------------------------
  // TELA 2: /ExecutarCheckout - Iniciar, pausar e concluir item
  // --------------------------------------------------------------------------
  console.log('\n[TELA 2/8] 🛒 /ExecutarCheckout - Iniciar, pausar e concluir item...');
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const testPedido = `PED-QA-${Date.now().toString().slice(-5)}`;

    const { data: progCheck } = await supabase
      .from('checkout_programacoes')
      .insert({
        data_programada: hoje,
        total_pedidos: 1,
        pedidos_concluidos: 0,
        status: 'Pendente'
      })
      .select()
      .single();

    const { data: itemCheck } = await supabase
      .from('checkout_itens')
      .insert({
        programacao_id: progCheck.id,
        numero_pedido: testPedido,
        cliente: 'CLIENTE TESTE AUDITORIA QA',
        data_entrega: hoje,
        status: 'Pendente',
        operador: 'Lucas Araujo',
        critico: true
      })
      .select()
      .single();

    console.log(`   ↳ Criado item no banco: ${itemCheck.id} (${testPedido})`);
    await page.goto(`${BASE_URL}/ExecutarCheckout?id=${progCheck.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const itemCard = page.locator('div.border-slate-200.shadow-lg').filter({ hasText: testPedido });
    await itemCard.waitFor({ timeout: 10000 });

    // 1. Iniciar timer (Play)
    console.log('   ↳ Acionando botão Iniciar (Play)...');
    const playBtn = itemCard.locator('button.bg-green-600').first();
    await playBtn.click();
    await page.waitForTimeout(2500);

    const shot2 = path.join(ARTIFACT_DIR, 'staging-14-checkout-em-andamento.png');
    await page.screenshot({ path: shot2 });
    console.log(`   📸 Screenshot salvo: staging-14-checkout-em-andamento.png`);

    // 2. Reabrir edição dentro do card do item
    console.log('   ↳ Clicando em Editar no card do item...');
    const editBtn = itemCard.locator('button:has-text("Editar")').first();
    await editBtn.click();
    await page.waitForTimeout(1000);

    // Editar observação
    const obsInput = itemCard.locator('textarea').first();
    if (await obsInput.count() > 0) {
      await obsInput.fill('Item inspecionado - pausa preventiva de etiqueta');
      await page.waitForTimeout(500);
    }

    // 3. Concluir (Stop)
    console.log('   ↳ Acionando botão Concluir (Stop)...');
    const stopBtn = itemCard.locator('button.bg-red-600').first();
    await stopBtn.click();
    await page.waitForTimeout(3000);

    const shot3 = path.join(ARTIFACT_DIR, 'staging-15-checkout-concluido.png');
    await page.screenshot({ path: shot3 });
    console.log(`   📸 Screenshot salvo: staging-15-checkout-concluido.png`);

    const { data: dbItem } = await supabase
      .from('checkout_itens')
      .select('*')
      .eq('id', itemCheck.id)
      .single();

    console.log(`   ✅ Status no banco: ${dbItem.status}, Início: ${dbItem.hora_inicio}, Término: ${dbItem.hora_termino}`);
    results.executarCheckout = { success: dbItem.status === 'Concluído', record: dbItem };
  } catch (err) {
    console.error('   ❌ Falha na tela ExecutarCheckout:', err.message);
    results.executarCheckout = { success: false, error: err.message };
  }

  // --------------------------------------------------------------------------
  // TELA 3: /ExecutarEmpilha - Fluxo completo de assinatura (operador, ajudante, líder)
  // --------------------------------------------------------------------------
  console.log('\n[TELA 3/8] 🏗️ /ExecutarEmpilha - Fluxo completo de assinaturas...');
  try {
    const hoje = new Date().toISOString().split('T')[0];

    // Cria empilhadeira se não existir
    const empId = '11111111-2222-3333-4444-555555555555';
    await supabase.from('empilhadeira_configs').upsert({
      id: empId,
      nome: 'Empilhadeira Eletrica 01',
      tag: 'EMP-01',
      ativo: true
    });

    const { data: progEmp, error: errProg } = await supabase
      .from('empilha_programacoes')
      .insert({
        data_programada: hoje,
        empilhadeira_id: empId,
        total_linhas: 1,
        linhas_concluidas: 0,
        status: 'Pendente'
      })
      .select()
      .single();
    if (errProg) throw errProg;

    const { data: linhaEmp, error: errLinha } = await supabase
      .from('empilha_linhas')
      .insert({
        programacao_id: progEmp.id,
        tipo_linha: 'Normal',
        codigo_produto: 'IVP074808060',
        descricao_produto: 'Aliplex p 515 (QA Test)',
        deposito: 'DEP-01',
        rua_torre: 'RUA B - 02',
        quantidade: 20,
        status: 'Em Andamento',
        hora_inicio: '08:00:00',
        operador_empilhadeira: 'Lucas Araujo',
        operador_empilhadeira_id: '00000000-6ab3-bf2e-9a60-d918e4ed058b',
        operador_ajudante: 'Operador Teste Funcional QA'
      })
      .select()
      .single();
    if (errLinha) throw errLinha;

    console.log(`   ↳ Criada linha no banco: ${linhaEmp.id}`);
    await page.goto(`${BASE_URL}/ExecutarEmpilha?id=${progEmp.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Finalizar linha para abrir fluxo de assinatura
    console.log('   ↳ Clicando no botão Finalizar da linha...');
    await page.locator('button:has-text("Finalizar")').first().click();
    await page.waitForTimeout(1000);

    // Modal de Assinaturas
    await page.waitForSelector('text=Assinatura do Operador', { timeout: 10000 });

    // 1. Operador
    console.log('   ↳ Assinatura Etapa 1 (Operador)...');
    const selectOperador = page.locator('div[role="dialog"] button[role="combobox"]').first();
    await selectOperador.click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]:has-text("Lucas Araujo")').first().click();
    await page.waitForTimeout(300);
    await page.locator('div[role="dialog"] input[type="checkbox"]').first().click();
    await page.locator('button:has-text("Confirmar e continuar")').first().click();
    await page.waitForTimeout(1500);

    // 2. Ajudante
    console.log('   ↳ Assinatura Etapa 2 (Ajudante)...');
    await page.waitForSelector('text=Etapa 2 de 3 — Assinatura do Ajudante', { timeout: 10000 });
    const selectAjudante = page.locator('div[role="dialog"] button[role="combobox"]').first();
    if (await selectAjudante.count() > 0) {
      await selectAjudante.click();
      await page.waitForTimeout(300);
      await page.locator('[role="option"]').first().click();
      await page.waitForTimeout(300);
    }
    await page.locator('div[role="dialog"] input[type="checkbox"]').first().click({ force: true });
    await page.locator('button.bg-blue-600:has-text("Confirmar e continuar")').first().dispatchEvent('click');
    await page.waitForTimeout(1500);

    // 3. Líder
    console.log('   ↳ Assinatura Etapa 3 (Líder)...');
    await page.waitForSelector('text=Etapa Final — Assinatura do Líder', { timeout: 10000 });
    const selectLider = page.locator('div[role="dialog"] button[role="combobox"]').first();
    if (await selectLider.count() > 0) {
      await selectLider.click({ force: true });
      await page.waitForTimeout(300);
      await page.locator('[role="option"]').first().click({ force: true });
      await page.waitForTimeout(300);
    }
    await page.locator('div[role="dialog"] input[type="checkbox"]').first().click({ force: true });
    await page.locator('button:has-text("Assinar como Líder")').first().dispatchEvent('click');
    await page.waitForTimeout(3500);

    const shot4 = path.join(ARTIFACT_DIR, 'staging-16-empilha-concluido-assinado.png');
    await page.screenshot({ path: shot4 });
    console.log(`   📸 Screenshot salvo: staging-16-empilha-concluido-assinado.png`);

    const { data: dbLinha } = await supabase
      .from('empilha_linhas')
      .select('*')
      .eq('id', linhaEmp.id)
      .single();

    console.log(`   ✅ Assinaturas no banco: Operador=${dbLinha.assinatura_operador}, Ajudante=${dbLinha.assinatura_ajudante}, Líder=${dbLinha.assinatura_lider}, Status=${dbLinha.status_assinatura}`);
    results.executarEmpilha = {
      success: dbLinha.assinatura_operador && dbLinha.assinatura_ajudante && dbLinha.assinatura_lider,
      record: dbLinha
    };
  } catch (err) {
    console.error('   ❌ Falha na tela ExecutarEmpilha:', err.message);
    results.executarEmpilha = { success: false, error: err.message };
  }

  // --------------------------------------------------------------------------
  // TELA 4: /ExecutarRecebimento - Pausar, Retomar, Finalizar e Assinatura
  // --------------------------------------------------------------------------
  console.log('\n[TELA 4/8] 🚚 /ExecutarRecebimento - Pausa, Retomada, Finalização e Assinaturas...');
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const testDoc = `DOC-QA-${Date.now().toString().slice(-5)}`;

    const { data: opRow } = await supabase.from('operators').select('id, nome').eq('ativo', true).limit(1).single();
    const opId = opRow?.id;
    const opNome = opRow?.nome || 'Lucas Araujo';

    const { data: recDb } = await supabase
      .from('recebimentos')
      .insert({
        tipo: 'Nacional',
        numero_documento: testDoc,
        numero_nf: '998877',
        data_chegada: hoje,
        status: 'Em andamento',
        prioridade: 'Normal',
        datetime_inicio: new Date().toISOString(),
        coordenador_nome: opNome
      })
      .select()
      .single();

    const { data: partDb } = await supabase
      .from('recebimento_participantes')
      .insert({
        recebimento_id: recDb.id,
        operator_id: opId,
        operator_nome: opNome,
        funcao: 'Coordenador',
        assinou: false
      })
      .select()
      .single();

    const { data: itemRecDb } = await supabase
      .from('recebimento_itens')
      .insert({
        recebimento_id: recDb.id,
        produto_codigo: 'IVP074808060',
        produto_descricao: 'Aliplex p 515 (QA Recebimento)',
        quantidade_prevista: 100,
        quantidade_recebida: 100,
        unidade: 'KG',
        status_item: 'Conferido OK'
      })
      .select()
      .single();

    console.log(`   ↳ Criado recebimento: ${recDb.id}, participante: ${partDb?.id}, item: ${itemRecDb?.id}`);
    await page.goto(`${BASE_URL}/ExecutarRecebimento?id=${recDb.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 1. Pausar
    console.log('   ↳ Clicando em Pausar...');
    await page.locator('button:has-text("Pausar")').click();
    await page.waitForTimeout(1500);

    // 2. Retomar
    console.log('   ↳ Clicando em Retomar...');
    await page.locator('button:has-text("Retomar")').click();
    await page.waitForTimeout(1500);

    // 3. Finalizar
    console.log('   ↳ Clicando em Finalizar...');
    await page.locator('button:has-text("Finalizar")').click();
    await page.waitForTimeout(2000);

    // 4. Modal de Assinaturas
    const modalDialog = page.locator('div[role="dialog"]');
    await modalDialog.waitFor({ state: 'visible', timeout: 10000 });
    console.log('   ↳ Assinando participante no modal...');
    await modalDialog.locator('button:has-text("Assinar")').first().click();
    await page.waitForTimeout(500);

    // Checkbox do participante
    const checkPart = modalDialog.locator('input[type="checkbox"], button[role="checkbox"]').first();
    await checkPart.click();
    await page.waitForTimeout(300);
    await modalDialog.locator('button:has-text("Confirmar")').first().click();
    await page.waitForTimeout(2500);

    // Etapa Líder
    console.log('   ↳ Assinando como Líder...');
    const assinarLiderBtn = modalDialog.locator('button:has-text("Assinar como Líder")').first();
    await assinarLiderBtn.click();
    await page.waitForTimeout(2500);

    const shot5 = path.join(ARTIFACT_DIR, 'staging-17-recebimento-finalizado-assinado.png');
    await page.screenshot({ path: shot5 });
    console.log(`   📸 Screenshot salvo: staging-17-recebimento-finalizado-assinado.png`);

    const { data: dbRec } = await supabase.from('recebimentos').select('*').eq('id', recDb.id).single();
    console.log(`   ✅ Recebimento no banco: Status=${dbRec.status}, AssinaturaCoord=${dbRec.assinatura_coordenador}, AssinaturaLider=${dbRec.assinatura_lider}`);
    results.executarRecebimento = {
      success: dbRec.status === 'Concluído' && dbRec.assinatura_coordenador && dbRec.assinatura_lider,
      record: dbRec,
      itemConferido: itemRecDb
    };
  } catch (err) {
    console.error('   ❌ Falha na tela ExecutarRecebimento:', err.message);
    results.executarRecebimento = { success: false, error: err.message };
  }

  // --------------------------------------------------------------------------
  // TELA 5: /Operadores - Upload de foto no bucket fotos-operadores
  // --------------------------------------------------------------------------
  console.log('\n[TELA 5/8] 👤 /Operadores - Cadastro de operador e upload no bucket fotos-operadores...');
  try {
    await page.goto(`${BASE_URL}/Operadores`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const testMatricula = `QA-${Date.now().toString().slice(-4)}`;
    console.log(`   ↳ Criando operador com matrícula: ${testMatricula}`);

    await page.locator('button:has-text("Novo Operador")').first().click();
    await page.waitForSelector('text=Nome Completo *', { timeout: 10000 });

    await page.fill('input#nome', 'Operador Teste Funcional QA');
    await page.fill('input#matricula', testMatricula);

    const salaSelect = page.locator('button:has-text("Selecione a sala")').first();
    if (await salaSelect.count() > 0) {
      await salaSelect.click();
      await page.waitForTimeout(300);
      await page.locator('[role="option"]:has-text("Bio")').first().click();
    }

    console.log('   ↳ Realizando upload de arquivo de foto no bucket fotos-operadores...');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(tmpImgPath);
    await page.waitForTimeout(3000);

    const shot6 = path.join(ARTIFACT_DIR, 'staging-18-operador-foto-upload.png');
    await page.screenshot({ path: shot6 });
    console.log(`   📸 Screenshot salvo: staging-18-operador-foto-upload.png`);

    await page.locator('button[type="submit"]:has-text("Salvar")').first().click();
    await page.waitForTimeout(3500);

    const { data: dbOp } = await supabase
      .from('operators')
      .select('*')
      .eq('matricula', testMatricula)
      .single();

    console.log(`   ✅ Operador no banco: ${dbOp.nome}, Foto URL: ${dbOp.foto_url}`);
    results.operadores = {
      success: !!dbOp && dbOp.foto_url && dbOp.foto_url.includes('fotos-operadores'),
      record: dbOp
    };
  } catch (err) {
    console.error('   ❌ Falha na tela Operadores:', err.message);
    results.operadores = { success: false, error: err.message };
  }

  // --------------------------------------------------------------------------
  // TELA 6: /NovaNotaFiscal - Upload no bucket notas-fiscais e Signed URL
  // --------------------------------------------------------------------------
  console.log('\n[TELA 6/8] 📄 /NovaNotaFiscal - Upload no bucket notas-fiscais e visualização com Signed URL...');
  try {
    await page.goto(`${BASE_URL}/NovaNotaFiscal`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const testNfNum = `NF-QA-${Date.now().toString().slice(-5)}`;
    console.log(`   ↳ Fazendo upload de NF: ${testNfNum}`);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(tmpImgPath);
    await page.waitForTimeout(2000);

    const shot7 = path.join(ARTIFACT_DIR, 'staging-19-novanotafiscal-upload.png');
    await page.screenshot({ path: shot7 });
    console.log(`   📸 Screenshot salvo: staging-19-novanotafiscal-upload.png`);

    const nfInput = page.locator('input[placeholder="Ex: 123456"]').first();
    await nfInput.fill(testNfNum);
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Salvar")').first().click();
    await page.waitForTimeout(4000);

    const { data: dbNf } = await supabase
      .from('nota_fiscal_arquivos')
      .select('*')
      .eq('numero_nf', testNfNum)
      .single();

    console.log(`   ✅ NF no banco: ID=${dbNf.id}, arquivo_url=${dbNf.arquivo_url}`);

    // Abrir detalhe da NF
    console.log(`   ↳ Acessando /NotaFiscalDetalhe?id=${dbNf.id}...`);
    await page.goto(`${BASE_URL}/NotaFiscalDetalhe?id=${dbNf.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const shot8 = path.join(ARTIFACT_DIR, 'staging-20-notafiscal-detalhe-signed.png');
    await page.screenshot({ path: shot8 });
    console.log(`   📸 Screenshot salvo: staging-20-notafiscal-detalhe-signed.png`);

    results.novaNotaFiscal = {
      success: !!dbNf && !dbNf.arquivo_url.startsWith('http') && !dbNf.arquivo_url.includes('?token='),
      record: dbNf
    };
  } catch (err) {
    console.error('   ❌ Falha na tela NovaNotaFiscal:', err.message);
    results.novaNotaFiscal = { success: false, error: err.message };
  }

  // --------------------------------------------------------------------------
  // TELA 7: /NovoChecklist - Preenchimento e cálculo automático de nota_final
  // --------------------------------------------------------------------------
  console.log('\n[TELA 7/8] 📋 /NovoChecklist - Preenchimento e cálculo automático de nota_final...');
  try {
    await page.goto(`${BASE_URL}/NovoChecklist`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const testPcNum = `PC-QA-${Date.now().toString().slice(-5)}`;
    console.log(`   ↳ Preenchendo checklist com pedido: ${testPcNum}`);

    // Pedido disponível etapa 5
    await page.locator('button:has-text("Sim")').first().click();
    await page.waitForTimeout(300);

    // Preenche pedido e dispara blur para busca SAP resolver
    const inputPedido = page.locator('input[placeholder="Ex: 4500012345"]');
    await inputPedido.fill(testPcNum);
    await inputPedido.blur();
    await page.waitForTimeout(2000);

    // Preenche fornecedor e datas
    await page.fill('input[placeholder="Nome do fornecedor"]', 'FORNECEDOR QUÍMICO QA LTDA');
    await page.fill('textarea[placeholder="Descreva o material recebido"]', 'Óleo básico mineral de alta viscosidade para teste QA');

    const hoje = new Date().toISOString().split('T')[0];
    await page.locator('input[type="date"]').first().fill(hoje);
    await page.locator('input[type="date"]').nth(1).fill(hoje);

    // Entrega conforme prevista (segundo grupo de Sim/Não)
    const botoesSim = page.locator('button:has-text("Sim")');
    if (await botoesSim.count() > 1) {
      await botoesSim.nth(1).click();
    }

    // Inspetor
    const inspetorBtn = page.locator('button:has-text("Lucas Araujo")').first();
    if (await inspetorBtn.count() > 0) await inspetorBtn.click();

    // NF
    await page.fill('input[placeholder="Nº NF"]', 'NF-CHECK-999');

    // Material de Recebimento via trigger Radix
    console.log('   ↳ Selecionando Material de Recebimento...');
    const matTrigger = page.locator('div:has(> label:has-text("Material de Recebimento")) button[role="combobox"]').first();
    await matTrigger.click();
    await page.waitForTimeout(500);
    await page.locator('[role="option"]:has-text("Spray")').first().click();
    await page.waitForTimeout(300);

    // Quantidade Recebida
    await page.fill('input[placeholder="0"]', '200');

    // Unidade de Medida via trigger Radix
    console.log('   ↳ Selecionando Unidade de Medida...');
    const unTrigger = page.locator('div:has(> label:has-text("Unidade de Medida")) button[role="combobox"]').first();
    await unTrigger.click();
    await page.waitForTimeout(500);
    await page.locator('[role="option"]:has-text("KG")').first().click();
    await page.waitForTimeout(300);

    // Lote
    await page.fill('input[placeholder="Lote"]', 'LOT-QA-200');

    // Perguntas de Qualidade: clicar em todas as opções "Sim"
    const todasPerguntasSim = page.locator('button:has-text("Sim")');
    const totalSim = await todasPerguntasSim.count();
    console.log(`   ↳ Marcando todas as opções Sim (${totalSim} encontradas)...`);
    for (let i = 0; i < totalSim; i++) {
      try {
        await todasPerguntasSim.nth(i).click({ timeout: 500 });
      } catch {}
    }

    await page.waitForTimeout(1000);

    console.log('   ↳ Clicando em "Enviar Checklist"...');
    await page.locator('button:has-text("Enviar Checklist")').click();
    await page.waitForTimeout(3500);

    const shot9 = path.join(ARTIFACT_DIR, 'staging-21-checklist-salvo.png');
    await page.screenshot({ path: shot9 });
    console.log(`   📸 Screenshot salvo: staging-21-checklist-salvo.png`);

    const { data: dbCheckList } = await supabase
      .from('checklist_recebimentos')
      .select('*')
      .eq('numero_pedido_compras', testPcNum)
      .limit(1);

    const dbChk = dbCheckList?.[0];
    console.log(`   ✅ Checklist no banco: ID=${dbChk?.id}, NotaFinal=${dbChk?.nota_final}, TotalSim=${dbChk?.total_sim}, Protocolo=${dbChk?.numero_checklist}`);
    results.novoChecklist = {
      success: !!dbChk && dbChk.nota_final > 0,
      record: dbChk
    };
  } catch (err) {
    console.error('   ❌ Falha na tela NovoChecklist:', err.message);
    results.novoChecklist = { success: false, error: err.message };
  }

  // --------------------------------------------------------------------------
  // TELA 8: /GerenciarUsuarios - Promover e rebaixar role
  // --------------------------------------------------------------------------
  console.log('\n[TELA 8/8] 👥 /GerenciarUsuarios - Promover e rebaixar role...');
  try {
    const targetEmail = 'tv-fabrica@interlub.com';
    await page.goto(`${BASE_URL}/GerenciarUsuarios`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    console.log(`   ↳ Localizando linha do usuário ${targetEmail}...`);
    const userRow = page.locator('div.divide-y > div').filter({ hasText: targetEmail });
    await userRow.waitFor({ timeout: 5000 });

    // 1. Promover para Admin
    console.log('   ↳ Clicando em Alterar role (promovendo para Admin)...');
    await userRow.locator('button:has-text("Alterar role")').click();
    await page.waitForTimeout(500);

    const modalDialog = page.locator('div[role="dialog"]');
    await modalDialog.waitFor({ state: 'visible', timeout: 5000 });
    await modalDialog.locator('button:has-text("Confirmar")').click();
    await modalDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(2000);

    const shot10 = path.join(ARTIFACT_DIR, 'staging-22-usuario-promovido-admin.png');
    await page.screenshot({ path: shot10 });
    console.log(`   📸 Screenshot salvo: staging-22-usuario-promovido-admin.png`);

    const { data: profileAdmin } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', targetEmail)
      .single();

    console.log(`   ✅ Role no banco após promoção: ${profileAdmin.role}`);

    // 2. Rebaixar de volta para Operador
    console.log('   ↳ Clicando novamente em Alterar role (rebaixando para Operador)...');
    await userRow.locator('button:has-text("Alterar role")').click();
    await page.waitForTimeout(500);

    await modalDialog.waitFor({ state: 'visible', timeout: 5000 });
    await modalDialog.locator('button:has-text("Confirmar")').click();
    await modalDialog.waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(2000);

    const shot11 = path.join(ARTIFACT_DIR, 'staging-23-usuario-rebaixado-operator.png');
    await page.screenshot({ path: shot11 });
    console.log(`   📸 Screenshot salvo: staging-23-usuario-rebaixado-operator.png`);

    const { data: profileOperator } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', targetEmail)
      .single();

    console.log(`   ✅ Role no banco após rebaixamento: ${profileOperator.role}`);

    results.gerenciarUsuarios = {
      success: profileAdmin.role === 'admin' && profileOperator.role === 'operator',
      adminRole: profileAdmin.role,
      finalRole: profileOperator.role
    };
  } catch (err) {
    console.error('   ❌ Falha na tela GerenciarUsuarios:', err.message);
    results.gerenciarUsuarios = { success: false, error: err.message };
  }

  // FINALIZAÇÃO
  if (fs.existsSync(tmpImgPath)) fs.unlinkSync(tmpImgPath);
  await browser.close();

  console.log('\n' + '='.repeat(78));
  console.log('📊 RESUMO DA AUDITORIA FUNCIONAL DAS 8 TELAS');
  console.log('='.repeat(78));
  console.log(JSON.stringify(results, null, 2));

  return results;
}

runDefinitiveFunctionalAudit().catch(console.error);
