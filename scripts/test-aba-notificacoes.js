/**
 * scripts/test-aba-notificacoes.js — destinatários dos alertas de ocorrência,
 * na interface real (Playwright, app e banco LOCAIS).
 *
 * REESCRITO em 20/10/2026. A versão anterior gravava no banco local mas abria
 * a TELA no site de PRODUÇÃO (endereço fixo no código): rodada, tentou logar
 * em produção com a senha local do admin e foi recusada. Também usava o
 * botão de login removido no PR #25.
 *
 * O que prova agora:
 *  1. admin cadastra um destinatário pela aba "Alertas de Ocorrência" e ele
 *     aparece na lista e no banco;
 *  2. admin desativa e reativa pelo botão da linha (o banco acompanha);
 *  3. admin remove (confirmando o diálogo) e o registro some do banco;
 *  4. o operador não cadastra destinatário (RLS: 42501) nem abre a tela.
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-aba-notificacoes');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(APP)) {
  console.error(`Recusado: este teste só roda contra o app local (APP_BASE_URL=${APP})`);
  process.exit(2);
}
const URL = process.env.VITE_SUPABASE_URL;
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { login } = criarAjudantes({ app: APP, svc });
const SAIDA = 'scratch/notificacoes';
fs.mkdirSync(SAIDA, { recursive: true });
const EMAIL = `teste.alerta.${Date.now()}@exemplo.com.br`;
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const linhaNoBanco = async () => (await svc.from('notificacao_destinatarios').select('*').eq('email', EMAIL)).data?.[0];

// Restos da versão antiga (lider.qa.*), só no banco LOCAL.
await svc.from('notificacao_destinatarios').delete().like('email', 'lider.qa.%');

const nav = await chromium.launch({ headless: true });
try {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  ok(await login(page, { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD }), 'admin entra');
  await page.goto(`${APP}/GerenciarUsuarios`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await page.getByRole('tab', { name: /Alertas de Ocorrência/ }).count()) > 0, 20000);
  await page.getByRole('tab', { name: /Alertas de Ocorrência/ }).click();

  console.log('1. Cadastrar');
  await page.locator('#nomeDest').fill('Destinatário de teste');
  await page.locator('#emailDest').fill(EMAIL);
  await page.getByRole('button', { name: /Cadastrar Destinatário/ }).click();
  const naLista = await esperarPor(async () => (await page.getByText(EMAIL).count()) > 0, 15000);
  ok(naLista, 'aparece na lista da tela');
  const r1 = await linhaNoBanco();
  ok(r1?.ativo === true && r1?.nome === 'Destinatário de teste', 'gravado no banco, ativo');
  await page.screenshot({ path: `${SAIDA}/1-cadastrado.png`, fullPage: true });

  console.log('\n2. Desativar e reativar');
  const linha = page.locator('li, tr, div').filter({ hasText: EMAIL }).filter({ has: page.getByRole('button', { name: /o destinatário/ }) }).last();
  await linha.getByRole('button', { name: 'Desativar o destinatário' }).click();
  ok(await esperarPor(async () => (await linhaNoBanco())?.ativo === false, 10000), 'desativado no banco');
  await linha.getByRole('button', { name: 'Ativar o destinatário' }).click();
  ok(await esperarPor(async () => (await linhaNoBanco())?.ativo === true, 10000), 'reativado no banco');

  console.log('\n3. Remover');
  await linha.getByRole('button', { name: 'Excluir' }).click();
  ok(await esperarPor(async () => !(await linhaNoBanco()), 10000), 'removido do banco (depois de confirmar)');
  await ctx.close();

  console.log('\n4. Operador');
  const op = createClient(URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await op.auth.signInWithPassword({ email: process.env.TEST_OPERATOR_EMAIL, password: process.env.TEST_OPERATOR_PASSWORD });
  const ins = await op.from('notificacao_destinatarios').insert({ email: `op.${EMAIL}`, nome: 'x', ativo: true });
  ok(ins.error?.code === '42501', `operador NÃO cadastra (${ins.error?.code || 'CADASTROU'})`);
  const ctxOp = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const pOp = await ctxOp.newPage();
  await login(pOp, { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD });
  await pOp.goto(`${APP}/GerenciarUsuarios`, { waitUntil: 'domcontentloaded' });
  await pOp.waitForTimeout(3000);
  ok(await pOp.getByRole('tab', { name: /Alertas de Ocorrência/ }).count() === 0, 'operador não abre a tela de configurações');
  await ctxOp.close();
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  await svc.from('notificacao_destinatarios').delete().like('email', `%${EMAIL}`);
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
