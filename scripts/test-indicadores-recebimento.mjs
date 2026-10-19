/**
 * scripts/test-indicadores-recebimento.mjs — paridade da RPC
 * indicadores_recebimento(de, ate)
 *
 *  A. RPC × src/lib/indicadoresRecebimento.js (o recuo), objeto inteiro, em
 *     vários períodos (inclusive vazio e invertido).
 *  B. A lib × as contas ANTIGAS de IndicadoresRecebimento.jsx (copiadas do
 *     main): iguais, salvo as correções declaradas.
 *
 * Exige indicadores diferentes de zero no período de 60 dias.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { calcularIndicadoresRecebimento } from '../src/lib/indicadoresRecebimento.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-indicadores-recebimento');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

const adm = createClient(URL, ANON, { auth: { persistSession: false } });
await adm.auth.signInWithPassword({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD });
async function tudo(t) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await adm.from(t).select('*').order('id').range(de, de + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const [recebimentos, participantes, ocorrencias] = await Promise.all(
  ['recebimentos', 'recebimento_participantes', 'recebimento_ocorrencias'].map(tudo));

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const menos = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const lib = (de, ate) => calcularIndicadoresRecebimento({ de, ate, recebimentos, participantes, ocorrencias });

const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
const norm = (o) => canon(JSON.parse(JSON.stringify(o, (k, v) => (['gerado_em', 'calculado_no'].includes(k) ? undefined : v))));

console.log('='.repeat(76));
console.log(`indicadores_recebimento(de, ate) | hoje ${hoje} | ${recebimentos.length} recebimentos`);
console.log('='.repeat(76));
console.log('\nA. RPC × recuo (objeto inteiro)');
const PERIODOS = [
  ['hoje', hoje, hoje], ['30 dias', menos(29), hoje], ['60 dias', menos(59), hoje],
  ['histórico todo', menos(270), hoje], ['sem dado', '2030-01-01', '2030-01-31'], ['invertido', hoje, menos(5)],
];
const rpcDe = {};
for (const [rot, de, ate] of PERIODOS) {
  const { data, error } = await adm.rpc('indicadores_recebimento', { de, ate });
  if (error) { ok(false, `${rot}: ${error.message}`); continue; }
  rpcDe[rot] = data;
  const a = JSON.stringify(norm(lib(de, ate))); const b = JSON.stringify(norm(data));
  ok(a === b, `${rot.padEnd(15)} (${de} a ${ate}): idêntico — ${data.total} recebimentos, ${data.ocorrencias.total} ocorrências`);
  if (a !== b) {
    const na = norm(lib(de, ate)); const nb = norm(data);
    for (const k of Object.keys(nb)) if (JSON.stringify(na[k]) !== JSON.stringify(nb[k])) {
      console.log(`      ${k}: lib=${JSON.stringify(na[k])?.slice(0, 160)}\n      ${' '.repeat(k.length)}  rpc=${JSON.stringify(nb[k])?.slice(0, 160)}`);
    }
  }
}
const r = rpcDe['60 dias'];
const v60 = { total: r.total, concluidos: r.concluidos, cancelados: r.cancelados, 'tempo.medio': r.tempo.medio,
  'tempo.pausado_total': Number(r.tempo.pausado_total), 'tempo.produtivo_total': Number(r.tempo.produtivo_total),
  'ocorrencias.total': r.ocorrencias.total, 'ocorrencias.abertas': r.ocorrencias.abertas,
  'ocorrencias.resolvidas': r.ocorrencias.resolvidas, equipe: r.equipe.length };
const zer = Object.entries(v60).filter(([, x]) => !x).map(([k]) => k);
ok(zer.length === 0, `60 dias: nenhum indicador zerado${zer.length ? ` (${zer.join(', ')})` : ''}`);
const nac = r.tempo.por_tipo.find((t) => t.tipo === 'Nacional');
ok(nac && nac.total > 0, `correção 1: "Nacional" no tempo por tipo (${nac?.total} concluídos, média ${nac?.media} min)`);

/* ── B ───────────────────────────────────────────────────────────────────── */
function antigo(dataInicio, dataFim) {
  // IndicadoresRecebimento.jsx no main, sem mudança
  const filtrados = recebimentos.filter((r) => { const data = r.data_chegada || r.data_prevista || ''; return data >= dataInicio && data <= dataFim; });
  const concluidos = filtrados.filter((r) => r.status === 'Concluído' && r.tempo_produtivo_minutos != null);
  const porTipo = Object.entries(filtrados.reduce((acc, r) => { acc[r.tipo] = (acc[r.tipo] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
  const porDia = Object.entries(filtrados.reduce((acc, r) => { const d = r.data_chegada || r.data_prevista || ''; if (!d) return acc; acc[d] = (acc[d] || 0) + 1; return acc; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ dia: date, total }));
  const N = (x) => Number(x);
  const tempoMedioGeral = concluidos.length > 0 ? Math.round(concluidos.reduce((s, r) => s + N(r.tempo_produtivo_minutos), 0) / concluidos.length) : 0;
  const tempoPausadoTotal = filtrados.reduce((s, r) => s + (N(r.tempo_pausado_minutos) || 0), 0);
  const tempoTotalProdutivo = filtrados.reduce((s, r) => s + (N(r.tempo_produtivo_minutos) || 0), 0);
  const tempoMedioPorTipo = ['Importação', 'Devolução', 'Material auxiliar', 'Outro'].map((tipo) => {
    const deste = concluidos.filter((r) => r.tipo === tipo);
    return { tipo, media: deste.length > 0 ? Math.round(deste.reduce((s, r) => s + N(r.tempo_produtivo_minutos), 0) / deste.length) : 0, total: deste.length };
  });
  const rankingOp = Object.entries(participantes.filter((p) => filtrados.some((r) => r.id === p.recebimento_id)).reduce((acc, p) => { acc[p.operator_nome] = (acc[p.operator_nome] || 0) + 1; return acc; }, {})).sort(([, a], [, b]) => b - a).slice(0, 8).map(([nome, total]) => ({ nome, total }));
  const ocFiltradas = ocorrencias.filter((o) => filtrados.some((r) => r.id === o.recebimento_id));
  const ocPorTipo = Object.entries(ocFiltradas.reduce((acc, o) => { acc[o.tipo] = (acc[o.tipo] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
  return { total: filtrados.length, concluidos: filtrados.filter((r) => r.status === 'Concluído').length,
    em_andamento: filtrados.filter((r) => r.status === 'Em andamento').length, cancelados: filtrados.filter((r) => r.status === 'Cancelado').length,
    porTipo, porDia, tempoMedioGeral, tempoPausadoTotal, tempoTotalProdutivo, base: concluidos.length, tempoMedioPorTipo, rankingOp,
    ocTotal: ocFiltradas.length, ocAbertas: ocFiltradas.filter((o) => !o.resolvido).length, ocResolvidas: ocFiltradas.filter((o) => o.resolvido).length, ocPorTipo };
}

console.log('\nB. Recuo (= regra nova) × contas antigas da página');
const conj = (l) => JSON.stringify(l.map((x) => JSON.stringify(x)).sort());
for (const [rot, de, ate] of PERIODOS.filter(([x]) => x !== 'invertido')) {
  const v = antigo(de, ate); const n = lib(de, ate);
  const pares = [
    ['total', v.total, n.total], ['concluídos', v.concluidos, n.concluidos], ['em andamento', v.em_andamento, n.em_andamento],
    ['cancelados', v.cancelados, n.cancelados], ['por tipo (conjunto)', conj(v.porTipo), conj(n.por_tipo)],
    ['por dia', JSON.stringify(v.porDia), JSON.stringify(n.por_dia)], ['tempo médio', v.tempoMedioGeral, n.tempo.medio],
    ['pausado total', v.tempoPausadoTotal, n.tempo.pausado_total], ['produtivo total', v.tempoTotalProdutivo, n.tempo.produtivo_total],
    ['base', v.base, n.tempo.base],
    ['tempo por tipo (os 4 antigos)', JSON.stringify(v.tempoMedioPorTipo), JSON.stringify(n.tempo.por_tipo.filter((t) => t.tipo !== 'Nacional'))],
    ['ocorrências', v.ocTotal, n.ocorrencias.total], ['abertas', v.ocAbertas, n.ocorrencias.abertas], ['resolvidas', v.ocResolvidas, n.ocorrencias.resolvidas],
    ['ocorrência por tipo (conjunto)', conj(v.ocPorTipo), conj(n.ocorrencias.por_tipo)],
  ];
  // Equipe: o top 8 antigo desempatava pela ordem de chegada. Igual em
  // contagens; os nomes só podem diferir dentro de um empate na fronteira.
  const totaisIguais = JSON.stringify(v.rankingOp.map((x) => x.total)) === JSON.stringify(n.equipe.map((x) => x.total));
  const dif = pares.filter(([, a, b]) => a !== b).map(([k]) => k);
  ok(dif.length === 0 && totaisIguais, `${rot.padEnd(15)}: ${pares.length + 1} indicadores iguais à conta antiga${dif.length ? ` — DIFEREM: ${dif.join(', ')}` : ''}${totaisIguais ? '' : ' — equipe difere'}`);
}

console.log('\nQuem executa');
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const ra = await anon.rpc('indicadores_recebimento', { de: hoje, ate: hoje });
ok(ra.error?.code === '42501', `anon é recusado: ${ra.error?.code || 'EXECUTOU'}`);

console.log('\n' + '='.repeat(76));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
