/**
 * scripts/find-test-records.js
 * 
 * Varredura SOMENTE LEITURA em todas as tabelas do banco para encontrar
 * registros criados por testes/QA (critérios de texto, sem filtro de data).
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('find-test-records');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const PATTERNS = [
  'teste',
  'qa',
  'forn teste',
  'operador teste',
  'temp-qa',
  'sec.audit',
  'staging'
];

function isMatch(val) {
  if (typeof val !== 'string') return false;
  const lower = val.toLowerCase();
  return PATTERNS.some(p => lower.includes(p));
}

function findMatchingFields(row) {
  const matches = {};
  for (const [k, v] of Object.entries(row)) {
    if (isMatch(v)) {
      matches[k] = v;
    }
  }
  return matches;
}

const TABELAS = [
  'operators',
  'products',
  'embalagens',
  'envase_records',
  'checkout_programacoes',
  'checkout_itens',
  'empilhadeira_configs',
  'empilha_programacoes',
  'empilha_linhas',
  'empilha_ocorrencias',
  'empilhadeira_paradas',
  'empilhadeira_manutencoes',
  'limpeza_locais',
  'limpeza_programacoes',
  'recebimento_fornecedores',
  'recebimentos',
  'recebimento_itens',
  'recebimento_participantes',
  'recebimento_ocorrencias',
  'sap_pedidos',
  'checklist_recebimentos',
  'nota_fiscal_arquivos',
  'user_profiles',
  'notificacao_destinatarios'
];

async function scan() {
  console.log('='.repeat(78));
  console.log('🔍 VARREDURA DE REGISTROS DE TESTE POR CRITÉRIOS DE TEXTO (SEM FILTRO DE DATA)');
  console.log(`🌐 Origem: ${SUPABASE_URL}`);
  console.log('='.repeat(78));

  const resultadoPorTabela = {};

  for (const tabela of TABELAS) {
    const { data, error } = await supabase.from(tabela).select('*');
    if (error) {
      console.error(`Erro ao consultar ${tabela}:`, error.message);
      continue;
    }

    const testRows = [];
    for (const row of (data || [])) {
      const match = findMatchingFields(row);
      if (Object.keys(match).length > 0) {
        testRows.push({
          id: row.id,
          campos_identificadores: match
        });
      }
    }

    if (testRows.length > 0) {
      resultadoPorTabela[tabela] = testRows;
    }
  }

  // Storage buckets check
  const { data: filesFotos } = await supabase.storage.from('fotos-operadores').list();
  const fotosTest = (filesFotos || []).filter(f => isMatch(f.name));

  const { data: filesNf } = await supabase.storage.from('notas-fiscais').list();
  const nfTest = (filesNf || []).filter(f => isMatch(f.name));

  const relatorioCompleto = {
    banco_tabelas: resultadoPorTabela,
    storage_fotos_operadores: fotosTest.map(f => f.name),
    storage_notas_fiscais: nfTest.map(f => f.name)
  };

  fs.writeFileSync('backups/test_records_scan.json', JSON.stringify(relatorioCompleto, null, 2), 'utf8');

  console.log('\n📊 RESUMO DOS REGISTROS DE TESTE ENCONTRADOS POR TABELA:');
  console.log('-'.repeat(78));
  for (const [tabela, rows] of Object.entries(resultadoPorTabela)) {
    console.log(`- ${tabela.padEnd(28)}: ${rows.length} registros de teste`);
  }
  console.log(`- storage fotos-operadores    : ${fotosTest.length} arquivos`);
  console.log(`- storage notas-fiscais       : ${nfTest.length} arquivos`);
  console.log('-'.repeat(78));
  console.log('Arquivo completo detalhado salvo em: backups/test_records_scan.json');
}

import fs from 'node:fs';
scan().catch(console.error);
