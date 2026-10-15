/**
 * Captura o leitor de codigo nos dois estados que importam: com camera
 * (detector falso, porque a camera do laboratorio mostra um padrao de cores) e
 * com a camera recusada, que e o estado que tem de EXPLICAR em vez de ficar
 * preto.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('capturar-leitor');
const APP = 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { login, abrir } = criarAjudantes({ app: APP, svc });
const CONTA = { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD };

const dir = 'scratch/redesenho/leitor';
fs.mkdirSync(dir, { recursive: true });

const { data: ultima } = await svc.from('envase_records')
  .select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
const marco = ultima?.created_at || '1970-01-01T00:00:00Z';

const nav = await chromium.launch({
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

for (const [nome, prepara, permissoes] of [
  ['com-camera', null, ['camera']],
  ['camera-recusada', `navigator.mediaDevices.getUserMedia = () => {
      const e = new Error('negado'); e.name = 'NotAllowedError'; return Promise.reject(e); };`, []],
]) {
  const ctx = await nav.newContext({ viewport: { width: 1180, height: 820 }, permissions: permissoes });
  // Detector que nunca acha nada: mantem o modal ABERTO para a foto. Um que
  // "le" na hora fecharia o modal antes do obturador.
  await ctx.addInitScript(`window.BarcodeDetector = class {
    static getSupportedFormats() { return Promise.resolve(['code_128']); }
    detect() { return Promise.resolve([]); }
  };`);
  if (prepara) await ctx.addInitScript(prepara);
  const page = await ctx.newPage();
  await login(page, CONTA);
  await abrir(page, 'NovoRegistro');
  await page.getByRole('button', { name: /ler código/i }).first().click();
  await esperarPor(async () => (await page.locator('#codigo-usb').count()) > 0, 15000);
  await page.waitForTimeout(1200);
  const arq = `${dir}/${nome}.png`;
  await page.screenshot({ path: arq });
  console.log('  ' + arq);
  await ctx.close();
}
await nav.close();

const { data: lixo } = await svc.from('envase_records').delete().gt('created_at', marco).select('id');
console.log(`  limpeza: ${lixo?.length ?? 0} registro(s)`);
