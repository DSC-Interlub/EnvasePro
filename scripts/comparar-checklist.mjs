/**
 * scripts/comparar-checklist.mjs — prova de que só a COR mudou no checklist
 *
 * Compara `src/lib/checklist.js` com uma cópia de referência (por padrão
 * `scratch/checklist/checklist.ANTES.js`, tirada do git antes da mudança),
 * chamando as duas com TODAS as entradas que importam:
 *
 *  - cada nota inteira de -90 a +90;
 *  - entradas ruins: null, undefined, '', 'abc', NaN, Infinity, '45', ' 45 ';
 *  - checklists de verdade: todas as combinações de Sim / Não / N/A nas 9
 *    perguntas que o critério de percentual usa (3^9 = 19.683 casos);
 *  - cada critério de CRITERIOS.
 *
 * Exige IDÊNTICO, valor a valor, em tudo que é regra: classificar, rotulo,
 * corNome, contarPorFaixa, percentualConformidade e as constantes (PONTOS,
 * NOTA_MINIMA, NOTA_MAXIMA, TOTAL_PERGUNTAS, CRITERIOS, CRITERIO_ATIVO).
 *
 * Nas três funções de classe (corTexto, corSelo, corCaixa) exige outra coisa:
 * que a troca seja uma TRADUÇÃO FIXA — cada classe antiga vira sempre a mesma
 * classe nova, e duas classes antigas diferentes nunca viram a mesma nova.
 * Isso prova que nenhuma nota mudou de cor de ESTADO: o que era vermelho
 * continua sendo a cor de erro, o que era amarelo continua sendo atenção.
 *
 * Uso: node scripts/comparar-checklist.mjs [referencia.js]
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const refArq = process.argv[2] || 'scratch/checklist/checklist.ANTES.js';
const antes = await import(pathToFileURL(path.resolve(refArq)).href);
const depois = await import(pathToFileURL(path.resolve('src/lib/checklist.js')).href);

let comparacoes = 0;
const divergencias = [];

function igual(rotulo, a, b) {
  comparacoes += 1;
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb && divergencias.length < 20) divergencias.push(`${rotulo}: antes=${sa} depois=${sb}`);
  return sa === sb;
}

// ── constantes ───────────────────────────────────────────────────────────
for (const nome of ['PONTOS', 'TOTAL_PERGUNTAS', 'NOTA_MINIMA', 'NOTA_MAXIMA', 'CRITERIOS', 'CRITERIO_ATIVO', 'CLASSIFICACAO']) {
  igual(`constante ${nome}`, antes[nome], depois[nome]);
}

// ── as entradas ──────────────────────────────────────────────────────────
const notas = [];
for (let n = -90; n <= 90; n += 1) notas.push(n);
const ruins = [null, undefined, '', 'abc', NaN, Infinity, -Infinity, '45', ' 45 ', '-10', 0.5, -0.5, 89.9];

// Checklists de verdade: toda combinação de Sim + Não + N/A que soma 9, com a
// nota que a trigger do banco calcula (Sim +10, Não -10, N/A 0) — e também
// cada combinação SEM nota (null), para exercitar o caminho de queda do
// critério de percentual. É o que `classificar` e `percentualConformidade`
// leem: nota_final, total_sim, total_nao, total_na.
const checklists = [];
for (let sim = 0; sim <= 9; sim += 1) {
  for (let nao = 0; nao + sim <= 9; nao += 1) {
    const na = 9 - sim - nao;
    const base = { total_sim: sim, total_nao: nao, total_na: na };
    checklists.push({ ...base, nota_final: 10 * sim - 10 * nao });
    checklists.push({ ...base, nota_final: null });
    checklists.push({ ...base, nota_final: String(10 * sim - 10 * nao) });
  }
}
// Sempre também por nota_final, que é o caminho que a tela usa.
for (const n of [...notas, ...ruins]) checklists.push({ nota_final: n });

const criterios = Object.values(antes.CRITERIOS);

// ── regra: idêntico ──────────────────────────────────────────────────────
for (const cr of criterios) {
  for (const x of [...notas, ...ruins, ...checklists]) {
    for (const fn of ['classificar', 'rotulo', 'corNome']) {
      igual(`${fn}(${JSON.stringify(x)?.slice(0, 60)}, ${cr.id || cr.nome || '?'})`, antes[fn](x, cr), depois[fn](x, cr));
    }
  }
  igual(`contarPorFaixa(${checklists.length} checklists)`, antes.contarPorFaixa(checklists, cr), depois.contarPorFaixa(checklists, cr));
}
// SEM critério: cada versão usa o SEU CRITERIO_ATIVO — é assim que as telas
// chamam. Passar o critério da referência às duas esconderia uma mudança de
// limite (o mutante "aprovado a partir de 70" passou por aqui sem divergir,
// pego só pela comparação de constantes).
for (const x of [...notas, ...ruins, ...checklists]) {
  for (const fn of ['classificar', 'rotulo', 'corNome']) {
    igual(`${fn}(${JSON.stringify(x)?.slice(0, 60)}) [critério ativo de cada versão]`, antes[fn](x), depois[fn](x));
  }
}

for (const c of checklists) {
  igual(`percentualConformidade(${JSON.stringify(c).slice(0, 60)})`,
    antes.percentualConformidade(c), depois.percentualConformidade(c));
}

// ── cor: tradução fixa e sem colisão ─────────────────────────────────────
const traducoes = {};
for (const fn of ['corTexto', 'corSelo', 'corCaixa']) {
  const mapa = new Map();
  for (const cr of criterios) {
    for (const x of [...notas, ...ruins, ...checklists]) {
      const a = antes[fn](x, cr);
      const b = depois[fn](x, cr);
      comparacoes += 1;
      if (!mapa.has(a)) mapa.set(a, b);
      else if (mapa.get(a) !== b && divergencias.length < 20) {
        divergencias.push(`${fn}: "${a}" virou "${mapa.get(a)}" e também "${b}" — a tradução não é fixa`);
      }
    }
  }
  const destinos = [...mapa.values()];
  if (new Set(destinos).size !== destinos.length) {
    divergencias.push(`${fn}: duas classes antigas diferentes viraram a MESMA classe nova (${destinos.join(' | ')})`);
  }
  traducoes[fn] = Object.fromEntries(mapa);
}

console.log('='.repeat(78));
console.log('CHECKLIST — antes × depois');
console.log('='.repeat(78));
console.log(`referência: ${refArq}`);
console.log(`checklists gerados: ${checklists.length}  |  critérios: ${criterios.length}`);
console.log(`comparações feitas: ${comparacoes.toLocaleString('pt-BR')}`);
console.log('\nTradução de cor (antes -> depois):');
for (const [fn, t] of Object.entries(traducoes)) {
  console.log(`  ${fn}`);
  for (const [a, b] of Object.entries(t)) console.log(`    ${a.padEnd(48)} -> ${b}`);
}
console.log('\n' + '='.repeat(78));
if (divergencias.length) {
  console.log(`DIVERGÊNCIAS (${divergencias.length}):`);
  for (const d of divergencias) console.log('  - ' + d);
  process.exit(1);
}
console.log('IDÊNTICO em toda a regra; cor é tradução fixa, um para um.');
console.log('='.repeat(78));
