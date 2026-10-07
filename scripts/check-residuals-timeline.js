import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('check-residuals-timeline');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTimestamps() {
  const tables = [
    { name: 'envase_records', col: 'op' },
    { name: 'checkout_itens', col: 'numero_pedido' },
    { name: 'empilha_linhas', col: 'descricao_produto' },
    { name: 'recebimentos', col: 'numero_documento' },
    { name: 'operators', col: 'matricula' },
    { name: 'nota_fiscal_arquivos', col: 'numero_nf' },
    { name: 'checklist_recebimentos', col: 'numero_pedido_compras' }
  ];

  console.log('='.repeat(78));
  console.log('📅 ANÁLISE TEMPORAL DOS REGISTROS DE TESTE (QA)');
  console.log('='.repeat(78));

  for (const t of tables) {
    const { data } = await supabase.from(t.name).select('*').ilike(t.col, '%QA%').order('created_at', { ascending: false });
    if (!data || data.length === 0) {
      console.log(`${t.name}: Nenhum`);
      continue;
    }
    const maisRecente = data[0].created_at || 'N/A';
    const maisAntigo = data[data.length - 1].created_at || 'N/A';
    const criadosHoje = data.filter(r => r.created_at?.startsWith('2026-09-30'));
    console.log(`${t.name.padEnd(23)} | Total: ${data.length.toString().padStart(2)} | Mais antigo: ${maisAntigo.slice(0, 19)} | Mais recente: ${maisRecente.slice(0, 19)} | Criados hoje (30/09): ${criadosHoje.length}`);
  }
  console.log('='.repeat(78));
}

checkTimestamps();
