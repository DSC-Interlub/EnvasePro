/**
 * scripts/auditoria-v2-capturas.js
 *
 * Captura TODAS as telas em 3 larguras e MEDE: requisições por tela, bytes
 * baixados, tempo até a tela ficar pronta, e alvos de toque menores que 48 px.
 *
 * Somente leitura: navega e fotografa, não clica em nada que grave.
 *
 * Uso: npx vite (noutro terminal) && node scripts/auditoria-v2-capturas.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('auditoria-v2-capturas');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const SAIDA = path.join('scratch', 'auditoria');

const LARGURAS = [
  { nome: 'celular', w: 390, h: 844 },
  { nome: 'tablet', w: 820, h: 1180 },
  { nome: 'desktop', w: 1440, h: 900 },
];

/** Telas por papel. `espera` extra onde a tela carrega muito dado. */
const TELAS = {
  admin: [
    ['Dashboard', 4000], ['Registros', 3500], ['NovoRegistro', 3000],
    ['Checkout', 3000], ['NovaProgramacaoCheckout', 3000],
    ['Empilhadeira', 3000], ['NovaEmpilhaProgramacao', 3000],
    ['EmpilhadeiraConfig', 2500], ['IndicadoresEmpilha', 3500],
    ['Recebimento', 3000], ['IndicadoresRecebimento', 3500],
    ['ChecklistRecebimento', 3000], ['NovoChecklist', 3000],
    ['NotasFiscais', 3000], ['NovaNotaFiscal', 2500],
    ['Produtos', 5000], ['Embalagens', 3000], ['Operadores', 3000],
    ['GerenciarUsuarios', 3000], ['ImportarProdutos', 2000],
    ['ImportarEmbalagens', 2000], ['ImportarCategorias', 2500],
    ['GuiaCapturas', 2000], ['Painel', 4000],
  ],
  operador: [
    ['Dashboard', 4000], ['NovoRegistro', 3000], ['Registros', 3500],
    ['Checkout', 3000], ['Empilhadeira', 3000], ['Recebimento', 3000],
    ['ChecklistRecebimento', 3000], ['NotasFiscais', 3000],
    ['Operadores', 2500], ['GerenciarUsuarios', 2500], // devem BARRAR o operador
  ],
  tv: [['Televisao', 5000], ['TelevisaoEmpilha', 5000], ['Painel', 5000]],
};

const CONTAS = {
  admin: { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD },
  operador: { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD },
  tv: { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD },
};

const medidas = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarPor(cond, limite = 20000) {
  const fim = Date.now() + limite;
  while (Date.now() < fim) { if (await cond()) return true; await esperar(250); }
  return false;
}

const ruidoDev = (t) => /vite|WebSocket|HMR|react-refresh|ERR_CONNECTION_REFUSED/i.test(t);

async function autenticado(page) {
  return (await page.getByRole('button', { name: /fazer login/i }).count()) === 0
      && (await page.locator('#email').count()) === 0;
}

async function login(page, conta) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await page.getByRole('button', { name: /fazer login/i }).count()) > 0
    || (await page.locator('#email').count()) > 0 || (await autenticado(page)));
  const abrir = page.getByRole('button', { name: /fazer login/i });
  if (await abrir.count()) { await abrir.first().click(); await esperarPor(async () => (await page.locator('#email').count()) > 0, 10000); }
  if (await page.locator('#email').count()) {
    await page.locator('#email').fill(conta.email);
    await page.locator('#password').fill(conta.senha);
    await page.locator('button[type="submit"]').first().click();
    await esperarPor(async () => (await autenticado(page))
      || (await page.locator('button').filter({ hasText: /^(?!.*Sair).*$/ }).count()) > 0, 20000);
  }
  const titulo = page.getByText(/quem é você hoje/i);
  if (await esperarPor(async () => (await titulo.count()) > 0, 5000)) {
    for (let i = 0; i < 3; i += 1) {
      const op = page.locator('button').filter({ hasText: /Sala:/ });
      if (!(await op.count())) break;
      await op.first().click({ force: true });
      if (await esperarPor(async () => (await titulo.count()) === 0, 5000)) break;
    }
  }
  await esperarPor(() => autenticado(page), 10000);
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  console.log('='.repeat(76));
  console.log(`AUDITORIA V2 — capturas e medicoes | ${APP}`);
  console.log('='.repeat(76));

  const nav = await chromium.launch({ headless: true });

  for (const faixa of LARGURAS) {
    for (const [papel, telas] of Object.entries(TELAS)) {
      const ctx = await nav.newContext({ viewport: { width: faixa.w, height: faixa.h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await login(page, CONTAS[papel]);

      for (const [rota, espera] of telas) {
        let requisicoes = 0; let bytes = 0; const erros = [];
        const porTipo = {};
        const ouvinteResp = async (r) => {
          const u = r.url();
          if (u.startsWith('data:') || u.includes('/@vite') || u.includes('/node_modules/')) return;
          requisicoes += 1;
          const tam = Number(r.headers()['content-length'] || 0);
          bytes += tam;
          if (u.includes('/rest/v1/')) {
            const tabela = u.split('/rest/v1/')[1].split('?')[0];
            porTipo[tabela] = (porTipo[tabela] || 0) + 1;
          }
          if (r.status() >= 400) erros.push(`HTTP ${r.status()} ${u.split('/').pop().slice(0, 50)}`);
        };
        const ouvinteCons = (m) => { if (m.type() === 'error' && !ruidoDev(m.text())) erros.push(m.text().slice(0, 110)); };
        page.on('response', ouvinteResp);
        page.on('console', ouvinteCons);

        const t0 = Date.now();
        await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
        await esperar(espera);
        const ms = Date.now() - t0;

        const arquivo = path.join(SAIDA, `${faixa.nome}_${papel}_${rota}.png`);
        await page.screenshot({ path: arquivo, fullPage: true });

        // alvos de toque pequenos (so uma vez, no celular)
        let alvosPequenos = null;
        if (faixa.nome === 'celular') {
          alvosPequenos = await page.evaluate(() => {
            const sel = 'button, a, input[type=checkbox], input[type=radio], [role=button]';
            let n = 0; let total = 0;
            for (const el of document.querySelectorAll(sel)) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              total += 1;
              if (r.width < 48 || r.height < 48) n += 1;
            }
            return { pequenos: n, total };
          });
        }
        // overflow horizontal
        const estoura = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);

        const texto = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
        page.off('response', ouvinteResp);
        page.off('console', ouvinteCons);

        medidas.push({
          faixa: faixa.nome, largura: faixa.w, papel, rota, ms, requisicoes,
          kb: Math.round(bytes / 1024), tabelas: porTipo, erros: [...new Set(erros)].slice(0, 3),
          alvosPequenos, estouraHorizontal: estoura,
          barrado: /sem permiss|acesso negado|restrit/i.test(texto),
          vazio: texto.trim().length < 120,
          arquivo,
        });
        console.log(`  ${faixa.nome.padEnd(8)} ${papel.padEnd(9)} ${rota.padEnd(26)} ${String(ms).padStart(5)}ms ` +
          `${String(requisicoes).padStart(3)}req ${String(Math.round(bytes / 1024)).padStart(5)}KB` +
          `${estoura ? ' ESTOURA' : ''}${erros.length ? ' erros=' + erros.length : ''}`);
      }
      await ctx.close();
    }
  }

  await nav.close();
  fs.writeFileSync(path.join(SAIDA, 'medidas.json'), JSON.stringify(medidas, null, 2));
  console.log(`\n${medidas.length} capturas em ${SAIDA}`);
}

main().catch((e) => { console.error('ERRO:', e); process.exit(2); });
