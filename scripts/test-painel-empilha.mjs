/**
 * scripts/test-painel-empilha.mjs — paridade da RPC painel_televisao_empilha()
 *
 * Compara o que a função SQL devolve com o cálculo que /TelevisaoEmpilha fazia
 * no navegador (copiado abaixo, linha a linha, de src/pages/TelevisaoEmpilha.jsx
 * antes da troca), com os MESMOS dados, lidos como a conta da TV.
 *
 * Exige indicadores DIFERENTES DE ZERO: paridade com tudo zerado não prova
 * nada (0 = 0 com qualquer fórmula). Rode depois de `semear-volume.mjs`.
 *
 * Cobre também:
 *  - a correção 1 da migration (o dia era filtrado dentro das 200 linhas mais
 *    recentes por updated_at): mostra quanto a tela antiga perdia;
 *  - uma mudança ao vivo: uma linha crítica nova entra nos dois lados;
 *  - segurança: anon não executa; operador e TV executam.
 *
 * Uso: node scripts/test-painel-empilha.mjs
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { calcularPainelEmpilha } from '../src/lib/painelEmpilha.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-painel-empilha');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let falhas = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'OK  ' : 'FALHA'} ${msg}`); if (!cond) falhas += 1; };

async function entrar(email, senha) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

async function tudo(c, tabela, ordem, asc) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await c.from(tabela).select('*').order(ordem, { ascending: asc }).range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/* ── o cálculo da tela, como estava ──────────────────────────────────────── */
function comoATela(programacoes, allLinhas, ocorrencias, today) {
  const progHoje = programacoes.filter(p => p.data_programada === today);
  const progHojeIds = progHoje.map(p => p.id);
  const linhasHoje = allLinhas.filter(l => progHojeIds.includes(l.programacao_id));
  const ehCritica = (l) => l.tipo_linha === 'Crítico';
  const linhasEmAndamento = linhasHoje
    .filter(l => l.status === 'Em Andamento')
    .sort((a, b) => (ehCritica(b) ? 1 : 0) - (ehCritica(a) ? 1 : 0));
  const ocorrenciasHoje = ocorrencias.filter(o => o.data === today && !o.resolvido);
  const linhasComTempo = linhasHoje.filter(l => l.tempo_total && l.status === 'Concluído');
  let tempoMedioMin = 0;
  if (linhasComTempo.length > 0) {
    const totalMins = linhasComTempo.reduce((sum, l) => {
      const [h, m] = l.tempo_total.split(':').map(Number);
      return sum + h * 60 + m;
    }, 0);
    tempoMedioMin = Math.round(totalMins / linhasComTempo.length);
  }
  return {
    total: linhasHoje.length,
    concluidas: linhasHoje.filter(l => l.status === 'Concluído').length,
    em_andamento: linhasHoje.filter(l => l.status === 'Em Andamento').length,
    criticos_pendentes: linhasHoje.filter(l => ehCritica(l) && l.status !== 'Concluído').length,
    tempo_medio_min: tempoMedioMin,
    ocorrencias_abertas: ocorrenciasHoje.length,
    _operacoes: linhasEmAndamento,
    _ocorrencias: ocorrenciasHoje,
  };
}

const CAMPOS = ['total', 'concluidas', 'em_andamento', 'criticos_pendentes', 'tempo_medio_min', 'ocorrencias_abertas'];

async function comparar(c, rotulo, { exigirNaoZero = true, linhasSemTeto = false } = {}) {
  const [programacoes, allLinhas, ocorrencias, rpc] = await Promise.all([
    tudo(c, 'empilha_programacoes', 'created_at', false),
    linhasSemTeto
      ? tudo(c, 'empilha_linhas', 'updated_at', false)
      : c.from('empilha_linhas').select('*').order('updated_at', { ascending: false }).limit(200)
          .then(({ data, error }) => { if (error) throw error; return data; }),
    tudo(c, 'empilha_ocorrencias', 'data', false),
    c.rpc('painel_televisao_empilha').then(({ data, error }) => { if (error) throw error; return data; }),
  ]);
  const js = comoATela(programacoes, allLinhas, ocorrencias, hojeSP());

  console.log(`\n${rotulo}`);
  console.log(`  ${'indicador'.padEnd(22)} ${'JS'.padStart(6)} ${'RPC'.padStart(6)}`);
  for (const k of CAMPOS) console.log(`  ${k.padEnd(22)} ${String(js[k]).padStart(6)} ${String(rpc[k]).padStart(6)}`);
  const iguais = CAMPOS.every((k) => js[k] === rpc[k]);
  return { js, rpc, iguais, exigirNaoZero };
}

function conferirTudo({ js, rpc, iguais }, exigirNaoZero) {
  ok(rpc.dia === hojeSP(), `dia da RPC = dia de Brasília (${rpc.dia})`);
  ok(iguais, 'os 6 indicadores são IGUAIS ao cálculo da tela');
  if (exigirNaoZero) {
    const zerados = CAMPOS.filter((k) => !js[k]);
    ok(zerados.length === 0, `nenhum indicador zerado${zerados.length ? ` (zerados: ${zerados.join(', ')})` : ''}`);
  }
  const idsJs = js._operacoes.map((l) => l.id).sort();
  const idsRpc = rpc.operacoes.map((l) => l.id).sort();
  ok(JSON.stringify(idsJs) === JSON.stringify(idsRpc), `mesmas ${idsRpc.length} operações em andamento`);
  const primeiraNaoCritica = rpc.operacoes.findIndex((o) => !o.critica);
  ok(primeiraNaoCritica === -1 || rpc.operacoes.slice(primeiraNaoCritica).every((o) => !o.critica),
    'críticas primeiro (a regra da tela)');
  const porId = Object.fromEntries(js._operacoes.map((l) => [l.id, l]));
  const camposCartao = ['operador_empilhadeira', 'operador_ajudante', 'descricao_produto', 'codigo_produto',
    'numero_item', 'rua_torre', 'deposito', 'tipo_linha', 'status'];
  const diverg = rpc.operacoes.flatMap((o) => camposCartao
    .filter((k) => (porId[o.id]?.[k] ?? null) !== (o[k] ?? null)).map((k) => `${o.id}.${k}`));
  const divergNum = rpc.operacoes.filter((o) => Number(porId[o.id]?.quantidade) !== Number(o.quantidade)
    || String(porId[o.id]?.hora_inicio).slice(0, 5) !== String(o.hora_inicio).slice(0, 5));
  ok(diverg.length === 0 && divergNum.length === 0,
    `cada cartão com os mesmos campos (${camposCartao.length + 2} por operação)${diverg.length ? ' — ' + diverg.slice(0, 3).join(', ') : ''}`);
  const maisRecente = js._ocorrencias.map((o) => o.hora).sort().pop() ?? null;
  ok((rpc.ultima_ocorrencia?.hora ?? null) === maisRecente,
    `pílula = ocorrência aberta de hora mais recente (${maisRecente})`);
}

console.log('='.repeat(72));
console.log('painel_televisao_empilha() × cálculo da tela');
console.log('='.repeat(72));

const tv = await entrar(process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD);

// 1. Estado carregado — a FÓRMULA da tela sobre todas as linhas, contra a RPC.
const r1 = await comparar(tv, '1. Banco no volume da Base44: fórmula da tela (sem o teto) × RPC', { linhasSemTeto: true });
conferirTudo(r1, true);

// 1b. A tela como era DE FATO, com o teto das 200 linhas mais recentes por
// updated_at. Basta o histórico ter 200 linhas tocadas depois das de hoje para
// os números do dia sumirem — a correção 1 da migration.
const r1b = await comparar(tv, '1b. A tela como era de fato (200 linhas mais recentes por updated_at)', { exigirNaoZero: false });
ok(r1b.rpc.total === r1.rpc.total, `a RPC não depende do teto (${r1b.rpc.total})`);
console.log(`  -> a tela antiga mostraria ${r1b.js.total} linha(s) no dia; o dia tem ${r1.js.total}.`);

// 2. Mudança ao vivo: uma linha crítica nova em andamento.
const { data: prog } = await svc.from('empilha_programacoes').select('id')
  .eq('data_programada', hojeSP()).limit(1).single();
const { data: op } = await svc.from('operators').select('id, nome').eq('ativo', true).limit(1).single();
const { data: nova, error: eNova } = await svc.from('empilha_linhas').insert({
  programacao_id: prog.id, tipo_linha: 'Crítico', numero_item: 'VOL-PARIDADE', status: 'Em Andamento',
  operador_empilhadeira: op.nome, operador_empilhadeira_id: op.id, hora_inicio: '06:00',
}).select('id').single();
if (eNova) throw eNova;
try {
  const r2 = await comparar(tv, '2. Depois de entrar uma linha CRÍTICA em andamento', { linhasSemTeto: true });
  conferirTudo(r2, true);
  ok(r2.rpc.criticos_pendentes === r1.rpc.criticos_pendentes + 1, 'críticos pendentes subiu exatamente 1');
  ok(r2.rpc.em_andamento === r1.rpc.em_andamento + 1, 'em andamento subiu exatamente 1');
  ok(r2.rpc.operacoes.some((o) => o.id === nova.id && o.critica), 'a linha nova aparece nas operações, como crítica');
} finally {
  await svc.from('empilha_linhas').delete().eq('id', nova.id);
}

// 3. O RECUO do navegador (src/lib/painelEmpilha.js), que a TV usa se a
// função não existir no banco, tem de devolver o MESMO que a RPC.
console.log('\n3. Recuo do navegador × RPC');
{
  const dia = hojeSP();
  const { data: progs } = await tv.from('empilha_programacoes').select('id').eq('data_programada', dia);
  const { data: linhas } = await tv.from('empilha_linhas').select('*').in('programacao_id', progs.map((p) => p.id));
  const { data: ocorr } = await tv.from('empilha_ocorrencias').select('tipo, hora, resolvido, created_at').eq('data', dia);
  const { data: rpc } = await tv.rpc('painel_televisao_empilha');
  const nav = calcularPainelEmpilha(linhas, ocorr, dia);
  // Canônico: jsonb reordena as chaves, então compara-se com chaves ordenadas.
  const canon = (v) => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
  const norm = (o) => JSON.stringify(canon({ ...o, gerado_em: null, calculado_no: null,
    operacoes: o.operacoes.map((x) => ({ ...x, quantidade: x.quantidade == null ? null : Number(x.quantidade) })) }));
  const igual = norm(nav) === norm(rpc);
  ok(igual, `objeto inteiro idêntico, inclusive a ORDEM das ${rpc.operacoes.length} operações e a pílula`);
  if (!igual) {
    for (const k of Object.keys(rpc)) if (k !== 'gerado_em' && JSON.stringify(canon(nav[k])) !== JSON.stringify(canon(rpc[k]))) console.log(`    difere: ${k}`);
  }
}

// 4. Segurança.
console.log('\n4. Quem executa');
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const ra = await anon.rpc('painel_televisao_empilha');
ok(!!ra.error, `anon (sem login) é recusado: ${ra.error?.code || ''} ${ra.error?.message || 'NÃO FOI RECUSADO'}`);
const oper = await entrar(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
const ro = await oper.rpc('painel_televisao_empilha');
ok(!ro.error && ro.data?.total === r1.rpc.total, 'operador executa e vê o mesmo painel');
// service_role também NÃO executa: EXECUTE é só de `authenticated`. Nada no
// servidor (api/) chama o painel, então não há por que conceder.
const rs = await svc.rpc('painel_televisao_empilha');
ok(rs.error?.code === '42501', `service_role não executa (só authenticated): ${rs.error?.code || 'EXECUTOU'}`);

console.log('\n' + '='.repeat(72));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
