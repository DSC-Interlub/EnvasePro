/**
 * scripts/test-checklist-criterio.js
 *
 * Testa a função única do critério do checklist, faixa por faixa e nos limites.
 *
 * Os limites são o que importa: o defeito que a auditoria achou — nota negativa
 * aparecendo amarela na TV — era justamente um ramo de faixa que faltava.
 *
 * Uso: node scripts/test-checklist-criterio.js
 */

import {
  CRITERIOS, CLASSIFICACAO, classificar, rotulo, corTexto, corSelo, corCaixa,
  corNome, contarPorFaixa, percentualConformidade, PONTOS, NOTA_MINIMA, NOTA_MAXIMA,
} from '../src/lib/checklist.js';

let ok = 0;
let falhou = 0;
const falhas = [];

function checar(nome, condicao, detalhe = '') {
  if (condicao) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

/** Monta um checklist como a trigger do banco o gravaria. */
function checklistCom(sims, naos) {
  const na = 9 - sims - naos;
  if (na < 0) throw new Error('mais de 9 respostas');
  return {
    total_sim: sims, total_nao: naos,
    soma_sim: sims * 10, soma_nao: naos * -10,
    nota_final: sims * 10 + naos * -10,
  };
}

const A = CRITERIOS.PONTOS;
const B = CRITERIOS.PERCENTUAL;

console.log('='.repeat(72));
console.log('CRITERIO DO CHECKLIST');
console.log('='.repeat(72));

// ------------------------------------------------- a nota que a trigger gera
console.log('\n[1] a nota possivel, conforme a trigger do banco');
checar('"Sim" vale +10, "Nao" vale -10, "N/A" vale 0',
  PONTOS.Sim === 10 && PONTOS['Não'] === -10 && PONTOS['N/A'] === 0);
checar('9 "Sim" = 90, que e o maximo', checklistCom(9, 0).nota_final === NOTA_MAXIMA);
checar('9 "Nao" = -90, que e o minimo', checklistCom(0, 9).nota_final === NOTA_MINIMA);
checar('8 "Sim" + 1 "N/A" = 80', checklistCom(8, 0).nota_final === 80);
checar('9 "N/A" = 0', checklistCom(0, 0).nota_final === 0);

// -------------------------------------------------------- criterio A: pontos
console.log('\n[2] criterio A (pontos) — as combinacoes que APROVAM');
checar('9 "Sim" (90) aprova', classificar(checklistCom(9, 0), A) === CLASSIFICACAO.APROVADO);
checar('8 "Sim" + 1 "N/A" (80) aprova', classificar(checklistCom(8, 0), A) === CLASSIFICACAO.APROVADO);
console.log('      -> sao as DUAS unicas combinacoes que chegam a 80');

console.log('\n[3] criterio A — limites de cada faixa');
checar('79 ainda nao aprova (limite de baixo)', classificar(79, A) === CLASSIFICACAO.ATENCAO);
checar('80 aprova (limite exato)', classificar(80, A) === CLASSIFICACAO.APROVADO);
checar('0 e Atencao, nao Reprovado', classificar(0, A) === CLASSIFICACAO.ATENCAO);
checar('-1 e Reprovado', classificar(-1, A) === CLASSIFICACAO.REPROVADO);
checar('-90 e Reprovado', classificar(-90, A) === CLASSIFICACAO.REPROVADO);
checar('70, a maior nota do historico real, e Atencao', classificar(70, A) === CLASSIFICACAO.ATENCAO);

console.log('\n[4] sem nota');
for (const v of [null, undefined, NaN, 'abc']) {
  checar(`${String(v)} e SEM_NOTA`, classificar(v, A) === CLASSIFICACAO.SEM_NOTA);
}

// -------------------------------------------------- criterio B: percentual
console.log('\n[5] criterio B (percentual sobre o aplicavel) — FAIXAS A CONFIRMAR');
checar('9 "Sim" = 100%', percentualConformidade(checklistCom(9, 0)) === 100);
checar('8 "Sim" + 1 "Nao" = 89%', percentualConformidade(checklistCom(8, 1)) === 89);
checar('5 "Sim" + 4 "N/A" = 100% (N/A nao conta)', percentualConformidade(checklistCom(5, 0)) === 100);
checar('todas "N/A" devolve null (nada a medir, sem divisao por zero)',
  percentualConformidade(checklistCom(0, 0)) === null);
checar('100% aprova', classificar(checklistCom(9, 0), B) === CLASSIFICACAO.APROVADO);
checar('89% e Atencao (limite de baixo de 90%)', classificar(checklistCom(8, 1), B) === CLASSIFICACAO.ATENCAO);
checar('5 "Sim" + 4 "N/A" APROVA em B', classificar(checklistCom(5, 0), B) === CLASSIFICACAO.APROVADO);
checar('  ... e so da Atencao em A (nota 50)', classificar(checklistCom(5, 0), A) === CLASSIFICACAO.ATENCAO);
console.log('      -> e esta a diferenca que importa entre A e B:');
console.log('         um checklist sem NENHUM problema, com 4 perguntas nao');
console.log('         aplicaveis, tira 50 em A e 100% em B.');

const seis = checklistCom(6, 3); // 6 de 9 aplicaveis = 67%
checar('67% e Reprovado em B (abaixo de 70%)', classificar(seis, B) === CLASSIFICACAO.REPROVADO);
checar('  ... mas e Atencao em A (nota 30)', classificar(seis, A) === CLASSIFICACAO.ATENCAO);

// ----------------------------------------------------------- apresentacao
console.log('\n[6] rotulo e cor — os QUATRO estados existem sempre');
checar('rotulo de 90 e "Aprovado"', rotulo(90) === 'Aprovado');
checar('rotulo de 50 e "Atencao"', rotulo(50) === 'Atenção');
checar('rotulo de -10 e "Reprovado"', rotulo(-10) === 'Reprovado');
checar('rotulo de null e "—"', rotulo(null) === '—');

// Era este o defeito do Painel: nota negativa caindo no ramo amarelo.
checar('NOTA NEGATIVA e VERMELHA no texto', corTexto(-10) === 'text-red-700');
checar('NOTA NEGATIVA e VERMELHA no selo', corSelo(-10).includes('red'));
checar('NOTA NEGATIVA e VERMELHA na caixa', corCaixa(-10).includes('red'));
checar('NOTA NEGATIVA e "red" no nome de cor', corNome(-10) === 'red');
console.log('      -> Painel.jsx:549 tinha so verde/amarelo: negativa ficava AMARELA');

for (const [fn, nome] of [[corTexto, 'corTexto'], [corSelo, 'corSelo'], [corCaixa, 'corCaixa'], [corNome, 'corNome']]) {
  const vistos = new Set([fn(90), fn(50), fn(-10), fn(null)]);
  checar(`${nome} devolve 4 valores distintos`, vistos.size === 4, [...vistos].join(' | '));
}

console.log('\n[7] contagem por faixa');
const lista = [checklistCom(9, 0), checklistCom(8, 0), checklistCom(5, 0), checklistCom(0, 5), { nota_final: null }];
const c = contarPorFaixa(lista, A);
checar('conta 2 aprovados, 1 atencao, 1 reprovado, 1 sem nota',
  c.APROVADO === 2 && c.ATENCAO === 1 && c.REPROVADO === 1 && c.SEM_NOTA === 1, JSON.stringify(c));
checar('a soma bate com o tamanho da lista',
  c.APROVADO + c.ATENCAO + c.REPROVADO + c.SEM_NOTA === lista.length);

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
