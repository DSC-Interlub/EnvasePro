/**
 * scripts/test-painel-geral.mjs — paridade da RPC painel_geral()
 *
 *  A. RPC × recuo do navegador (src/lib/painelGeral.js), objeto inteiro. As
 *     entradas do recuo são montadas aqui com os MESMOS filtros que o
 *     adaptador aplica no banco (o adaptador usa aliases do Vite e não roda
 *     no Node; o teste de interface exercita o adaptador de verdade).
 *  B. RPC × fórmulas da tela antiga (src/pages/Painel.jsx antes da troca),
 *     sobre TODAS as linhas: iguais, salvo as correções declaradas.
 *  C. As correções, com o valor que a tela antiga mostrava (com os tetos).
 *  D. O fuso: um checklist criado ontem às 22:30 de Brasília. A tela antiga o
 *     contava como de HOJE (comparava o texto UTC); a RPC não.
 *
 * Roda como a conta da TV e como admin. Exige indicadores diferentes de zero.
 * Rode depois de `semear-volume.mjs`.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { calcularPainelGeral, limitesDaSemana, diaEmBrasilia } from '../src/lib/painelGeral.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-painel-geral');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function entrar(email, senha) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login: ${error.message}`);
  return c;
}
async function tudo(c, tabela) {
  const linhas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await c.from(tabela).select('*').order('created_at', { ascending: false }).range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}
const TABELAS = ['envase_records', 'checkout_itens', 'checkout_programacoes', 'empilha_linhas', 'empilha_programacoes',
  'empilhadeira_paradas', 'recebimentos', 'recebimento_participantes', 'empilha_ocorrencias', 'recebimento_ocorrencias',
  'checklist_recebimentos', 'limpeza_programacoes', 'nota_fiscal_arquivos', 'empilhadeira_configs'];

async function ler(c) {
  const t = {};
  await Promise.all(TABELAS.map(async (n) => { t[n] = await tudo(c, n); }));
  const { data, error } = await c.rpc('painel_geral');
  if (error) throw error;
  return { t, rpc: data };
}

const canon = (v) => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v;
const norm = (o) => JSON.parse(JSON.stringify(o), (k, v) => {
  if (['gerado_em', 'calculado_no'].includes(k)) return undefined;
  if (['atualizado', 'criado', 'created_at', 'datetime_inicio'].includes(k) && v) return Date.parse(v);
  if (['quantidade_produzida', 'producao'].includes(k) && v != null) return Number(v);
  return v;
});

/* ── A: o recuo, com as entradas filtradas como o adaptador filtra ──────── */
function entradasDoRecuo(t, dia) {
  const { semana, semanaFim } = limitesDaSemana(dia);
  const desde = Date.parse(`${semana}T00:00:00-03:00`);
  const ha3 = Date.now() - 3 * 86400000;
  const idsCk = t.checkout_programacoes.filter((p) => p.data_programada === dia).map((p) => p.id);
  const idsEmp = t.empilha_programacoes.filter((p) => p.data_programada === dia).map((p) => p.id);
  const recSemana = t.recebimentos.filter((r) => Date.parse(r.created_at) >= desde);
  const recAtivos = t.recebimentos.filter((r) => r.status === 'Em andamento');
  const recSemLider = t.recebimentos.filter((r) => r.status === 'Concluído' && r.assinatura_lider !== true);
  const uniq = (l) => [...new Map(l.map((x) => [x.id, x])).values()];
  return {
    dia,
    envaseSemana: t.envase_records.filter((r) => r.data >= semana && r.data <= dia),
    checkoutHoje: t.checkout_itens.filter((i) => idsCk.includes(i.programacao_id)),
    checkoutConcluidosSemana: t.checkout_itens.filter((i) => i.status === 'Concluído' && Date.parse(i.updated_at) >= desde),
    linhasConcluidasSemana: t.empilha_linhas.filter((l) => l.status === 'Concluído' && Date.parse(l.updated_at) >= desde),
    empilhaAtivasHoje: t.empilha_linhas.filter((l) => idsEmp.includes(l.programacao_id) && l.status === 'Em Andamento'),
    linhasSemAssinatura: t.empilha_linhas.filter((l) => l.status === 'Concluído' && l.assinatura_lider !== true).length,
    recebimentos: uniq([...recSemana, ...recAtivos, ...recSemLider]),
    participantes: t.recebimento_participantes.filter((p) => recAtivos.some((r) => r.id === p.recebimento_id)),
    checklistsSemana: t.checklist_recebimentos.filter((c) => Date.parse(c.created_at) >= desde),
    limpezas: uniq([
      ...t.limpeza_programacoes.filter((l) => l.data_prevista >= semana && l.data_prevista <= semanaFim),
      ...t.limpeza_programacoes.filter((l) => l.data_prevista < dia && l.status !== 'Concluído'),
      ...t.limpeza_programacoes.filter((l) => l.status === 'Concluído' && l.assinatura_responsavel === true && l.assinatura_lider !== true),
    ]),
    nfsSemana: t.nota_fiscal_arquivos.filter((n) => Date.parse(n.created_at) >= desde).length,
    nfsSemArquivo3dias: t.nota_fiscal_arquivos.filter((n) => !n.arquivo_url && Date.parse(n.created_at) < ha3).length,
    ocorrenciasEmpilha: t.empilha_ocorrencias.filter((o) => o.resolvido !== true),
    ocorrenciasRecebimento: t.recebimento_ocorrencias.filter((o) => o.resolvido !== true),
    paradasHoje: t.empilhadeira_paradas.filter((p) => p.data === dia),
    empilhadeiras: t.empilhadeira_configs,
  };
}

/* ── B/C: a tela antiga, linha a linha ──────────────────────────────────── */
function comoATela(t, dia, tetos) {
  const lim = (lista, n, ord) => (tetos ? [...lista].sort(ord).slice(0, n) : lista);
  const porCriado = (a, b) => String(b.created_at).localeCompare(String(a.created_at));
  const now = new Date();
  const hoje = dia;
  const semanaInicio = limitesDaSemana(dia).semana;
  const envases = lim(t.envase_records, 100, (a, b) => String(b.data).localeCompare(String(a.data)));
  const checkoutItems = lim(t.checkout_itens, 100, porCriado);
  const checkoutProgs = lim(t.checkout_programacoes, 10, (a, b) => String(b.data_programada).localeCompare(String(a.data_programada)));
  const empilhaLinhas = lim(t.empilha_linhas, 100, porCriado);
  const empilhaParadas = lim(t.empilhadeira_paradas, 30, porCriado);
  const empilhaProgs = lim(t.empilha_programacoes, 10, (a, b) => String(b.data_programada).localeCompare(String(a.data_programada)));
  const recebimentos = lim(t.recebimentos, 50, porCriado);
  const empilhaOcorrencias = lim(t.empilha_ocorrencias, 50, porCriado);
  const recOcorrencias = lim(t.recebimento_ocorrencias, 50, porCriado);
  const checklists = lim(t.checklist_recebimentos, 100, porCriado);
  const limpezas = lim(t.limpeza_programacoes, 100, (a, b) => String(b.data_prevista).localeCompare(String(a.data_prevista)));
  const nfs = lim(t.nota_fiscal_arquivos, 50, porCriado);
  const empilhaConfig = t.empilhadeira_configs;

  const checklistsHoje = checklists.filter((c) => c.created_at?.startsWith(hoje));
  const notaMedia = checklistsHoje.length > 0 ? Math.round(checklistsHoje.reduce((s, c) => s + (c.nota_final || 0), 0) / checklistsHoje.length) : null;
  const limpezasHoje = limpezas.filter((l) => l.data_prevista === hoje);
  const limpezasAtrasadas = limpezas.filter((l) => l.data_prevista < hoje && l.status !== 'Concluído');
  const envasesSemana = envases.filter((e) => e.data >= semanaInicio);
  const checklistsSemana = checklists.filter((c) => c.created_at >= semanaInicio);
  const limpezasSemana = limpezas.filter((l) => l.data_prevista >= semanaInicio);
  const envasesHoje = envases.filter((e) => e.data === hoje);
  const q = (l) => l.reduce((s, e) => s + (Number(e.quantidade_produzida) || 0), 0);
  const checkoutIdsHoje = checkoutProgs.filter((p) => p.data_programada === hoje).map((p) => p.id);
  const empilhaIdsHoje = empilhaProgs.filter((p) => p.data_programada === hoje).map((p) => p.id);
  const envaseAtivos = envases.filter((r) => r.inicio && r.data === hoje && (r.sala === 'Bio' ? !r.material_retirado : !r.termino));
  const checkoutAtivos = checkoutItems.filter((i) => i.hora_inicio && !i.hora_termino && i.status === 'Em Andamento' && checkoutIdsHoje.includes(i.programacao_id));
  const empilhaAtivas = empilhaLinhas.filter((l) => empilhaIdsHoje.includes(l.programacao_id) && l.status === 'Em Andamento');
  const recebimentoAtivos = recebimentos.filter((r) => r.status === 'Em andamento');
  return {
    'hoje.envases': envasesHoje.length,
    'hoje.envases_concluidos': envasesHoje.filter((e) => e.termino).length,
    'hoje.producao': q(envasesHoje),
    'hoje.checklists': checklistsHoje.length,
    'hoje.nota_media': notaMedia,
    'hoje.limpezas': limpezasHoje.length,
    'hoje.limpezas_concluidas': limpezasHoje.filter((l) => l.status === 'Concluído').length,
    'semana.envases': envasesSemana.length,
    'semana.producao': q(envasesSemana),
    'semana.checkouts_concluidos': checkoutItems.filter((e) => e.status === 'Concluído' && e.updated_at >= semanaInicio).length,
    'semana.linhas_movimentadas': empilhaLinhas.filter((e) => e.status === 'Concluído' && e.updated_at >= semanaInicio).length,
    'semana.recebimentos': recebimentos.filter((r) => r.created_at >= semanaInicio).length,
    'semana.checklists': checklistsSemana.length,
    'semana.nota_media': checklistsSemana.length > 0 ? Math.round(checklistsSemana.reduce((s, c) => s + (c.nota_final || 0), 0) / checklistsSemana.length) : null,
    'semana.limpezas': limpezasSemana.length,
    'semana.limpezas_concluidas': limpezasSemana.filter((l) => l.status === 'Concluído').length,
    'semana.nfs': nfs.filter((n) => n.created_at >= semanaInicio).length,
    'pendencias.assinaturas': empilhaLinhas.filter((l) => l.status === 'Concluído' && !l.assinatura_lider).length
      + limpezas.filter((l) => l.status === 'Concluído' && l.assinatura_responsavel && !l.assinatura_lider).length
      + recebimentos.filter((r) => r.status === 'Concluído' && !r.assinatura_lider).length,
    'pendencias.ocorrencias': empilhaOcorrencias.filter((o) => !o.resolvido).length + recOcorrencias.filter((o) => !o.resolvido).length,
    'pendencias.limpezas_atrasadas': limpezasAtrasadas.length,
    'pendencias.checklists_reprovados_hoje': checklistsHoje.filter((c) => (c.nota_final || 0) < 0).length,
    'pendencias.nfs_sem_arquivo_3dias': nfs.filter((n) => !n.arquivo_url && (now - new Date(n.created_at)) > 3 * 86400000).length,
    'pendencias.manutencao': empilhaConfig.filter((e) => e.data_proxima_manutencao && Math.ceil((new Date(e.data_proxima_manutencao) - now) / 86400000) <= 7).length,
    'ao_vivo.envase.total': Math.min(4, envaseAtivos.length),
    'ao_vivo.checkout.total': Math.min(4, checkoutAtivos.length),
    'ao_vivo.checkout.criticos': checkoutItems.filter((i) => i.critico && i.status !== 'Concluído' && checkoutIdsHoje.includes(i.programacao_id)).length,
    'ao_vivo.empilha.total': Math.min(4, empilhaAtivas.length),
    'ao_vivo.recebimento.total': Math.min(4, recebimentoAtivos.length),
    'ao_vivo.empilha.parada': !!empilhaParadas.find((p) => p.data === hoje && !p.hora_fim),
    _ids: {
      envase: envaseAtivos.map((x) => x.id), checkout: checkoutAtivos.map((x) => x.id),
      empilha: empilhaAtivas.map((x) => x.id), recebimento: recebimentoAtivos.map((x) => x.id),
    },
  };
}
const pegar = (o, caminho) => caminho.split('.').reduce((x, k) => x?.[k], o);
const doRpc = (rpc, k) => (k === 'ao_vivo.empilha.parada' ? !!rpc.ao_vivo.empilha.parada
  : k.endsWith('producao') ? Number(pegar(rpc, k)) : pegar(rpc, k));

// Diferenças esperadas, cada uma é uma correção da migration.
const CORRECAO = {
  'semana.limpezas': 3, 'semana.limpezas_concluidas': 3,
  'ao_vivo.envase.total': 4, 'ao_vivo.checkout.total': 4, 'ao_vivo.empilha.total': 4, 'ao_vivo.recebimento.total': 4,
};

async function rodada(rotulo, cliente) {
  const dia = hojeSP();
  const { t, rpc } = await ler(cliente);
  console.log('\n' + '='.repeat(78));
  console.log(`${rotulo} | dia ${dia} | semana desde ${rpc.semana_inicio}`);
  console.log('='.repeat(78));
  ok(rpc.dia === dia, `dia da RPC = dia de Brasília (${rpc.dia})`);
  ok(rpc.semana_inicio === limitesDaSemana(dia).semana, `semana começa na segunda (${rpc.semana_inicio})`);

  console.log('\nA. RPC × recuo do navegador');
  const nav = calcularPainelGeral(entradasDoRecuo(t, dia));
  for (const bloco of ['hoje', 'semana', 'pendencias', 'ao_vivo', 'ocorrencias']) {
    const a = JSON.stringify(canon(norm(nav[bloco])));
    const b = JSON.stringify(canon(norm(rpc[bloco])));
    ok(a === b, `bloco "${bloco}" idêntico`);
    if (a !== b) {
      const na = canon(norm(nav[bloco])); const nb = canon(norm(rpc[bloco]));
      for (const k of Object.keys(nb)) if (JSON.stringify(na[k]) !== JSON.stringify(nb[k])) {
        console.log(`      difere ${bloco}.${k}: nav=${JSON.stringify(na[k])?.slice(0, 160)}\n                         rpc=${JSON.stringify(nb[k])?.slice(0, 160)}`);
      }
    }
  }

  console.log('\nB. Fórmulas da tela antiga (sem tetos) × RPC');
  const v = comoATela(t, dia, false);
  console.log(`  ${'indicador'.padEnd(40)} ${'tela'.padStart(8)} ${'RPC'.padStart(8)}`);
  const iguais = []; const corrigidos = []; const errados = [];
  for (const [k, a] of Object.entries(v)) {
    if (k === '_ids') continue;
    const b = doRpc(rpc, k);
    const marca = a === b ? '' : CORRECAO[k] ? `   correção ${CORRECAO[k]}` : '   <-- DIFERE';
    console.log(`  ${k.padEnd(40)} ${String(a).padStart(8)} ${String(b).padStart(8)}${marca}`);
    if (a === b) iguais.push(k); else if (CORRECAO[k]) corrigidos.push(k); else errados.push(k);
  }
  ok(errados.length === 0, `${iguais.length} iguais; ${corrigidos.length} diferem só por correção declarada${errados.length ? `; SEM explicação: ${errados.join(', ')}` : ''}`);
  const PODE_ZERO = new Set(['ao_vivo.empilha.parada', 'pendencias.manutencao']);
  const zerados = Object.entries(v).filter(([k]) => k !== '_ids' && !PODE_ZERO.has(k))
    .filter(([k]) => !doRpc(rpc, k)).map(([k]) => k);
  ok(zerados.length === 0, `nenhum indicador zerado na RPC${zerados.length ? ` (zerados: ${zerados.join(', ')})` : ''}`);
  for (const m of ['envase', 'checkout', 'empilha', 'recebimento']) {
    const novos = rpc.ao_vivo[m].itens.map((x) => x.id);
    ok(novos.every((id) => v._ids[m].includes(id)) && rpc.ao_vivo[m].total === v._ids[m].length,
      `ao vivo ${m}: total ${rpc.ao_vivo[m].total} = ativos da tela; os ${novos.length} cartões estão entre eles`);
  }
  const semana = limitesDaSemana(dia);
  ok(t.limpeza_programacoes.filter((l) => l.data_prevista >= semana.semana && l.data_prevista <= semana.semanaFim).length === rpc.semana.limpezas,
    `correção 3: limpezas da semana = segunda a domingo (${rpc.semana.limpezas}); a tela contava ${v['semana.limpezas']}, até as semanas seguintes`);
  const rec = rpc.ao_vivo.recebimento.itens[0];
  ok(!rec || (rec.primeiro?.nome && rec.participantes > 0), `correção 5: participante do recebimento com nome (${rec?.primeiro?.nome ?? '—'}, ${rec?.participantes ?? 0} no total)`);

  console.log('\nC. O que a tela antiga MOSTRAVA (com os tetos) × agora');
  const c = comoATela(t, dia, true);
  console.log(`  ${'indicador'.padEnd(40)} ${'antes'.padStart(8)} ${'agora'.padStart(8)}`);
  for (const [k, a] of Object.entries(c)) {
    if (k === '_ids') continue;
    const b = doRpc(rpc, k);
    if (a !== b) console.log(`  ${k.padEnd(40)} ${String(a).padStart(8)} ${String(b).padStart(8)}`);
  }
  return { t, rpc };
}

const tv = await entrar(process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD);
const adm = await entrar(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
const r1 = await rodada('CONTA DA TV', tv);
await rodada('ADMIN', adm);

/* ── D: fuso ─────────────────────────────────────────────────────────────── */
console.log('\nD. Checklist criado ontem às 22:30 de Brasília (01:30 UTC de hoje)');
{
  const dia = hojeSP();
  const ontem = new Date(Date.parse(`${dia}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const instante = new Date(`${ontem}T22:30:00-03:00`).toISOString();
  const { data: modelo } = await svc.from('checklist_recebimentos').select('*').like('numero_lote', 'VOL-%').limit(1).single();
  const { id, numero_checklist, created_at, updated_at, nota_final, total_sim, total_nao, total_na, ...resto } = modelo;
  const { data: novo, error } = await svc.from('checklist_recebimentos')
    .insert({ ...resto, numero_lote: 'VOL-FUSO' }).select('id').single();
  if (error) throw error;
  try {
    await svc.from('checklist_recebimentos').update({ created_at: instante }).eq('id', novo.id);
    const { data: rpc } = await tv.rpc('painel_geral');
    const { t } = await ler(tv);
    const velho = comoATela(t, dia, false);
    ok(diaEmBrasilia(instante) === ontem, `o instante ${instante} é de ${ontem} em Brasília`);
    ok(velho['hoje.checklists'] === r1.rpc.hoje.checklists + 1, `a tela antiga o contava como de HOJE (${r1.rpc.hoje.checklists} -> ${velho['hoje.checklists']})`);
    ok(rpc.hoje.checklists === r1.rpc.hoje.checklists, `a RPC não (${rpc.hoje.checklists}) — correção 2`);
  } finally {
    await svc.from('checklist_recebimentos').delete().eq('id', novo.id);
  }
}

console.log('\nQuem executa');
const anon = createClient(URL, ANON, { auth: { persistSession: false } });
const ra = await anon.rpc('painel_geral');
ok(ra.error?.code === '42501', `anon é recusado: ${ra.error?.code || 'EXECUTOU'}`);

console.log('\n' + '='.repeat(78));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
