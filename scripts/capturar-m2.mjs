import fs from 'node:fs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('capturar-m2');
const APP = 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { login, abrir } = criarAjudantes({ app: APP, svc });

const dir = 'scratch/redesenho/m2';
fs.mkdirSync(dir, { recursive: true });
const nav = await chromium.launch({ headless: true });

for (const [rot, w, h] of [['proto1180', 1180, 820], ['tablet820', 820, 1180], ['celular390', 390, 844]]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await login(page, { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD });
  for (const tela of ['NovoRegistro', 'Registros']) {
    await abrir(page, tela);
    // Na tela de envase, mostra o estado COM produto escolhido: o cartao vazio
    // nao se compara com o prototipo, que mostra um produto selecionado.
    if (tela === 'NovoRegistro') {
      // A OP vai PRIMEIRO de proposito: preencher o produto dispara o autosave,
      // que cria um registro de verdade no banco local. Com a OP ja preenchida,
      // esse registro nasce marcado e pode ser apagado no fim — sem isso a
      // captura deixava lixo que fazia a conferencia de contagem do
      // test-envase-m2 falhar.
      await page.locator('#op').fill('OP-M2-CAPTURA');
      await page.locator('#codigo_produto').fill('SEED');
      const r = page.locator('button').filter({ hasText: /SEED-PRD-001/ });
      if (await r.count()) await r.first().click();
      for (const t of ['4', '5', '0']) await page.getByRole('button', { name: t, exact: true }).click();
      await page.waitForTimeout(800);
    }
    const arq = `${dir}/${rot}_${tela}.png`;
    await page.screenshot({ path: arq, fullPage: true });
    console.log('  ' + arq);
  }
  await ctx.close();
}
await nav.close();

// Devolve o banco local ao estado anterior.
const { error: erroLimpeza, count } = await svc
  .from('envase_records').delete({ count: 'exact' }).like('op', 'OP-M2-%');
console.log(erroLimpeza
  ? `  ATENCAO: nao consegui limpar os registros da captura: ${erroLimpeza.message}`
  : `  limpeza: ${count ?? 0} registro(s) de captura removido(s)`);
