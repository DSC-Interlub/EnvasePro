/**
 * scripts/comparar-cores.mjs
 *
 * Compara dois arquivos de histograma de cores (gerados por
 * scripts/cores-por-tela.mjs) e diz, tela por tela, se alguma cor mudou.
 *
 * Isto e a prova determinista de "diferenca visual zero" numa troca de cor
 * escrita a mao por token com o MESMO valor. Comparar captura de tela nao
 * serve: as telas de TV e Painel tem relogio e dao diferenca de pixel mesmo
 * com codigo identico.
 *
 * Uso: node scripts/comparar-cores.mjs <antes.json> <depois.json>
 */

import fs from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('Uso: node scripts/comparar-cores.mjs <antes.json> <depois.json>'); process.exit(1); }

const antes = JSON.parse(fs.readFileSync(a, 'utf8'));
const depois = JSON.parse(fs.readFileSync(b, 'utf8'));

const AZUL_MARCA = /rgb\(37, 99, 235\)/;
const AZUL_FORTE = /rgb\(29, 78, 216\)/;

let iguais = 0, diferentes = 0, soNoAntes = 0, soNoDepois = 0;
const problemas = [];
let usosAzul = 0;

for (const tela of Object.keys(antes)) {
  if (!(tela in depois)) { soNoAntes += 1; console.log(`  SO NO ANTES   ${tela}`); continue; }
  const ca = antes[tela], cd = depois[tela];
  const chaves = new Set([...Object.keys(ca), ...Object.keys(cd)]);
  const mudou = [];
  for (const k of chaves) {
    const na = ca[k] || 0, nd = cd[k] || 0;
    if (na !== nd) mudou.push(`${k}: ${na} -> ${nd}`);
  }
  usosAzul += Object.entries(ca)
    .filter(([k]) => AZUL_MARCA.test(k) || AZUL_FORTE.test(k))
    .reduce((s, [, n]) => s + n, 0);

  if (mudou.length === 0) { iguais += 1; }
  else {
    diferentes += 1;
    problemas.push({ tela, mudou });
    console.log(`  MUDOU         ${tela}`);
    mudou.slice(0, 6).forEach(m => console.log(`                  ${m}`));
    if (mudou.length > 6) console.log(`                  ... e ${mudou.length - 6} outras`);
  }
}
for (const tela of Object.keys(depois)) if (!(tela in antes)) { soNoDepois += 1; console.log(`  SO NO DEPOIS  ${tela}`); }

console.log('\n' + '='.repeat(78));
console.log(`Telas comparadas:                 ${Object.keys(antes).length}`);
console.log(`Histograma de cores IDENTICO:     ${iguais}`);
console.log(`Com alguma cor diferente:         ${diferentes}`);
console.log(`So num dos lados:                 ${soNoAntes} / ${soNoDepois}`);
console.log(`Usos do azul da marca no "antes":  ${usosAzul}`);
console.log('='.repeat(78));
process.exit(diferentes + soNoAntes + soNoDepois === 0 ? 0 : 1);
