const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tables = [
  'products', 'embalagens', 'operators', 'envase_records',
  'checkout_programacoes', 'checkout_itens', 'empilhadeira_configs',
  'empilha_programacoes', 'empilha_linhas', 'empilha_ocorrencias',
  'empilhadeira_paradas', 'empilhadeira_manutencoes', 'limpeza_locais',
  'limpeza_programacoes', 'recebimento_fornecedores', 'recebimentos',
  'recebimento_itens', 'recebimento_participantes', 'recebimento_ocorrencias',
  'sap_pedidos', 'checklist_recebimentos', 'nota_fiscal_arquivos', 'user_profiles'
];

async function checkAll() {
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(t.padEnd(28), ':', count !== null ? count : 'N/A', error ? `(error: ${error.message})` : '');
  }
}
checkAll();
