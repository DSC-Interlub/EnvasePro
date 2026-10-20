/**
 * scripts/capturar-proto-real.mjs — a tela REAL de cada protótipo de
 * referência, no mesmo tamanho de janela em que o protótipo foi fotografado
 * (scratch/capturar-prototipos.mjs), para a comparação lado a lado.
 *
 * Mapeamento (escolhido e declarado na página de comparação):
 *   TV-fabrica                 → /Televisao          1920×1080, conta TV
 *   Painel-desktop             → /Painel             1440×980, admin
 *   Envase-tablet              → /NovoRegistro       1180×900, operador
 *   Checklist-celular          → /NovoChecklist      390×844, operador
 *   Padrao-Lista               → /Registros          1440×980, admin
 *   Padrao-Formulario          → /NovaProgramacaoCheckout 1440×980, admin
 *   Padrao-Modulo-Empilhadeira → /Empilhadeira       1440×980, admin
 *
 * Uso: node scripts/capturar-proto-real.mjs <pasta-saida>
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('capturar-proto-real');

const APP = process.env.APP_CAPTURA || 'http://127.0.0.1:5173';
const saida = process.argv[2] || 'scratch/redesenho/final/proto-real';
fs.mkdirSync(saida, { recursive: true });
const { login } = criarAjudantes({ app: APP });

const CONTAS = {
  tv: [process.env.TEST_TV_EMAIL, process.env.TEST_TV_PASSWORD],
  admin: [process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD],
  operador: [process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD],
};
const PARES = [
  ['TV-fabrica', 'Televisao', 'tv', 1920, 1080],
  ['Painel-desktop', 'Painel', 'admin', 1440, 980],
  ['Envase-tablet', 'NovoRegistro', 'operador', 1180, 900],
  ['Checklist-celular', 'NovoChecklist', 'operador', 390, 844],
  ['Padrao-Lista', 'Registros', 'admin', 1440, 980],
  ['Padrao-Formulario', 'NovaProgramacaoCheckout', 'admin', 1440, 980],
  ['Padrao-Modulo-Empilhadeira', 'Empilhadeira', 'admin', 1440, 980],
];

const nav = await chromium.launch({ headless: true });
for (const [proto, tela, conta, w, h] of PARES) {
  try {
    const ctx = await nav.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    if (!(await login(page, { email: CONTAS[conta][0], senha: CONTAS[conta][1] }))) throw new Error('login');
    await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
    await esperarPor(() => page.evaluate(() => document.querySelectorAll('button,a,input').length > 3), 30000);
    if (tela === 'Televisao') {
      await page.getByRole('button', { name: /pausar rotação/i }).click().catch(() => {});
      await page.getByRole('tab', { name: 'Envase' }).click().catch(() => {});
    }
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${saida}/${proto}--real.png`, animations: 'disabled' });
    console.log(`  ${proto} -> /${tela}`);
    await ctx.close();
  } catch (e) {
    console.log(`  FALHOU ${proto}: ${String(e.message || e).split(String.fromCharCode(10))[0].slice(0, 160)}`);
  }
}
await nav.close();
for (const f of fs.readdirSync('scratch/redesenho/prototipos')) {
  if (f.endsWith('.png')) fs.copyFileSync(`scratch/redesenho/prototipos/${f}`, `${saida}/${f.replace('.png', '--prototipo.png')}`);
}
