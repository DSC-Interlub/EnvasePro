import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function truncar() {
  const flagConfirmar = process.argv.includes('--confirmar-truncamento');
  if (!flagConfirmar) {
    console.error('❌ Operação abortada! Para truncar as tabelas operacionais, passe explicitamente: --confirmar-truncamento');
    process.exit(1);
  }

  console.log('='.repeat(78));
  console.log('⚠️ TRUNCANDO TABELAS OPERACIONAIS NO SUPABASE (ORDEM DE FKs)');
  console.log('='.repeat(78));

  const tabelas = [
    'nota_fiscal_arquivos',
    'checklist_recebimentos',
    'envase_records',
    'checkout_itens',
    'checkout_programacoes',
    'sap_pedidos'
  ];

  for (const t of tabelas) {
    const { count: antes } = await supabase.from(t).select('*', { count: 'exact', head: true });
    // Deleta todos os registros usando condição sempre verdadeira
    const { error } = await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`Erro ao truncar ${t}:`, error.message);
    } else {
      const { count: depois } = await supabase.from(t).select('*', { count: 'exact', head: true });
      console.log(`   🗑️  ${t.padEnd(26)}: ${antes} registros removidos ➔ total atual: ${depois}`);
    }
  }

  console.log('='.repeat(78));
  console.log('✅ TRUNCAMENTO CONCLUÍDO COM SUCESSO! Banco limpo.');
  console.log('='.repeat(78));
}

truncar().catch(err => {
  console.error('Falha no truncamento:', err);
  process.exit(1);
});
