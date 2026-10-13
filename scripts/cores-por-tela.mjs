/**
 * scripts/cores-por-tela.mjs
 *
 * Para cada tela e largura, coleta o HISTOGRAMA das cores computadas de todos
 * os elementos (fundo, texto e borda) e grava num JSON.
 *
 * POR QUE NAO COMPARAR CAPTURAS
 *
 * As telas de TV e Painel tem relogio e atualizam sozinhas: capturar duas
 * vezes o MESMO codigo ja da diferenca de pixel. Medido: num controle com
 * codigo identico, 22 das 111 telas divergiram.
 *
 * Cor computada nao depende de relogio nem de dado. Se o histograma de cores
 * de uma tela e identico antes e depois, nenhuma cor mudou naquela tela —
 * que e exatamente o que a troca de `bg-blue-600` por `bg-marca` precisa
 * provar.
 *
 * Uso: node scripts/cores-por-tela.mjs <saida.json>
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('cores-por-tela');

const APP = 'http://127.0.0.1:5173';
const saida = process.argv[2];
if (!saida) { console.error('Uso: node scripts/cores-por-tela.mjs <saida.json>'); process.exit(1); }

const LARGURAS = [['celular', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]];
const TELAS = {
  admin: ['Dashboard', 'Registros', 'NovoRegistro', 'Checkout', 'NovaProgramacaoCheckout',
    'Empilhadeira', 'NovaEmpilhaProgramacao', 'EmpilhadeiraConfig', 'IndicadoresEmpilha',
    'Recebimento', 'IndicadoresRecebimento', 'ChecklistRecebimento', 'NovoChecklist',
    'NotasFiscais', 'NovaNotaFiscal', 'Produtos', 'Embalagens', 'Operadores',
    'GerenciarUsuarios', 'ImportarProdutos', 'ImportarEmbalagens', 'ImportarCategorias', 'Painel'],
  operador: ['Dashboard', 'NovoRegistro', 'Registros', 'Checkout', 'Empilhadeira',
    'Recebimento', 'ChecklistRecebimento', 'NotasFiscais'],
  tv: ['Televisao', 'TelevisaoEmpilha', 'Painel'],
};
const CONTAS = {
  admin: [process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD],
  operador: [process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD],
  tv: [process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD],
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
      // espera a arvore montar: pelo menos um elemento com fundo pintado
      await page.waitForFunction(() => document.querySelectorAll('div,button,a,span').length > 30,
        null, { timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(2500);

      const cores = await page.evaluate(() => {
        const conta = {};
        for (const el of document.querySelectorAll('*')) {
          const s = getComputedStyle(el);
          for (const prop of ['backgroundColor', 'color', 'borderTopColor', 'borderBottomColor',
                              'borderLeftColor', 'borderRightColor']) {
            const v = s[prop];
            if (!v || v === 'rgba(0, 0, 0, 0)') continue;
            const chave = `${prop}=${v}`;
            conta[chave] = (conta[chave] || 0) + 1;
          }
        }
        return conta;
      });

      const chave = `${nomeL}_${papel}_${tela}`;
      resultado[chave] = cores;
      const azul = Object.entries(cores)
        .filter(([k]) => /rgb\(37, 99, 235\)|rgb\(29, 78, 216\)/.test(k))
        .reduce((s, [, n]) => s + n, 0);
      console.log(`  ${chave.padEnd(40)} ${Object.keys(cores).length} cores distintas | azul da marca em ${azul} usos`);
    }
    await ctx.close();
  }
}
await nav.close();
fs.writeFileSync(saida, JSON.stringify(resultado, null, 2));
console.log(`\n${Object.keys(resultado).length} telas -> ${saida}`);
