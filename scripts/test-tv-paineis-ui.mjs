/**
 * scripts/test-tv-paineis-ui.mjs — as três telas de parede com os painéis da
 * Etapa 2, na interface real (Playwright, banco LOCAL): /TelevisaoEmpilha,
 * /Televisao e /Painel.
 *
 * Três modos, cada um com a conta da TV:
 *
 *  1. RPC: a tela chama painel_televisao_empilha() e NÃO baixa mais as três
 *     tabelas; os números na tela são os que a RPC devolve.
 *  2. Função ausente: a resposta da RPC é trocada por PGRST202 (o que o
 *     PostgREST diz quando a migration ainda não foi aplicada). A tela tem de
 *     recuar para o cálculo no navegador, com consultas FILTRADAS pelo dia, e
 *     mostrar os MESMOS números.
 *  3. Rede caindo: depois de carregar, toda chamada falha. A tela mantém o
 *     último painel e avisa "Sem atualizar desde HH:MM".
 *
 * /Televisao e /Painel: com a função e com a função ausente (recuo), os
 * números na tela batem com a RPC.
 *
 * Rode depois de `semear-volume.mjs` (precisa de números diferentes de zero).
 * Uso: node scripts/test-tv-paineis-ui.mjs
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';
import { anelEnvase, anelSimples } from '../src/lib/metaNaTela.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-tv-paineis-ui');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { login } = criarAjudantes({ app: APP, svc });
const SAIDA = 'scratch/etapa2/tv-paineis';
fs.mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

// O esperado vem da RPC, lida como a TV.
const tvCli = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await tvCli.auth.signInWithPassword({ email: process.env.TEST_TV_EMAIL, password: process.env.TEST_TV_PASSWORD });
const { data: esperado, error } = await tvCli.rpc('painel_televisao_empilha');
if (error) throw error;
// O anel e a legenda dependem de haver META (tabela metas_diarias): o
// esperado sai das mesmas funções que a tela usa (src/lib/metaNaTela.js).
const anelEmp = anelSimples({
  concluidos: esperado.concluidas, total: esperado.total, meta: esperado.meta ?? null,
  unidade: 'linhas', emAberto: esperado.total - esperado.concluidas, rotuloAberto: 'em aberto',
});
const pctDe = (a) => (a.total ? Math.round(Math.min(1, a.valor / a.total) * 100) : 0);
const textos = [
  `${esperado.em_andamento} linha(s) agora`,
  `${esperado.criticos_pendentes} pendente(s)`,
  `${esperado.ocorrencias_abertas} aberta(s)`,
  anelEmp.legenda,
];
console.log('='.repeat(72));
console.log(`TV empilhadeira — painel da Etapa 2 | ${APP}`);
console.log(`esperado (RPC): ${textos.join(' | ')}`);
console.log('='.repeat(72));

const nav = await chromium.launch({ headless: true });

async function abrirTV(rotulo, preparar, rota = 'TelevisaoEmpilha', esperados = textos) {
  const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  if (!(await login(page, { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD }))) {
    throw new Error('a conta da TV não entrou');
  }
  // Sai da tela inicial ANTES de ouvir: ela (Registros) lista envase_records
  // logo depois do login, e essa requisição em voo era contada como se fosse
  // da TV.
  await page.goto('about:blank');
  const pedidos = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/')) pedidos.push(r.url()); });
  if (preparar) await preparar(page);
  await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
  const apareceu = await esperarPor(async () => {
    const corpo = await page.locator('body').innerText();
    return esperados.every((t) => corpo.includes(t));
  }, 30000);
  console.log(`\n${rotulo}`);
  return { ctx, page, pedidos, apareceu };
}

const tabela = (u) => new URL(u).pathname.replace('/rest/v1/', '');

try {
  // 1. RPC
  {
    const { ctx, page, pedidos, apareceu } = await abrirTV('1. Com a função no banco');
    await page.waitForTimeout(3000);
    ok(apareceu, 'os 4 números da RPC estão na tela');
    const pct = pctDe(anelEmp);
    const rotuloAnel = await page.locator('[aria-label*="por cento"]').first().getAttribute('aria-label');
    ok(new RegExp(`, ${pct} por cento`).test(rotuloAnel || ''), `o anel mostra ${pct}% (${rotuloAnel})`);
    ok(await page.locator('[data-tv-atualizacao="ok"]').count() === 1
      && /atualizado às \d\d:\d\d/.test(await page.locator('[data-tv-atualizacao="ok"]').innerText()),
      `mostra "${await page.locator('[data-tv-atualizacao]').innerText().catch(() => '?')}"`);
    const tabelas = [...new Set(pedidos.map(tabela))];
    ok(tabelas.includes('rpc/painel_televisao_empilha'), 'chamou rpc/painel_televisao_empilha');
    const antigas = tabelas.filter((t) => ['empilha_linhas', 'empilha_programacoes', 'empilha_ocorrencias'].includes(t));
    ok(antigas.length === 0, `não baixou mais as tabelas da empilhadeira${antigas.length ? ` (baixou ${antigas.join(', ')})` : ''}`);
    console.log(`     pedidos ao banco: ${tabelas.join(', ')}`);
    await page.screenshot({ path: `${SAIDA}/1-rpc.png` });
    await ctx.close();
  }

  // 2. Função ausente
  {
    const { ctx, page, pedidos, apareceu } = await abrirTV('2. Função AUSENTE (PGRST202) — recuo do navegador', async (p) => {
      await p.route('**/rest/v1/rpc/painel_televisao_empilha*', (r) => r.fulfill({
        status: 404, contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.painel_televisao_empilha without parameters in the schema cache', details: null, hint: null }),
      }));
    });
    await page.waitForTimeout(3000);
    ok(apareceu, 'os MESMOS 4 números aparecem, calculados no navegador');
    ok(await page.locator('[data-tv-atualizacao="falhou"]').count() === 0, 'sem aviso de falha (o recuo não é falha)');
    const linhas = pedidos.filter((u) => tabela(u) === 'empilha_linhas');
    const progs = pedidos.filter((u) => tabela(u) === 'empilha_programacoes');
    const ocorr = pedidos.filter((u) => tabela(u) === 'empilha_ocorrencias');
    ok(linhas.length > 0 && linhas.every((u) => decodeURIComponent(u).includes('programacao_id=in.')),
      'linhas buscadas FILTRADAS pelas programações do dia');
    ok(progs.length > 0 && progs.every((u) => u.includes('data_programada=eq.')), 'programações filtradas pelo dia');
    ok(ocorr.length > 0 && ocorr.every((u) => u.includes('data=eq.')), 'ocorrências filtradas pelo dia');
    await page.screenshot({ path: `${SAIDA}/2-recuo.png` });
    await ctx.close();
  }

  // 3. Rede caindo
  {
    const { ctx, page, apareceu } = await abrirTV('3. Rede cai depois de carregar');
    ok(apareceu, 'carregou normalmente');
    const antes = await page.locator('[data-tv-atualizacao="ok"]').innerText();
    await page.route('**/rest/v1/**', (r) => r.abort('internetdisconnected'));
    const avisou = await esperarPor(async () => (await page.locator('[data-tv-atualizacao="falhou"]').count()) > 0, 70000, 1000);
    const aviso = avisou ? await page.locator('[data-tv-atualizacao="falhou"]').innerText() : '(nenhum)';
    ok(avisou && /Sem atualizar desde \d\d:\d\d/.test(aviso), `avisa: "${aviso.replace(/\s+/g, ' ')}" (antes: "${antes}")`);
    const corpo = await page.locator('body').innerText();
    ok(textos.every((t) => corpo.includes(t)), 'mantém o último painel na tela (não apaga)');
    await page.screenshot({ path: `${SAIDA}/3-falhou.png` });
    await ctx.close();
  }

  // 4 e 5. A TV principal (/Televisao), com a RPC e com o recuo.
  const { data: pt, error: ePt } = await tvCli.rpc('painel_televisao');
  if (ePt) throw ePt;
  const anelEnv = anelEnvase({ envase: pt.envase, metas: pt.metas });
  const principal = [
    anelEnv.legenda,                                                          // legenda do anel
    `${pt.checkout.pendentes} pendentes`,                                     // rodapé (correção 2)
    `${pt.empilha.ocorrencias_abertas} aberta(s) hoje`,                       // rodapé
    Number(pt.envase.producao_dia).toLocaleString('pt-BR'),                      // produção de hoje
  ];
  console.log(`
/Televisao — esperado (RPC): ${principal.join(' | ')}`);
  for (const [n, rotulo, preparar, deveChamar] of [
    [4, '4. /Televisao com a função no banco', null, true],
    [5, '5. /Televisao com a função AUSENTE (recuo)', async (p) => {
      await p.route('**/rest/v1/rpc/painel_televisao', (r) => r.fulfill({
        status: 404, contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.painel_televisao without parameters in the schema cache', details: null, hint: null }),
      }));
    }, false],
  ]) {
    const { ctx, page, pedidos, apareceu } = await abrirTV(rotulo, preparar, 'Televisao', principal);
    // Pausa a rotação: a captura tem de ser do painel de envase.
    await page.getByRole('button', { name: /pausar rotação/i }).click().catch(() => {});
    // E escolhe o slide explicitamente: a rotação pode ter andado antes da pausa.
    await page.getByRole('tab', { name: 'Envase' }).click();
    await page.waitForTimeout(3000);
    ok(apareceu, 'legenda do anel, rodapé e produção do dia batem com a RPC');
    const pct = pctDe(anelEnv);
    const anel = await page.locator('[aria-label*="por cento"]').first().getAttribute('aria-label');
    ok(new RegExp(`, ${pct} por cento`).test(anel || ''), `o anel mostra ${pct}% (${anel})`);
    const tabelas = [...new Set(pedidos.map(tabela))];
    console.log(`     pedidos ao banco: ${tabelas.join(', ')}`);
    if (deveChamar) {
      const pesadas = tabelas.filter((t) => ['products', 'checkout_itens', 'checkout_programacoes', 'empilha_linhas'].includes(t));
      ok(pesadas.length === 0, `não baixou catálogo nem tabelas de operação${pesadas.length ? ` (baixou ${pesadas.join(', ')})` : ''}`);
      ok(await page.locator('[data-tv-atualizacao="ok"]').count() === 1, 'mostra "atualizado às"');
    } else {
      const amplo = pedidos.filter((u) => ['envase_records', 'checkout_itens', 'empilha_linhas'].includes(tabela(u))
        && !/data=eq.|data=gte.|programacao_id=in./.test(decodeURIComponent(u)));
      ok(amplo.length === 0, `o recuo só lê com filtro de dia/mês${amplo.length ? ` (sem filtro: ${amplo.map((u) => decodeURIComponent(u).split('/rest/v1/')[1]).join(' ; ')})` : ''}`);
    }
    await page.screenshot({ path: `${SAIDA}/${n}-televisao.png` });
    await ctx.close();
  }

  // 6 e 7. /Painel, com a RPC e com o recuo. A conta da TV não é admin: vê
  // indicadores e cartões ao vivo, não a lista "Precisa de você".
  const { data: pg, error: ePg } = await tvCli.rpc('painel_geral');
  if (ePg) throw ePg;
  const recNome = pg.ao_vivo.recebimento.itens[0]?.primeiro?.nome;
  const itemEmp = pg.ao_vivo.empilha.itens[0]?.numero_item;
  const geral = [
    `${pg.hoje.envases_concluidos} concluídos`,
    Number(pg.hoje.producao).toLocaleString('pt-BR'),
    `${pg.hoje.limpezas_concluidas}/${pg.hoje.limpezas}`,
    `${pg.ao_vivo.envase.total} ativo(s)`,                 // correção 4: o total, não 4
    pg.ao_vivo.checkout.criticos > 0 ? `${pg.ao_vivo.checkout.criticos} crítico(s)` : `${pg.ao_vivo.checkout.total} ativo(s)`,
    `${pg.ao_vivo.empilha.total} ativo(s)`,
    ...(recNome ? [recNome] : []),                           // correção 5: o participante aparece
    ...(itemEmp ? [`Item ${itemEmp}`] : []),                // correção 6: o item da linha aparece
  ];
  console.log(`\n/Painel — esperado (RPC): ${geral.join(' | ')}`);
  for (const [n, rotulo, preparar, deveChamar] of [
    [6, '6. /Painel com a função no banco', null, true],
    [7, '7. /Painel com a função AUSENTE (recuo)', async (p) => {
      await p.route('**/rest/v1/rpc/painel_geral', (r) => r.fulfill({
        status: 404, contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.painel_geral without parameters in the schema cache', details: null, hint: null }),
      }));
    }, false],
  ]) {
    const { ctx, page, pedidos, apareceu } = await abrirTV(rotulo, preparar, 'Painel', geral);
    await page.waitForTimeout(2000);
    if (!apareceu) {
      const corpo = await page.locator('body').innerText();
      console.log(`     faltando: ${geral.filter((t) => !corpo.includes(t)).join(' | ')}`);
    }
    ok(apareceu, 'indicadores, pílulas e cartões batem com a RPC (com as correções 4, 5 e 6)');
    const tabelas = [...new Set(pedidos.map(tabela))];
    console.log(`     pedidos ao banco: ${tabelas.join(', ')}`);
    if (deveChamar) {
      const antigas = tabelas.filter((t) => !['rpc/painel_geral', 'operators', 'user_profiles'].includes(t) && !t.startsWith('rpc/'));
      ok(antigas.length === 0, `só a RPC (e operadores, para foto)${antigas.length ? ` — baixou também ${antigas.join(', ')}` : ''}`);
      ok(/atualizado às \d\d:\d\d/.test(await page.locator('[data-tv-atualizacao="ok"]').innerText().catch(() => '')),
        'mostra "atualizado às HH:MM"');
    } else {
      const semFiltro = pedidos.filter((u) => ['envase_records', 'checkout_itens', 'empilha_linhas', 'limpeza_programacoes']
        .includes(tabela(u)) && !/(data|data_prevista|updated_at|status|programacao_id)=/.test(decodeURIComponent(u)));
      ok(semFiltro.length === 0, `o recuo nunca lê tabela de operação sem filtro${semFiltro.length ? ` (${semFiltro.map(tabela).join(', ')})` : ''}`);
    }
    await page.screenshot({ path: `${SAIDA}/${n}-painel.png`, fullPage: true });
    await ctx.close();
  }
} finally {
  await nav.close();
}

console.log('\n' + '='.repeat(72));
console.log(falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`);
process.exit(falhas ? 1 : 0);
