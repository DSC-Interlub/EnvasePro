/**
 * scripts/test-dia-local.js
 *
 * Prova que `diaLocal()` nao adianta o dia a noite, e que o jeito antigo
 * (`toISOString().split('T')[0]`) adianta.
 *
 * O defeito aparecia das 21h a meia-noite de Brasilia: `toISOString()` e UTC,
 * entao as 21h de 9/10 ele ja respondia "2026-10-10". No grafico dos ultimos
 * 7 dias do painel, o ROTULO da barra vinha do horario local e o DADO vinha
 * do UTC — depois das 21h os dois apontavam para dias diferentes.
 *
 * Uso: node scripts/test-dia-local.js
 */

import { diaLocal } from '../src/lib/datas.js';

let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;

console.log('='.repeat(72));
console.log(`DIA LOCAL x DIA UTC   (fuso desta maquina: ${fuso})`);
console.log('='.repeat(72));

if (fuso !== 'America/Sao_Paulo') {
  console.log(`\n  Esta suite so faz sentido rodando em America/Sao_Paulo.`);
  console.log(`  Fuso atual: ${fuso}. Nada foi verificado.`);
  process.exit(1);
}

const antigo = (d) => d.toISOString().split('T')[0];

// 9/10/2026 as 22h de Brasilia = 10/10 as 01h UTC
const casos = [
  ['19h BRT', new Date('2026-10-09T22:00:00Z'), '2026-10-09', false],
  ['20h59 BRT', new Date('2026-10-09T23:59:00Z'), '2026-10-09', false],
  ['21h BRT', new Date('2026-10-10T00:00:00Z'), '2026-10-09', true],
  ['22h BRT', new Date('2026-10-10T01:00:00Z'), '2026-10-09', true],
  ['23h59 BRT', new Date('2026-10-10T02:59:00Z'), '2026-10-09', true],
  ['00h01 BRT', new Date('2026-10-10T03:01:00Z'), '2026-10-10', false],
];

console.log('\n[1] diaLocal devolve o dia de quem esta olhando');
for (const [rotulo, instante, esperado] of casos) {
  checar(`${rotulo}: diaLocal = ${esperado}`, diaLocal(instante) === esperado,
    `deu ${diaLocal(instante)}`);
}

console.log('\n[2] o jeito antigo adianta o dia na janela das 21h as 24h');
for (const [rotulo, instante, esperado, deviaDivergir] of casos) {
  const divergiu = antigo(instante) !== esperado;
  checar(`${rotulo}: toISOString ${deviaDivergir ? 'ERRA' : 'acerta'} (${antigo(instante)})`,
    divergiu === deviaDivergir);
}

console.log('\n[3] hoje, agora, os dois concordam ou nao — so para registrar');
const agora = new Date();
console.log(`  diaLocal()=${diaLocal()}  toISOString()=${antigo(agora)}  ` +
  `${diaLocal() === antigo(agora) ? '(iguais neste horario)' : '(DIVERGEM neste horario)'}`);

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
