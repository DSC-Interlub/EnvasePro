/**
 * scripts/test-csp.js
 *
 * Mede se a CSP já pode sair de Report-Only e passar a bloquear.
 *
 * Como: sobe um servidor estático servindo `dist/` (a build de produção) com a
 * CSP do `vercel.json` aplicada em modo BLOQUEANTE, navega com o Playwright e
 * coleta os eventos `securitypolicyviolation` da própria página.
 *
 * Por que não dá para medir no servidor de desenvolvimento: o Vite não aplica
 * os cabeçalhos do `vercel.json`, e em dev o React injeta estilo e script de
 * recarga que não existem na build. Medir ali daria violação que não acontece
 * em produção.
 *
 * AJUSTE DECLARADO: a CSV de produção libera `https://*.supabase.co` em
 * `connect-src`. Como o teste roda contra o Supabase LOCAL
 * (`http://127.0.0.1:54421`), esse host é acrescentado só durante o teste.
 * Sem isso toda chamada ao banco viraria violação de mentira.
 *
 * Uso: npx vite build && node scripts/test-csp.js
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-csp');

const DIST = path.resolve('dist');
const PORTA = 4178;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ não encontrado. Rode antes: npx vite build');
  process.exit(1);
}

// --- CSP do vercel.json, em modo BLOQUEANTE -------------------------------
const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const cspOriginal = vercel.headers[0].headers
  .find((h) => h.key.toLowerCase().includes('content-security-policy')).value;

const supabaseLocal = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const cspTeste = cspOriginal
  .replace("connect-src 'self'", `connect-src 'self' ${supabaseLocal} ws://127.0.0.1:* `)
  .replace('; report-uri /api/csp-report;', ';');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const servidor = http.createServer((req, res) => {
  const limpo = decodeURIComponent(req.url.split('?')[0]);
  let arquivo = path.join(DIST, limpo);
  if (!arquivo.startsWith(DIST) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    arquivo = path.join(DIST, 'index.html'); // fallback de SPA
  }
  res.setHeader('Content-Security-Policy', cspTeste); // BLOQUEANTE, não Report-Only
  res.setHeader('Content-Type', TIPOS[path.extname(arquivo)] || 'application/octet-stream');
  res.end(fs.readFileSync(arquivo));
});

const violacoes = [];
let ok = 0;
let falhou = 0;

async function main() {
  await new Promise((r) => servidor.listen(PORTA, r));
  const base = `http://127.0.0.1:${PORTA}`;
  console.log('='.repeat(76));
  console.log('CSP EM MODO BLOQUEANTE — medicao');
  console.log('='.repeat(76));
  console.log('\nCSP aplicada no teste:');
  for (const d of cspTeste.split('; ')) console.log(`  ${d}`);

  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // O evento nasce na propria pagina; so se ve injetando um ouvinte.
  await page.addInitScript(() => {
    window.__cspViolacoes = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolacoes.push({
        diretiva: e.effectiveDirective || e.violatedDirective,
        bloqueado: String(e.blockedURI || '').slice(0, 120),
        origem: String(e.sourceFile || '').slice(0, 120),
        linha: e.lineNumber,
      });
    });
  });

  const coletar = async (rotulo) => {
    const v = await page.evaluate(() => window.__cspViolacoes || []);
    for (const x of v) violacoes.push({ ...x, tela: rotulo });
    await page.evaluate(() => { window.__cspViolacoes = []; });
  };

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. Tela de entrada
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await esperar(3000);
  await coletar('entrada');

  // 2. Login e navegacao autenticada
  const botao = page.getByRole('button', { name: /fazer login/i });
  if (await botao.count()) { await botao.first().click(); await esperar(800); }
  if (await page.locator('#email').count()) {
    await page.locator('#email').fill(process.env.TEST_ADMIN_EMAIL);
    await page.locator('#password').fill(process.env.TEST_ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await esperar(5000);
  }
  const seed = page.locator('button').filter({ hasText: /SEED-/ });
  if (await seed.count()) { await seed.first().click({ force: true }); await esperar(1500); }
  await coletar('login');

  for (const rota of ['Dashboard', 'Checkout', 'Empilhadeira', 'Recebimento',
    'NovoChecklist', 'NotasFiscais', 'Produtos', 'Operadores', 'Televisao', 'Painel']) {
    await page.goto(`${base}/${rota}`, { waitUntil: 'domcontentloaded' });
    await esperar(2500);
    await coletar(rota);
  }

  await nav.close();
  servidor.close();

  // ------------------------------------------------------------ relatorio --
  console.log(`\n${'='.repeat(76)}`);
  if (!violacoes.length) {
    console.log('NENHUMA violacao de CSP em 12 telas, com a politica BLOQUEANTE.');
    ok += 1;
  } else {
    const porDiretiva = {};
    for (const v of violacoes) {
      const chave = `${v.diretiva} <- ${v.bloqueado}`;
      (porDiretiva[chave] = porDiretiva[chave] || []).push(v.tela);
    }
    console.log(`${violacoes.length} violacao(oes), agrupadas:\n`);
    for (const [chave, telas] of Object.entries(porDiretiva)) {
      console.log(`  ${chave}`);
      console.log(`    telas: ${[...new Set(telas)].join(', ')}`);
    }
    falhou += 1;
  }
  console.log('='.repeat(76));
  fs.mkdirSync('scratch', { recursive: true });
  fs.writeFileSync('scratch/csp-violacoes.json', JSON.stringify(violacoes, null, 2));
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error('ERRO:', e); servidor.close(); process.exit(2); });
