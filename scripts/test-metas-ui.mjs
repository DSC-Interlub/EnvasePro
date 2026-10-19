/**
 * scripts/test-metas-ui.mjs — metas diárias de ponta a ponta, na interface
 * real (Playwright, banco LOCAL).
 *
 *  1. As TVs medem contra a meta vigente (a carga de volume tem metas, com a
 *     de envases da sala Industrial vazia de propósito).
 *  2. O admin lança uma meta de check-out pela tela /Metas; a TV passa a
 *     mostrar essa meta; o admin a apaga pela mesma tela.
 *  3. O operador não abre /Metas.
 *
 * Os textos esperados vêm da RPC e de src/lib/metaNaTela.js — as mesmas
 * funções que as TVs usam.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';
import { anelEnvase, pilulaProducao, anelSimples } from '../src/lib/metaNaTela.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-metas-ui');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { login } = criarAjudantes({ app: APP, svc });
const SAIDA = 'scratch/etapa2/metas-ui';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };

const tvCli = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
await tvCli.auth.signInWithPassword({ email: process.env.TEST_TV_EMAIL, password: process.env.TEST_TV_PASSWORD });
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const nav = await chromium.launch({ headless: true });
async function sessao(email, senha) {
  const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  if (!(await login(page, { email, senha }))) throw new Error(`${email} não entrou`);
  return { ctx, page };
}
const corpo = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
async function painelDaTV(page, aba) {
  await page.goto(`${APP}/Televisao`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await page.getByRole('tab').count()) >= 4, 30000);
  await page.getByRole('button', { name: /pausar rotação/i }).click().catch(() => {});
  await page.getByRole('tab', { name: aba }).click();
}

console.log('='.repeat(72));
console.log(`METAS DIÁRIAS — interface real | ${APP}`);
console.log('='.repeat(72));
let lancada = false;
try {
  const tv = await sessao(process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD);
  const { data: pt } = await tvCli.rpc('painel_televisao');

  console.log('\n1. As TVs medem contra a meta vigente');
  const anel = anelEnvase({ envase: pt.envase, metas: pt.metas });
  const pil = pilulaProducao({ envase: pt.envase, metas: pt.metas });
  ok(anel.usaMeta && /Industrial sem meta/.test(anel.legenda), `a carga tem meta de envases só na sala Bio: "${anel.legenda}"`);
  await painelDaTV(tv.page, 'Envase');
  const viuEnvase = await esperarPor(async () => (await corpo(tv.page)).includes(anel.legenda) && (await corpo(tv.page)).includes(pil.texto), 20000);
  const aria = await tv.page.locator('[aria-label*="por cento"]').first().getAttribute('aria-label');
  ok(viuEnvase, `envase: legenda "${anel.legenda}" e pílula "${pil.texto}"`);
  ok(aria?.startsWith(`${anel.valor} de ${anel.total} `), `anel do envase: ${aria}`);
  await tv.page.waitForTimeout(3000); // a entrada dos cartões termina
  await tv.page.screenshot({ path: `${SAIDA}/1-tv-envase.png` });

  const { data: pe } = await tvCli.rpc('painel_televisao_empilha');
  const anelEmp = anelSimples({ concluidos: pe.concluidas, total: pe.total, meta: pe.meta, unidade: 'linhas', emAberto: pe.total - pe.concluidas, rotuloAberto: 'em aberto' });
  await tv.page.goto(`${APP}/TelevisaoEmpilha`, { waitUntil: 'domcontentloaded' });
  const viuEmp = await esperarPor(async () => (await corpo(tv.page)).includes(anelEmp.legenda), 20000);
  const ariaEmp = await tv.page.locator('[aria-label*="por cento"]').first().getAttribute('aria-label');
  ok(viuEmp && ariaEmp?.startsWith(`${anelEmp.valor} de ${anelEmp.total} linhas`), `TV de empilhadeira: "${anelEmp.legenda}" (${ariaEmp})`);
  await tv.page.screenshot({ path: `${SAIDA}/2-tv-empilha.png` });

  console.log('\n2. O admin lança e apaga uma meta pela tela /Metas');
  const adm = await sessao(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
  await adm.page.goto(`${APP}/Metas`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await adm.page.locator('#meta-item').count()) > 0, 20000);
  ok(await adm.page.getByRole('link', { name: /metas diárias/i }).count() > 0, 'o menu do admin tem "Metas diárias"');
  await adm.page.locator('#meta-item').selectOption('checkout|pedidos|');
  await adm.page.locator('#meta-valor').fill('33');
  await adm.page.locator('#meta-desde').fill(hoje);
  await adm.page.locator('#meta-obs').fill('TESTE-METAS-UI');
  await adm.page.getByRole('button', { name: 'Lançar meta' }).click();
  lancada = await esperarPor(async () => (await adm.page.getByRole('status').filter({ hasText: 'Meta lançada.' }).count()) > 0, 15000);
  ok(lancada, 'a tela confirma "Meta lançada."');
  const cartao = adm.page.locator('[data-meta-item="checkout|pedidos|"]');
  ok(/33\s*pedidos/.test(await cartao.innerText()), `"Valendo hoje" mostra a meta nova: ${(await cartao.innerText()).replace(/\s+/g, ' ')}`);
  await adm.page.screenshot({ path: `${SAIDA}/3-metas-lancada.png`, fullPage: true });

  const { data: pt2 } = await tvCli.rpc('painel_televisao');
  const anelCk = anelSimples({ concluidos: pt2.checkout.concluidos, total: pt2.checkout.total_dia, meta: pt2.metas.checkout.pedidos, unidade: 'pedidos', emAberto: pt2.checkout.pendentes, rotuloAberto: 'pendentes' });
  ok(anelCk.legenda.startsWith('meta 33 pedidos'), `a RPC já traz a meta nova: "${anelCk.legenda}"`);
  await painelDaTV(tv.page, 'Check-out');
  const viuCk = await esperarPor(async () => (await corpo(tv.page)).includes(anelCk.legenda), 40000);
  ok(viuCk, `a TV de check-out mostra "${anelCk.legenda}"`);
  await tv.page.waitForTimeout(3000);
  await tv.page.screenshot({ path: `${SAIDA}/4-tv-checkout.png` });

  // Apagar pela tela (a meta começa hoje: o RLS deixa).
  await adm.page.getByRole('button', { name: /Apagar a meta de Check-out · pedidos concluídos/ }).first().click();
  const apagou = await esperarPor(async () => (await adm.page.getByRole('status').filter({ hasText: 'Meta apagada.' }).count()) > 0, 15000);
  const { data: resto } = await svc.from('metas_diarias').select('id').eq('observacao', 'TESTE-METAS-UI');
  ok(apagou && resto.length === 0, 'o admin apaga a meta do dia pela tela, e ela some do banco');
  if (apagou && !resto.length) lancada = false;

  // Uma meta antiga (da carga) não tem botão de apagar.
  const botoesAntigos = await adm.page.getByRole('button', { name: /Apagar a meta/ }).count();
  ok(botoesAntigos === 0, `metas que já valeram em dias passados não têm botão de apagar (${botoesAntigos})`);

  console.log('\n3. O operador não abre /Metas');
  const op = await sessao(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
  await op.page.goto(`${APP}/Metas`, { waitUntil: 'domcontentloaded' });
  await op.page.waitForTimeout(4000);
  ok(await op.page.locator('#meta-item').count() === 0, 'o formulário de metas não aparece para o operador');
  ok(await op.page.getByRole('link', { name: /metas diárias/i }).count() === 0, 'e o menu do operador não tem "Metas diárias"');
  await op.page.screenshot({ path: `${SAIDA}/5-operador.png` });
} finally {
  if (lancada) await svc.from('metas_diarias').delete().eq('observacao', 'TESTE-METAS-UI');
  await nav.close();
}
console.log('\n' + '='.repeat(72));
console.log(falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`);
process.exit(falhas ? 1 : 0);
