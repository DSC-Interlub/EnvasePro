/**
 * scripts/test-401-intermitente.js
 *
 * Reproduz e diagnostica o 401 intermitente.
 *
 * O que ele olha, e que os testes anteriores nao olhavam: o CABECALHO da
 * requisicao que falhou. Saber se o `Authorization` foi enviado, e com qual
 * token, separa as hipoteses:
 *
 *   - sem cabecalho algum      -> a consulta saiu antes de a sessao carregar
 *   - cabecalho = chave anon   -> idem, so que o cliente usou o fallback
 *   - cabecalho = JWT expirado -> o problema e renovacao de token
 *   - cabecalho = JWT valido   -> o problema esta no servidor, nao no cliente
 *
 * Faz N ciclos de login + navegacao, porque a falha e intermitente: uma rodada
 * limpa nao prova nada.
 *
 * Uso: node scripts/test-401-intermitente.js [ciclos]
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-401-intermitente');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const CICLOS = Number(process.argv[2] || 8);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarPor(c, lim = 20000) {
  const f = Date.now() + lim;
  while (Date.now() < f) { if (await c()) return true; await esperar(200); }
  return false;
}

/** Descreve o token sem imprimi-lo. */
function descreverToken(auth) {
  if (!auth) return 'SEM CABECALHO Authorization';
  const t = auth.replace(/^Bearer\s+/i, '');
  if (t === ANON) return 'chave ANON (nao e sessao de usuario)';
  const partes = t.split('.');
  if (partes.length !== 3) return 'token em formato desconhecido';
  try {
    const p = JSON.parse(Buffer.from(partes[1], 'base64').toString());
    const agora = Math.floor(Date.now() / 1000);
    const resta = (p.exp || 0) - agora;
    return `JWT role=${p.role} sub=${String(p.sub || '').slice(0, 8)} ` +
           `expira em ${resta}s ${resta <= 0 ? '(EXPIRADO)' : '(valido)'}`;
  } catch { return 'JWT ilegivel'; }
}

const ocorrencias = [];

async function umCiclo(nav, n) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Guarda o cabecalho de cada requisicao ao PostgREST, para cruzar com a resposta.
  const porUrl = new Map();
  // Captura QUALQUER requisicao ao Supabase, nao so /rest/v1/: o 401 pode vir
  // do /auth/v1/ (renovacao de token) ou do /storage/v1/.
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/') || r.url().includes('/auth/v1/') || r.url().includes('/storage/v1/')) {
      porUrl.set(r.url(), r.headers().authorization || null);
    }
  });
  page.on('response', async (r) => {
    if (r.status() !== 401) return;
    let corpo = '';
    try { corpo = (await r.text()).slice(0, 160); } catch { corpo = '(sem corpo)'; }
    ocorrencias.push({
      ciclo: n,
      alvo: (r.url().split('/supabase.co')[1] || r.url()).replace(/^https?:\/\/[^/]+/, '').split('&')[0].slice(0, 75),
      token: descreverToken(porUrl.get(r.url())),
      corpo,
    });
  });

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await page.getByRole('button', { name: /fazer login/i }).count()) > 0
    || (await page.locator('#email').count()) > 0);
  const abrir = page.getByRole('button', { name: /fazer login/i });
  if (await abrir.count()) { await abrir.first().click(); await esperarPor(async () => (await page.locator('#email').count()) > 0, 8000); }
  await page.locator('#email').fill(process.env.TEST_ADMIN_EMAIL);
  await page.locator('#password').fill(process.env.TEST_ADMIN_PASSWORD);

  // Clica e NAVEGA IMEDIATAMENTE: e a janela onde a corrida acontece.
  await page.locator('button[type="submit"]').first().click();
  await esperar(900);
  await page.goto(`${APP}/Dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(1500);
  await page.goto(`${APP}/Recebimento`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await esperar(3000);

  await ctx.close();
}

async function main() {
  console.log('='.repeat(76));
  console.log(`401 INTERMITENTE — ${CICLOS} ciclos de login + navegacao imediata`);
  console.log('='.repeat(76));

  const nav = await chromium.launch({ headless: true });
  for (let i = 1; i <= CICLOS; i += 1) {
    const antes = ocorrencias.length;
    await umCiclo(nav, i);
    const novas = ocorrencias.length - antes;
    console.log(`  ciclo ${String(i).padStart(2)}: ${novas ? `${novas} resposta(s) 401` : 'limpo'}`);
  }
  await nav.close();

  console.log('\n' + '='.repeat(76));
  if (!ocorrencias.length) {
    console.log(`NENHUM 401 em ${CICLOS} ciclos.`);
    console.log('Nao prova ausencia: a falha e intermitente. Rode mais ciclos.');
  } else {
    console.log(`${ocorrencias.length} resposta(s) 401 em ${CICLOS} ciclos:\n`);
    for (const o of ocorrencias) {
      console.log(`  ciclo ${o.ciclo} | ${o.alvo}`);
      console.log(`    token : ${o.token}`);
      console.log(`    corpo : ${o.corpo}`);
    }
    const semCab = ocorrencias.filter((o) => o.token.includes('SEM CABECALHO')).length;
    const anon = ocorrencias.filter((o) => o.token.includes('ANON')).length;
    const expirado = ocorrencias.filter((o) => o.token.includes('EXPIRADO')).length;
    const valido = ocorrencias.filter((o) => o.token.includes('(valido)')).length;
    console.log('\n  DIAGNOSTICO:');
    console.log(`    sem cabecalho Authorization : ${semCab}  -> consulta antes da sessao carregar`);
    console.log(`    com a chave anon            : ${anon}  -> idem, com fallback do cliente`);
    console.log(`    com JWT expirado            : ${expirado}  -> problema de renovacao de token`);
    console.log(`    com JWT valido              : ${valido}  -> o problema NAO e o cliente`);
  }
  console.log('='.repeat(76));
  process.exit(ocorrencias.length ? 1 : 0);
}

main().catch((e) => { console.error('ERRO:', e); process.exit(2); });
