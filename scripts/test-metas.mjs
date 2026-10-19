/**
 * scripts/test-metas.mjs — a tabela metas_diarias e metas_do_dia()
 *
 * Com JWT real de cada papel (banco LOCAL):
 *  - admin lança, troca e apaga meta; operador e TV só LEEM; anon não lê;
 *  - as regras da tabela: envase exige sala, check-out e empilhadeira não
 *    aceitam sala, valor > 0, uma meta por item e data de início;
 *  - vigência: a linha mais recente que não seja posterior ao dia;
 *  - os painéis das TVs mostram a meta lançada na hora.
 *
 * Tudo o que cria leva observacao 'TESTE-METAS' e é apagado no fim.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { metasDoDia } from '../src/lib/metas.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-metas');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const MARCA = 'TESTE-METAS';

async function entrar(email, senha) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}
const adm = await entrar(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
const op = await entrar(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
const tv = await entrar(process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD);
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const amanha = new Date(Date.parse(`${hoje}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

console.log('='.repeat(72));
console.log('METAS DIÁRIAS — RLS, regras e vigência');
console.log('='.repeat(72));
try {
  console.log('\n1. Quem lê');
  const lt = await tv.from('metas_diarias').select('id').limit(1);
  ok(!lt.error, `TV lê (${lt.error?.message || 'ok'})`);
  const lo = await op.from('metas_diarias').select('id').limit(1);
  ok(!lo.error, `operador lê (${lo.error?.message || 'ok'})`);
  const la = await anon.from('metas_diarias').select('id').limit(1);
  ok(!!la.error, `anon NÃO lê: ${la.error?.code || 'LEU'} ${la.error?.message || ''}`);

  console.log('\n2. Quem escreve');
  const io = await op.from('metas_diarias').insert({ modulo: 'checkout', indicador: 'pedidos', valor: 999, vigente_desde: amanha, observacao: MARCA });
  ok(io.error?.code === '42501', `operador NÃO lança meta: ${io.error?.code || 'LANÇOU'}`);
  const it = await tv.from('metas_diarias').insert({ modulo: 'checkout', indicador: 'pedidos', valor: 999, vigente_desde: amanha, observacao: MARCA });
  ok(it.error?.code === '42501', `TV NÃO lança meta: ${it.error?.code || 'LANÇOU'}`);
  const ia = await adm.from('metas_diarias')
    .insert({ modulo: 'checkout', indicador: 'pedidos', valor: 77, vigente_desde: hoje, observacao: MARCA }).select('id').single();
  ok(!ia.error, `admin lança meta (${ia.error?.message || 'ok'})`);

  const { data: pt } = await tv.rpc('painel_televisao');
  ok(Number(pt.metas.checkout.pedidos) === 77, `a TV vê a meta nova na hora (${pt.metas.checkout.pedidos})`);

  const uo = await op.from('metas_diarias').update({ valor: 1 }).eq('id', ia.data.id).select('id');
  const { data: depoisUo } = await svc.from('metas_diarias').select('valor').eq('id', ia.data.id).single();
  ok((uo.data?.length ?? 0) === 0 && Number(depoisUo.valor) === 77, 'operador NÃO altera meta (0 linhas; o valor continua 77)');
  const dop = await op.from('metas_diarias').delete().eq('id', ia.data.id).select('id');
  const { data: aindaLa } = await svc.from('metas_diarias').select('id').eq('id', ia.data.id);
  ok((dop.data?.length ?? 0) === 0 && aindaLa.length === 1, 'operador NÃO apaga meta');

  console.log('\n3. Regras da tabela');
  const casos = [
    ['envase sem sala', { modulo: 'envase', indicador: 'unidades', sala: null }, '23514'],
    ['check-out com sala', { modulo: 'checkout', indicador: 'pedidos', sala: 'Bio' }, '23514'],
    ['indicador trocado', { modulo: 'empilhadeira', indicador: 'pedidos', sala: null }, '23514'],
    ['valor zero', { modulo: 'empilhadeira', indicador: 'linhas', sala: null, valor: 0 }, '23514'],
    ['mesma meta, mesma data (sem sala)', { modulo: 'checkout', indicador: 'pedidos', sala: null, vigente_desde: hoje }, '23505'],
  ];
  for (const [rot, c, codigo] of casos) {
    const r = await adm.from('metas_diarias').insert({ valor: 5, vigente_desde: amanha, observacao: MARCA, ...c });
    ok(r.error?.code === codigo, `${rot}: recusado (${r.error?.code || 'ACEITO'})`);
  }

  console.log('\n4. Vigência');
  const ib = await adm.from('metas_diarias')
    .insert({ modulo: 'checkout', indicador: 'pedidos', valor: 88, vigente_desde: amanha, observacao: MARCA }).select('id').single();
  ok(!ib.error, 'admin lança uma meta que só vale a partir de amanhã');
  const { data: mHoje } = await adm.rpc('metas_do_dia', { dia: hoje });
  const { data: mAmanha } = await adm.rpc('metas_do_dia', { dia: amanha });
  ok(Number(mHoje.checkout.pedidos) === 77 && Number(mAmanha.checkout.pedidos) === 88,
    `hoje vale 77, amanhã 88 (hoje=${mHoje.checkout.pedidos}, amanhã=${mAmanha.checkout.pedidos})`);
  const { data: todas } = await adm.from('metas_diarias').select('*');
  for (const d of [hoje, amanha, '2026-01-01']) {
    const { data: rpc } = await adm.rpc('metas_do_dia', { dia: d });
    // Canônico: jsonb reordena as chaves.
    const ordena = (v) => (Array.isArray(v) ? v.map(ordena)
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordena(v[k])])) : v);
    const canon = (o) => JSON.stringify(ordena(o));
    ok(canon(rpc) === canon(metasDoDia(todas, d)), `metas_do_dia(${d}) = regra do navegador (src/lib/metas.js)`);
  }

  console.log('\n4b. O histórico é imutável — inclusive para o admin');
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const passada = await svc.from('metas_diarias')
    .insert({ modulo: 'empilhadeira', indicador: 'linhas', valor: 42, vigente_desde: ontem, observacao: MARCA }).select('id').single();
  const up = await adm.from('metas_diarias').update({ valor: 1 }).eq('id', passada.data.id).select('id');
  const del = await adm.from('metas_diarias').delete().eq('id', passada.data.id).select('id');
  const { data: continua } = await svc.from('metas_diarias').select('valor').eq('id', passada.data.id).single();
  ok((up.data?.length ?? 0) === 0 && (del.data?.length ?? 0) === 0 && Number(continua?.valor) === 42,
    'admin NÃO altera nem apaga meta que começou ontem (o valor continua 42)');
  const delHoje = await adm.from('metas_diarias').delete().eq('id', ia.data.id).select('id');
  ok(delHoje.data?.length === 1, 'admin apaga a meta que começa hoje (correção de digitação do dia)');
  const delAmanha = await adm.from('metas_diarias').delete().eq('id', ib.data.id).select('id');
  ok(delAmanha.data?.length === 1, 'admin apaga a meta futura');

  console.log('\n5. Quem executa metas_do_dia');
  const ra = await anon.rpc('metas_do_dia', { dia: hoje });
  ok(ra.error?.code === '42501', `anon é recusado: ${ra.error?.code || 'EXECUTOU'}`);
} finally {
  const { count } = await svc.from('metas_diarias').delete({ count: 'exact' }).eq('observacao', MARCA);
  console.log(`\n(limpeza: ${count} meta(s) de teste apagada(s))`);
}

console.log('\n' + '='.repeat(72));
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK');
process.exit(falhas ? 1 : 0);
