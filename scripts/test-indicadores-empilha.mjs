/**
 * scripts/test-indicadores-empilha.mjs — paridade da RPC
 * indicadores_empilhadeira(de, ate)
 *
 *  A. RPC × src/lib/indicadoresEmpilha.js (o recuo), objeto inteiro, em
 *     vários períodos: hoje, 7 dias, 30 dias, o histórico todo, um período sem
 *     dado nenhum e um período invertido.
 *  B. A mesma lib × as contas ANTIGAS de BlocosIndicadores.jsx (copiadas
 *     abaixo do jeito que estavam no main), com os dados crus: cada indicador
 *     igual, salvo as correções declaradas na migration.
 *
 * Exige indicadores diferentes de zero no período de 30 dias.
 * Rode depois de `semear-volume.mjs`.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { calcularIndicadoresEmpilha } from '../src/lib/indicadoresEmpilha.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-indicadores-empilha');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

const adm = createClient(URL, ANON, { auth: { persistSession: false } });
{
  const { error } = await adm.auth.signInWithPassword({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD });
  if (error) throw error;
}
async function tudo(t) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await adm.from(t).select('*').order('id').range(de, de + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const [programacoes, linhas, paradas, ocorrencias, empilhadeiras] = await Promise.all(
  ['empilha_programacoes', 'empilha_linhas', 'empilhadeira_paradas', 'empilha_ocorrencias', 'empilhadeira_configs'].map(tudo));
const ativa = [...empilhadeiras].filter((e) => e.ativa)
  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || (a.id < b.id ? -1 : 1))[0];

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const menos = (n) => new Date(Date.parse(`${hoje}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

function lib(de, ate) {
  const progs = programacoes.filter((p) => p.data_programada >= de && p.data_programada <= ate);
  const ids = new Set(progs.map((p) => p.id));
  return calcularIndicadoresEmpilha({
    de, ate, programacoes: progs, linhas: linhas.filter((l) => ids.has(l.programacao_id)),
    paradas: paradas.filter((p) => p.data >= de && p.data <= ate),
    ocorrencias: ocorrencias.filter((o) => o.data >= de && o.data <= ate),
    duracaoTurnoHoras: ativa?.duracao_turno_horas,
  });
}

const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
const norm = (o) => canon(JSON.parse(JSON.stringify(o, (k, v) => (['gerado_em', 'calculado_no'].includes(k) ? undefined : v))));

/* ── A ───────────────────────────────────────────────────────────────────── */
console.log('='.repeat(76));
console.log(`indicadores_empilhadeira(de, ate) | hoje ${hoje} | ${linhas.length} linhas, ${paradas.length} paradas`);
console.log('='.repeat(76));
console.log('\nA. RPC × recuo (objeto inteiro)');
const PERIODOS = [
  ['hoje', hoje, hoje], ['7 dias', menos(6), hoje], ['30 dias', menos(29), hoje],
  ['histórico todo', menos(270), hoje], ['sem dado (futuro)', '2030-01-01', '2030-01-07'], ['invertido', hoje, menos(5)],
];
const rpcDe = {};
for (const [rot, de, ate] of PERIODOS) {
  const { data, error } = await adm.rpc('indicadores_empilhadeira', { de, ate });
  if (error) { ok(false, `${rot}: ${error.message}`); continue; }
  rpcDe[rot] = data;
  const a = JSON.stringify(norm(lib(de, ate)));
  const b = JSON.stringify(norm(data));
  ok(a === b, `${rot.padEnd(18)} (${de} a ${ate}): idêntico — ${data.producao.total} linhas, ${data.paradas.total} paradas, OEE ${data.oee.medio}%`);
  if (a !== b) {
    const na = norm(lib(de, ate)); const nb = norm(data);
    for (const k of Object.keys(nb)) if (JSON.stringify(na[k]) !== JSON.stringify(nb[k])) {
      for (const k2 of Object.keys(nb[k] || {})) if (JSON.stringify(na[k]?.[k2]) !== JSON.stringify(nb[k]?.[k2])) {
        console.log(`      ${k}.${k2}: lib=${JSON.stringify(na[k]?.[k2])?.slice(0, 140)}\n${' '.repeat(10 + k.length + k2.length)}rpc=${JSON.stringify(nb[k]?.[k2])?.slice(0, 140)}`);
      }
    }
  }
}
const r30 = rpcDe['30 dias'];
const valores30 = {
  'producao.total': r30.producao.total, 'producao.critico': r30.producao.critico, 'producao.avulso': r30.producao.avulso,
  'producao.concluidas': r30.producao.concluidas, 'producao.tempo_medio': r30.producao.tempo_medio,
  'operadores.empilhadores': r30.operadores.empilhadores.length,
  'operadores.ajudantes': r30.operadores.ajudantes.length, 'paradas.total': r30.paradas.total,
  'paradas.minutos': Number(r30.paradas.minutos), 'ocorrencias.total': r30.ocorrencias.total,
  'ocorrencias.resolvidas': r30.ocorrencias.resolvidas, 'oee.medio': r30.oee.medio,
};
const zerados = Object.entries(valores30).filter(([, v]) => !v).map(([k]) => k);
ok(zerados.length === 0, `30 dias: nenhum indicador zerado${zerados.length ? ` (${zerados.join(', ')})` : ''}`);
ok(r30.paradas.por_tipo.some((x) => x.name === 'Sem tipo'), 'correção 3: parada sem tipo aparece como "Sem tipo"');
ok(rpcDe['invertido']?.producao.total === 0 && rpcDe['invertido']?.oee.dias.length === 0, 'correção 4: período invertido devolve vazio, sem erro');

/* ── B: as contas antigas do componente, copiadas do main ────────────────── */
function antigo(dataInicio, dataFim) {
  const emPeriodo = (data) => data && data >= dataInicio && data <= dataFim;
  const progIds = programacoes.filter((p) => emPeriodo(p.data_programada)).map((p) => p.id);
  const linhasFiltradas = linhas.filter((l) => progIds.includes(l.programacao_id));
  const paradasFiltradas = paradas.filter((p) => emPeriodo(p.data));
  const ocorrenciasFiltradas = ocorrencias.filter((o) => emPeriodo(o.data));
  const empilhadeiraAtiva = empilhadeiras.find((e) => e.ativa);
  // ---- daqui para baixo: BlocosIndicadores.jsx no main, sem mudança ----
  function minsFromHHMM(str) {
    if (!str) return 0;
    if (str.includes('min')) return parseInt(str) || 0;
    const [h, m] = str.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  const duracaoTurnoMins = (empilhadeiraAtiva?.duracao_turno_horas || 8) * 60;
  const totalNormal = linhasFiltradas.filter((l) => l.tipo_linha === 'Normal' || !l.tipo_linha).length;
  const totalCritico = linhasFiltradas.filter((l) => l.tipo_linha === 'Crítico').length;
  const totalAvulso = linhasFiltradas.filter((l) => l.tipo_linha === 'Avulso').length;
  const totalConcluidas = linhasFiltradas.filter((l) => l.status === 'Concluído').length;
  const temposMins = linhasFiltradas.filter((l) => l.tempo_total && l.status === 'Concluído').map((l) => minsFromHHMM(l.tempo_total));
  const tempoMedioGeral = temposMins.length > 0 ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0;
  const tempoMedioTipo = ['Normal', 'Crítico', 'Avulso'].map((tipo) => {
    const ts = linhasFiltradas.filter((l) => (l.tipo_linha === tipo || (!l.tipo_linha && tipo === 'Normal')) && l.status === 'Concluído' && l.tempo_total).map((l) => minsFromHHMM(l.tempo_total));
    return { tipo, media: ts.length > 0 ? Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) : 0, count: ts.length };
  });
  const dias = dataInicio && dataFim ? eachDayOfInterval({ start: parseISO(dataInicio), end: parseISO(dataFim) }) : [];
  const linhasPorDia = dias.map((d) => {
    const dia = format(d, 'yyyy-MM-dd');
    const ps = programacoes.filter((p) => p.data_programada === dia).map((p) => p.id);
    const ls = linhas.filter((l) => ps.includes(l.programacao_id));
    return { dia, Normal: ls.filter((l) => l.tipo_linha === 'Normal' || !l.tipo_linha).length, Crítico: ls.filter((l) => l.tipo_linha === 'Crítico').length, Avulso: ls.filter((l) => l.tipo_linha === 'Avulso').length };
  });
  const rankingEmpilhador = {}; const rankingAjudante = {};
  linhasFiltradas.filter((l) => l.status === 'Concluído').forEach((l) => {
    if (l.operador_empilhadeira) {
      if (!rankingEmpilhador[l.operador_empilhadeira]) rankingEmpilhador[l.operador_empilhadeira] = { total: 0, mins: [] };
      rankingEmpilhador[l.operador_empilhadeira].total++;
      if (l.tempo_total) rankingEmpilhador[l.operador_empilhadeira].mins.push(minsFromHHMM(l.tempo_total));
    }
    if (l.operador_ajudante && l.operador_ajudante !== 'nenhum') {
      if (!rankingAjudante[l.operador_ajudante]) rankingAjudante[l.operador_ajudante] = { total: 0, mins: [] };
      rankingAjudante[l.operador_ajudante].total++;
      if (l.tempo_total) rankingAjudante[l.operador_ajudante].mins.push(minsFromHHMM(l.tempo_total));
    }
  });
  const toRanking = (obj) => Object.entries(obj).map(([nome, d]) => ({ nome, total: d.total, media: d.mins.length > 0 ? Math.round(d.mins.reduce((a, b) => a + b, 0) / d.mins.length) : 0 })).sort((a, b) => b.total - a.total);
  const totalTempoParado = paradasFiltradas.reduce((acc, p) => acc + (parseInt(p.tempo_total) || 0), 0);
  const paradaPorTipo = Object.entries(paradasFiltradas.reduce((acc, p) => { acc[p.tipo] = (acc[p.tipo] || 0) + (parseInt(p.tempo_total) || 0); return acc; }, {})).map(([name, value]) => ({ name, value }));
  const paradasPorDia = dias.map((d) => { const dia = format(d, 'yyyy-MM-dd'); const ps = paradasFiltradas.filter((p) => p.data === dia); return { dia, paradas: ps.length, tempo: ps.reduce((a, p) => a + (parseInt(p.tempo_total) || 0), 0) }; });
  const ocorrPorTipo = Object.entries(ocorrenciasFiltradas.reduce((acc, o) => { acc[o.tipo || 'Outro'] = (acc[o.tipo || 'Outro'] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
  const rankOcorrencias = Object.entries(ocorrenciasFiltradas.reduce((acc, o) => { if (o.registrado_por) { acc[o.registrado_por] = (acc[o.registrado_por] || 0) + 1; } return acc; }, {})).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  const oeeDias = dias.map((d) => {
    const dia = format(d, 'yyyy-MM-dd');
    const ps = programacoes.filter((p) => p.data_programada === dia).map((p) => p.id);
    const ls = linhas.filter((l) => ps.includes(l.programacao_id) && l.status === 'Concluído' && l.tempo_total);
    const produtivo = ls.reduce((a, l) => a + minsFromHHMM(l.tempo_total), 0);
    const parado = paradasFiltradas.filter((p) => p.data === dia).reduce((a, p) => a + (parseInt(p.tempo_total) || 0), 0);
    const aproveitamento = duracaoTurnoMins > 0 ? Math.min(100, Math.round((produtivo / duracaoTurnoMins) * 100)) : 0;
    return { dia, aproveitamento, produtivo, parado };
  });
  const oeeMedio = oeeDias.length > 0 ? Math.round(oeeDias.reduce((a, d) => a + d.aproveitamento, 0) / oeeDias.length) : 0;
  return { totalNormal, totalCritico, totalAvulso, totalConcluidas, total: linhasFiltradas.length, tempoMedioGeral, tempoMedioTipo, linhasPorDia,
    empilhadores: toRanking(rankingEmpilhador), ajudantes: toRanking(rankingAjudante), paradasTotal: paradasFiltradas.length, totalTempoParado,
    paradaPorTipo, paradasPorDia, ocorrTotal: ocorrenciasFiltradas.length, resolvidas: ocorrenciasFiltradas.filter((o) => o.resolvido).length,
    ocorrPorTipo, rankOcorrencias, oeeDias, oeeMedio };
}

console.log('\nB. Recuo (= regra nova) × contas antigas do componente');
const conjunto = (l, chave = (x) => JSON.stringify(x)) => JSON.stringify(l.map(chave).sort());
for (const [rot, de, ate] of PERIODOS.filter(([r]) => r !== 'invertido')) {
  const v = antigo(de, ate); const n = lib(de, ate);
  const pares = [
    ['normal', v.totalNormal, n.producao.normal], ['crítico', v.totalCritico, n.producao.critico],
    ['avulso', v.totalAvulso, n.producao.avulso], ['concluídas', v.totalConcluidas, n.producao.concluidas],
    ['total', v.total, n.producao.total], ['tempo médio', v.tempoMedioGeral, n.producao.tempo_medio],
    ['tempo por tipo', JSON.stringify(v.tempoMedioTipo), JSON.stringify(n.producao.por_tipo)],
    ['linhas por dia', JSON.stringify(v.linhasPorDia), JSON.stringify(n.producao.por_dia)],
    ['ranking empilhadores (conjunto)', conjunto(v.empilhadores), conjunto(n.operadores.empilhadores)],
    ['ranking ajudantes (conjunto)', conjunto(v.ajudantes), conjunto(n.operadores.ajudantes)],
    ['paradas', v.paradasTotal, n.paradas.total], ['minutos parados', v.totalTempoParado, n.paradas.minutos],
    ['parada por tipo (null → "Sem tipo")', conjunto(v.paradaPorTipo.map((x) => ({ ...x, name: x.name === 'null' ? 'Sem tipo' : x.name }))), conjunto(n.paradas.por_tipo)],
    ['paradas por dia', JSON.stringify(v.paradasPorDia), JSON.stringify(n.paradas.por_dia)],
    ['ocorrências', v.ocorrTotal, n.ocorrencias.total], ['resolvidas', v.resolvidas, n.ocorrencias.resolvidas],
    ['ocorrência por tipo (conjunto)', conjunto(v.ocorrPorTipo), conjunto(n.ocorrencias.por_tipo)],
    ['quem registrou (conjunto)', conjunto(v.rankOcorrencias), conjunto(n.ocorrencias.ranking)],
    ['OEE por dia', JSON.stringify(v.oeeDias), JSON.stringify(n.oee.dias)], ['OEE médio', v.oeeMedio, n.oee.medio],
  ];
  const dif = pares.filter(([, a, b]) => a !== b).map(([k]) => k);
  ok(dif.length === 0, `${rot.padEnd(18)}: ${pares.length} indicadores iguais à conta antiga${dif.length ? ` — DIFEREM: ${dif.join(', ')}` : ''}`);
  // Ordem dos rankings: a antiga só desempatava pela ordem de chegada.
  const ordem = (l) => l.every((x, i) => i === 0 || l[i - 1].total >= x.total);
  ok(ordem(n.operadores.empilhadores) && ordem(n.ocorrencias.ranking), `${rot.padEnd(18)}: rankings em ordem decrescente de total`);
}

console.log('\nQuem executa');
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const ra = await anon.rpc('indicadores_empilhadeira', { de: hoje, ate: hoje });
ok(ra.error?.code === '42501', `anon é recusado: ${ra.error?.code || 'EXECUTOU'}`);

console.log('\n' + '='.repeat(76));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
