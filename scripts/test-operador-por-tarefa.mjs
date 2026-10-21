/**
 * scripts/test-operador-por-tarefa.mjs — o operador é escolhido DENTRO de cada tarefa (banco LOCAL).
 *
 * Decisão do dono, 20/10/2026: não existe mais "Quem é você hoje?" nem
 * operador guardado. Todos usam a MESMA conta (operacoes.equipe) e escolhem o
 * nome numa lista suspensa em cada tarefa. Prova, na tela real:
 *   - a mesma conta faz duas tarefas seguidas escolhendo operadores
 *     DIFERENTES, e cada registro fica com o operador escolhido — na tela de
 *     listagem e no banco;
 *   - a tela não deixa sair de "Pendente" sem escolher;
 *   - a segunda tarefa começa VAZIA (nada é lembrado da primeira).
 * Em check-out (itens) e empilhadeira (linhas), onde o banco exige o operador.
 * As tarefas pendentes são criadas pelo banco; tudo o que é ação é pela tela.
 *
 * Uso: node scripts/test-operador-por-tarefa.mjs   (precisa do `vite` em 5173)
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-operador-por-tarefa');
const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: APP_BASE_URL não é local (${APP})`); process.exit(2); }
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { login } = criarAjudantes({ app: APP });
const SAIDA = 'scratch/operador-por-tarefa';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (c, m, extra = '') => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}${extra ? ` -> ${extra}` : ''}`); if (!c) falhas += 1; };
const MARCA = `TESTE-OPT-${Date.now()}`;
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const limpar = [];

/** Escolhe `nome` na lista suspensa de id `id`; devolve o texto do campo antes. */
async function escolherNaLista(page, id, nome) {
  const campo = page.locator(`[id="${id}"]`);
  await campo.waitFor({ state: 'visible', timeout: 15000 });
  const antes = (await campo.innerText()).trim();
  await campo.click();
  await page.getByRole('option', { name: nome, exact: false }).first().click();
  return antes;
}

const nav = await chromium.launch({ headless: true });
console.log('='.repeat(78));
console.log(`OPERADOR ESCOLHIDO EM CADA TAREFA | ${APP}`);
console.log('='.repeat(78));

try {
  const { data: ops } = await svc.from('operators').select('id, nome').eq('ativo', true).order('nome').limit(2);
  if (!ops || ops.length < 2) throw new Error('precisa de 2 operadores ativos no banco local (rode o seed)');
  const [A, B] = ops;
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const falhasRede = [];
  page.on('response', (r) => { if (r.status() >= 400 && /\/rest\/v1\//.test(r.url())) falhasRede.push(`${r.status()} ${r.url().split('/rest/v1/')[1]?.slice(0, 60)}`); });
  ok(await login(page, { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD }), 'a conta compartilhada operacoes.equipe entra (sem modal)');
  ok((await page.getByText(/quem é você hoje/i).count()) === 0, 'nenhum "Quem é você hoje?"');

  // ── Check-out: dois itens, dois operadores ─────────────────────────────
  console.log('\nCheck-out');
  const { data: prog } = await svc.from('checkout_programacoes').insert({ data_programada: hoje, observacoes: MARCA }).select('id').single();
  limpar.push(['checkout_programacoes', prog.id]);
  const { data: itens } = await svc.from('checkout_itens').insert([
    { programacao_id: prog.id, numero_pedido: `${MARCA}-1`, cliente: 'Cliente 1', status: 'Pendente' },
    { programacao_id: prog.id, numero_pedido: `${MARCA}-2`, cliente: 'Cliente 2', status: 'Pendente' },
  ]).select('id, numero_pedido').order('numero_pedido');
  await page.goto(`${APP}/ExecutarCheckout?id=${prog.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator(`#operador-${itens[0].id}`).waitFor({ timeout: 20000 });

  // Sem escolher: "Marcar o início agora" não tira o item de Pendente.
  const card1 = page.locator(`#operador-${itens[0].id}`).locator('xpath=ancestor::*[.//button[@aria-label="Marcar o início agora"]][1]');
  await card1.getByRole('button', { name: 'Marcar o início agora' }).click();
  await page.getByText('Escolha o operador antes de iniciar.').waitFor({ timeout: 10000 });
  ok(true, 'sem escolher o operador, a tela avisa "Escolha o operador antes de iniciar."');
  const { data: s0 } = await svc.from('checkout_itens').select('status, operator_id').eq('id', itens[0].id).single();
  ok(s0.status === 'Pendente' && !s0.operator_id, 'e o item continua Pendente, sem operador', `${s0.status}`);

  const vazio1 = await escolherNaLista(page, `operador-${itens[0].id}`, A.nome);
  ok(/Selecione o operador/i.test(vazio1), 'item 1: o campo começava vazio', vazio1);
  await card1.getByRole('button', { name: 'Marcar o início agora' }).click();
  await esperarPor(async () => (await svc.from('checkout_itens').select('status').eq('id', itens[0].id).single()).data.status === 'Em Andamento', 15000);

  const card2 = page.locator(`#operador-${itens[1].id}`).locator('xpath=ancestor::*[.//button[@aria-label="Marcar o início agora"]][1]');
  const vazio2 = (await page.locator(`#operador-${itens[1].id}`).innerText()).trim();
  ok(/Selecione o operador/i.test(vazio2), 'item 2: começa VAZIO (nada lembrado do item 1)', vazio2);
  await escolherNaLista(page, `operador-${itens[1].id}`, B.nome);
  await card2.getByRole('button', { name: 'Marcar o início agora' }).click();
  await esperarPor(async () => (await svc.from('checkout_itens').select('status').eq('id', itens[1].id).single()).data.status === 'Em Andamento', 15000);

  const { data: fim } = await svc.from('checkout_itens').select('numero_pedido, operador, operator_id').in('id', itens.map((i) => i.id)).order('numero_pedido');
  ok(fim[0].operator_id === A.id && fim[0].operador === A.nome, `banco: item 1 ficou com ${A.nome}`, fim[0].operador);
  ok(fim[1].operator_id === B.id && fim[1].operador === B.nome, `banco: item 2 ficou com ${B.nome}`, fim[1].operador);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(`#operador-${itens[1].id}`).waitFor({ timeout: 20000 });
  const t1 = (await page.locator(`#operador-${itens[0].id}`).innerText()).trim();
  const t2 = (await page.locator(`#operador-${itens[1].id}`).innerText()).trim();
  ok(t1.startsWith(A.nome) && t2.startsWith(B.nome), 'tela: depois de recarregar, cada item mostra o SEU operador', `${t1} / ${t2}`);
  await page.screenshot({ path: `${SAIDA}/checkout-dois-operadores.png`, fullPage: true });

  // ── Empilhadeira: duas linhas, dois operadores ────────────────────────
  console.log('\nEmpilhadeira');
  const { data: cfg } = await svc.from('empilhadeira_configs').select('id').limit(1).single();
  const { data: pe } = await svc.from('empilha_programacoes').insert({ data_programada: hoje, empilhadeira_id: cfg.id, observacoes: MARCA }).select('id').single();
  limpar.push(['empilha_programacoes', pe.id]);
  const { data: linhas } = await svc.from('empilha_linhas').insert([
    { programacao_id: pe.id, numero_item: `${MARCA}-L1`, tipo_linha: 'Normal', status: 'Pendente' },
    { programacao_id: pe.id, numero_item: `${MARCA}-L2`, tipo_linha: 'Normal', status: 'Pendente' },
  ]).select('id, numero_item').order('numero_item');
  await page.goto(`${APP}/ExecutarEmpilha?id=${pe.id}`, { waitUntil: 'domcontentloaded' });
  for (const [i, op] of [[0, A], [1, B]]) {
    const cartao = page.locator('div').filter({ hasText: linhas[i].numero_item }).filter({ has: page.getByRole('button', { name: /^Iniciar$/ }) }).last();
    await cartao.getByRole('button', { name: /^Iniciar$/ }).click();
    const dialogo = page.getByRole('dialog');
    const campo = dialogo.locator(`#empilhador-${linhas[i].id}`);
    await campo.waitFor({ timeout: 15000 });
    const antes = (await campo.innerText()).trim();
    ok(/Selecione o operador/i.test(antes), `linha ${i + 1}: o empilhador começa vazio`, antes);
    ok(await dialogo.getByRole('button', { name: /Iniciar Agora/ }).isDisabled(), `linha ${i + 1}: "Iniciar Agora" desabilitado sem operador`);
    await campo.click();
    await page.getByRole('option', { name: op.nome, exact: false }).first().click();
    await dialogo.getByRole('button', { name: /Iniciar Agora/ }).click();
    await esperarPor(async () => (await svc.from('empilha_linhas').select('status').eq('id', linhas[i].id).single()).data.status === 'Em Andamento', 15000);
  }
  const { data: lf } = await svc.from('empilha_linhas').select('numero_item, operador_empilhadeira, operador_empilhadeira_id').in('id', linhas.map((l) => l.id)).order('numero_item');
  ok(lf[0].operador_empilhadeira_id === A.id, `banco: linha 1 ficou com ${A.nome}`, lf[0].operador_empilhadeira);
  ok(lf[1].operador_empilhadeira_id === B.id, `banco: linha 2 ficou com ${B.nome}`, lf[1].operador_empilhadeira);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText(linhas[1].numero_item).waitFor({ timeout: 20000 });
  const corpo = await page.locator('body').innerText();
  ok(corpo.includes(A.nome) && corpo.includes(B.nome), 'tela: a programação mostra os dois operadores, cada um na sua linha');
  await page.screenshot({ path: `${SAIDA}/empilhadeira-dois-operadores.png`, fullPage: true });

  ok((await page.evaluate(() => localStorage.getItem('envase_current_operator'))) === null, 'nada de operador guardado no navegador, do começo ao fim');
  ok(falhasRede.length === 0, 'nenhuma requisição ao banco falhou (4xx/5xx)', falhasRede[0] || '');
  await ctx.close();
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  for (const [t, id] of limpar.reverse()) await svc.from(t).delete().eq('id', id);
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
