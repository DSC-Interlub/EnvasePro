/**
 * scripts/test-login.mjs — a tela de login, na interface real
 *
 * O que é provado:
 *  1. Abrir o sistema SEM sessão mostra o formulário direto, com foco no
 *     e-mail — sem botão intermediário, sem modal.
 *  2. Enter envia; admin, operador e TV entram.
 *  3. Senha errada dá erro claro e GENÉRICO — e um e-mail inexistente dá a
 *     MESMA mensagem (não dá para descobrir quais contas existem).
 *  4. A TV continua imune ao logout por inatividade; o admin continua caindo
 *     (e vê o motivo na tela de login).
 *  5. Token expirado no meio do uso reabre o MESMO formulário, por cima da tela.
 *  6. O bundle de produção não tem nenhum e-mail das contas internas.
 *
 * Uso:  npx vite --port 5173   e   npx vite build   antes
 *       node scripts/test-login.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-login');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const SHOTS = path.join('scratch', 'login');
fs.mkdirSync(SHOTS, { recursive: true });

const CONTAS = {
  admin: { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD },
  operador: { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD },
  tv: { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD },
};

const resultados = [];
function registrar(item, ok, detalhe = '') {
  resultados.push({ item, ok, detalhe });
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${item}${detalhe ? ` -> ${detalhe}` : ''}`);
}

const temFormulario = async (page) => (await page.locator('#email').count()) > 0;

async function entrarPeloTeclado(page, conta) {
  await page.locator('#email').fill(conta.email);
  await page.locator('#password').fill(conta.senha);
  await page.locator('#password').press('Enter');   // Enter envia
  return esperarPor(async () => !(await temFormulario(page)), 20000);
}

async function main() {
  console.log('='.repeat(78));
  console.log(`LOGIN  |  app ${APP}`);
  console.log('='.repeat(78));

  const nav = await chromium.launch({ headless: true });

  /* ── 1. sem sessão: formulário direto ─────────────────────────────── */
  console.log('\n[1] sem sessão');
  {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    const apareceu = await esperarPor(() => temFormulario(page), 20000);
    registrar('abrir sem sessão já mostra o formulário', apareceu);

    const botaoAntigo = await page.getByRole('button', { name: /fazer login/i }).count();
    registrar('não há botão intermediário "Fazer Login"', botaoAntigo === 0);

    await page.waitForTimeout(300);
    const foco = await page.evaluate(() => document.activeElement?.id);
    registrar('o foco já está no e-mail', foco === 'email', `foco em "${foco}"`);

    const semAtalho = await page.getByText(/preenchimento rápido/i).count();
    registrar('o "Preenchimento Rápido" saiu', semAtalho === 0);
    await page.screenshot({ path: path.join(SHOTS, '1_sem_sessao.png') });

    /* ── 3. erro de senha, e o mesmo erro para e-mail inexistente ─────── */
    console.log('\n[3] erros');
    await page.locator('#email').fill(CONTAS.admin.email);
    await page.locator('#password').fill('senha-errada-de-proposito');
    await page.locator('#password').press('Enter');
    const alerta = page.getByRole('alert');
    await esperarPor(async () => (await alerta.count()) > 0, 15000);
    const msgSenha = (await alerta.count()) ? (await alerta.innerText()).trim() : '';
    registrar('senha errada mostra erro claro', msgSenha === 'E-mail ou senha inválidos.', `"${msgSenha}"`);
    registrar('continua na tela de login', await temFormulario(page));
    const focoPosErro = await page.evaluate(() => document.activeElement?.id);
    registrar('depois do erro o foco volta para a senha', focoPosErro === 'password', `foco em "${focoPosErro}"`);
    await page.screenshot({ path: path.join(SHOTS, '3_erro_senha.png') });

    await page.locator('#email').fill('ninguem-existe-com-este@exemplo.invalido');
    await page.locator('#password').fill('qualquer-coisa-123');
    await page.locator('#password').press('Enter');
    await page.waitForTimeout(2500);
    const msgInexistente = (await alerta.count()) ? (await alerta.innerText()).trim() : '';
    registrar('e-mail inexistente dá a MESMA mensagem', msgInexistente === msgSenha, `"${msgInexistente}"`);
    await ctx.close();
  }

  /* ── 2. as três contas entram pelo teclado ────────────────────────── */
  console.log('\n[2] as três contas');
  for (const [papel, conta] of Object.entries(CONTAS)) {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    // A TV entra pela própria rota: é assim que a TV da fábrica liga.
    await page.goto(papel === 'tv' ? `${APP}/Televisao` : APP, { waitUntil: 'domcontentloaded' });
    await esperarPor(() => temFormulario(page), 20000);
    const entrou = await entrarPeloTeclado(page, conta);
    registrar(`${papel} entra com Enter`, entrou);
    if (papel === 'tv') {
      const desenhou = await esperarPor(async () => (await page.getByText(/Produção de hoje|Expedição de hoje/i).count()) > 0, 20000);
      registrar('a TV abre o painel depois do login', desenhou);
      await page.screenshot({ path: path.join(SHOTS, '2_tv_logada.png') });
    }
    await ctx.close();
  }

  /* ── 4. inatividade: TV imune, admin cai ──────────────────────────── */
  console.log('\n[4] logout por inatividade');
  for (const [papel, deveCair] of [['tv', false], ['admin', true]]) {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(papel === 'tv' ? `${APP}/Televisao` : APP, { waitUntil: 'domcontentloaded' });
    await esperarPor(() => temFormulario(page), 20000);
    await entrarPeloTeclado(page, CONTAS[papel]);

    // Simula duas horas sem interação: a regra lê este carimbo ao carregar.
    await page.evaluate(() => localStorage.setItem('envase_last_activity', String(Date.now() - 2 * 3600 * 1000)));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const caiu = await temFormulario(page);
    registrar(`${papel} ${deveCair ? 'CAI' : 'NÃO cai'} após 2h sem interação`, caiu === deveCair,
      caiu ? 'voltou para o login' : 'continua logado');
    if (deveCair && caiu) {
      const motivo = await page.getByText(/inatividade/i).count();
      registrar('o admin vê o motivo na tela de login', motivo > 0);
      await page.screenshot({ path: path.join(SHOTS, '4_admin_inatividade.png') });
    }
    await ctx.close();
  }

  /* ── 5. token expirado no meio do uso: o mesmo formulário ─────────── */
  console.log('\n[5] sessão expirada no meio do uso');
  {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    await esperarPor(() => temFormulario(page), 20000);
    await entrarPeloTeclado(page, CONTAS.admin);
    // O adaptador dispara este evento quando a renovação do token falha.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('envase_open_login_modal')));
    const modal = page.getByRole('dialog', { name: /entre de novo/i });
    const abriu = await esperarPor(async () => (await modal.count()) > 0, 8000);
    registrar('o modal de login reaparece', abriu);
    const mesmoForm = abriu && (await modal.locator('#email').count()) > 0
      && (await modal.locator('#password').count()) > 0
      && (await modal.getByRole('button', { name: /^entrar$/i }).count()) > 0;
    registrar('é o mesmo formulário (e-mail, senha, Entrar)', mesmoForm);
    await page.screenshot({ path: path.join(SHOTS, '5_modal_meio_da_sessao.png') });
    if (abriu) {
      await modal.locator('#email').fill(CONTAS.admin.email);
      await modal.locator('#password').fill(CONTAS.admin.senha);
      await modal.locator('#password').press('Enter');
      const fechou = await esperarPor(async () => (await modal.count()) === 0, 15000);
      registrar('entrar de novo fecha o modal', fechou);
    }
    await ctx.close();
  }

  await nav.close();

  /* ── 6. o bundle de produção ──────────────────────────────────────── */
  console.log('\n[6] bundle de produção (dist/)');
  if (!fs.existsSync('dist/assets')) {
    registrar('dist/ existe (rode `npx vite build` antes)', false);
  } else {
    const arquivos = fs.readdirSync('dist/assets').filter((f) => f.endsWith('.js'))
      .map((f) => path.join('dist/assets', f)).concat(['dist/index.html']);
    const proibidos = ['interlub.com', 'gmail.com', 'tv-fabrica', 'pcp-brasil', 'operacoes.equipe', 'lauremank'];
    const achados = [];
    for (const f of arquivos) {
      const s = fs.readFileSync(f, 'utf8');
      for (const p of proibidos) if (s.includes(p)) achados.push(`${p} em ${path.basename(f)}`);
    }
    registrar(`nenhum e-mail interno nos ${arquivos.length} arquivos do bundle`, achados.length === 0, achados.slice(0, 3).join(', '));
  }

  const ok = resultados.filter((r) => r.ok).length;
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(78));
  console.log(`LOGIN: ${ok} OK, ${falhas.length} FALHA(S), de ${resultados.length}`);
  if (falhas.length) for (const f of falhas) console.log(`  - ${f.item}${f.detalhe ? ` (${f.detalhe})` : ''}`);
  console.log('='.repeat(78));
  process.exit(falhas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
