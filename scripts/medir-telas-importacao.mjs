// Mede as telas principais com o histórico importado, no app LOCAL.
//
// Para cada tela: tempo até o conteúdo aparecer (e a rede assentar), número
// de requisições ao Supabase, bytes baixados, e qualquer erro (HTTP ≥ 400 ou
// erro de JS). Serve para responder "as telas aguentam o histórico inteiro?".
//
// Uso: node scripts/medir-telas-importacao.mjs [--app=http://127.0.0.1:4180]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { criarAjudantes } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
const APP = (process.argv.find((a) => a.startsWith('--app=')) || '--app=http://127.0.0.1:4180').slice(6);
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: app não é local (${APP})`); process.exit(2); }
const SAIDA = path.join(os.homedir(), 'EnvasePro-importacao', 'telas');
fs.mkdirSync(SAIDA, { recursive: true });

const TELAS = [
  ['Dashboard', 'admin'], ['Registros', 'admin'], ['Checkout', 'admin'], ['IndicadoresEmpilha', 'admin'],
  ['IndicadoresRecebimento', 'admin'], ['ChecklistRecebimento', 'admin'], ['NotasFiscais', 'admin'], ['Produtos', 'admin'],
  ['Painel', 'admin'], ['Televisao', 'tv'], ['TelevisaoEmpilha', 'tv'],
];
const CONTAS = {
  admin: { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD },
  tv: { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD },
};
const { login } = criarAjudantes({ app: APP });
const nav = await chromium.launch();
const sessoes = {};
async function pagina(perfil) {
  if (sessoes[perfil]) return sessoes[perfil];
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page, CONTAS[perfil]);
  await page.waitForTimeout(1500);
  sessoes[perfil] = page;
  return page;
}

const linhas = [];
for (const [tela, perfil] of TELAS) {
  const page = await pagina(perfil);
  const reqs = []; const erros = [];
  const aoResp = async (r) => {
    const u = new URL(r.url());
    if (u.port !== '35421' && !u.pathname.startsWith('/api/')) return;
    let bytes = 0; try { bytes = (await r.body()).length; } catch { /* redirecionado */ }
    reqs.push({ status: r.status(), bytes, caminho: u.pathname });
    if (r.status() >= 400) erros.push(`HTTP ${r.status()} ${r.request().method()} ${u.pathname}`);
  };
  const aoErro = (e) => erros.push(`JS: ${e.message}`);
  page.on('response', aoResp); page.on('pageerror', aoErro);
  const t0 = Date.now();
  await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
  await page.locator('h1:visible').first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => erros.push('a rede não assentou em 90 s'));
  const ms = Date.now() - t0;
  const quebrou = (await page.getByText('Não foi possível abrir esta tela').count()) > 0;
  if (quebrou) erros.push('a tela caiu no erro de renderização');
  await page.screenshot({ path: path.join(SAIDA, `${tela}.png`) });
  page.off('response', aoResp); page.off('pageerror', aoErro);
  const kb = reqs.reduce((s, r) => s + r.bytes, 0) / 1024;
  linhas.push({ tela, perfil, segundos: +(ms / 1000).toFixed(1), requisicoes: reqs.length, kb: Math.round(kb), erros });
  console.log(`${erros.length ? 'FALHA' : 'ok   '} ${tela.padEnd(24)} ${String((ms / 1000).toFixed(1)).padStart(5)} s  ${String(reqs.length).padStart(4)} req  ${String(Math.round(kb)).padStart(7)} KB${erros.length ? '  ' + erros.slice(0, 3).join(' | ') : ''}`);
}
await nav.close();
fs.writeFileSync(path.join(SAIDA, 'telas.json'), JSON.stringify(linhas, null, 1));
console.log(`\ncapturas e telas.json em ${SAIDA}`);
process.exit(linhas.some((l) => l.erros.length) ? 1 : 0);
