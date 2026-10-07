import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('find-test-residuals');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findTestRecords() {
  console.log('='.repeat(70));
  console.log('🧹 VARREDURA DE REGISTROS DE TESTE (ENSAIOS QA) NO SUPABASE');
  console.log('='.repeat(70));
  
  const tables = [
    { name: 'envase_records', col: 'op' },
    { name: 'checkout_itens', col: 'numero_pedido' },
    { name: 'empilha_linhas', col: 'descricao_produto' },
    { name: 'empilha_programacoes', col: 'observacoes' },
    { name: 'recebimentos', col: 'numero_documento' },
    { name: 'operators', col: 'matricula' },
    { name: 'nota_fiscal_arquivos', col: 'numero_nf' },
    { name: 'checklists', col: 'numero_pedido_compras' }
  ];

  const residuals = {};

  for (const t of tables) {
    const { data, error } = await supabase
      .from(t.name)
      .select('*')
      .ilike(t.col, '%QA%');

    if (error) {
      console.log(`${t.name}: Erro ao consultar (${error.message})`);
    } else {
      residuals[t.name] = data || [];
      console.log(`- ${t.name.padEnd(25)}: ${(data || []).length} registro(s) de teste`);
      if (data && data.length > 0) {
        data.forEach(r => {
          console.log(`    ↳ ID: ${r.id} | ${t.col}: "${r[t.col]}" | Criado em: ${r.created_at || r.created_date}`);
        });
      }
    }
  }

  console.log('='.repeat(70));
  return residuals;
}

findTestRecords();
