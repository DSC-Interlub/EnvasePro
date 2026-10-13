/**
 * scripts/medir-alvos.mjs
 *
 * Mede TODO alvo tocavel (botao, aba, campo, selecao, link de linha) em todas
 * as telas e nas 3 larguras, e registra quantos ficam abaixo de 48 px.
 *
 * Grava um JSON para comparar antes e depois. Ao contrario de captura de tela,
 * tamanho de elemento nao depende de relogio nem de dado.
 *
 * Uso: node scripts/medir-alvos.mjs <saida.json>
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('medir-alvos');

const APP = 'http://127.0.0.1:5173';
const saida = process.argv[2];
if (!saida) { console.error('Uso: node scripts/medir-alvos.mjs <saida.json>'); process.exit(1); }

const ALVO_MIN = 48;
const LARGURAS = [['celular', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]];
const TELAS = {
  admin: ['Dashboard', 'Registros', 'NovoRegistro', 'Checkout', 'NovaProgramacaoCheckout',
    'Empilhadeira', 'NovaEmpilhaProgramacao', 'EmpilhadeiraConfig', 'IndicadoresEmpilha',
    'Recebimento', 'IndicadoresRecebimento', 'ChecklistRecebimento', 'NovoChecklist',
    'NotasFiscais', 'NovaNotaFiscal', 'Produtos', 'Embalagens', 'Operadores',
    'GerenciarUsuarios', 'ImportarProdutos', 'ImportarEmbalagens', 'ImportarCategorias'],
  operador: ['Dashboard', 'NovoRegistro', 'Registros', 'Checkout', 'Empilhadeira',
    'Recebimento', 'ChecklistRecebimento', 'NotasFiscais'],
};
const CONTAS = {
  admin: [process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD],
  operador: [process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD],
};

async function entrar(page, [email, senha]) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  const b = page.getByRole('button', { name: /fazer login/i });
  await Promise.race([
    b.first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
    page.locator('#email').waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
  ]);
  if (await b.count()) await b.first().click();
  await page.locator('#email').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(senha);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForFunction(() => !document.querySelector('#email'), null, { timeout: 60000 });
}

const resultado = {};
const nav = await chromium.launch({ headless: true });

for (const [papel, telas] of Object.entries(TELAS)) {
  const ctx0 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const p0 = await ctx0.newPage();
  await entrar(p0, CONTAS[papel]);
  const estado = await ctx0.storageState();
  await ctx0.close();

  for (const [nomeL, w, h] of LARGURAS) {
    const ctx = await nav.newContext({ viewport: { width: w, height: h }, storageState: estado });
    const page = await ctx.newPage();
    for (const tela of telas) {
      await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('button,a,input,select').length > 3,
        null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);

      const m = await page.evaluate((min) => {
        const sel = 'button, [role="button"], [role="radio"], [role="tab"], a[href], input, select, textarea';
        const alvos = [...document.querySelectorAll(sel)];
        const medidos = [];
        for (const el of alvos) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;          // invisivel
          const s = getComputedStyle(el);
          if (s.visibility === 'hidden' || s.display === 'none') continue;
          if (el.tagName === 'INPUT' && ['hidden', 'checkbox', 'radio'].includes(el.type)) continue;
          // O Radix mantem um <select> nativo de 1x1 escondido atras do
          // seletor proprio, para compatibilidade de formulario. Ninguem
          // toca nele; contar como alvo era erro de medicao.
          if (r.width <= 2 || r.height <= 2) continue;
          // link dentro de paragrafo nao conta como alvo de toque
          if (el.tagName === 'A' && el.closest('p')) continue;
          // Ancora que ENVOLVE um botao nao e o alvo: o botao e. Contar as
          // duas media a caixa de texto da ancora (21px) como se fosse um
          // alvo pequeno, quando o que o dedo acerta tem 48px.
          if (el.tagName === 'A' && el.querySelector('button')) continue;
          medidos.push({
            tag: el.tagName.toLowerCase(),
            rotulo: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '')
              .trim().slice(0, 34),
            l: Math.round(r.width), a: Math.round(r.height),
          });
        }
        const pequenos = medidos.filter(x => x.a < min || x.l < min);
        // histograma de alturas, para ver o padrao
        const alturas = {};
        medidos.forEach(x => { alturas[x.a] = (alturas[x.a] || 0) + 1; });
        return {
          total: medidos.length,
          pequenos: pequenos.length,
          menorAltura: medidos.length ? Math.min(...medidos.map(x => x.a)) : null,
          alturas,
          exemplos: pequenos.slice(0, 8),
        };
      }, ALVO_MIN);

      const chave = `${nomeL}_${papel}_${tela}`;
      resultado[chave] = m;
      console.log(`  ${chave.padEnd(38)} ${String(m.total).padStart(3)} alvos | ` +
        `${String(m.pequenos).padStart(3)} abaixo de 48px | menor altura ${m.menorAltura}`);
    }
    await ctx.close();
  }
}
await nav.close();

const somaAlvos = Object.values(resultado).reduce((s, m) => s + m.total, 0);
const somaPequenos = Object.values(resultado).reduce((s, m) => s + m.pequenos, 0);
fs.writeFileSync(saida, JSON.stringify(resultado, null, 2));
console.log(`\n${Object.keys(resultado).length} telas | ${somaAlvos} alvos | ` +
  `${somaPequenos} abaixo de 48px -> ${saida}`);
