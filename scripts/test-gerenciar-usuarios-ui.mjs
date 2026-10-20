/**
 * scripts/test-gerenciar-usuarios-ui.mjs — Gerenciar Usuários na TELA REAL (banco LOCAL).
 *
 * O fluxo inteiro, clicando como uma pessoa:
 *  1. admin cria uma conta (operador, "uso em TV"); a senha temporária aparece
 *     uma vez, com botão de copiar, e some ao fechar;
 *  2. a conta nova entra e cai na tela "Crie a sua senha"; troca; volta ao
 *     login com o aviso; entra com a senha nova e usa o sistema;
 *  3. admin edita o nome, reseta a senha (nova senha aparece uma vez),
 *     desativa (login recusado com mensagem clara), reativa;
 *  4. excluir exige digitar o e-mail; a conta some da lista;
 *  5. o histórico mostra o que foi feito; a própria linha do admin não tem
 *     Excluir/Desativar/Resetar; a tela diz que senha não se vê;
 *  6. operador: não abre Gerenciar Usuários; tem "Alterar minha senha".
 *
 * Uso: node scripts/test-gerenciar-usuarios-ui.mjs   (precisa do `vite` em 5173)
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-gerenciar-usuarios-ui');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: APP_BASE_URL não é local (${APP})`); process.exit(2); }
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { login, abrir } = criarAjudantes({ app: APP, svc });
const SAIDA = 'scratch/gerenciar-usuarios';
fs.mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const ok = (c, m, extra = '') => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}${extra ? ` -> ${extra}` : ''}`); if (!c) falhas += 1; };
const EMAIL = `teste-ui-${Date.now()}@exemplo.local`;
let ATOR = null;
const print = (page, nome) => page.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: true, animations: 'disabled' }).catch(() => {});

/** Login direto no formulário (conta nova não tem operador físico nem modal). */
async function entrarNaTela(page, email, senha) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  // Logo depois de um "sair", a tela de login pode remontar (o estado de
  // autenticação ainda está assentando) e apagar o que foi digitado; o clique
  // então esperava um botão habilitado que não vinha. Confere os campos antes
  // de clicar e tenta de novo.
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    await page.locator('#email').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(300);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(senha);
    const preenchido = await page.evaluate(([e, s]) =>
      document.querySelector('#email')?.value === e && document.querySelector('#password')?.value === s, [email, senha]);
    if (!preenchido) continue;
    try {
      await page.locator('button[type="submit"]').first().click({ timeout: 8000 });
      return;
    } catch { /* remontou entre o preencher e o clicar: tenta de novo */ }
  }
  throw new Error('não consegui enviar o formulário de login');
}

const nav = await chromium.launch({ headless: true });
console.log('='.repeat(78));
console.log(`GERENCIAR USUÁRIOS — interface real | ${APP}`);
console.log('='.repeat(78));

try {
  const ctxA = await nav.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const adm = await ctxA.newPage();
  // Admin descartável, novo a cada execução: o limite de 30 ações por admin a
  // cada 10 min contaria as execuções anteriores se fosse sempre a mesma conta.
  ATOR = `teste-ui-ator-${Date.now()}@exemplo.local`;
  const SENHA_ATOR = `Ator#Tela-${Date.now()}`;
  const { data: criado, error: eCriar } = await svc.auth.admin.createUser({ email: ATOR, password: SENHA_ATOR, email_confirm: true });
  if (eCriar) throw new Error(`admin descartável: ${eCriar.message}`);
  const { error: ePapel } = await svc.from('user_profiles').update({ role: 'admin' }).eq('id', criado.user.id);
  if (ePapel) throw new Error(`admin descartável: ${ePapel.message}`);
  ok(await login(adm, { email: ATOR, senha: SENHA_ATOR }), 'admin entra');
  await abrir(adm, 'GerenciarUsuarios');
  await esperarPor(async () => (await adm.locator('[data-usuario]').count()) > 0, 30000);

  console.log('\n1. Criar');
  ok(await adm.getByText(/Ninguém consegue ver a senha de uma conta/).isVisible(), 'a tela avisa que senha existente não se vê');
  const linhaEu = adm.locator(`[data-usuario="${ATOR}"]`);
  ok((await linhaEu.getByRole('button', { name: /Excluir|Desativar|Resetar/ }).count()) === 0, 'a própria linha não tem Excluir/Desativar/Resetar');
  await adm.getByRole('button', { name: 'Novo usuário' }).click();
  await adm.locator('#conta-nome').fill('Teste da Tela');
  await adm.locator('#conta-email').fill(EMAIL);
  await adm.getByText('Uso em TV').click();
  await print(adm, '1-criar');
  await adm.getByRole('button', { name: 'Criar usuário' }).click();
  const caixaSenha = adm.locator('[data-senha-temporaria]');
  await caixaSenha.waitFor({ state: 'visible', timeout: 20000 });
  const temporaria = (await caixaSenha.innerText()).trim();
  ok(temporaria.length === 20, 'a senha temporária aparece (20 caracteres)');
  await print(adm, '2-senha-uma-vez');
  await adm.getByRole('button', { name: 'Copiar senha' }).click();
  const copiada = await adm.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(copiada === temporaria, 'o botão copia a senha');
  await adm.getByRole('button', { name: 'Já anotei' }).click();
  await esperarPor(async () => (await caixaSenha.count()) === 0, 5000);
  ok(!(await adm.content()).includes(temporaria), 'fechado o diálogo, a senha não está mais na página');
  const linha = adm.locator(`[data-usuario="${EMAIL}"]`);
  await linha.waitFor({ state: 'visible', timeout: 15000 });
  const textoLinha = await linha.innerText();
  ok(/Operador/.test(textoLinha) && /Uso em TV/.test(textoLinha) && /Senha temporária/.test(textoLinha), 'a linha mostra Operador, Uso em TV e Senha temporária');

  console.log('\n2. Primeiro acesso: troca obrigatória');
  const ctxN = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const novo = await ctxN.newPage();
  await entrarNaTela(novo, EMAIL, temporaria);
  await novo.getByRole('heading', { name: 'Crie a sua senha' }).waitFor({ timeout: 30000 });
  ok(true, 'com a senha temporária, a conta cai em "Crie a sua senha" (nada do sistema abre antes)');
  ok((await novo.locator('nav').count()) === 0, 'sem menu enquanto não troca');
  await print(novo, '3-primeiro-acesso-celular');
  const NOVA = `Minha#Senha-${Date.now()}`;
  await novo.locator('#senha-atual').fill(temporaria);
  await novo.locator('#senha-nova').fill('curta');
  ok(await novo.getByRole('button', { name: 'Trocar senha' }).isDisabled(), 'senha fraca: botão desabilitado');
  await novo.locator('#senha-nova').fill(NOVA);
  await novo.locator('#senha-confirma').fill(NOVA);
  await novo.getByRole('button', { name: 'Trocar senha' }).click();
  await novo.getByText('Senha trocada. Entre com a senha nova.').waitFor({ timeout: 20000 });
  ok(true, 'depois da troca, volta ao login com o aviso');
  await entrarNaTela(novo, EMAIL, NOVA);
  await esperarPor(async () => (await novo.locator('#email').count()) === 0 && (await novo.getByRole('heading', { name: 'Crie a sua senha' }).count()) === 0, 30000);
  ok((await novo.getByRole('heading', { name: 'Crie a sua senha' }).count()) === 0, 'com a senha nova, entra direto no sistema');
  await ctxN.close();

  console.log('\n3. Editar, resetar, desativar, reativar');
  await adm.reload({ waitUntil: 'domcontentloaded' });
  await linha.waitFor({ state: 'visible', timeout: 20000 });
  ok(!/Senha temporária/.test(await linha.innerText()), 'depois da troca, a linha não mostra mais "Senha temporária"');
  await linha.getByRole('button', { name: `Editar ${EMAIL}` }).click();
  await adm.locator('#conta-nome').fill('Teste Renomeado');
  await adm.getByRole('button', { name: 'Salvar' }).click();
  await esperarPor(async () => /Teste Renomeado/.test(await linha.innerText()), 15000);
  ok(/Teste Renomeado/.test(await linha.innerText()), 'nome editado aparece na lista');

  await linha.getByRole('button', { name: `Resetar a senha de ${EMAIL}` }).click();
  await adm.getByRole('button', { name: 'Resetar senha' }).last().click();
  await caixaSenha.waitFor({ state: 'visible', timeout: 20000 });
  const resetada = (await caixaSenha.innerText()).trim();
  ok(resetada.length === 20 && resetada !== temporaria, 'reset mostra uma senha temporária nova, uma vez');
  await adm.getByRole('button', { name: 'Já anotei' }).click();

  await linha.getByRole('button', { name: `Desativar ${EMAIL}` }).click();
  await adm.getByRole('button', { name: 'Desativar' }).last().click();
  await esperarPor(async () => /Desativada/.test(await linha.innerText()), 15000);
  ok(/Desativada/.test(await linha.innerText()), 'a linha mostra "Desativada"');
  await print(adm, '4-lista-desativada');
  const ctxD = await nav.newContext();
  const desat = await ctxD.newPage();
  await entrarNaTela(desat, EMAIL, resetada);
  await desat.getByText('Esta conta está desativada. Fale com um administrador.').waitFor({ timeout: 20000 });
  ok(true, 'login de conta desativada: mensagem clara');
  await ctxD.close();
  await linha.getByRole('button', { name: `Reativar ${EMAIL}` }).click();
  await adm.getByRole('button', { name: 'Reativar' }).last().click();
  await esperarPor(async () => !/Desativada/.test(await linha.innerText()), 15000);
  ok(!/Desativada/.test(await linha.innerText()), 'reativada');

  console.log('\n4. Excluir com confirmação por digitação');
  await linha.getByRole('button', { name: `Excluir ${EMAIL}` }).click();
  const botaoExcluir = adm.getByRole('button', { name: 'Excluir de vez' });
  ok(await botaoExcluir.isDisabled(), 'sem digitar o e-mail, "Excluir de vez" fica desabilitado');
  await adm.locator('#confirma-exclusao').fill('outro@exemplo.local');
  ok(await botaoExcluir.isDisabled(), 'com o e-mail errado, continua desabilitado');
  await adm.locator('#confirma-exclusao').fill(EMAIL);
  await print(adm, '5-excluir');
  await botaoExcluir.click();
  await esperarPor(async () => (await linha.count()) === 0, 15000);
  ok((await linha.count()) === 0, 'a conta some da lista');

  console.log('\n5. Histórico');
  const hist = adm.getByRole('list', { name: 'Histórico de alterações' });
  await esperarPor(async () => /excluiu/.test(await hist.innerText().catch(() => '')), 15000);
  const textoHist = await hist.innerText();
  for (const verbo of ['criou', 'editou', 'resetou a senha de', 'desativou', 'reativou', 'excluiu', 'trocou a própria senha']) {
    ok(textoHist.includes(verbo), `histórico registra "${verbo}"`);
  }
  ok(!textoHist.includes(temporaria) && !textoHist.includes(NOVA) && !textoHist.includes(resetada), 'nenhuma senha no histórico');
  await print(adm, '6-historico');
  await ctxA.close();

  console.log('\n6. Operador');
  const ctxO = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  const op = await ctxO.newPage();
  ok(await login(op, { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD }), 'operador entra');
  await op.goto(`${APP}/GerenciarUsuarios`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => !op.url().includes('GerenciarUsuarios'), 15000);
  ok(!op.url().includes('GerenciarUsuarios') && (await op.locator('[data-usuario]').count()) === 0, 'operador não abre Gerenciar Usuários', op.url().replace(APP, ''));
  const link = op.getByRole('link', { name: 'Alterar minha senha' });
  ok(await link.isVisible(), 'operador tem "Alterar minha senha" no menu');
  await link.click();
  await op.locator('#senha-nova').waitFor({ timeout: 15000 });
  ok(true, '"Alterar minha senha" abre o formulário');
  await print(op, '7-alterar-minha-senha');
  await ctxO.close();
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter((x) => x.email === EMAIL || x.email === ATOR)) await svc.auth.admin.deleteUser(u.id).catch(() => {});
  await nav.close();
}

console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
