/**
 * scripts/test-reconcile-triggers.js
 *
 * Suite de verificacao da migration 20261007000001_reconcile_security.
 * Roda contra o Supabase LOCAL, com JWT REAL de operador e de admin — nao com
 * service_role, que passa livre por todos os triggers e nao prova nada.
 *
 * Cobre: GRANTs, EXECUTE de funcao, gerar_protocolo (default de coluna e
 * allowlist), politicas com is_admin(), escrita unica, admin-only, reversao de
 * assinatura 'Completo' e imutabilidade.
 *
 * Uso: node scripts/test-reconcile-triggers.js
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-reconcile-triggers');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

const svc = createClient(URL, SRK, { auth: { persistSession: false } });
const anonCli = createClient(URL, ANON, { auth: { persistSession: false } });

let passou = 0;
let falhou = 0;
const falhas = [];

function checar(nome, condicao, detalhe) {
  if (condicao) {
    passou += 1;
    console.log(`  OK    ${nome}`);
  } else {
    falhou += 1;
    falhas.push(nome);
    console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`);
  }
}

async function logar(email, senha) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { cliente: c, token: data.session.access_token };
}

// Chamada crua de RPC, para testar EXECUTE sem a camada do supabase-js.
async function rpc(nome, args, token) {
  const r = await fetch(`${URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: r.status, corpo: (await r.text()).slice(0, 160) };
}

const curto = (e) => (e && e.message ? e.message.slice(0, 85) : '');

async function main() {
  console.log('='.repeat(78));
  console.log(`SUITE reconcile_security — ${URL}`);
  console.log('='.repeat(78));

  const { cliente: op, token: tokenOp } = await logar(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
  const { cliente: adm, token: tokenAdm } = await logar(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);

  console.log('\n[1] GRANTs — o operador consegue LER (achado F0-1)');
  for (const t of ['operators', 'products', 'envase_records', 'user_profiles']) {
    const { error } = await op.from(t).select('*').limit(1);
    checar(`operador le ${t}`, !error, error ? `${error.code} ${error.message}` : '');
  }

  console.log('\n[2] anon NAO le nada (GRANT revogado, nao apenas RLS)');
  for (const t of ['operators', 'products']) {
    const { error } = await anonCli.from(t).select('*').limit(1);
    checar(`anon bloqueado em ${t}`, !!error, error ? error.code : 'LEU — FALHA DE SEGURANCA');
  }

  console.log('\n[3] gerar_protocolo — EXECUTE e allowlist (F0-7, item 1)');
  const rOpOk = await rpc('gerar_protocolo', { prefixo: 'T', nome_sequence: 'public.seq_envase_protocolo' }, tokenOp);
  checar('operador chama gerar_protocolo na sequence permitida', rOpOk.status === 200, `HTTP ${rOpOk.status} ${rOpOk.corpo}`);

  const rOpBad = await rpc('gerar_protocolo', { prefixo: 'T', nome_sequence: 'public.seq_inexistente' }, tokenOp);
  checar('operador BLOQUEADO em sequence fora da allowlist', rOpBad.status !== 200, `HTTP ${rOpBad.status}`);

  const rAnon = await rpc('gerar_protocolo', { prefixo: 'X', nome_sequence: 'public.seq_envase_protocolo' }, ANON);
  checar('anon BLOQUEADO em gerar_protocolo (era HTTP 200 antes)', rAnon.status !== 200, `HTTP ${rAnon.status}`);

  const rTrig = await rpc('protect_write_once_columns', {}, tokenOp);
  checar('operador BLOQUEADO em funcao de trigger via RPC', rTrig.status !== 200, `HTTP ${rTrig.status}`);

  console.log('\n[4] is_admin() continua chamavel (as politicas dependem dela)');
  const rAdminOp = await rpc('is_admin', {}, tokenOp);
  checar('operador chama is_admin e recebe false', rAdminOp.status === 200 && rAdminOp.corpo.includes('false'), `HTTP ${rAdminOp.status} ${rAdminOp.corpo}`);
  const rAdminAdm = await rpc('is_admin', {}, tokenAdm);
  checar('admin chama is_admin e recebe true', rAdminAdm.status === 200 && rAdminAdm.corpo.includes('true'), `HTTP ${rAdminAdm.status} ${rAdminAdm.corpo}`);

  console.log('\n[5] INSERT gera protocolo pelo DEFAULT da coluna');
  const { data: prog, error: eProg } = await op
    .from('checkout_programacoes').insert({ data_programada: '2026-10-07' }).select().single();
  checar('operador cria checkout_programacoes', !eProg, eProg ? `${eProg.code} ${eProg.message}` : '');
  if (eProg) throw new Error('sem fixture de programacao, o resto nao roda');
  checar('codigo_programacao preenchido pelo DEFAULT', !!prog.codigo_programacao, JSON.stringify(prog.codigo_programacao));

  console.log('\n[6] ESCRITA UNICA em checkout_itens (o fluxo que estava quebrado)');
  const { data: item, error: eItem } = await svc
    .from('checkout_itens')
    .insert({ programacao_id: prog.id, numero_pedido: 'PED-TESTE-1', cliente: 'CLIENTE TESTE', status: 'Pendente' })
    .select().single();
  if (eItem) throw new Error(`fixture checkout_itens: ${eItem.message}`);

  const { error: e1 } = await op.from('checkout_itens').update({ operador: 'SEED-Ana Operadora' }).eq('id', item.id);
  checar('operador PREENCHE operador vazio (antes era bloqueado)', !e1, curto(e1));

  const { error: e2 } = await op.from('checkout_itens').update({ operador: 'SEED-Bruno Empilhador' }).eq('id', item.id);
  const { data: itemDepois } = await svc.from('checkout_itens').select('operador').eq('id', item.id).single();
  checar('2o operador NAO troca operador ja gravado (valor relido)',
    !!e2 && itemDepois.operador === 'SEED-Ana Operadora', `erro=${!!e2} valor=${itemDepois.operador}`);

  const { error: e3 } = await adm.from('checkout_itens').update({ operador: 'SEED-Bruno Empilhador' }).eq('id', item.id);
  checar('admin TROCA operador ja gravado', !e3, curto(e3));

  console.log('\n[7] ESCRITA UNICA em empilha_linhas (nao tinha trava nenhuma)');
  const { data: cfg } = await svc.from('empilhadeira_configs').select('id').limit(1).single();
  const { data: opBruno } = await svc.from('operators').select('id, nome').eq('nome', 'SEED-Bruno Empilhador').single();
  const { data: opCarla } = await svc.from('operators').select('id, nome').eq('nome', 'SEED-Carla Ajudante').single();
  const { data: ep, error: eEp } = await svc
    .from('empilha_programacoes').insert({ data_programada: '2026-10-07', empilhadeira_id: cfg.id }).select().single();
  if (eEp) throw new Error(`fixture empilha_programacoes: ${eEp.message}`);
  const { data: linha, error: eLinha } = await svc
    .from('empilha_linhas').insert({ programacao_id: ep.id, status: 'Pendente', tipo_linha: 'Normal' }).select().single();
  if (eLinha) throw new Error(`fixture empilha_linhas: ${eLinha.message}`);

  const { error: e4 } = await op.from('empilha_linhas')
    .update({ operador_empilhadeira: opBruno.nome, operador_empilhadeira_id: opBruno.id, status: 'Em Andamento' })
    .eq('id', linha.id);
  checar('operador INICIA a linha gravando o empilhador', !e4, curto(e4));

  const { error: e5 } = await op.from('empilha_linhas')
    .update({ operador_empilhadeira: opCarla.nome, operador_empilhadeira_id: opCarla.id }).eq('id', linha.id);
  const { data: linhaDepois } = await svc.from('empilha_linhas').select('operador_empilhadeira').eq('id', linha.id).single();
  checar('operador NAO troca o empilhador ja gravado (valor relido)',
    !!e5 && linhaDepois.operador_empilhadeira === opBruno.nome, `erro=${!!e5} valor=${linhaDepois.operador_empilhadeira}`);

  console.log('\n[8] ADMIN-ONLY: assinatura de lider');
  const { error: e6 } = await op.from('empilha_linhas')
    .update({ assinatura_lider: true, assinatura_lider_nome: 'Invasor' }).eq('id', linha.id);
  checar('operador NAO assina como lider', !!e6, e6 ? 'bloqueado' : 'ASSINOU — FALHA');

  const { error: e7 } = await adm.from('empilha_linhas')
    .update({ assinatura_lider: true, assinatura_lider_nome: 'Lider Real' }).eq('id', linha.id);
  checar('admin assina como lider', !e7, curto(e7));

  console.log('\n[9] BURACO FECHADO: reverter assinatura ja Completo');
  await svc.from('empilha_linhas').update({ status_assinatura: 'Completo' }).eq('id', linha.id);

  const { error: e8 } = await op.from('empilha_linhas').update({ status_assinatura: 'Parcial' }).eq('id', linha.id);
  checar('operador NAO reverte status_assinatura Completo', !!e8, e8 ? 'bloqueado' : 'REVERTEU — FALHA');

  const { error: e9 } = await op.from('empilha_linhas').update({ assinatura_operador_nome: 'Reescrito' }).eq('id', linha.id);
  checar('operador NAO reescreve assinatura com registro Completo', !!e9, e9 ? 'bloqueado' : 'REESCREVEU — FALHA');

  const { error: e10 } = await adm.from('empilha_linhas').update({ status_assinatura: 'Parcial' }).eq('id', linha.id);
  checar('admin AINDA reverte (correcao legitima)', !e10, curto(e10));

  console.log('\n[10] IMUTABILIDADE de protocolo');
  const { error: e11 } = await op.from('checkout_programacoes').update({ codigo_programacao: 'FALSIFICADO' }).eq('id', prog.id);
  checar('operador NAO altera codigo_programacao', !!e11, e11 ? 'bloqueado' : 'ALTEROU — FALHA');
  const { error: e12 } = await adm.from('checkout_programacoes').update({ codigo_programacao: 'FALSIFICADO' }).eq('id', prog.id);
  checar('admin TAMBEM NAO altera codigo_programacao', !!e12, e12 ? 'bloqueado' : 'ALTEROU — FALHA');

  console.log('\n[11] CATALOGO e admin-only para escrita (item 4)');
  const { error: e13 } = await op.from('products').insert({ codigo: 'OP-TESTE', nome: 'x', consistencia: 'y' });
  checar('operador NAO insere produto', !!e13, e13 ? e13.code : 'INSERIU — FALHA');
  const { error: e14 } = await op.from('operators').insert({ nome: 'OP-TESTE', sala: 'Bio' });
  checar('operador NAO insere operador', !!e14, e14 ? e14.code : 'INSERIU — FALHA');
  // ATENCAO: um UPDATE barrado por RLS afeta 0 linhas e NAO devolve erro.
  // A unica prova valida e reler o estado com service_role.
  await op.from('user_profiles').update({ role: 'admin' }).eq('email', process.env.TEST_OPERATOR_EMAIL);
  const { data: perfilDepois } = await svc.from('user_profiles').select('role').eq('email', process.env.TEST_OPERATOR_EMAIL).single();
  checar('operador NAO se promove a admin (papel relido no banco)', perfilDepois.role === 'operator', `papel ficou = ${perfilDepois.role}`);

  console.log('\n[12] DELETE e admin-only');
  await op.from('checkout_itens').delete().eq('id', item.id);
  const { count: aindaExiste } = await svc.from('checkout_itens').select('*', { count: 'exact', head: true }).eq('id', item.id);
  checar('operador NAO apaga checkout_itens (linha relida no banco)', aindaExiste === 1, `linhas restantes = ${aindaExiste}`);

  const { error: eDelAdm } = await adm.from('checkout_itens').delete().eq('id', item.id);
  const { count: depoisAdmin } = await svc.from('checkout_itens').select('*', { count: 'exact', head: true }).eq('id', item.id);
  checar('admin APAGA checkout_itens', !eDelAdm && depoisAdmin === 0, `linhas restantes = ${depoisAdmin}`);

  // limpeza das fixtures
  await svc.from('empilha_linhas').delete().eq('id', linha.id);
  await svc.from('empilha_programacoes').delete().eq('id', ep.id);
  await svc.from('checkout_itens').delete().eq('id', item.id);
  await svc.from('checkout_programacoes').delete().eq('id', prog.id);

  console.log('\n' + '='.repeat(78));
  console.log(`RESULTADO: ${passou} OK, ${falhou} FALHA`);
  if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
  console.log('='.repeat(78));
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error('\nERRO NA SUITE:', e.message); process.exit(2); });
