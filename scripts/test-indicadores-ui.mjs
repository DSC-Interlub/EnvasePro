/**
 * scripts/test-indicadores-ui.mjs — indicadores de admin na interface real
 * (Playwright, banco LOCAL), Etapa 2 passos 4 e 5.
 *
 * Para cada tela e atalho de período: lê as datas que o filtro preencheu,
 * chama a RPC com ELAS e exige que os números na tela sejam os da RPC. Roda
 * também com a função ausente (PGRST202): a tela recua para o cálculo no
 * navegador e mostra o mesmo, lendo só o período.
 *
 * Rode depois de `semear-volume.mjs`.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-indicadores-ui');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { login } = criarAjudantes({ app: APP, svc });
const SAIDA = 'scratch/etapa2/indicadores-ui';
fs.mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const tabela = (u) => new URL(u).pathname.replace('/rest/v1/', '');

const adm = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await adm.auth.signInWithPassword({ email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD });

const nav = await chromium.launch({ headless: true });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
if (!(await login(page, { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD }))) throw new Error('admin não entrou');

async function abrir(rota, { semFuncao = false, aba = null } = {}) {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto('about:blank');
  if (semFuncao) {
    await page.route('**/rest/v1/rpc/indicadores_*', (r) => r.fulfill({
      status: 404, contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function in the schema cache', details: null, hint: null }),
    }));
  }
  const pedidos = [];
  const ouvir = (r) => { if (r.url().includes('/rest/v1/')) pedidos.push(r.url()); };
  page.on('request', ouvir);
  await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
  if (aba) {
    await esperarPor(async () => (await page.getByRole('button', { name: aba, exact: true }).count()) > 0, 20000);
    await page.getByRole('button', { name: aba, exact: true }).click();
  }
  return { pedidos, parar: () => page.off('request', ouvir) };
}

async function periodoNaTela() {
  const datas = page.locator('input[type="date"]');
  await esperarPor(async () => (await datas.count()) >= 2, 20000);
  return [await datas.nth(0).inputValue(), await datas.nth(1).inputValue()];
}

function esperadosEmpilha(r) {
  const t = [`${r.producao.concluidas}/${r.producao.total}`, `Turno de ${Number(r.duracao_turno_horas)}h`];
  if (r.oee.dias.some((d) => d.aproveitamento > 0)) t.push(`${r.oee.medio}%`);
  if (r.paradas.total > 0) t.push(`${Number(r.paradas.minutos)} min`);
  if (r.operadores.empilhadores[0]) t.push(`${r.operadores.empilhadores[0].media} min/linha`);
  return t;
}

async function conferir(rotulo, rota, rpcNome, esperados, opcoes = {}) {
  for (const atalho of opcoes.atalhos || ['Hoje', 'Mês']) {
    for (const semFuncao of [false, true]) {
      const { pedidos, parar } = await abrir(rota, { semFuncao, aba: opcoes.aba });
      await page.getByRole('radio', { name: atalho }).or(page.getByRole('button', { name: atalho, exact: true })).first().click();
      const [de, ate] = await periodoNaTela();
      const { data: r, error } = await adm.rpc(rpcNome, { de, ate });
      if (error) throw error;
      const textos = esperados(r);
      const apareceu = await esperarPor(async () => {
        const corpo = (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ');
        return textos.every((x) => corpo.includes(x));
      }, 20000);
      if (!apareceu) {
        const corpo = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
        console.log(`      faltando: ${textos.filter((x) => !corpo.includes(x)).join(' | ')}`);
      }
      await page.waitForTimeout(800);
      parar();
      const tabs = [...new Set(pedidos.map(tabela))];
      const modo = semFuncao ? 'recuo' : 'RPC  ';
      ok(apareceu, `${rotulo} · ${atalho.padEnd(4)} · ${modo} (${de} a ${ate}): ${textos.join(' | ')}`);
      if (!semFuncao) {
        ok(tabs.includes(`rpc/${rpcNome}`) && !(opcoes.pesadas || []).some((t) => tabs.includes(t)),
          `${rotulo} · ${atalho.padEnd(4)} · RPC  : só a função (pedidos: ${tabs.join(', ')})`);
      } else {
        const semFiltro = pedidos.filter((u) => (opcoes.pesadas || []).includes(tabela(u))
          && !/(data|data_programada|data_entrega|data_chegada|data_prevista|programacao_id|created_at|recebimento_id)=/.test(decodeURIComponent(u)));
        ok(semFiltro.length === 0, `${rotulo} · ${atalho.padEnd(4)} · recuo: nenhuma tabela lida sem filtro de período`);
      }
      for (const t of opcoes.filtradas || []) {
        const lidas = pedidos.filter((u) => tabela(u) === t);
        ok(lidas.length > 0 && lidas.every((u) => /=gte\./.test(u) && /=lte\./.test(u)),
          `${rotulo} · ${atalho.padEnd(4)} · ${modo}: ${t} lido só no período (${lidas.length} pedido(s))`);
      }
      await page.screenshot({ path: `${SAIDA}/${rotulo.replace(/\W+/g, '-')}-${atalho}-${semFuncao ? 'recuo' : 'rpc'}.png`, fullPage: true });
    }
  }
}

console.log('='.repeat(78));
console.log(`INDICADORES DE ADMIN — interface real | ${APP}`);
console.log('='.repeat(78));
try {
  const pesadasEmp = ['empilha_linhas', 'empilha_programacoes', 'empilhadeira_paradas', 'empilha_ocorrencias'];
  await conferir('IndicadoresEmpilha', 'IndicadoresEmpilha', 'indicadores_empilhadeira', esperadosEmpilha, { pesadas: pesadasEmp });
  // A aba da /Empilhadeira: a página continua lendo as tabelas para as OUTRAS
  // abas, então aqui só se confere que os números batem.
  await conferir('Empilhadeira (aba)', 'Empilhadeira', 'indicadores_empilhadeira', esperadosEmpilha,
    { aba: 'Indicadores', atalhos: ['Hoje', 'Mês'] });
  const minToHM = (min) => { const h = Math.floor(min / 60); const m = min % 60; return h > 0 ? `${h}h ${m}min` : `${m}min`; };
  await conferir('IndicadoresRecebimento', 'IndicadoresRecebimento', 'indicadores_recebimento', (r) => [
    `${r.tempo.base} concluídos`,
    `Tempo médio geral ${minToHM(r.tempo.medio)}`,
    `Total pausado ${minToHM(Number(r.tempo.pausado_total))}`,
    `Recebimento ${r.total}`,
  ], { pesadas: ['recebimentos', 'recebimento_ocorrencias', 'recebimento_participantes'], filtradas: ['checklist_recebimentos'] });
} finally {
  await nav.close();
}
console.log('\n' + '='.repeat(78));
console.log(falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`);
process.exit(falhas ? 1 : 0);
