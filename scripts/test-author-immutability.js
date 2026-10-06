/**
 * scripts/test-author-immutability.js
 * Teste unitário e de integração para comprovar que o autor (operator_id e operador)
 * NÃO muda ao editar um registro como outro operador.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Simular LocalStorage no Node
global.window = {};
const mockStorage = new Map();
global.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k)
};

const { supabase } = await import('../src/lib/supabaseClient.js');
const { base44 } = await import('../src/api/base44Client.js');

async function testAuthorImmutability() {
  console.log('='.repeat(78));
  console.log('🧪 TESTE DE IMUTABILIDADE DO AUTOR ORIGINAL (operator_id / operador)');
  console.log('='.repeat(78));

  // Cenário 1: Operador Inicial (Lucas Araujo) cria o registro
  const operadorCriador = {
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Lucas Araujo'
  };
  localStorage.setItem('envase_current_operator', JSON.stringify(operadorCriador));

  console.log('\n[CENÁRIO 1] Criação do registro pelo Operador Inicial:');
  console.log(`   - Operador no LocalStorage: "${operadorCriador.nome}" (${operadorCriador.id})`);

  // Como create chama sanitizarPayload(table, data, true):
  // Vamos inspecionar o payload gerado em create vs update
  // Para testar sem escrever no banco remoto, vamos mockar a chamada do Supabase no client
  const { default: clientModule } = await import('../src/api/base44Client.js');

  // Cenário 2: Outro operador (Carlos Silva) tenta editar o registro existente
  const outroOperador = {
    id: '99999999-9999-4999-8999-999999999999',
    nome: 'Carlos Silva'
  };
  localStorage.setItem('envase_current_operator', JSON.stringify(outroOperador));

  console.log('\n[CENÁRIO 2] Edição do registro por Outro Operador:');
  console.log(`   - Operador ativo no LocalStorage mudou para: "${outroOperador.nome}" (${outroOperador.id})`);
  console.log('   - Payload enviado na edição tenta forçar novo operador:');
  const dadosEdicao = {
    quantidade_produzida: 500,
    observacoes: 'Ajuste de quantidade pelo segundo turno',
    operador: 'Carlos Silva',
    operator_id: outroOperador.id
  };
  console.log('     ', dadosEdicao);

  // Verificação direta no adapter
  // Vamos interceptar a query do Supabase para capturar o payload exato que chega no banco
  let payloadCapturadoNoUpdate = null;
  const originalUpdate = base44.entities.EnvaseRecord.update;

  // Criamos um mock da chamada interna
  try {
    // Usamos um mock temporário no supabase.from('envase_records').update
    const originalFrom = supabase.from;

    supabase.from = function(table) {
      if (table === 'envase_records') {
        return {
          update: (payload) => {
            payloadCapturadoNoUpdate = payload;
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: 'env-test-123',
                      op: 'OP-2026-001',
                      quantidade_produzida: payload.quantidade_produzida,
                      operador: 'Lucas Araujo', // Banco preservou o original
                      operator_id: operadorCriador.id
                    },
                    error: null
                  })
                })
              })
            };
          }
        };
      }
      return originalFrom.apply(this, arguments);
    };

    // Executa o update com o segundo operador logado
    const resultado = await base44.entities.EnvaseRecord.update('env-test-123', dadosEdicao);

    console.log('\n[RESULTADO DA INTERCEPTAÇÃO NO CLIENTE]');
    console.log('   Payload real enviado pelo base44Client para o Postgres no UPDATE:');
    console.log('   ', payloadCapturadoNoUpdate);

    if (payloadCapturadoNoUpdate.operator_id === undefined && payloadCapturadoNoUpdate.operador === undefined) {
      console.log('\n   ✅ PROVA CONFIRMADA:');
      console.log('      1. "operator_id" foi removido do payload de UPDATE.');
      console.log('      2. "operador" foi removido do payload de UPDATE.');
      console.log('      3. O autor original ("Lucas Araujo") NUNCA é substituído por "Carlos Silva".');
    } else {
      console.error('\n   ❌ FALHA: operator_id ou operador vazaram no payload de UPDATE!');
      process.exit(1);
    }

    // Restaura
    supabase.from = originalFrom;
  } catch (err) {
    console.error('Erro no teste:', err);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(78));
  console.log('🏁 TESTE DE IMUTABILIDADE DO AUTOR CONCLUÍDO COM SUCESSO.');
  console.log('='.repeat(78));
}

testAuthorImmutability();
