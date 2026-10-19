/**
 * scripts/test-dashboard-faixa.mjs — o Dashboard busca só a faixa, e os
 * gráficos recebem as MESMAS linhas.
 *
 * Para cada combinação de filtros, compara:
 *   antes:  tabela inteira  → filtro do navegador (copiado do main)
 *   agora:  faixa do servidor (faixaDoServidor + gte/lte) → o MESMO filtro
 * Exige o mesmo conjunto de linhas, e mede quanto deixou de ser baixado.
 *
 * Inclui um envase SEM data (criado e apagado aqui), que nenhum filtro de
 * data deixa passar e que só aparece em "sem mês" (tudo).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { paraData } from '../src/lib/datas.js';
import { faixaDoServidor } from '../src/lib/faixaDashboard.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-dashboard-faixa');

const URL = process.env.VITE_SUPABASE_URL;
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const adm = createClient(URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await adm.auth.signInWithPassword({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD });
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function ler(de, ate) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    let q = adm.from('envase_records').select('*');
    if (de) q = q.gte('data', de);
    if (ate) q = q.lte('data', ate);
    const { data, error } = await q.order('data', { ascending: false }).order('id').range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// O filtro do navegador, como está em src/pages/Dashboard.jsx (main).
function filtroDaTela({ selectedMonth, startDate, endDate, selectedOperator, selectedSala }) {
  const combina = (record) => {
    const operatorMatch = selectedOperator === 'all' || record.operador === selectedOperator;
    let dateMatch = true;
    if (selectedMonth) {
      const recordDate = paraData(record.data);
      const recordMonth = recordDate ? format(recordDate, 'yyyy-MM') : null;
      dateMatch = recordMonth === selectedMonth;
      if (startDate || endDate) {
        const s = record.data;
        if (startDate && endDate) dateMatch = s >= startDate && s <= endDate;
        else if (startDate) dateMatch = s >= startDate;
        else if (endDate) dateMatch = s <= endDate;
      }
    }
    return operatorMatch && dateMatch;
  };
  return (lista) => lista.filter(combina).filter((r) => selectedSala === 'all' || r.sala === selectedSala);
}

// Um envase sem data, para o caso de borda.
const { data: modelo } = await svc.from('envase_records').select('*').like('op', 'VOL-%').limit(1).single();
const { id: _i, protocolo: _p, created_at: _c, updated_at: _u, ...resto } = modelo;
const { data: semData, error: eSD } = await svc.from('envase_records').insert({ ...resto, op: 'VOL-SEM-DATA', data: null }).select('id').single();
const semDataCriado = !eSD;
if (eSD) console.log(`  (envase sem data não pôde ser criado: ${eSD.message} — o caso fica de fora)`);

try {
  const tudo = await ler(null, null);
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const mes = hoje.slice(0, 7);
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  const mesPassado = format(d, 'yyyy-MM');
  const operador = tudo.find((r) => r.operador)?.operador;
  const CASOS = [
    ['mês atual (padrão)', { selectedMonth: mes, startDate: '', endDate: '' }],
    ['mês passado', { selectedMonth: mesPassado, startDate: '', endDate: '' }],
    ['mês + início', { selectedMonth: mes, startDate: `${mesPassado}-10`, endDate: '' }],
    ['mês + fim', { selectedMonth: mes, startDate: '', endDate: `${mesPassado}-20` }],
    ['mês + início + fim', { selectedMonth: mes, startDate: `${mesPassado}-05`, endDate: `${mes}-03` }],
    ['sem mês (tudo)', { selectedMonth: '', startDate: '', endDate: '' }],
    ['sem mês, com datas (o navegador ignora as datas)', { selectedMonth: '', startDate: `${mes}-01`, endDate: hoje }],
    ['mês + operador + sala Bio', { selectedMonth: mes, startDate: '', endDate: '', selectedOperator: operador, selectedSala: 'Bio' }],
  ];
  console.log('='.repeat(78));
  console.log(`Dashboard: faixa do servidor × tabela inteira | ${tudo.length} envases`);
  console.log('='.repeat(78));
  for (const [rot, f] of CASOS) {
    const filtros = { selectedOperator: 'all', selectedSala: 'all', ...f };
    const filtrar = filtroDaTela(filtros);
    const faixa = faixaDoServidor(filtros.selectedMonth, filtros.startDate, filtros.endDate);
    const baixadas = faixa ? await ler(faixa.de, faixa.ate) : tudo;
    const antes = filtrar(tudo).map((r) => r.id).sort();
    const agora = filtrar(baixadas).map((r) => r.id).sort();
    const iguais = JSON.stringify(antes) === JSON.stringify(agora);
    ok(iguais && antes.length > 0,
      `${rot.padEnd(48)} ${String(agora.length).padStart(5)} linhas iguais; baixadas ${String(baixadas.length).padStart(5)} de ${tudo.length}`);
  }
  if (semDataCriado) {
    const filtrar = filtroDaTela({ selectedMonth: '', startDate: '', endDate: '', selectedOperator: 'all', selectedSala: 'all' });
    ok(filtrar(tudo).some((r) => r.id === semData.id), 'o envase sem data aparece em "sem mês" (tudo), como antes');
    const faixaMes = faixaDoServidor(mes, '', '');
    ok(!(await ler(faixaMes.de, faixaMes.ate)).some((r) => r.id === semData.id), 'e não vem em faixa nenhuma (nenhum filtro de data o deixava passar)');
  }
  ok(tudo.every((r, i) => i === 0 || String(tudo[i - 1].data) >= String(r.data)),
    'ordem do mais recente para o mais antigo, como o list("-data")');

  // Bloco de limpeza: o filtro da tela é data_prevista entre início e fim.
  console.log('\nBloco de limpeza: faixa do servidor × tabela inteira');
  const { data: todasLimp } = await adm.from('limpeza_programacoes').select('id, data_prevista').order('id').range(0, 9999);
  for (const [rot, de, ate] of [['esta semana', null, null], ['30 dias atrás a hoje', -30, 0], ['próximas 2 semanas', 1, 14]]) {
    const base = new Date(`${hoje}T12:00:00Z`);
    const seg = new Date(base); seg.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
    const iso = (x) => x.toISOString().slice(0, 10);
    const desloca = (n) => { const x = new Date(base); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
    const ini = de === null ? iso(seg) : desloca(de);
    const fim = ate === null ? iso(new Date(seg.getTime() + 6 * 86400000)) : desloca(ate);
    const antes = todasLimp.filter((p) => p.data_prevista >= ini && p.data_prevista <= fim).map((p) => p.id).sort();
    const { data: faixa } = await adm.from('limpeza_programacoes').select('id').gte('data_prevista', ini).lte('data_prevista', fim).range(0, 9999);
    const agora = faixa.map((p) => p.id).sort();
    ok(JSON.stringify(antes) === JSON.stringify(agora) && antes.length > 0,
      `${rot.padEnd(22)} (${ini} a ${fim}): ${agora.length} iguais; baixadas ${agora.length} de ${todasLimp.length}`);
  }
} finally {
  if (semDataCriado) await svc.from('envase_records').delete().eq('id', semData.id);
}

console.log('\n' + '='.repeat(78));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
