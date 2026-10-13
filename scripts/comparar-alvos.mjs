/**
 * scripts/comparar-alvos.mjs
 *
 * Compara duas medicoes de scripts/medir-alvos.mjs e mostra, por tela, quantos
 * alvos saíram de baixo de 48 px. No fim, lista as telas mais afetadas — as
 * que valem olhar na captura.
 *
 * Uso: node scripts/comparar-alvos.mjs <antes.json> <depois.json>
 */

import fs from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('Uso: node scripts/comparar-alvos.mjs <antes.json> <depois.json>'); process.exit(1); }

const antes = JSON.parse(fs.readFileSync(a, 'utf8'));
const depois = JSON.parse(fs.readFileSync(b, 'utf8'));

const linhas = [];
let somaAntes = 0, somaDepois = 0, alvosAntes = 0, alvosDepois = 0, piorou = 0;

for (const tela of Object.keys(antes)) {
  const ma = antes[tela], md = depois[tela];
  if (!md) { console.log(`  SO NO ANTES  ${tela}`); continue; }
  somaAntes += ma.pequenos; somaDepois += md.pequenos;
  alvosAntes += ma.total; alvosDepois += md.total;
  const ganho = ma.pequenos - md.pequenos;
  if (ganho < 0) piorou += 1;
  linhas.push({ tela, antes: ma.pequenos, depois: md.pequenos, ganho,
    total: md.total, menorA: ma.menorAltura, menorD: md.menorAltura });
}

linhas.sort((x, y) => y.ganho - x.ganho);

console.log('\nTELAS MAIS AFETADAS (alvos abaixo de 48px: antes -> depois)\n');
for (const l of linhas.slice(0, 15)) {
  console.log(`  ${l.tela.padEnd(38)} ${String(l.antes).padStart(3)} -> ${String(l.depois).padStart(3)}` +
    `  (${l.ganho >= 0 ? '-' : '+'}${Math.abs(l.ganho)})  menor altura ${l.menorA} -> ${l.menorD}`);
}

const aindaPequenos = linhas.filter(l => l.depois > 0);
if (aindaPequenos.length) {
  console.log(`\nTELAS QUE AINDA TEM ALVO PEQUENO (${aindaPequenos.length}):\n`);
  for (const l of aindaPequenos.slice(0, 12)) {
    console.log(`  ${l.tela.padEnd(38)} ${l.depois} de ${l.total}  (menor ${l.menorD}px)`);
  }
}

// o que sobrou, por tipo
const sobrou = {};
for (const tela of Object.keys(depois)) {
  for (const e of depois[tela].exemplos || []) {
    const k = `${e.tag} ${e.a}px`;
    sobrou[k] = (sobrou[k] || 0) + 1;
  }
}
if (Object.keys(sobrou).length) {
  console.log('\nO QUE SOBROU, por tipo e altura (amostra):\n');
  Object.entries(sobrou).sort((x, y) => y[1] - x[1]).slice(0, 12)
    .forEach(([k, n]) => console.log(`  ${k.padEnd(16)} ${n}`));
}

console.log('\n' + '='.repeat(72));
console.log(`Telas:                        ${linhas.length}`);
console.log(`Alvos medidos:                ${alvosAntes} -> ${alvosDepois}`);
console.log(`Abaixo de 48px:               ${somaAntes} -> ${somaDepois}` +
  `  (${somaAntes ? Math.round((1 - somaDepois / somaAntes) * 100) : 0}% a menos)`);
console.log(`Telas que PIORARAM:           ${piorou}`);
console.log('='.repeat(72));
process.exit(piorou > 0 ? 1 : 0);
