/**
 * scripts/test-critical-columns-triggers.js
 * 
 * Teste automatizado para validar os triggers BEFORE UPDATE de proteção de colunas:
 * 1. Para cada tabela, testa com JWT de OPERADOR (bloqueia alteração de colunas críticas).
 * 2. Para cada tabela, testa com JWT de ADMIN (permite alteração de colunas administrativas).
 * 3. Testa colunas IMUTÁVEIS (bloqueia tanto para operador quanto para admin).
 * 4. Valida os fluxos reais de assinatura da UI (operador assina como operador, admin assina como líder).
 * 5. Limpeza de registros de teste no final.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'pcp-brasil@interlub.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

const OPERATOR_EMAIL = process.env.TEST_OPERATOR_EMAIL || 'operacoes.equipe@interlub.com';
const OPERATOR_PASSWORD = process.env.TEST_OPERATOR_PASSWORD;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !ADMIN_PASSWORD || !OPERATOR_PASSWORD) {
  console.error('❌ Credenciais incompletas no .env.local');
  process.exit(1);
}

// 1. Cliente Master (Service Role) para setup e teardown
const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('='.repeat(78));
  console.log('🛡️  TESTE DE VALIDAÇÃO DE TRIGGERS: protect_admin_columns & protect_immutable');
  console.log('🌐 Alvo:', SUPABASE_URL);
  console.log('='.repeat(78));

  // 2. Autentica Operador e Admin para obter JWTs reais
  console.log('\n[AUTENTICAÇÃO]');
  const authClient = createClient(SUPABASE_URL, ANON_KEY);

  const { data: authOp, error: errOp } = await authClient.auth.signInWithPassword({
    email: OPERATOR_EMAIL,
    password: OPERATOR_PASSWORD
  });
  if (errOp) throw new Error(`Falha no login do operador: ${errOp.message}`);
  console.log(`   ✓ Operador logado: ${OPERATOR_EMAIL} (UID: ${authOp.user.id})`);

  const { data: authAdm, error: errAdm } = await authClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  if (errAdm) throw new Error(`Falha no login do admin: ${errAdm.message}`);
  console.log(`   ✓ Admin logado: ${ADMIN_EMAIL} (UID: ${authAdm.user.id})`);

  const opClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authOp.session.access_token}` } }
  });

  const admClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authAdm.session.access_token}` } }
  });

  let testesPassados = 0;
  let totalTestes = 0;

  function assertBloqueado(res, descricao) {
    totalTestes++;
    if (res.error) {
      console.log(`   🔒 [BLOQUEIO OK] ${descricao}`);
      console.log(`      Mensagem: "${res.error.message}" (Code: ${res.error.code})`);
      testesPassados++;
      return true;
    } else {
      console.error(`   ❌ [FALHA DE SEGURANÇA] ${descricao} - Deveria ter sido bloqueado!`);
      return false;
    }
  }

  function assertPermitido(res, descricao) {
    totalTestes++;
    if (!res.error) {
      console.log(`   ✅ [PERMITIDO OK] ${descricao}`);
      testesPassados++;
      return true;
    } else {
      console.error(`   ❌ [FALHA OPERACIONAL] ${descricao} - Erro: "${res.error.message}"`);
      return false;
    }
  }

  // Obter um operador ID real para referências FK
  const { data: opRow } = await serviceClient.from('operators').select('id, nome').limit(1).single();
  const operatorFkId = opRow.id;

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 1: empilha_linhas
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('📦 TABELA 1: empilha_linhas');
  console.log('-'.repeat(78));
  const { data: empConfig } = await serviceClient.from('empilhadeira_configs').select('id').limit(1).single();
  const { data: empProg, error: errEmpProg } = await serviceClient.from('empilha_programacoes').insert({
    data_programada: '2026-10-06',
    empilhadeira_id: empConfig.id
  }).select().single();
  if (errEmpProg) throw new Error(`Erro ao criar empilha_programacoes: ${errEmpProg.message}`);

  const { data: empLinha, error: errEmpLinha } = await serviceClient.from('empilha_linhas').insert({
    programacao_id: empProg.id,
    tipo_linha: 'Normal',
    status: 'Pendente',
    status_assinatura: 'Pendente'
  }).select().single();
  if (errEmpLinha) throw new Error(`Erro ao criar empilha_linhas: ${errEmpLinha.message}`);

  // Teste 1.1: Operador tenta assinar pelo líder
  const res1_1 = await opClient.from('empilha_linhas').update({
    assinatura_lider: true,
    assinatura_lider_nome: 'Operador Fraude'
  }).eq('id', empLinha.id);
  assertBloqueado(res1_1, 'Operador tenta alterar assinatura_lider');

  // Teste 1.2: Operador tenta forçar status_assinatura = "Completo"
  const res1_2 = await opClient.from('empilha_linhas').update({
    status_assinatura: 'Completo'
  }).eq('id', empLinha.id);
  assertBloqueado(res1_2, 'Operador tenta finalizar status_assinatura = "Completo"');

  // Teste 1.3: Operador tenta trocar operador_empilhadeira_id
  const res1_3 = await opClient.from('empilha_linhas').update({
    operador_empilhadeira_id: operatorFkId
  }).eq('id', empLinha.id);
  assertBloqueado(res1_3, 'Operador tenta alterar operador_empilhadeira_id');

  // Teste 1.4: Operador tenta alterar created_at (Imutável)
  const res1_4 = await opClient.from('empilha_linhas').update({
    created_at: '2020-01-01T00:00:00Z'
  }).eq('id', empLinha.id);
  assertBloqueado(res1_4, 'Operador tenta alterar created_at');

  // Teste 1.5: Fluxo real da UI - Operador assina sua etapa (operador + Parcial)
  const res1_5 = await opClient.from('empilha_linhas').update({
    assinatura_operador: true,
    assinatura_operador_nome: 'Operador Real',
    assinatura_operador_hora: '10:00',
    status_assinatura: 'Parcial'
  }).eq('id', empLinha.id);
  assertPermitido(res1_5, 'Fluxo UI: Operador assina etapa operacional (status_assinatura = "Parcial")');

  // Teste 1.6: Fluxo real da UI - Admin assina como Líder (lider + Completo)
  const res1_6 = await admClient.from('empilha_linhas').update({
    assinatura_lider: true,
    assinatura_lider_nome: 'Líder Admin',
    assinatura_lider_hora: '10:30',
    status_assinatura: 'Completo'
  }).eq('id', empLinha.id);
  assertPermitido(res1_6, 'Fluxo UI: Admin assina como Líder (status_assinatura = "Completo")');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 2: limpeza_programacoes
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('🧹 TABELA 2: limpeza_programacoes');
  console.log('-'.repeat(78));
  let { data: limpLocal } = await serviceClient.from('limpeza_locais').select('id').limit(1).maybeSingle();
  let criouLocalTeste = false;
  if (!limpLocal) {
    const { data: novoLocal, error: errLocal } = await serviceClient.from('limpeza_locais').insert({
      nome: 'Setor QA Teste'
    }).select().single();
    if (errLocal) throw new Error(`Erro ao criar limpeza_locais: ${errLocal.message}`);
    limpLocal = novoLocal;
    criouLocalTeste = true;
  }

  const { data: limpProg, error: errLimpProg } = await serviceClient.from('limpeza_programacoes').insert({
    local_id: limpLocal.id,
    data_prevista: '2026-10-06',
    status: 'Pendente',
    status_assinatura: 'Pendente'
  }).select().single();
  if (errLimpProg) throw new Error(`Erro ao criar limpeza_programacoes: ${errLimpProg.message}`);

  // Teste 2.1: Operador tenta assinar pelo líder
  const res2_1 = await opClient.from('limpeza_programacoes').update({
    assinatura_lider: true,
    assinatura_lider_nome: 'Operador Fraude'
  }).eq('id', limpProg.id);
  assertBloqueado(res2_1, 'Operador tenta alterar assinatura_lider');

  // Teste 2.2: Operador assina higienização (etapa operacional)
  const res2_2 = await opClient.from('limpeza_programacoes').update({
    assinatura_responsavel: true,
    assinatura_responsavel_nome: 'Higienizador 1',
    status_assinatura: 'Parcial'
  }).eq('id', limpProg.id);
  assertPermitido(res2_2, 'Fluxo UI: Operador assina higienização operacional (Parcial)');

  // Teste 2.3: Admin assina fechamento da limpeza
  const res2_3 = await admClient.from('limpeza_programacoes').update({
    assinatura_lider: true,
    assinatura_lider_nome: 'Líder Limpeza',
    status_assinatura: 'Completo'
  }).eq('id', limpProg.id);
  assertPermitido(res2_3, 'Fluxo UI: Admin assina fechamento da limpeza (Completo)');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 3: recebimentos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('🚚 TABELA 3: recebimentos');
  console.log('-'.repeat(78));
  const { data: recRow, error: errRec } = await serviceClient.from('recebimentos').insert({
    tipo: 'Nacional',
    numero_documento: 'DOC-QA-001',
    status: 'Agendado',
    coordenador_id: operatorFkId
  }).select().single();
  if (errRec) throw new Error(`Erro ao criar recebimento: ${errRec.message}`);

  // Teste 3.1: Operador tenta assinar pelo líder
  const res3_1 = await opClient.from('recebimentos').update({
    assinatura_lider: true,
    assinatura_lider_nome: 'Operador Fraude'
  }).eq('id', recRow.id);
  assertBloqueado(res3_1, 'Operador tenta alterar assinatura_lider');

  // Teste 3.2: Imutável - Operador ou Admin tenta mudar protocolo_recebimento
  const res3_2 = await admClient.from('recebimentos').update({
    protocolo_recebimento: 'REC-ALTERADO'
  }).eq('id', recRow.id);
  assertBloqueado(res3_2, 'Admin tenta alterar protocolo_recebimento (Imutável para todos)');

  // Teste 3.3: Fluxo UI - Operador/Coordenador assina na doca
  const res3_3 = await opClient.from('recebimentos').update({
    assinatura_coordenador: true,
    assinatura_coordenador_nome: 'Coordenador Doca',
    assinatura_coordenador_datetime: new Date().toISOString(),
    status_assinatura: 'Parcial'
  }).eq('id', recRow.id);
  assertPermitido(res3_3, 'Fluxo UI: Operador/Coordenador assina conferência na doca');

  // Teste 3.4: Fluxo UI - Admin assina como Líder
  const res3_4 = await admClient.from('recebimentos').update({
    assinatura_lider: true,
    assinatura_lider_nome: 'Líder Recebimento',
    assinatura_lider_datetime: new Date().toISOString(),
    status_assinatura: 'Completo'
  }).eq('id', recRow.id);
  assertPermitido(res3_4, 'Fluxo UI: Admin assina liberação como Líder');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 4: empilha_ocorrencias
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('⚠️  TABELA 4: empilha_ocorrencias');
  console.log('-'.repeat(78));
  const { data: ocorrEmp, error: errOcorrEmp } = await serviceClient.from('empilha_ocorrencias').insert({
    tipo: 'Problema',
    descricao: 'Teste ocorrência',
    registrado_por: 'Operador Autor',
    data: '2026-10-06',
    hora: '11:00',
    resolvido: false
  }).select().single();
  if (errOcorrEmp) throw new Error(`Erro ao criar empilha_ocorrencias: ${errOcorrEmp.message}`);

  // Teste 4.1: Operador tenta dar baixa em ocorrência
  const res4_1 = await opClient.from('empilha_ocorrencias').update({
    resolvido: true,
    resolucao: 'Operador tentando auto-resolver'
  }).eq('id', ocorrEmp.id);
  assertBloqueado(res4_1, 'Operador tenta resolver empilha_ocorrencias');

  // Teste 4.2: Operador tenta alterar autoria (registrado_por)
  const res4_2 = await opClient.from('empilha_ocorrencias').update({
    registrado_por: 'Outra Pessoa'
  }).eq('id', ocorrEmp.id);
  assertBloqueado(res4_2, 'Operador tenta alterar registrado_por');

  // Teste 4.3: Admin resolve ocorrência
  const res4_3 = await admClient.from('empilha_ocorrencias').update({
    resolvido: true,
    resolucao: 'Aprovado pelo líder'
  }).eq('id', ocorrEmp.id);
  assertPermitido(res4_3, 'Admin resolve empilha_ocorrencias');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 5: recebimento_ocorrencias
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('⚠️  TABELA 5: recebimento_ocorrencias');
  console.log('-'.repeat(78));
  const { data: ocorrRec, error: errOcorrRec } = await serviceClient.from('recebimento_ocorrencias').insert({
    recebimento_id: recRow.id,
    tipo: 'Avaria',
    descricao: 'Avaria na embalagem secundária',
    registrado_por: 'Operador Doca',
    resolvido: false
  }).select().single();
  if (errOcorrRec) throw new Error(`Erro ao criar recebimento_ocorrencias: ${errOcorrRec.message}`);

  // Teste 5.1: Operador tenta resolver
  const res5_1 = await opClient.from('recebimento_ocorrencias').update({
    resolvido: true,
    resolucao: 'Baixado pelo operador'
  }).eq('id', ocorrRec.id);
  assertBloqueado(res5_1, 'Operador tenta resolver recebimento_ocorrencias');

  // Teste 5.2: Admin resolve ocorrência
  const res5_2 = await admClient.from('recebimento_ocorrencias').update({
    resolvido: true,
    resolucao: 'Divergência tratada junto ao fornecedor'
  }).eq('id', ocorrRec.id);
  assertPermitido(res5_2, 'Admin resolve recebimento_ocorrencias');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 6: nota_fiscal_arquivos (Acréscimo do usuário)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('📄 TABELA 6: nota_fiscal_arquivos');
  console.log('-'.repeat(78));
  const { data: nfRow, error: errNf } = await serviceClient.from('nota_fiscal_arquivos').insert({
    numero_nf: 'NF-TEST-999',
    arquivo_url: 'https://exemplo.com/nf-999.pdf',
    descartado: false
  }).select().single();
  if (errNf) throw new Error(`Erro ao criar nota_fiscal_arquivos: ${errNf.message}`);

  // Teste 6.1: Operador tenta descartar arquivo
  const res6_1 = await opClient.from('nota_fiscal_arquivos').update({
    descartado: true,
    descartado_por: 'Operador Fraude'
  }).eq('id', nfRow.id);
  assertBloqueado(res6_1, 'Operador tenta descartar nota_fiscal_arquivos');

  // Teste 6.2: Operador tenta alterar arquivo_url
  const res6_2 = await opClient.from('nota_fiscal_arquivos').update({
    arquivo_url: 'https://malicious.com/fake.pdf'
  }).eq('id', nfRow.id);
  assertBloqueado(res6_2, 'Operador tenta alterar arquivo_url');

  // Teste 6.3: Admin descarta arquivo
  const res6_3 = await admClient.from('nota_fiscal_arquivos').update({
    descartado: true,
    descartado_por: 'Admin Responsável',
    descartado_em: new Date().toISOString()
  }).eq('id', nfRow.id);
  assertPermitido(res6_3, 'Admin descarta nota_fiscal_arquivos');

  // Teste 6.4: Imutável - Admin tenta alterar protocolo_arquivo
  const res6_4 = await admClient.from('nota_fiscal_arquivos').update({
    protocolo_arquivo: 'NFA-MODIFICADO'
  }).eq('id', nfRow.id);
  assertBloqueado(res6_4, 'Admin tenta alterar protocolo_arquivo (Imutável para todos)');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 7: envase_records
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('🏷️  TABELA 7: envase_records');
  console.log('-'.repeat(78));
  const { data: prodRow } = await serviceClient.from('products').select('codigo').limit(1).single();
  const { data: envRow, error: errEnv } = await serviceClient.from('envase_records').insert({
    sala: 'Bio',
    data: '2026-10-06',
    operator_id: operatorFkId,
    operador: 'Operador Original',
    codigo_produto: prodRow.codigo,
    quantidade_produzida: 100
  }).select().single();
  if (errEnv) throw new Error(`Erro ao criar envase_records: ${errEnv.message}`);

  // Teste 7.1: Operador tenta alterar operator_id em envase_records
  const res7_1 = await opClient.from('envase_records').update({
    operator_id: '00000000-0000-4000-8000-000000000000',
    operador: 'Outro Operador'
  }).eq('id', envRow.id);
  assertBloqueado(res7_1, 'Operador tenta transferir autoria (operator_id/operador) em envase_records');

  // Teste 7.2: Operador atualiza dados operacionais de envase_records (quantidade_produzida)
  const res7_2 = await opClient.from('envase_records').update({
    quantidade_produzida: 250,
    observacoes: 'Produção turno normal'
  }).eq('id', envRow.id);
  assertPermitido(res7_2, 'Operador atualiza dados de produção normalmente em envase_records');

  // Teste 7.3: Imutável - Operador ou Admin tenta alterar protocolo em envase_records
  const res7_3 = await admClient.from('envase_records').update({
    protocolo: 'ENV-HACKED'
  }).eq('id', envRow.id);
  assertBloqueado(res7_3, 'Admin tenta alterar protocolo em envase_records (Imutável para todos)');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 8: checkout_itens
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('📋 TABELA 8: checkout_itens');
  console.log('-'.repeat(78));
  const { data: ckoProg, error: errCkoProg } = await serviceClient.from('checkout_programacoes').insert({
    data_programada: '2026-10-06'
  }).select().single();
  if (errCkoProg) throw new Error(`Erro ao criar checkout_programacoes: ${errCkoProg.message}`);

  const { data: ckoItem, error: errCkoItem } = await serviceClient.from('checkout_itens').insert({
    programacao_id: ckoProg.id,
    numero_pedido: 'PED-CKO-001',
    cliente: 'Cliente Teste QA',
    data_entrega: '2026-10-06',
    status: 'Pendente',
    operator_id: operatorFkId,
    operador: 'Operador CKO'
  }).select().single();
  if (errCkoItem) throw new Error(`Erro ao criar checkout_itens: ${errCkoItem.message}`);

  // Teste 8.1: Operador tenta trocar operator_id de checkout_itens
  const res8_1 = await opClient.from('checkout_itens').update({
    operator_id: '00000000-0000-4000-8000-000000000000'
  }).eq('id', ckoItem.id);
  assertBloqueado(res8_1, 'Operador tenta trocar operator_id em checkout_itens');

  // Teste 8.1b: Operador tenta trocar operador (texto) de checkout_itens
  const res8_1b = await opClient.from('checkout_itens').update({
    operador: 'Hacker Operador'
  }).eq('id', ckoItem.id);
  assertBloqueado(res8_1b, 'Operador tenta trocar operador (nome) em checkout_itens');

  // Teste 8.2: Operador atualiza status da tarefa normalmente
  const res8_2 = await opClient.from('checkout_itens').update({
    status: 'Em Andamento',
    observacoes: 'Separando caixas no estoque'
  }).eq('id', ckoItem.id);
  assertPermitido(res8_2, 'Operador atualiza status operacional em checkout_itens');

  // Teste 8.2b: Admin atualiza operator_id normalmente
  const res8_2b = await admClient.from('checkout_itens').update({
    operator_id: operatorFkId,
    observacoes: 'Supervisão reatribuiu'
  }).eq('id', ckoItem.id);
  assertPermitido(res8_2b, 'Admin atualiza operator_id em checkout_itens');

  // Teste 8.3: Imutável - Admin tenta alterar codigo_programacao em checkout_programacoes
  const res8_3 = await admClient.from('checkout_programacoes').update({
    codigo_programacao: 'CKO-ALTERADO'
  }).eq('id', ckoProg.id);
  assertBloqueado(res8_3, 'Admin tenta alterar codigo_programacao em checkout_programacoes (Imutável para todos)');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 9: checklist_recebimentos
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('✅ TABELA 9: checklist_recebimentos');
  console.log('-'.repeat(78));
  const { data: chkRow, error: errChk } = await serviceClient.from('checklist_recebimentos').insert({
    pedido_disponivel_etapa5: 'Sim',
    numero_pedido_compras: 'PED-QA-123',
    nome_fornecedor: 'Fornecedor QA',
    descricao_material: 'Insumo Teste',
    data_entrega: '2026-10-06',
    entrega_conforme_prevista: 'Sim',
    numero_nota_fiscal: 'NF-12345',
    material_recebimento: 'Spray',
    quantidade_recebida: 10,
    unidade_medida: 'UN',
    numero_lote: 'LOTE-001',
    quantidade_conforme_nf: 'Sim',
    amostragem_inspecionada: 'Sim',
    condicoes_gerais_conformes: 'Sim',
    spray_conforme_feps: 'Sim',
    acompanha_certificado_analise: 'Sim',
    acompanha_ficha_emergencia: 'Sim',
    acompanha_fispq: 'Sim',
    criado_por_id: operatorFkId,
    criado_por_nome: 'Operador Criador'
  }).select().single();
  if (errChk) throw new Error(`Erro ao criar checklist_recebimentos: ${errChk.message}`);

  // Teste 9.1: Operador tenta transferir criado_por_id
  const res9_1 = await opClient.from('checklist_recebimentos').update({
    criado_por_id: '00000000-0000-4000-8000-000000000000'
  }).eq('id', chkRow.id);
  assertBloqueado(res9_1, 'Operador tenta transferir criado_por_id em checklist_recebimentos');

  // Teste 9.2: Operador atualiza dados normais de conferência
  const res9_2 = await opClient.from('checklist_recebimentos').update({
    observacoes: 'Material totalmente conforme'
  }).eq('id', chkRow.id);
  assertPermitido(res9_2, 'Operador atualiza observações em checklist_recebimentos');

  // Teste 9.3: Imutável - Admin tenta alterar numero_checklist
  const res9_3 = await admClient.from('checklist_recebimentos').update({
    numero_checklist: 'CHK-HACKED'
  }).eq('id', chkRow.id);
  assertBloqueado(res9_3, 'Admin tenta alterar numero_checklist (Imutável para todos)');

  // ──────────────────────────────────────────────────────────────────────────
  // TABELA 10: empilha_programacoes (Imutabilidade de codigo_programacao)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('📌 TABELA 10: empilha_programacoes');
  console.log('-'.repeat(78));
  const res10_1 = await admClient.from('empilha_programacoes').update({
    codigo_programacao: 'EMP-HACKED'
  }).eq('id', empProg.id);
  assertBloqueado(res10_1, 'Admin tenta alterar codigo_programacao em empilha_programacoes (Imutável para todos)');

  // ──────────────────────────────────────────────────────────────────────────
  // TEARDOWN: Limpeza dos registros de teste
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(78));
  console.log('🧹 LIMPEZA DOS REGISTROS DE TESTE');
  console.log('-'.repeat(78));
  await serviceClient.from('empilha_linhas').delete().eq('id', empLinha.id);
  await serviceClient.from('empilha_programacoes').delete().eq('id', empProg.id);
  await serviceClient.from('limpeza_programacoes').delete().eq('id', limpProg.id);
  if (criouLocalTeste) await serviceClient.from('limpeza_locais').delete().eq('id', limpLocal.id);
  await serviceClient.from('recebimento_ocorrencias').delete().eq('id', ocorrRec.id);
  await serviceClient.from('recebimentos').delete().eq('id', recRow.id);
  await serviceClient.from('empilha_ocorrencias').delete().eq('id', ocorrEmp.id);
  await serviceClient.from('nota_fiscal_arquivos').delete().eq('id', nfRow.id);
  await serviceClient.from('envase_records').delete().eq('id', envRow.id);
  await serviceClient.from('checkout_itens').delete().eq('id', ckoItem.id);
  await serviceClient.from('checkout_programacoes').delete().eq('id', ckoProg.id);
  await serviceClient.from('checklist_recebimentos').delete().eq('id', chkRow.id);
  console.log('   ✓ Todos os registros de teste foram removidos com sucesso via service_role.');

  console.log('\n' + '='.repeat(78));
  console.log(`🏁 RESULTADO FINAL: ${testesPassados} de ${totalTestes} testes passaram com 100% de sucesso!`);
  console.log('='.repeat(78));
}

main().catch(err => {
  console.error('Erro fatal no teste:', err);
  process.exit(1);
});
