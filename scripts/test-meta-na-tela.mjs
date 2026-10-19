/**
 * scripts/test-meta-na-tela.mjs — a regra de exibição da meta nas TVs
 * (src/lib/metaNaTela.js), sem navegador nem banco.
 *
 * O ponto principal: SEM META, o anel e a legenda são EXATAMENTE os de antes
 * (o texto antigo está copiado aqui do main). Com meta, cada borda: só uma
 * sala com meta, realizado acima da meta, meta zero recusada no banco (não
 * chega aqui), check-out e empilhadeira.
 */
import { anelEnvase, pilulaProducao, anelSimples } from '../src/lib/metaNaTela.js';

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const envase = {
  concluidos: 11, lancados: 23, em_andamento: 20,
  por_sala: { Bio: { producao: 6709, concluidos: 8 }, Industrial: { producao: 5214, concluidos: 3 } },
};
const semMetas = { envase: { unidades: { Bio: null, Industrial: null }, envases: { Bio: null, Industrial: null } }, checkout: { pedidos: null }, empilhadeira: { linhas: null } };

console.log('SEM META: igual ao de antes');
const antigoEnvase = { valor: 11, total: 23, legenda: '20 em andamento · 23 lançados' };
const a0 = anelEnvase({ envase, metas: semMetas });
ok(!a0.usaMeta && eq({ valor: a0.valor, total: a0.total, legenda: a0.legenda }, antigoEnvase), `envase: ${a0.legenda}`);
ok(anelEnvase({ envase: { ...envase, lancados: 0 }, metas: null }).legenda === 'sem lançamentos', 'envase sem lançamentos e sem metas (null): "sem lançamentos"');
ok(pilulaProducao({ envase, metas: semMetas }) === null, 'pílula de produção: null (a tela mantém "N registros no mês")');
const ck0 = anelSimples({ concluidos: 10, total: 31, meta: null, unidade: 'pedidos', emAberto: 21, rotuloAberto: 'pendentes' });
ok(eq(ck0, { usaMeta: false, valor: 10, total: 31, legenda: '21 pendentes · 31 no dia' }), `check-out: ${ck0.legenda}`);
const em0 = anelSimples({ concluidos: 6, total: 12, meta: null, unidade: 'linhas', emAberto: 6, rotuloAberto: 'em aberto' });
ok(em0.legenda === '6 em aberto · 12 no dia' && em0.total === 12, `empilhadeira: ${em0.legenda}`);
ok(anelSimples({ concluidos: 0, total: 0, meta: null, unidade: 'linhas', emAberto: 0, rotuloAberto: 'em aberto' }).legenda === 'sem linhas', 'empilhadeira vazia: "sem linhas"');

console.log('\nCOM META');
const ambas = { ...semMetas, envase: { unidades: { Bio: 8000, Industrial: 6000 }, envases: { Bio: 14, Industrial: 6 } } };
const a1 = anelEnvase({ envase, metas: ambas });
ok(a1.usaMeta && a1.valor === 11 && a1.total === 20 && a1.legenda === 'meta 20 envases · Bio 8/14 · Industrial 3/6', `duas salas: ${a1.legenda}`);
const soBio = { ...semMetas, envase: { unidades: { Bio: 8000, Industrial: null }, envases: { Bio: 14, Industrial: null } } };
const a2 = anelEnvase({ envase, metas: soBio });
ok(a2.valor === 8 && a2.total === 14 && /Industrial sem meta/.test(a2.legenda),
  `só a Bio com meta: o anel conta só a Bio (8/14), não 11/14 — "${a2.legenda}"`);
const p2 = pilulaProducao({ envase, metas: soBio });
ok(p2.texto === '84% da meta de 8.000 un. (Industrial sem meta)' && p2.tom === 'atencao', `pílula só Bio: ${p2.texto}`);
const p1 = pilulaProducao({ envase, metas: ambas });
ok(p1.texto === '85% da meta de 14.000 un.', `pílula duas salas: ${p1.texto}`);
const acima = pilulaProducao({ envase, metas: { ...semMetas, envase: { unidades: { Bio: 5000, Industrial: 5000 }, envases: { Bio: null, Industrial: null } } } });
ok(acima.texto.startsWith('119%') && acima.tom === 'ok', `acima da meta: ${acima.texto} (tom ${acima.tom})`);
const ck1 = anelSimples({ concluidos: 10, total: 31, meta: 33, unidade: 'pedidos', emAberto: 21, rotuloAberto: 'pendentes' });
ok(eq(ck1, { usaMeta: true, valor: 10, total: 33, legenda: 'meta 33 pedidos · 21 pendentes' }), `check-out com meta: ${ck1.legenda}`);
const ck2 = anelSimples({ concluidos: 40, total: 45, meta: '33', unidade: 'pedidos', emAberto: 5, rotuloAberto: 'pendentes' });
ok(ck2.total === 33 && ck2.valor === 40, 'meta vinda como texto (numeric do PostgREST) vira número; 40 de 33 (o anel limita a 100%)');

console.log('\n' + (falhas ? `${falhas} FALHA(S)` : 'TUDO OK'));
process.exit(falhas ? 1 : 0);
