/**
 * scripts/test-sql-injection.js
 *
 * Revisão de SQL injection com PROVA, não só leitura de código.
 *
 * Dispara entradas maliciosas contra o Supabase LOCAL, pelos mesmos caminhos
 * que as telas usam, e confere o que volta. O critério não é "deu erro": é que
 * o valor tenha sido tratado como TEXTO LITERAL, sem virar operador, sem
 * devolver linha que não devia e sem vazar erro de banco.
 *
 * Caminhos cobertos:
 *   1. adaptador .filter({ coluna: valor })  -> .eq()  (busca de pedido SAP)
 *   2. adaptador .filter({ coluna: [lista] }) -> .in()
 *   3. adaptador .list(orderBy)               -> .order(coluna)
 *   4. .get(id) com id forjado
 *   5. RPC gerar_protocolo com nome de sequence forjado
 *   6. PostgREST cru, para tentar o que o supabase-js talvez escapasse
 *
 * Uso: node scripts/test-sql-injection.js
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-sql-injection');

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const svc = createClient(URL, SRK, { auth: { persistSession: false } });

let ok = 0;
let falhou = 0;
const falhas = [];

function checar(nome, condicao, detalhe = '') {
  if (condicao) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

/**
 * Cargas maliciosas: SQL clássico, sintaxe de filtro do PostgREST
 * (vírgula, parênteses, ponto, operadores) e curingas.
 */
const CARGAS = [
  `' OR '1'='1`,
  `' OR 1=1 --`,
  `'; DROP TABLE sap_pedidos; --`,
  `" OR ""="`,
  `1' UNION SELECT * FROM user_profiles --`,
  `%`,
  `%%`,
  `_`,
  `*`,
  `,`,
  `(`,
  `)`,
  `()`,
  `.`,
  `eq.PED-REAL-1`,
  `PED-REAL-1,ativo.eq.true`,
  `*,user_profiles(*)`,
  `or=(id.gt.0)`,
  `not.is.null`,
  `in.(PED-REAL-1)`,
  `\\`,
  `\u0000truncado`,
  `PED-REAL-1' --`,
];

async function main() {
  console.log('='.repeat(76));
  console.log(`SQL INJECTION — ${URL}`);
  console.log('='.repeat(76));

  // ---------------------------------------------------------- fixtures ------
  await svc.from('sap_pedidos').delete().like('numero_documento', 'PED-%');
  await svc.from('sap_pedidos').insert([
    { numero_documento: 'PED-REAL-1', nome_fornecedor: 'FORNECEDOR A', ativo: true },
    { numero_documento: 'PED-REAL-2', nome_fornecedor: 'FORNECEDOR B', ativo: true },
    { numero_documento: 'PED-INATIVO', nome_fornecedor: 'FORNECEDOR C', ativo: false },
  ]);
  const { count: totalPedidos } = await svc
    .from('sap_pedidos').select('*', { count: 'exact', head: true });
  console.log(`\nfixtures: ${totalPedidos} pedidos (2 ativos, 1 inativo)`);

  const admin = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: eLogin } = await admin.auth.signInWithPassword({
    email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD,
  });
  if (eLogin) throw new Error(`login admin: ${eLogin.message}`);
  const token = (await admin.auth.getSession()).data.session.access_token;

  // ============================== 1. .eq() ==================================
  // Caminho real: NovoChecklist.handleBuscarSAP ->
  //   SapPedido.filter({ numero_documento: <digitado>, ativo: true })
  console.log('\n[1] busca de pedido SAP (.eq com valor digitado pelo usuario)');
  let vazamentos = 0;
  let errosDeBanco = 0;
  for (const carga of CARGAS) {
    const { data, error } = await admin
      .from('sap_pedidos').select('*').eq('numero_documento', carga).eq('ativo', true);
    if (error) {
      errosDeBanco += 1;
      console.log(`    erro com ${JSON.stringify(carga)}: ${error.code} ${error.message.slice(0, 70)}`);
    } else if (data.length > 0) {
      vazamentos += 1;
      console.log(`    VAZOU com ${JSON.stringify(carga)}: ${data.length} linha(s)`);
    }
  }
  checar(`nenhuma das ${CARGAS.length} cargas devolveu linha (sem bypass de filtro)`, vazamentos === 0,
    `${vazamentos} vazamento(s)`);
  checar('nenhuma carga produziu erro de banco (valor tratado como texto)', errosDeBanco === 0,
    `${errosDeBanco} erro(s)`);

  // Controle: o valor legitimo ainda funciona. Sem isto, "0 linhas sempre"
  // passaria no teste por estar simplesmente quebrado.
  const { data: legitimo } = await admin
    .from('sap_pedidos').select('*').eq('numero_documento', 'PED-REAL-1').eq('ativo', true);
  checar('CONTROLE: o valor legitimo continua achando o pedido', legitimo?.length === 1,
    `${legitimo?.length} linha(s)`);

  // ============================== 2. .in() ==================================
  console.log('\n[2] lista de valores (.in)');
  const { data: dIn, error: eIn } = await admin
    .from('sap_pedidos').select('*').in('numero_documento', [`PED-REAL-1`, `' OR '1'='1`, `*`]);
  checar('.in com carga na lista devolve so o valor legitimo', !eIn && dIn?.length === 1,
    eIn ? eIn.message.slice(0, 60) : `${dIn?.length} linha(s)`);

  // ============================== 3. .order() ===============================
  console.log('\n[3] ordenacao (.order com coluna forjada)');
  for (const col of ['numero_documento', 'id); DROP TABLE sap_pedidos; --', 'nao_existe', '*']) {
    const { error } = await admin.from('sap_pedidos').select('*').order(col, { ascending: true }).limit(1);
    const legitima = col === 'numero_documento';
    checar(`order por ${JSON.stringify(col.slice(0, 28))} ${legitima ? 'funciona' : 'e recusado'}`,
      legitima ? !error : !!error, error ? `${error.code}` : 'sem erro');
  }
  const { count: aindaExiste } = await svc
    .from('sap_pedidos').select('*', { count: 'exact', head: true });
  checar('a tabela sobreviveu ao DROP TABLE embutido', aindaExiste === totalPedidos,
    `${aindaExiste} linhas (eram ${totalPedidos})`);

  // ============================== 4. .get(id) ===============================
  console.log('\n[4] busca por id forjado');
  for (const idFalso of [`00000000-0000-0000-0000-000000000000' OR '1'='1`, `*`, `1 OR 1=1`]) {
    const { data, error } = await admin.from('sap_pedidos').select('*').eq('id', idFalso);
    checar(`id ${JSON.stringify(idFalso.slice(0, 26))} nao devolve linha`,
      !!error || (data?.length ?? 0) === 0, error ? `recusado: ${error.code}` : `${data?.length} linha(s)`);
  }

  // ============================== 5. RPC ====================================
  console.log('\n[5] RPC gerar_protocolo com nome de sequence forjado');
  const rpcCargas = [
    `public.seq_envase_protocolo'); DROP TABLE sap_pedidos; --`,
    `pg_catalog.pg_class`,
    `public.seq_envase_protocolo, public.seq_checkout_prog`,
    `'; SELECT 1; --`,
  ];
  for (const carga of rpcCargas) {
    const r = await fetch(`${URL}/rest/v1/rpc/gerar_protocolo`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixo: 'X', nome_sequence: carga }),
    });
    checar(`sequence ${JSON.stringify(carga.slice(0, 30))} recusada`, r.status !== 200, `HTTP ${r.status}`);
  }
  const { count: depoisRpc } = await svc
    .from('sap_pedidos').select('*', { count: 'exact', head: true });
  checar('a tabela sobreviveu as cargas no RPC', depoisRpc === totalPedidos, `${depoisRpc} linhas`);

  // ============================== 6. PostgREST cru ==========================
  // Sem o supabase-js no meio: tenta injetar direto na querystring, que e onde
  // a sintaxe do PostgREST (virgula, parenteses, operadores) de fato vive.
  console.log('\n[6] PostgREST cru (sem o supabase-js escapar nada)');
  const cruas = [
    `numero_documento=eq.PED-REAL-1&ativo=eq.false`,
    `numero_documento=like.*`,
    `or=(numero_documento.eq.PED-REAL-1,numero_documento.eq.PED-REAL-2)`,
    `select=*,user_profiles(*)`,
  ];
  for (const qs of cruas) {
    const r = await fetch(`${URL}/rest/v1/sap_pedidos?${qs}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${token}` },
    });
    const corpo = await r.text();
    const vazouOutraTabela = /email|role|user_profiles/i.test(corpo) && r.status === 200;
    checar(`querystring ${JSON.stringify(qs.slice(0, 42))} nao vaza outra tabela`,
      !vazouOutraTabela, `HTTP ${r.status} ${corpo.slice(0, 70)}`);
  }

  // Limpeza
  await svc.from('sap_pedidos').delete().like('numero_documento', 'PED-%');

  console.log('\n' + '='.repeat(76));
  console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
  if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
  console.log('='.repeat(76));
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error('ERRO NA SUITE:', e); process.exit(2); });
