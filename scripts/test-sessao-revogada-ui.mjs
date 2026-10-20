/**
 * scripts/test-sessao-revogada-ui.mjs — duas abas, na TELA REAL (banco LOCAL).
 *
 * Aba A: o admin, em Configurações → Usuários, desativa / exclui / reseta a
 * senha / encerra as sessões de uma conta.
 * Aba B: essa conta, PARADA numa tela (sem clicar em nada).
 *
 * A aba B tem de cair sozinha — pelo bate-ponto de 20 s — na tela de login com
 * "Sua sessão foi encerrada pelo administrador." (e não "e-mail ou senha
 * inválidos"), sem tela branca. O tempo de cada queda é medido.
 *
 * Uso: node scripts/test-sessao-revogada-ui.mjs   (precisa do `vite` em 5173)
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-sessao-revogada-ui');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: APP_BASE_URL não é local (${APP})`); process.exit(2); }
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { login, abrir } = criarAjudantes({ app: APP, svc });
const SAIDA = 'scratch/sessao-revogada';
fs.mkdirSync(SAIDA, { recursive: true });
const MENSAGEM = 'Sua sessão foi encerrada pelo administrador.';
const LIMITE_S = 25; // bate-ponto de 20 s + o tempo da própria requisição

let falhas = 0;
const ok = (c, m, extra = '') => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}${extra ? ` -> ${extra}` : ''}`); if (!c) falhas += 1; };
const MARCA = `teste-sru-${Date.now()}`;
const criados = [];

async function contaNova(nome) {
  const email = `${MARCA}-${nome}@exemplo.local`;
  const senha = `Conta#${nome}-${Date.now()}`;
  const { data, error } = await svc.auth.admin.createUser({ email, password: senha, email_confirm: true, app_metadata: { trocar_senha: false } });
  if (error) throw new Error(`criar ${nome}: ${error.message}`);
  criados.push(data.user.id);
  return { id: data.user.id, email, senha };
}

const nav = await chromium.launch({ headless: true });
console.log('='.repeat(78));
console.log(`SESSÃO ENCERRADA PELO ADMIN — duas abas | ${APP}`);
console.log('='.repeat(78));

try {
  const ator = await contaNova('ator');
  await svc.from('user_profiles').update({ role: 'admin' }).eq('id', ator.id);
  const ctxA = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
  const a = await ctxA.newPage();
  ok(await login(a, { email: ator.email, senha: ator.senha }), 'aba A: admin entra');

  const CASOS = [
    ['desativar', 'Desativar', (e) => `Desativar ${e}`, 'Desativar'],
    ['excluir', 'Excluir', (e) => `Excluir ${e}`, 'Excluir de vez'],
    ['resetar', 'Resetar senha', (e) => `Resetar a senha de ${e}`, 'Resetar senha'],
    ['encerrar', 'Encerrar sessões', (e) => `Encerrar as sessões de ${e}`, 'Encerrar sessões'],
  ];
  for (const [nome, , rotuloLinha, rotuloConfirma] of CASOS) {
    console.log(`\n${nome}`);
    const conta = await contaNova(nome);
    const ctxB = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    const b = await ctxB.newPage();
    ok(await login(b, { email: conta.email, senha: conta.senha }), 'aba B: a conta entra');
    await abrir(b, 'Registros');

    await abrir(a, 'GerenciarUsuarios');
    const linha = a.locator(`[data-usuario="${conta.email}"]`);
    await linha.waitFor({ state: 'visible', timeout: 30000 });
    await linha.getByRole('button', { name: rotuloLinha(conta.email) }).click();
    if (nome === 'excluir') await a.locator('#confirma-exclusao').fill(conta.email);
    await a.getByRole('button', { name: rotuloConfirma }).last().click();
    const t0 = Date.now();
    if (nome === 'resetar') {
      await a.locator('[data-senha-temporaria]').waitFor({ timeout: 20000 });
      await a.getByRole('button', { name: 'Já anotei' }).click();
    }

    // A aba B NÃO é tocada: só se espera.
    const caiu = await esperarPor(async () => (await b.getByText(MENSAGEM).count()) > 0, (LIMITE_S + 10) * 1000, 250);
    const segundos = (Date.now() - t0) / 1000;
    ok(caiu, `aba B parada caiu sozinha na tela de login com "${MENSAGEM}"`, `${segundos.toFixed(1)} s`);
    ok(caiu && segundos <= LIMITE_S, `em até ${LIMITE_S} s (bate-ponto de 20 s)`, `${segundos.toFixed(1)} s`);
    ok((await b.locator('#email').count()) > 0, 'aba B mostra o formulário de login (sem tela branca)');
    ok((await b.getByText('E-mail ou senha inválidos.').count()) === 0, 'e não diz "e-mail ou senha inválidos"');
    ok(!(await b.evaluate(() => Object.keys(localStorage).some((k) => k.includes('auth-token')))), 'a sessão local foi apagada');
    await b.screenshot({ path: `${SAIDA}/${nome}-aba-B.png` });
    if (nome === 'desativar') {
      await linha.getByRole('button', { name: `Reativar ${conta.email}` }).click();
      await a.getByRole('button', { name: 'Reativar' }).last().click();
      await esperarPor(async () => !/Desativada/.test(await linha.innerText()), 15000);
      await b.locator('#email').fill(conta.email);
      await b.locator('#password').fill(conta.senha);
      await b.locator('button[type="submit"]').first().click();
      const voltou = await esperarPor(async () => (await b.locator('#email').count()) === 0, 30000);
      ok(voltou, 'reativada: a aba B entra de novo');
    }
    await ctxB.close();
  }
  await ctxA.close();
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  for (const id of criados) await svc.auth.admin.deleteUser(id).catch(() => {});
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
process.exitCode = falhas ? 1 : 0;
