/**
 * scripts/test-rotas-admin.js
 *
 * Prova que as rotas somente-admin recusam o operador ANTES de desenhar a tela.
 *
 * O teste abre as rotas DIGITANDO A URL, que é a única forma de o operador
 * chegar nelas: o menu já as esconde. Era exatamente essa a lacuna — o menu
 * escondia, mas a rota desenhava.
 *
 * Uso: npx vite (noutro terminal) && node scripts/test-rotas-admin.js
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-rotas-admin');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';

/** Rotas que o operador NÃO pode abrir. */
const SOMENTE_ADMIN = [
  'Produtos', 'Embalagens', 'Operadores',
  'ImportarProdutos', 'ImportarEmbalagens', 'ImportarCategorias',
  'GerenciarUsuarios', 'EmpilhadeiraConfig',
  'IndicadoresEmpilha', 'IndicadoresRecebimento',
];

/** Rotas que o operador PODE abrir. Sem isto, "barra tudo" passaria no teste. */
const LIBERADAS = ['Dashboard', 'NovoRegistro', 'Checkout', 'Empilhadeira', 'Recebimento', 'NotasFiscais'];

let ok = 0;
let falhou = 0;
const falhas = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

async function esperarPor(c, lim = 20000) {
  const f = Date.now() + lim;
  while (Date.now() < f) { if (await c()) return true; await esperar(200); }
  return false;
}
const autenticado = async (p) => (await p.getByRole('button', { name: /fazer login/i }).count()) === 0
  && (await p.locator('#email').count()) === 0;

async function login(page, email, senha) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await page.getByRole('button', { name: /fazer login/i }).count()) > 0 || (await autenticado(page)));
  const b = page.getByRole('button', { name: /fazer login/i });
  if (await b.count()) { await b.first().click(); await esperarPor(async () => (await page.locator('#email').count()) > 0, 8000); }
  if (await page.locator('#email').count()) {
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(senha);
    await page.locator('button[type="submit"]').first().click();
    await esperar(6000);
  }
  const t = page.getByText(/quem é você hoje/i);
  if (await esperarPor(async () => (await t.count()) > 0, 5000)) {
    for (let i = 0; i < 3; i += 1) {
      const op = page.locator('button').filter({ hasText: /Sala:/ });
      if (!(await op.count())) break;
      await op.first().click({ force: true });
      if (await esperarPor(async () => (await t.count()) === 0, 5000)) break;
    }
  }
  await esperarPor(() => autenticado(page), 10000);
}

/** Para onde a URL foi parar depois de carregar. */
/**
 * Abre a rota e devolve onde o navegador PAROU.
 *
 * Espera por condicao, nao por tempo: a guarda so decide depois de o papel
 * chegar de `user_profiles`, e a pagina e carregada sob demanda. Com uma
 * espera fixa de 2,5s a PRIMEIRA rota da lista pegava a compilacao fria do
 * Vite e era lida antes do redirecionamento, acusando uma falha de permissao
 * que nao existia.
 *
 * O limite de tempo e generoso e NAO mascara falha: se a rota de fato nao
 * redirecionar, a espera estoura e devolvemos o caminho onde ficou, que e
 * justamente o que reprova o teste.
 */
async function abrirEVerDestino(page, rota, esperaSair) {
  await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });

  // 1) a guarda decidiu (o spinner "Verificando permissão" saiu)
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Verificando permissão"]'),
    null, { timeout: 60000 }).catch(() => {});

  // 2) o desfecho esperado. Dizer qual e evita a corrida entre o fim do
  //    spinner e a troca de URL: esperar "sair" quando o certo e sair, e
  //    esperar a tela montar quando o certo e ficar.
  await page.waitForFunction(({ r, sair }) => {
    const fora = !location.pathname.toLowerCase().includes(r.toLowerCase());
    return sair ? fora : (document.body.innerText || '').trim().length > 0;
  }, { r: rota, sair: esperaSair }, { timeout: 60000 }).catch(() => {});

  const url = new URL(page.url());
  return { caminho: url.pathname, busca: url.search };
}

async function main() {
  console.log('='.repeat(72));
  console.log('ROTAS SOMENTE-ADMIN');
  console.log('='.repeat(72));

  const nav = await chromium.launch({ headless: true });

  // ------------------------------------------------------------- operador --
  console.log('\n[1] operador abrindo as rotas de admin PELA URL — deve ser recusado');
  const ctxOp = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const op = await ctxOp.newPage();
  await login(op, process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);

  for (const rota of SOMENTE_ADMIN) {
    const { caminho, busca } = await abrirEVerDestino(op, rota, true);
    // Recusado = redirecionado para outra rota, com o aviso de acesso restrito.
    const saiu = !caminho.toLowerCase().includes(rota.toLowerCase());
    const avisou = busca.includes('acesso=restrito');
    checar(`/${rota} recusa o operador`, saiu && avisou, `foi parar em ${caminho}${busca}`);
  }

  console.log('\n[2] operador nas rotas que PODE abrir — nao pode barrar demais');
  for (const rota of LIBERADAS) {
    const { caminho } = await abrirEVerDestino(op, rota, false);
    checar(`/${rota} continua aberta ao operador`,
      caminho.toLowerCase().includes(rota.toLowerCase()), `foi parar em ${caminho}`);
  }
  await ctxOp.close();

  // ---------------------------------------------------------------- admin --
  console.log('\n[3] admin abre todas as rotas de admin');
  const ctxAd = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const ad = await ctxAd.newPage();
  await login(ad, process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
  for (const rota of SOMENTE_ADMIN) {
    const { caminho } = await abrirEVerDestino(ad, rota, false);
    checar(`/${rota} abre para o admin`,
      caminho.toLowerCase().includes(rota.toLowerCase()), `foi parar em ${caminho}`);
  }
  await ctxAd.close();

  await nav.close();
  console.log('\n' + '='.repeat(72));
  console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
  if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
  console.log('='.repeat(72));
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error('ERRO:', e); process.exit(2); });
