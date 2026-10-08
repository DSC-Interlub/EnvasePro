/**
 * scripts/test-renovacao-sessao.js
 *
 * Testa a repetição com renovação de sessão do adaptador.
 *
 * O que importa aqui é tanto o que ela FAZ quanto o que ela NÃO faz:
 * repetir erro de permissão (42501) esconderia um problema real de RLS atrás
 * de uma segunda tentativa que também vai falhar, e repetir em laço
 * transformaria um problema de autenticação em tempestade de requisições.
 *
 * Uso: node scripts/test-renovacao-sessao.js
 */

import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { ehErroDeSessao, executarComRenovacao } from '../src/lib/sessaoRetry.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-renovacao-sessao');

let ok = 0;
let falhou = 0;
const falhas = [];

function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

console.log('='.repeat(72));
console.log('REPETICAO COM RENOVACAO DE SESSAO');
console.log('='.repeat(72));

// ------------------------------------------------- o que conta como sessao --
console.log('\n[1] quais erros contam como "de sessao"');
checar('PGRST303 (JWT issued at future) conta', ehErroDeSessao({ code: 'PGRST303' }));
checar('PGRST301 (JWT expirado) conta', ehErroDeSessao({ code: 'PGRST301' }));
checar('status 401 conta', ehErroDeSessao({ status: 401 }));
checar('code "401" conta', ehErroDeSessao({ code: '401' }));

console.log('\n[2] o que NAO pode contar — senao esconde problema real');
checar('42501 (permissao negada pelo RLS) NAO conta', !ehErroDeSessao({ code: '42501' }));
checar('23505 (chave duplicada) NAO conta', !ehErroDeSessao({ code: '23505' }));
checar('23503 (chave estrangeira) NAO conta', !ehErroDeSessao({ code: '23503' }));
checar('PGRST116 (nenhuma linha) NAO conta', !ehErroDeSessao({ code: 'PGRST116' }));
checar('erro nulo NAO conta', !ehErroDeSessao(null));
checar('status 500 NAO conta', !ehErroDeSessao({ status: 500 }));

// --------------------------------------------------- comportamento da repeticao
console.log('\n[3] quantas vezes a consulta e executada');

async function cenario(nome, erros, esperadoChamadas, esperaSucesso) {
  let chamadas = 0;
  let renovacoes = 0;
  const resultado = await executarComRenovacao(() => {
    const erro = erros[chamadas] ?? null;
    chamadas += 1;
    return Promise.resolve({ data: erro ? null : [{ id: chamadas }], error: erro });
  }, async () => { renovacoes += 1; });
  checar(`${nome}: ${esperadoChamadas} chamada(s)`, chamadas === esperadoChamadas, `foram ${chamadas}`);
  if (esperaSucesso !== undefined) {
    checar(`${nome}: ${esperaSucesso ? 'termina com dado' : 'devolve o erro'}`,
      esperaSucesso ? !!resultado.data && !resultado.error : !!resultado.error,
      JSON.stringify(resultado).slice(0, 70));
  }
}

await cenario('sucesso de primeira', [null], 1, true);
await cenario('erro de permissao 42501', [{ code: '42501' }], 1, false);
await cenario('erro de dado 23505', [{ code: '23505' }], 1, false);
await cenario('PGRST303 e depois sucesso', [{ code: 'PGRST303' }, null], 2, true);
await cenario('401 e depois sucesso', [{ status: 401 }, null], 2, true);

console.log('\n[4] NAO repete em laco');
await cenario('PGRST303 sempre: para na 2a', [{ code: 'PGRST303' }, { code: 'PGRST303' }, { code: 'PGRST303' }], 2, false);
await cenario('401 sempre: para na 2a', [{ status: 401 }, { status: 401 }, { status: 401 }], 2, false);

console.log('\n[5] o resultado devolvido e o da SEGUNDA tentativa quando ela da certo');
let n = 0;
const r = await executarComRenovacao(() => {
  n += 1;
  return Promise.resolve(n === 1
    ? { data: null, error: { code: 'PGRST303' } }
    : { data: [{ id: 'segunda' }], error: null });
}, async () => {});
checar('devolve o dado da segunda tentativa', r.data?.[0]?.id === 'segunda', JSON.stringify(r).slice(0, 70));
checar('e sem erro', !r.error);

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
