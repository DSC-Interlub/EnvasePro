/**
 * scripts/test-contadores-menu.js
 *
 * Testa a funcao public.contadores_do_menu() (item (e) da V1).
 *
 * O teste que mais importa aqui e o de PARIDADE: o menu vai parar de contar
 * no navegador e passar a confiar no banco. Se as duas contas nao derem o
 * mesmo numero, trocamos um numero certo por um errado — e o selo do menu e
 * justamente o que diz ao lider que ha assinatura pendente.
 *
 * Por isso a paridade e medida com dados de verdade, criados aqui, cobrindo
 * tambem os casos de borda de cada contador (vencido x a vencer, nulo x
 * falso), e a conta "antiga" e reproduzida exatamente como estava no
 * Layout.jsx antes da troca.
 *
 * Uso: node scripts/test-contadores-menu.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-contadores-menu');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const MARCA = 'ZZTESTE-CONTADOR';

const diaRelativo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function limpar() {
  await db.from('empilha_ocorrencias').delete().like('descricao', `${MARCA}%`);
  await db.from('empilhadeira_paradas').delete().like('descricao', `${MARCA}%`);
  await db.from('recebimento_ocorrencias').delete().like('descricao', `${MARCA}%`);
  await db.from('empilha_linhas').delete().like('descricao_produto', `${MARCA}%`);
  await db.from('limpeza_programacoes').delete().like('local_nome', `${MARCA}%`);
  await db.from('recebimentos').delete().like('numero_documento', `${MARCA}%`);
  await db.from('empilhadeira_configs').delete().like('nome', `${MARCA}%`);
  await db.from('empilha_programacoes').delete().like('observacoes', `${MARCA}%`);
  await db.from('limpeza_locais').delete().like('nome', `${MARCA}%`);
}

/**
 * Cria dados COM casos de borda: para cada contador, linhas que devem entrar
 * e linhas parecidas que NAO devem. Um contador que ignorasse a condicao
 * passaria num teste que so cria linhas positivas.
 */
async function semear() {
  const hoje = diaRelativo(0);

  // alertas_manutencao: 3 contam (vencida, hoje, em 7 dias), 2 nao (em 8 dias, sem data)
  const { data: emp, error: e3 } = await db.from('empilhadeira_configs').insert(
    [diaRelativo(-5), diaRelativo(0), diaRelativo(7), diaRelativo(8), null].map((d, i) => ({
      nome: `${MARCA} empilhadeira ${i}`, intervalo_manutencao_dias: 30,
      data_proxima_manutencao: d,
    }))).select();
  if (e3) throw new Error('empilhadeira_configs: ' + e3.message);

  const { data: prog, error: eProg } = await db.from('empilha_programacoes')
    .insert({ data_programada: hoje, empilhadeira_id: emp[0].id, observacoes: `${MARCA} programacao` })
    .select().single();
  if (eProg) throw new Error('empilha_programacoes: ' + eProg.message);

  // Todas as colunas de assinatura/resolucao sao NOT NULL no banco, entao o
  // caso nulo nao existe nos dados; o IS NOT TRUE do SQL cobre os dois mesmo
  // assim. assinaturas_pendentes: 2 contam, 2 nao.
  // operador_empilhadeira_id e obrigatorio fora do status Pendente
  // (chk_empilha_linha_operador_obrigatorio)
  const { data: operadores } = await db.from('operators').select('id,nome').limit(1);
  if (!operadores?.length) throw new Error('sem operador no banco local');

  // codigo_produto tem chave estrangeira para products: usa um produto real
  const { data: prods } = await db.from('products').select('codigo,nome').limit(1);
  if (!prods?.length) throw new Error('sem produto no banco local');

  const linhas = [
    { status: 'Concluído', assinatura_lider: false  },
    { status: 'Concluído', assinatura_lider: false  },
    { status: 'Concluído', assinatura_lider: true  },
    { status: 'Em Andamento', assinatura_lider: false  },
  ].map((l, i) => ({
    programacao_id: prog.id, tipo_linha: 'Normal', numero_item: i + 1,
    codigo_produto: prods[0].codigo, descricao_produto: `${MARCA} linha ${i}`,
    quantidade: 1,
    operador_empilhadeira: operadores[0].nome,
    operador_empilhadeira_id: operadores[0].id,
    ...l,
  }));
  const { error: e1 } = await db.from('empilha_linhas').insert(linhas);
  if (e1) throw new Error('empilha_linhas: ' + e1.message);

  // ocorrencias_abertas: 2 contam (abertas), 1 nao (resolvida)
  const { error: e2 } = await db.from('empilha_ocorrencias').insert(
    [false, false, true].map((r, i) => ({
      programacao_id: prog.id, tipo: 'Problema', descricao: `${MARCA} ocorrencia ${i}`,
      registrado_por: 'QA', data: hoje, hora: '08:00:00', resolvido: r,
    })));
  if (e2) throw new Error('empilha_ocorrencias: ' + e2.message);

  // paradas_abertas: 2 contam (sem hora_fim), 1 nao (encerrada)
  const { error: e4 } = await db.from('empilhadeira_paradas').insert(
    [null, null, '10:00:00'].map((fim, i) => ({
      empilhadeira_id: emp[0].id, tipo: 'Quebra', descricao: `${MARCA} parada ${i}`,
      registrado_por: 'QA', data: hoje, hora_inicio: '09:00:00', hora_fim: fim,
    })));
  if (e4) throw new Error('empilhadeira_paradas: ' + e4.message);

  const { data: local, error: eLoc } = await db.from('limpeza_locais')
    .insert({ nome: `${MARCA} local` }).select().single();
  if (eLoc) throw new Error('limpeza_locais: ' + eLoc.message);

  // limpezas_atrasadas: 2 contam (ontem, pendente/atrasado)
  // limpezas_aguardando: 2 contam (concluida, responsavel assinou, lider nao)
  const { error: e5 } = await db.from('limpeza_programacoes').insert([
    { data_prevista: diaRelativo(-1), status: 'Pendente' },
    { data_prevista: diaRelativo(-3), status: 'Atrasado' },
    { data_prevista: diaRelativo(-1), status: 'Concluído' },   // atrasada? nao: concluida
    { data_prevista: diaRelativo(1), status: 'Pendente' },     // futura: nao
    { data_prevista: hoje, status: 'Concluído', assinatura_responsavel: true, assinatura_lider: false },
    { data_prevista: diaRelativo(-2), status: 'Concluído', assinatura_responsavel: true, assinatura_lider: false },
    { data_prevista: hoje, status: 'Concluído', assinatura_responsavel: true, assinatura_lider: true },
    { data_prevista: hoje, status: 'Concluído', assinatura_responsavel: false, assinatura_lider: false },
  ].map((l) => ({
    local_id: local.id, local_nome: `${MARCA} local`,
    assinatura_responsavel: false, assinatura_lider: false,  // NOT NULL, sem default
    ...l,
  })));
  if (e5) throw new Error('limpeza_programacoes: ' + e5.message);

  // receb_aguarda_lider: 2 contam
  const { data: recs, error: e6 } = await db.from('recebimentos').insert([
    { status: 'Concluído', assinatura_lider: false },
    { status: 'Concluído', assinatura_lider: false },
    { status: 'Concluído', assinatura_lider: true },
    { status: 'Em andamento', assinatura_lider: false },
  ].map((r, i) => ({
    tipo: 'Nacional', numero_documento: `${MARCA}-${i}`, ...r,
  }))).select();
  if (e6) throw new Error('recebimentos: ' + e6.message);

  // receb_ocorr_abertas: 2 contam
  const { error: e7 } = await db.from('recebimento_ocorrencias').insert(
    [false, false, true].map((r, i) => ({
      recebimento_id: recs[0].id, tipo: 'Avaria', descricao: `${MARCA} ocorrencia ${i}`,
      registrado_por: 'QA', resolvido: r,
    })));
  if (e7) throw new Error('recebimento_ocorrencias: ' + e7.message);
}

/**
 * A conta ANTIGA, copiada do Layout.jsx como estava antes da troca —
 * inclusive o ceil() dos dias de manutencao. E esta que define o resultado
 * correto: a funcao SQL tem de reproduzi-la.
 */
function contarComoAntes({ linhas, ocorrencias, paradas, empilhadeiras, limpezas, recebimentos, recOcorrencias }) {
  const hojeStr = new Date().toISOString().split('T')[0];
  return {
    assinaturas_pendentes: linhas.filter(l => l.status === 'Concluído' && !l.assinatura_lider).length,
    ocorrencias_abertas: ocorrencias.filter(o => !o.resolvido).length,
    paradas_abertas: paradas.filter(p => !p.hora_fim).length,
    alertas_manutencao: empilhadeiras.filter(e => {
      if (!e.data_proxima_manutencao) return false;
      const diff = Math.ceil((new Date(e.data_proxima_manutencao) - new Date()) / (1000 * 60 * 60 * 24));
      return diff <= 7;
    }).length,
    limpezas_atrasadas: limpezas.filter(p => p.data_prevista < hojeStr && p.status !== 'Concluído').length,
    limpezas_aguardando: limpezas.filter(p => p.status === 'Concluído' && p.assinatura_responsavel && !p.assinatura_lider).length,
    receb_aguarda_lider: recebimentos.filter(r => r.status === 'Concluído' && !r.assinatura_lider).length,
    receb_ocorr_abertas: recOcorrencias.filter(o => !o.resolvido).length,
  };
}

const CONTADORES = [
  'assinaturas_pendentes', 'ocorrencias_abertas', 'paradas_abertas', 'alertas_manutencao',
  'limpezas_atrasadas', 'limpezas_aguardando', 'receb_aguarda_lider', 'receb_ocorr_abertas',
];

console.log('='.repeat(72));
console.log('CONTADORES DO MENU — ITEM (e) DA V1');
console.log('='.repeat(72));

await limpar();
await semear();

try {
  // --------------------------------------------------------- 1. JWT de verdade
  console.log('\n[1] com JWT real de admin');
  const admin = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: eLogin } = await admin.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD,
  });
  checar('admin entra com senha real', !eLogin, eLogin?.message);

  const { data: rpc, error: eRpc } = await admin.rpc('contadores_do_menu');
  checar('admin executa contadores_do_menu()', !eRpc, eRpc?.message);
  const doBanco = Array.isArray(rpc) ? rpc[0] : rpc;
  checar('devolve uma linha com os 8 contadores',
    !!doBanco && CONTADORES.every(c => c in doBanco),
    JSON.stringify(doBanco));

  // ------------------------------------------------------------- 2. PARIDADE
  console.log('\n[2] PARIDADE: banco x conta antiga do navegador, mesmos dados');
  const [linhas, ocorrencias, paradas, empilhadeiras, limpezas, recebimentos, recOcorrencias] =
    await Promise.all([
      admin.from('empilha_linhas').select('*'),
      admin.from('empilha_ocorrencias').select('*'),
      admin.from('empilhadeira_paradas').select('*'),
      admin.from('empilhadeira_configs').select('*'),
      admin.from('limpeza_programacoes').select('*'),
      admin.from('recebimentos').select('*'),
      admin.from('recebimento_ocorrencias').select('*'),
    ]).then(rs => rs.map(r => r.data ?? []));

  const antigo = contarComoAntes({ linhas, ocorrencias, paradas, empilhadeiras, limpezas, recebimentos, recOcorrencias });

  for (const c of CONTADORES) {
    checar(`${c}: banco=${doBanco?.[c]} navegador=${antigo[c]}`,
      Number(doBanco?.[c]) === Number(antigo[c]));
  }

  console.log('\n[3] os dados cobrem os casos de borda (nenhum contador em zero)');
  for (const c of CONTADORES) {
    checar(`${c} > 0, entao a paridade significa algo`, Number(antigo[c]) > 0,
      `vale ${antigo[c]}`);
  }

  // -------------------------------------------------------------- 4. permissoes
  console.log('\n[4] quem pode executar');
  const anonimo = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: eAnon } = await anonimo.rpc('contadores_do_menu');
  checar('anon NAO executa', !!eAnon, 'executou sem erro');

  const operador = createClient(URL, ANON, { auth: { persistSession: false } });
  await operador.auth.signInWithPassword({
    email: process.env.TEST_OPERATOR_EMAIL, password: process.env.TEST_OPERATOR_PASSWORD,
  });
  const { data: rpcOp, error: eOp } = await operador.rpc('contadores_do_menu');
  checar('operador autenticado executa (o selo so aparece para admin, mas o GRANT e por papel do banco)',
    !eOp, eOp?.message);

  // Direitos do invocador: o operador le pelas MESMAS regras de RLS. Se a
  // funcao fosse SECURITY DEFINER, ela contaria linhas que o RLS esconde.
  const linhasOp = (await operador.from('empilha_linhas').select('*')).data ?? [];
  const esperadoOp = linhasOp.filter(l => l.status === 'Concluído' && !l.assinatura_lider).length;
  const doBancoOp = Array.isArray(rpcOp) ? rpcOp[0] : rpcOp;
  checar('operador: a contagem respeita o RLS dele (direitos do invocador)',
    Number(doBancoOp?.assinaturas_pendentes) === esperadoOp,
    `funcao=${doBancoOp?.assinaturas_pendentes} consulta=${esperadoOp}`);

  // A declaracao em si (STABLE, invoker, search_path, GRANTs) nao e visivel
  // pelo PostgREST; e conferida no banco por scripts/verificar-contadores.sql,
  // cuja saida vai no PR.
} finally {
  await limpar();
}

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
