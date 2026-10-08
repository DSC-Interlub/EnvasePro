/**
 * scripts/auditoria-v2-desempenho.js
 *
 * Mede desempenho contra a BUILD DE PRODUÇÃO, não contra o servidor de
 * desenvolvimento. É uma distinção que muda tudo: em dev o Vite serve cada
 * módulo solto, então a contagem de requisições fica inflada e não tem relação
 * com o que o usuário vê.
 *
 * Mede: tamanho do bundle e divisão por rota, requisições e bytes por tela,
 * tempo até a tela ficar pronta, e o polling de uma TV ao longo de 2 minutos.
 *
 * Uso: npx vite build && node scripts/auditoria-v2-desempenho.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('auditoria-v2-desempenho');

const DIST = path.resolve('dist');
const PORTA = 4190;
const SAIDA = path.join('scratch', 'auditoria');
fs.mkdirSync(SAIDA, { recursive: true });

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ nao encontrado. Rode: npx vite build');
  process.exit(1);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const servidor = http.createServer((req, res) => {
  const limpo = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, limpo);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.setHeader('Content-Type', TIPOS[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarPor(c, lim = 20000) { const f = Date.now() + lim; while (Date.now() < f) { if (await c()) return true; await esperar(250); } return false; }
const autenticado = async (p) => (await p.getByRole('button', { name: /fazer login/i }).count()) === 0 && (await p.locator('#email').count()) === 0;

async function login(page, email, senha, base) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await page.getByRole('button', { name: /fazer login/i }).count()) > 0 || (await autenticado(page)));
  const b = page.getByRole('button', { name: /fazer login/i });
  if (await b.count()) { await b.first().click(); await esperarPor(async () => (await page.locator('#email').count()) > 0, 10000); }
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

async function main() {
  await new Promise((r) => servidor.listen(PORTA, r));
  const base = `http://127.0.0.1:${PORTA}`;
  const relatorio = { bundle: [], telas: [], polling: null };

  // ---------------------------------------------------- tamanho do bundle --
  console.log('='.repeat(74));
  console.log('1. BUNDLE');
  console.log('='.repeat(74));
  const assets = path.join(DIST, 'assets');
  for (const f of fs.readdirSync(assets)) {
    const tam = fs.statSync(path.join(assets, f)).size;
    relatorio.bundle.push({ arquivo: f, bytes: tam, kb: Math.round(tam / 1024) });
    console.log(`  ${f.padEnd(34)} ${String(Math.round(tam / 1024)).padStart(6)} KB`);
  }
  const js = relatorio.bundle.filter((b) => b.arquivo.endsWith('.js'));
  console.log(`\n  arquivos .js: ${js.length}  -> ${js.length === 1
    ? 'NAO HA DIVISAO POR ROTA: tudo num pedaco so' : 'ha divisao em ' + js.length + ' pedacos'}`);

  // ------------------------------------------------- requisicoes por tela --
  console.log('\n' + '='.repeat(74));
  console.log('2. POR TELA (build de producao)');
  console.log('='.repeat(74));
  const nav = await chromium.launch({ headless: true });
  // Mede por PAPEL. O polling de 7 tabelas do menu so roda para admin
  // (Layout.jsx:51), entao misturar os papeis numa media so esconde a causa.
  const PAPEIS = [
    ['admin', process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD,
      ['Dashboard', 'Registros', 'Produtos', 'Checkout', 'Empilhadeira', 'Recebimento', 'NotasFiscais']],
    ['operador', process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD,
      ['Dashboard', 'Registros', 'Checkout', 'Empilhadeira', 'Recebimento', 'NotasFiscais']],
    ['tv', process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD,
      ['Televisao', 'TelevisaoEmpilha', 'Painel']],
  ];

  for (const [papel, email, senha, ROTAS] of PAPEIS) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page, email, senha, base);
  console.log(`
  --- ${papel} ---`);

  for (const rota of ROTAS) {
    let req = 0; let bytes = 0; const tabelas = {};
    const ouv = (r) => {
      const u = r.url();
      req += 1;
      bytes += Number(r.headers()['content-length'] || 0);
      if (u.includes('/rest/v1/')) {
        const t = u.split('/rest/v1/')[1].split('?')[0];
        tabelas[t] = (tabelas[t] || 0) + 1;
      }
    };
    page.on('response', ouv);
    const t0 = Date.now();
    await page.goto(`${base}/${rota}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    const ms = Date.now() - t0;
    await esperar(1200);
    page.off('response', ouv);
    relatorio.telas.push({ papel, rota, ms, requisicoes: req, kb: Math.round(bytes / 1024),
      nTabelas: Object.keys(tabelas).length, tabelas });
    console.log(`  ${rota.padEnd(22)} ${String(ms).padStart(5)}ms  ${String(req).padStart(3)} req  ` +
      `${String(Math.round(bytes / 1024)).padStart(5)} KB  ${String(Object.keys(tabelas).length).padStart(2)} tabelas`);
  }
  await ctx.close();
  }

  // ----------------------------------------------------- polling de uma TV -
  console.log('\n' + '='.repeat(74));
  console.log('3. POLLING — uma TV aberta por 2 minutos');
  console.log('='.repeat(74));
  const ctxTv = await nav.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await ctxTv.newPage();
  await login(tv, process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD, base);
  await tv.goto(`${base}/Televisao`, { waitUntil: 'domcontentloaded' });
  await esperar(6000); // ignora a carga inicial

  const chamadas = [];
  tv.on('response', (r) => { if (r.url().includes('/rest/v1/')) {
    chamadas.push({ t: Date.now(), tabela: r.url().split('/rest/v1/')[1].split('?')[0] }); } });
  const inicio = Date.now();
  await esperar(120000);
  const dur = (Date.now() - inicio) / 1000;

  const porTabela = {};
  for (const c of chamadas) porTabela[c.tabela] = (porTabela[c.tabela] || 0) + 1;
  relatorio.polling = { segundos: Math.round(dur), total: chamadas.length,
    porMinuto: +(chamadas.length / (dur / 60)).toFixed(1), porTabela };
  console.log(`  em ${Math.round(dur)}s: ${chamadas.length} chamadas -> ${relatorio.polling.porMinuto}/min`);
  for (const [t, n] of Object.entries(porTabela).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(28)} ${n}`);
  }

  await nav.close();
  servidor.close();
  fs.writeFileSync(path.join(SAIDA, 'desempenho.json'), JSON.stringify(relatorio, null, 2));
  console.log(`\nsalvo em ${path.join(SAIDA, 'desempenho.json')}`);
}

main().catch((e) => { console.error('ERRO:', e); servidor.close(); process.exit(2); });
