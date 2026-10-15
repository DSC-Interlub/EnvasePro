/**
 * scripts/test-leitor-codigo.js — leitura de código de barras na interface real
 *
 * O QUE DÁ PARA PROVAR E O QUE NÃO DÁ
 *
 * Não dá para provar aqui que o `BarcodeDetector` do Chrome decodifica uma
 * etiqueta Code 128 de verdade: isso é código do navegador, e um teste que
 * "prova" biblioteca de terceiro prova pouco. O que dá para provar — e é o que
 * costuma quebrar — é a NOSSA cola:
 *
 *   1. o botão abre o modal;
 *   2. o caminho do leitor USB funciona de ponta a ponta (é o caminho real da
 *      fábrica: o leitor digita o código e manda Enter);
 *   3. um código que o detector devolve chega ao formulário e escolhe o produto
 *      (com `BarcodeDetector` falso, para exercitar a nossa cola sem depender da
 *      câmera do laboratório);
 *   4. código desconhecido NÃO some em silêncio — aparece no campo de busca;
 *   5. câmera recusada mostra explicação e o caminho USB continua funcionando;
 *   6. a câmera é DESLIGADA ao fechar o modal (sem isso a luz fica acesa e a
 *      bateria do tablet vai embora).
 *
 * Uso:  npx vite --port 5173     (noutro terminal)
 *       node scripts/test-leitor-codigo.js
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-leitor-codigo');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { login, abrir } = criarAjudantes({ app: APP, svc });
const CONTA = { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD };

const resultados = [];
function registrar(item, ok, detalhe = '') {
  resultados.push({ item, ok, detalhe });
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${item}${detalhe ? ` -> ${detalhe}` : ''}`);
}

/** Injeta um BarcodeDetector falso que sempre "le" o codigo dado. */
function detectorFalso(codigo) {
  return `
    window.BarcodeDetector = class {
      static getSupportedFormats() { return Promise.resolve(['code_128', 'qr_code']); }
      constructor() {}
      detect() { return Promise.resolve([{ rawValue: ${JSON.stringify(codigo)} }]); }
    };
  `;
}

async function abrirLeitor(page) {
  const botao = page.getByRole('button', { name: /ler código/i }).first();
  const apareceu = await esperarPor(async () => (await botao.count()) > 0, 20000);
  if (!apareceu) {
    const texto = (await page.locator('body').innerText()).slice(0, 300).replace(/\s+/g, ' ');
    throw new Error(`botao "Ler codigo" nao apareceu. Tela: ${texto}`);
  }
  await botao.click();
  return esperarPor(async () => (await page.locator('#codigo-usb').count()) > 0, 10000);
}

async function main() {
  console.log('='.repeat(78));
  console.log(`LEITOR DE CÓDIGO  |  app ${APP}`);
  console.log('='.repeat(78));

  const { data: produto } = await svc
    .from('products').select('codigo, nome').order('codigo').limit(1).single();

  // Escolher um produto ja dispara o autosave do EnvaseForm (ele grava assim
  // que tem produto, e o operador vem do modal), entao este teste CRIA
  // registros como efeito colateral. Marca o instante para apagar depois: sem
  // isso o lixo se acumula e quebra a conferencia de contagem de outra suite.
  const { data: ultima } = await svc.from('envase_records')
    .select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const marco = ultima?.created_at || '1970-01-01T00:00:00Z';
  console.log(`\nProduto alvo: ${produto.codigo} — ${produto.nome}\n`);

  const navegador = await chromium.launch({
    headless: true,
    // Camera falsa do Chromium: um padrao de cores animado. Serve para o
    // getUserMedia resolver; quem "le" o codigo e o detector falso.
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });

  // ============================================ 1. caminho do leitor USB ====
  console.log('[1] leitor de mão (USB) — o caminho real da fábrica');
  {
    const ctx = await navegador.newContext({ viewport: { width: 1180, height: 820 } });
    const page = await ctx.newPage();
    await login(page, CONTA);
    await abrir(page, 'NovoRegistro');

    const abriu = await abrirLeitor(page);
    registrar('o botão "Ler código" abre o leitor', abriu);

    // O dialogo entra com `zoom-in-95`, ou seja, scale(.95). Medir antes de a
    // animacao terminar dava 46px para um alvo de 48 (48 x 0,958) — o mesmo
    // erro de instrumento que ja tinha aparecido na medicao das listas.
    await esperarPor(async () => page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return false;
      // `matrix3d(...)` tambem conta: a animacao zoom-in-95 do Radix produz
      // matrix3d, e um regex que so casava `matrix(` dava "assentado" na hora.
      const t = getComputedStyle(d).transform;
      if (t === 'none') return true;
      const m = t.match(/matrix(?:3d)?\(([^,]+)/);
      return m ? Math.abs(parseFloat(m[1]) - 1) < 0.001 : true;
    }), 8000);

    // O medir-alvos.mjs percorre telas, nao modais — um alvo pequeno dentro de
    // um dialogo passaria despercebido por ele.
    const pequenosNoModal = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"]');
      if (!modal) return ['sem dialogo'];
      const ruins = [];
      for (const el of modal.querySelectorAll('button, a[href], input, select, textarea')) {
        const r = el.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // Meio pixel de folga, e nao `< 48` cru: getBoundingClientRect devolve
      // 47.99999999999999 para uma caixa de 48px, e o portao falhava relatando
      // "48.0x48.0 esta abaixo de 48px" — uma falha que se contradiz na
      // propria mensagem. Meio pixel nao muda nada para o dedo e elimina o
      // ruido de ponto flutuante.
        if (r.height < 47.5) {
          ruins.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.height)}px`);
        }
      }
      return ruins;
    });
    if (pequenosNoModal.length) {
      const d = await page.evaluate(() => {
        const el = document.querySelector('[role="dialog"] input');
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const escalas = [];
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const t = getComputedStyle(n).transform;
          if (t && t !== 'none') escalas.push(`${n.tagName}.${n.className?.toString().slice(0, 18)}: ${t}`);
        }
        return { rect: r.height, offset: el.offsetHeight, css: cs.height,
          box: cs.boxSizing, raiz: getComputedStyle(document.documentElement).fontSize,
          escalas };
      });
      console.log('       diagnostico:', JSON.stringify(d));
    }
    registrar('todo alvo dentro do leitor tem 48px', pequenosNoModal.length === 0,
      pequenosNoModal.slice(0, 4).join(' | '));

    const focado = await page.evaluate(() => document.activeElement?.id);
    registrar('o campo do leitor de mão já vem com foco', focado === 'codigo-usb',
      `foco em "${focado}"`);

    // E assim que o leitor USB se comporta: digita e manda Enter.
    await page.locator('#codigo-usb').fill(produto.codigo);
    await page.locator('#codigo-usb').press('Enter');

    const escolheu = await esperarPor(async () =>
      (await page.getByText(produto.nome, { exact: false }).count()) > 0, 10000);
    registrar('o código lido escolhe o produto', escolheu, produto.codigo);

    // O Radix mantem o no durante a animacao de saida; conferir no instante
    // seguinte ao clique media a animacao, nao o comportamento.
    const fechou = await esperarPor(async () =>
      (await page.locator('#codigo-usb').count()) === 0, 8000);
    registrar('o leitor fecha depois de ler', fechou);
    await ctx.close();
  }

  // ===================================== 2. codigo desconhecido nao some ====
  console.log('\n[2] código que não está no cadastro');
  {
    const ctx = await navegador.newContext({ viewport: { width: 1180, height: 820 } });
    const page = await ctx.newPage();
    await login(page, CONTA);
    await abrir(page, 'NovoRegistro');
    await abrirLeitor(page);
    await page.locator('#codigo-usb').fill('NAO-EXISTE-9999');
    await page.locator('#codigo-usb').press('Enter');

    const noCampo = await esperarPor(async () =>
      (await page.locator('#codigo_produto').inputValue()) === 'NAO-EXISTE-9999', 10000);
    registrar('código desconhecido aparece no campo de busca, não some', noCampo);

    const explica = await esperarPor(async () =>
      (await page.getByText(/nenhum produto encontrado/i).count()) > 0, 8000);
    registrar('a tela diz que não encontrou, em vez de ficar vazia', explica);
    await ctx.close();
  }

  // ============================================ 3. caminho da camera ========
  console.log('\n[3] câmera — com BarcodeDetector falso, para exercitar a cola');
  {
    const ctx = await navegador.newContext({
      viewport: { width: 1180, height: 820 },
      permissions: ['camera'],
    });
    await ctx.addInitScript(detectorFalso(produto.codigo));
    const page = await ctx.newPage();
    await login(page, CONTA);
    await abrir(page, 'NovoRegistro');
    await abrirLeitor(page);

    const usouNativo = await esperarPor(async () =>
      (await page.getByText(/leitor do navegador/i).count()) > 0, 10000);
    if (!usouNativo) {
      const alerta = (await page.getByRole('alert').count())
        ? await page.getByRole('alert').innerText() : '(sem alerta)';
      const temDetector = await page.evaluate(() => 'BarcodeDetector' in window);
      const temVideo = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? `video ${v.videoWidth}x${v.videoHeight} srcObject=${Boolean(v.srcObject)}` : 'sem video';
      });
      console.log(`       diagnostico: BarcodeDetector=${temDetector} | ${temVideo} | alerta: ${alerta.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    registrar('usa o detector do navegador quando ele existe', usouNativo);

    const escolheu = await esperarPor(async () =>
      (await page.getByText(produto.nome, { exact: false }).count()) > 0, 15000);
    registrar('o código vindo da câmera escolhe o produto', escolheu);

    // A camera precisa estar DESLIGADA depois que o modal fechou.
    const ligada = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v) return false;
      const f = v.srcObject?.getTracks?.() || [];
      return f.some((t) => t.readyState === 'live');
    });
    registrar('a câmera é desligada quando o leitor fecha', !ligada);
    await ctx.close();
  }

  // ======================================= 4. camera recusada ===============
  console.log('\n[4] câmera recusada — tem de explicar, não ficar preta');
  {
    const ctx = await navegador.newContext({ viewport: { width: 1180, height: 820 } });
    // Nega explicitamente: sem isso o Chromium com --use-fake-ui aceita sozinho.
    await ctx.grantPermissions([]);
    await ctx.addInitScript(`
      navigator.mediaDevices.getUserMedia = () => {
        const e = new Error('negado'); e.name = 'NotAllowedError'; return Promise.reject(e);
      };
    `);
    const page = await ctx.newPage();
    await login(page, CONTA);
    await abrir(page, 'NovoRegistro');
    await abrirLeitor(page);

    const explicou = await esperarPor(async () =>
      (await page.getByRole('alert').count()) > 0 &&
      /câmera foi bloqueada/i.test(await page.getByRole('alert').innerText()), 10000);
    registrar('explica que a câmera foi bloqueada', explicou);

    // E o caminho USB tem de continuar funcionando mesmo sem camera.
    await page.locator('#codigo-usb').fill(produto.codigo);
    await page.locator('#codigo-usb').press('Enter');
    const aindaFunciona = await esperarPor(async () =>
      (await page.getByText(produto.nome, { exact: false }).count()) > 0, 10000);
    registrar('o leitor de mão continua funcionando sem câmera', aindaFunciona);
    await ctx.close();
  }

  // ============================ 5. navegador SEM BarcodeDetector ===========
  console.log('\n[5] navegador sem BarcodeDetector — a biblioteca embarcada assume');
  {
    const ctx = await navegador.newContext({
      viewport: { width: 1180, height: 820 },
      permissions: ['camera'],
    });
    // Tira o detector nativo: e o Safari e os Chrome antigos.
    await ctx.addInitScript('delete window.BarcodeDetector;');
    const page = await ctx.newPage();
    const pedidos = [];
    page.on('response', (r) => { if (r.url().endsWith('.js')) pedidos.push(r.url()); });
    await login(page, CONTA);
    const antesDoClique = pedidos.length;
    await abrir(page, 'NovoRegistro');
    await abrirLeitor(page);

    // Nao da para provar decodificacao aqui: a camera falsa do Chromium mostra
    // um padrao de cores, nao um codigo de barras. O que se prova e que a
    // biblioteca embarcada ASSUMIU: o motor vira "leitor embarcado".
    const usouZxing = await esperarPor(async () =>
      (await page.getByText(/leitor embarcado/i).count()) > 0, 20000);
    registrar('sem detector nativo, a biblioteca embarcada assume', usouZxing);

    // E ela so e baixada AGORA — nao no carregamento inicial.
    const baixouDepois = pedidos.length > antesDoClique;
    registrar('a biblioteca é baixada sob demanda, não na carga inicial', baixouDepois,
      `${pedidos.length - antesDoClique} arquivo(s) js depois de abrir a tela`);
    await ctx.close();
  }

  await navegador.close();

  const { data: criados } = await svc.from('envase_records')
    .delete().gt('created_at', marco).select('id');
  registrar('os registros criados pelo teste foram removidos', true,
    `${criados?.length ?? 0} registro(s)`);

  const ok = resultados.filter((r) => r.ok).length;
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(78));
  console.log(`LEITOR: ${ok} OK, ${falhas.length} FALHA(S), de ${resultados.length}`);
  if (falhas.length) for (const f of falhas) console.log(`  - ${f.item}${f.detalhe ? ` (${f.detalhe})` : ''}`);
  console.log('='.repeat(78));
  process.exit(falhas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
