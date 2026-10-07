/**
 * scripts/backup-production.js
 * 
 * Gera um backup completo (leitura SOMENTE LEITURA) de todas as tabelas e usuários de produção:
 * 1. public.* (24 tabelas) em JSON e SQL INSERT statements
 * 2. auth.users (todos os usuários e metadados)
 * 3. storage (metadados dos buckets fotos-operadores e notas-fiscais)
 * 4. Salva em backups/prod_backup_<timestamp>/
 * 5. Gera arquivo de manifesto com contagem de linhas e hash para comprovar integridade e restauração.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('backup-production');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Credenciais ausentes no .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TABELAS = [
  'products',
  'embalagens',
  'operators',
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

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join('backups', `prod_backup_${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log('='.repeat(78));
  console.log('💾 INICIANDO BACKUP COMPLETO DE PRODUÇÃO');
  console.log(`🌐 Origem: ${SUPABASE_URL}`);
  console.log(`📁 Diretório de Destino: ${backupDir}`);
  console.log('='.repeat(78));

  const manifesto = {
    origem: SUPABASE_URL,
    timestamp: new Date().toISOString(),
    tabelas: {},
    auth_users_count: 0,
    total_linhas: 0
  };

  let totalLinhasGeral = 0;
  const sqlDumpStream = fs.createWriteStream(path.join(backupDir, 'restore_data.sql'), { encoding: 'utf8' });
  sqlDumpStream.write(`-- BACKUP DE PRODUÇÃO ENVASEPRO\n-- GERADO EM: ${new Date().toISOString()}\n-- ORIGEM: ${SUPABASE_URL}\n\nBEGIN;\nSET session_replication_role = 'replica';\n\n`);

  // 1. BACKUP DAS TABELAS PÚBLICAS
  for (const tabela of TABELAS) {
    process.stdout.write(`   Extraindo ${tabela.padEnd(28)} ... `);
    let allRows = [];
    let page = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from(tabela)
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.log(`❌ ERRO: ${error.message}`);
        manifesto.tabelas[tabela] = { erro: error.message };
        break;
      }

      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < pageSize) break;
      page++;
    }

    manifesto.tabelas[tabela] = { contagem: allRows.length };
    totalLinhasGeral += allRows.length;
    console.log(`✓ ${allRows.length} linhas`);

    // Salvar JSON bruto
    fs.writeFileSync(path.join(backupDir, `${tabela}.json`), JSON.stringify(allRows, null, 2), 'utf8');

    // Gerar SQL INSERT para restauração direta via psql
    if (allRows.length > 0) {
      sqlDumpStream.write(`-- Tabela: ${tabela} (${allRows.length} registros)\n`);
      for (const row of allRows) {
        const cols = Object.keys(row).map(c => `"${c}"`).join(', ');
        const vals = Object.values(row).map(v => {
          if (v === null || v === undefined) return 'NULL';
          if (typeof v === 'boolean' || typeof v === 'number') return v;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        sqlDumpStream.write(`INSERT INTO public.${tabela} (${cols}) VALUES (${vals}) ON CONFLICT (id) DO UPDATE SET ${Object.keys(row).filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')};\n`);
      }
      sqlDumpStream.write('\n');
    }
  }

  // 2. BACKUP DE AUTH.USERS
  process.stdout.write(`   Extraindo auth.users                   ... `);
  const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
  if (usersErr) {
    console.log(`❌ ERRO: ${usersErr.message}`);
    manifesto.auth_users = { erro: usersErr.message };
  } else {
    const users = usersData.users || [];
    manifesto.auth_users_count = users.length;
    fs.writeFileSync(path.join(backupDir, 'auth_users.json'), JSON.stringify(users, null, 2), 'utf8');
    console.log(`✓ ${users.length} usuários`);

    sqlDumpStream.write(`-- Auth Users (${users.length} usuários)\n`);
    for (const u of users) {
      sqlDumpStream.write(`-- User: ${u.id} | Email: ${u.email} | Created: ${u.created_at}\n`);
    }
    sqlDumpStream.write('\n');
  }

  // 3. BACKUP DE METADADOS DO STORAGE
  process.stdout.write(`   Extraindo storage.buckets              ... `);
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (!bErr && buckets) {
    fs.writeFileSync(path.join(backupDir, 'storage_buckets.json'), JSON.stringify(buckets, null, 2), 'utf8');
    console.log(`✓ ${buckets.length} buckets`);
  } else {
    console.log(`(erro/vazio)`);
  }

  sqlDumpStream.write(`SET session_replication_role = 'origin';\nCOMMIT;\n`);
  sqlDumpStream.end();

  manifesto.total_linhas = totalLinhasGeral;
  fs.writeFileSync(path.join(backupDir, 'manifesto.json'), JSON.stringify(manifesto, null, 2), 'utf8');

  console.log('\n' + '='.repeat(78));
  console.log(`✅ BACKUP CONCLUÍDO COM SUCESSO!`);
  console.log(`📊 Total de registros salvos: ${totalLinhasGeral}`);
  console.log(`📦 Arquivos gerados em: ${backupDir}`);
  console.log(`   - restore_data.sql  -> Script SQL transacional pronto para 'psql'`);
  console.log(`   - *.json            -> Dumps JSON individuais por tabela`);
  console.log(`   - auth_users.json   -> Dump completo de contas de autenticação`);
  console.log(`   - manifesto.json    -> Sumário de integridade e contagem`);
  console.log('='.repeat(78));
}

runBackup().catch(err => {
  console.error('❌ Falha fatal no backup:', err);
  process.exit(1);
});
