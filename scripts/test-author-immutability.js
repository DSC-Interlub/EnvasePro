/**
 * scripts/test-author-immutability.js
 * Teste unitário e de integração para comprovar que o autor (operator_id e operador)
 * NÃO muda ao editar um registro como outro operador.
 */

import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-author-immutability');

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

  // Cenário 2: outro operador (Carlos Silva) fica ativo no LocalStorage e edita.
  const outroOperador = {
    id: '99999999-9999-4999-8999-999999999999',
    nome: 'Carlos Silva'
  };
  localStorage.setItem('envase_current_operator', JSON.stringify(outroOperador));
  console.log('\n[CENÁRIO 2] Edição por outro operador (ativo no LocalStorage: "Carlos Silva")');

  // O que o adapter promete (CLAUDE.md §2): no UPDATE ele NÃO tira a autoria do
  // LocalStorage. Se a tela não manda operador, o payload não leva operador.
  // Quando a tela manda operador de propósito (check-out e empilhadeira gravam o
  // operador num item Pendente), o adapter repassa. Quem impede TROCAR um autor
  // já gravado é o banco (protect_write_once_columns), provado com JWT real em
  // test-critical-columns-triggers.js e test-reconcile-triggers.js.
  // (A versão anterior deste teste exigia que o adapter apagasse o operador mesmo
  // quando enviado; isso quebraria o check-out e nunca foi o desenho. Ela também
  // não rodava desde 07/10: o adapter importava por '@/', que só o Vite resolve.)
  const capturados = [];
  const originalFrom = supabase.from;
  supabase.from = function(table) {
    if (table === 'envase_records') {
      return {
        update: (payload) => {
          capturados.push(payload);
          const linha = { id: 'env-test-123', ...payload };
          const resposta = { data: linha, error: null };
          const fim = {
            select: () => ({ single: async () => resposta, maybeSingle: async () => resposta,
              then: (r) => r({ data: [linha], error: null }) }),
            then: (r) => r({ data: null, error: null }),
          };
          return { eq: () => fim };
        }
      };
    }
    return originalFrom.apply(this, arguments);
  };

  let falhas = 0;
  const ok = (cond, txt) => { console.log(`   ${cond ? 'OK   ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };
  try {
    await base44.entities.EnvaseRecord.update('env-test-123', {
      quantidade_produzida: 500,
      observacoes: 'Ajuste de quantidade pelo segundo turno',
    });
    const p1 = capturados[0] || {};
    console.log('   payload (edição sem operador):', p1);
    ok(capturados.length === 1, 'o UPDATE chegou ao cliente do banco');
    ok(p1.operator_id === undefined && p1.operador === undefined,
      'edição sem operador NÃO injeta o operador do LocalStorage (Carlos Silva)');
    ok(p1.quantidade_produzida === 500, 'o campo editado chega ao banco');
  } catch (err) {
    console.error('Erro no teste:', err);
    falhas++;
  } finally {
    supabase.from = originalFrom;
  }

  console.log('\n' + '='.repeat(78));
  console.log(falhas ? `RESULTADO: ${falhas} FALHA(S)`
    : 'TUDO OK — a troca de autor já gravado é barrada no banco (ver test-critical-columns-triggers).');
  console.log('='.repeat(78));
  process.exitCode = falhas ? 1 : 0;
}

testAuthorImmutability();
