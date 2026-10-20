/**
 * scripts/test-painel-televisao.mjs — paridade da RPC painel_televisao()
 *
 * Três comparações, com os mesmos dados, lidos como a conta da TV:
 *
 *  A. RPC × recuo do navegador (src/lib/painelTelevisao.js): objeto INTEIRO
 *     idêntico — é o que a TV mostra se a migration ainda não estiver aplicada.
 *  B. RPC × as fórmulas da tela antiga (copiadas de src/pages/Televisao.jsx
 *     antes da troca), aplicadas a TODAS as linhas: cada indicador igual, salvo
 *     as quatro correções declaradas na migration.
 *  C. As quatro correções, com o valor antigo ao lado do novo, para o dono ver
 *     o que muda na tela.
 *
 * Exige indicadores diferentes de zero. Rode depois de `semear-volume.mjs`.
 * Uso: node scripts/test-painel-televisao.mjs
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { calcularPainelEmpilha } from '../src/lib/painelEmpilha.js';
import { calcularPainelTelevisao, limitesDoMes } from '../src/lib/painelTelevisao.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-painel-televisao');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const tv = createClient(URL, ANON, { auth: { persistSession: false } });
{
  const { error } = await tv.auth.signInWithPassword({ email: process.env.TEST_TV_EMAIL, password: process.env.TEST_TV_PASSWORD });
  if (error) throw error;
}

async function tudo(construir) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await construir().range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

const dia = hojeSP();
const [rpcR, envaseTodos, checkoutTodos, progsCheckout, produtos, progsEmp, linhasEmp, ocorrEmp, paradas, empilhadeiras] = await Promise.all([
  tv.rpc('painel_televisao'),
  tudo(() => tv.from('envase_records').select('*').order('updated_at', { ascending: false })),
  tudo(() => tv.from('checkout_itens').select('*').order('updated_at', { ascending: false })),
  tudo(() => tv.from('checkout_programacoes').select('*')),
  tudo(() => tv.from('products').select('*')),
  tudo(() => tv.from('empilha_programacoes').select('*')),
  tudo(() => tv.from('empilha_linhas').select('*')),
  tudo(() => tv.from('empilha_ocorrencias').select('*')),
  tudo(() => tv.from('empilhadeira_paradas').select('*')),
  tudo(() => tv.from('empilhadeira_configs').select('*')),
]);
if (rpcR.error) throw rpcR.error;
const rpc = rpcR.data;

console.log('='.repeat(76));
console.log(`painel_televisao() | dia ${dia} | ${envaseTodos.length} envases, ${checkoutTodos.length} itens de check-out`);
console.log('='.repeat(76));
ok(rpc.dia === dia, `dia da RPC = dia de Brasília (${rpc.dia})`);

/* ── A. RPC × recuo do navegador ─────────────────────────────────────────── */
console.log('\nA. RPC × recuo do navegador (objeto inteiro)');
{
  const { inicio, fim } = limitesDoMes(dia);
  const idsCk = progsCheckout.filter((p) => p.data_programada === dia).map((p) => p.id);
  const idsEmp = progsEmp.filter((p) => p.data_programada === dia).map((p) => p.id);
  const nav = calcularPainelTelevisao({
    dia,
    envaseHoje: envaseTodos.filter((r) => r.data === dia),
    envaseMes: envaseTodos.filter((r) => r.data >= inicio && r.data < fim),
    checkoutHoje: checkoutTodos.filter((i) => idsCk.includes(i.programacao_id)),
    produtos,
    painelEmpilha: calcularPainelEmpilha(linhasEmp.filter((l) => idsEmp.includes(l.programacao_id)),
      ocorrEmp.filter((o) => o.data === dia), dia),
    paradasHoje: paradas.filter((p) => p.data === dia),
    empilhadeiras,
  });
  const canon = (v) => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
  // Números e instantes podem vir com grafias diferentes (numeric "10.000",
  // timestamp com microssegundos): normaliza o que é número e o que é instante.
  const norm = (o) => JSON.parse(JSON.stringify(o), (k, v) => {
    if (['gerado_em', 'calculado_no'].includes(k)) return undefined;
    if (k === 'atualizado' && v) return Date.parse(v);
    if (['quantidade', 'quantidade_produzida'].includes(k) && v != null) return Number(v);
    return v;
  });
  let algum = false;
  for (const bloco of ['envase', 'checkout', 'empilha', 'mes']) {
    const a = JSON.stringify(canon(norm(nav[bloco])));
    const b = JSON.stringify(canon(norm(rpc[bloco])));
    ok(a === b, `bloco "${bloco}" idêntico`);
    if (a !== b) {
      algum = true;
      for (const k of Object.keys(rpc[bloco])) {
        if (JSON.stringify(canon(norm(nav[bloco]))[k]) !== JSON.stringify(canon(norm(rpc[bloco]))[k])) {
          console.log(`      difere ${bloco}.${k}: nav=${JSON.stringify(norm(nav[bloco])[k])?.slice(0, 120)} rpc=${JSON.stringify(norm(rpc[bloco])[k])?.slice(0, 120)}`);
        }
      }
    }
  }
  if (!algum) console.log(`     (${rpc.envase.operacoes.length} + ${rpc.checkout.operacoes.length} + ${rpc.empilha.operacoes.length} operações, na mesma ordem)`);
}

/* ── B. As fórmulas da tela antiga, sobre TODAS as linhas ────────────────── */
function comoATela(allEnvaseRecords, allCheckoutItems, today) {
  // envaseRecords (cartões)
  const envaseRecords = allEnvaseRecords.filter((r) => {
    if (!r.inicio) return false;
    if (r.sala === 'Bio') { if (r.material_retirado) return false; } else if (r.termino) return false;
    return r.data === today;
  });
  const todayProgramacaoIds = progsCheckout.filter((p) => p.data_programada === today).map((p) => p.id);
  const checkoutItems = allCheckoutItems
    .filter((item) => item.hora_inicio && !item.hora_termino && item.status === 'Em Andamento' && todayProgramacaoIds.includes(item.programacao_id));
  // todayStats (com list() sem teto, como a tela fazia)
  const todayRecords = envaseTodos.filter((r) => r.data === today);
  const todayCheckouts = checkoutTodos.filter((item) => todayProgramacaoIds.includes(item.programacao_id));
  const todayStats = {
    envaseTotal: todayRecords.reduce((s, r) => s + (Number(r.quantidade_produzida) || 0), 0),
    envaseConcluidos: todayRecords.filter((r) => r.termino).length,
    checkoutConcluidos: todayCheckouts.filter((i) => i.status === 'Concluído').length,
    checkoutPendentes: todayCheckouts.length,
  };
  // mês (2.000 mais recentes por data)
  const mes = today.slice(0, 7);
  const ult2000 = [...envaseTodos].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 2000);
  const monthRecords = ult2000.filter((r) => r.data && r.data.startsWith(mes));
  const q = (l) => l.reduce((s, r) => s + (Number(r.quantidade_produzida) || 0), 0);
  const categoriaDe = Object.fromEntries(produtos.filter((p) => p.categoria).map((p) => [p.codigo, p.categoria]));
  const porCat = { oleo: 0, graxa: 0, pasta: 0 };
  for (const r of monthRecords) {
    if (!r.codigo_produto) continue;
    const c = categoriaDe[r.codigo_produto];
    const v = Number(r.quantidade_produzida) || 0;
    if (c === 'Óleo') porCat.oleo += v; else if (c === 'Graxa') porCat.graxa += v; else if (c === 'Pasta') porCat.pasta += v;
  }
  // empilhadeira
  const todayProgIds = progsEmp.filter((p) => p.data_programada === today).map((p) => p.id);
  const todayLinhas = linhasEmp.filter((l) => todayProgIds.includes(l.programacao_id));
  const temposMins = todayLinhas.filter((l) => l.status === 'Concluído' && l.tempo_total)
    .map((l) => { const [h, m] = (l.tempo_total || '0:0').split(':').map(Number); return h * 60 + (m || 0); });
  return {
    envaseRecords, checkoutItems, todayStats,
    mes: {
      total: q(monthRecords), bio: q(monthRecords.filter((r) => r.sala === 'Bio')),
      industrial: q(monthRecords.filter((r) => r.sala === 'Industrial')),
      registros: monthRecords.length, bio_registros: monthRecords.filter((r) => r.sala === 'Bio').length,
      industrial_registros: monthRecords.filter((r) => r.sala === 'Industrial').length, ...porCat,
    },
    empilha: {
      total: todayLinhas.length,
      concluidas: todayLinhas.filter((l) => l.status === 'Concluído').length,
      criticos_pendentes: todayLinhas.filter((l) => l.tipo_linha === 'Crítico' && l.status !== 'Concluído').length,
      tempo_medio_min: temposMins.length ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0,
      em_andamento: todayLinhas.filter((l) => l.status === 'Em Andamento').length,
      ocorrencias_abertas: ocorrEmp.filter((o) => o.data === today && !o.resolvido).length,
      parada_ativa: !!paradas.find((p) => p.data === today && !p.hora_fim),
    },
  };
}

console.log('\nB. Fórmulas da tela antiga (sem o teto) × RPC');
const velho = comoATela(envaseTodos, checkoutTodos, dia);
const linhasB = [
  ['envase.producao_dia', velho.todayStats.envaseTotal, Number(rpc.envase.producao_dia)],
  ['envase.concluidos', velho.todayStats.envaseConcluidos, rpc.envase.concluidos],
  ['envase.em_andamento (cartões)', velho.envaseRecords.length, rpc.envase.em_andamento],
  ['checkout.concluidos', velho.todayStats.checkoutConcluidos, rpc.checkout.concluidos],
  ['checkout.total_dia (era "pendentes")', velho.todayStats.checkoutPendentes, rpc.checkout.total_dia],
  ['checkout.em_andamento', velho.checkoutItems.length, rpc.checkout.em_andamento],
  ['checkout.criticos', velho.checkoutItems.filter((i) => i.critico).length, rpc.checkout.criticos],
  ...Object.entries(velho.empilha).map(([k, v]) => [`empilha.${k}`, v, rpc.empilha[k]]),
  ...Object.entries(velho.mes).map(([k, v]) => [`mes.${k}`, v, Number(rpc.mes[k])]),
];
console.log(`  ${'indicador'.padEnd(38)} ${'tela'.padStart(9)} ${'RPC'.padStart(9)}`);
for (const [k, a, b] of linhasB) console.log(`  ${k.padEnd(38)} ${String(a).padStart(9)} ${String(b).padStart(9)}${a === b ? '' : '   <-- DIFERE'}`);
ok(linhasB.every(([, a, b]) => a === b), `os ${linhasB.length} indicadores são IGUAIS`);
const PODE_ZERO = new Set(['empilha.parada_ativa']);
const zerados = linhasB.filter(([k, a]) => !a && !PODE_ZERO.has(k)).map(([k]) => k);
ok(zerados.length === 0, `nenhum indicador zerado${zerados.length ? ` (zerados: ${zerados.join(', ')})` : ''} — parada_ativa é booleano, pode ser falso`);
const ids = (l) => JSON.stringify(l.map((x) => x.id).sort());
ok(ids(velho.envaseRecords) === ids(rpc.envase.operacoes), `mesmos ${rpc.envase.operacoes.length} cartões de envase`);
ok(ids(velho.checkoutItems) === ids(rpc.checkout.operacoes), `mesmos ${rpc.checkout.operacoes.length} cartões de check-out`);

/* ── C. As correções ─────────────────────────────────────────────────────── */
console.log('\nC. As quatro correções (valor que a tela antiga MOSTRAVA × valor novo)');
const top100 = (l) => l.slice(0, 100); // as listas já vêm por updated_at desc
const comTeto = comoATela(top100(envaseTodos), top100(checkoutTodos), dia);
const totalCkAntigo = velho.todayStats.checkoutConcluidos + velho.todayStats.checkoutPendentes;
const lancAntigo = velho.todayStats.envaseConcluidos + velho.envaseRecords.length;
const tab = [
  ['1. envase em andamento (teto de 100)', comTeto.envaseRecords.length, rpc.envase.em_andamento],
  ['1. check-out em andamento (teto de 100)', comTeto.checkoutItems.length, rpc.checkout.em_andamento],
  ['2. check-out "pendentes" no rodapé', velho.todayStats.checkoutPendentes, rpc.checkout.pendentes],
  ['2. check-out "no dia" (anel)', totalCkAntigo, rpc.checkout.total_dia],
  ['3. envase "lançados"', lancAntigo, rpc.envase.lancados],
  ['4. mês, registros (teto de 2.000)', velho.mes.registros, rpc.mes.registros],
];
console.log(`  ${'correção'.padEnd(42)} ${'antes'.padStart(7)} ${'agora'.padStart(7)}`);
for (const [k, a, b] of tab) console.log(`  ${k.padEnd(42)} ${String(a).padStart(7)} ${String(b).padStart(7)}`);
ok(rpc.checkout.pendentes + rpc.checkout.concluidos === rpc.checkout.total_dia, 'check-out: pendentes + concluídos = total do dia');
const hoje = envaseTodos.filter((r) => r.data === dia);
const uniao = new Set([...hoje.filter((r) => r.termino).map((r) => r.id), ...velho.envaseRecords.map((r) => r.id)]);
ok(rpc.envase.lancados >= uniao.size && rpc.envase.lancados <= hoje.length,
  `envase lançados (${rpc.envase.lancados}) conta cada envase uma vez (união concluídos ∪ cartões = ${uniao.size}; envases do dia = ${hoje.length})`);
const duplos = hoje.filter((r) => r.sala === 'Bio' && r.termino && !r.material_retirado && r.inicio).length;
ok(lancAntigo - duplos === uniao.size, `a diferença antiga era exatamente os ${duplos} Bio prontos contados duas vezes`);

/* ── D. Parada aberta: o único indicador booleano, exercitado nos dois valores ── */
console.log('\nD. Empilhadeira parada agora');
{
  const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: emp } = await svc.from('empilhadeira_configs').select('id').limit(1).single();
  const { data: parada, error: eP } = await svc.from('empilhadeira_paradas').insert({
    empilhadeira_id: emp.id, data: dia, hora_inicio: '06:00', registrado_por: 'VOL teste de paridade', descricao: 'VOL parada',
  }).select('id').single();
  if (eP) throw eP;
  try {
    const { data: com } = await tv.rpc('painel_televisao');
    ok(com.empilha.parada_ativa === true, 'com uma parada sem hora de fim, parada_ativa = true');
  } finally {
    await svc.from('empilhadeira_paradas').delete().eq('id', parada.id);
  }
  const { data: sem } = await tv.rpc('painel_televisao');
  ok(sem.empilha.parada_ativa === false, 'apagada a parada de teste, volta a false');
}

/* ── segurança ───────────────────────────────────────────────────────────── */
console.log('\nQuem executa');
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const ra = await anon.rpc('painel_televisao');
ok(ra.error?.code === '42501', `anon é recusado: ${ra.error?.code || 'EXECUTOU'}`);

console.log('\n' + '='.repeat(76));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
