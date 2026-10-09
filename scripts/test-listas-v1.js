/**
 * scripts/test-listas-v1.js
 *
 * Testa o comportamento das listas (item (f) da V1) na interface real:
 *  - a lista entra no DOM de 50 em 50, e "Carregar mais 50" soma mais 50;
 *  - a busca filtra a lista INTEIRA, nao so a pagina visivel, e volta para a
 *    primeira pagina;
 *  - excluir pede confirmacao num dialogo da aplicacao, e Cancelar nao apaga;
 *  - nenhum alvo de acao abaixo de 48px;
 *  - nenhuma pagina rola na horizontal.
 *
 * Uso: node scripts/test-listas-v1.js
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-listas-v1');

const APP = 'http://127.0.0.1:5173';
const LARGURAS = [['celular', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]];

let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

/**
 * A suite cria o que precisa e apaga no fim.
 *
 * Provar "de 50 em 50" exige mais de 50 itens. Depender do catalogo real
 * deixaria o teste verde ou vermelho conforme o estado do banco local — foi o
 * que aconteceu: um `db reset` levou junto os cadastros e a suite passou a
 * medir uma lista de 3 produtos sem acusar nada.
 */
const MARCA = 'ZZTESTE-LISTA';
const QUANTOS = 120;

async function prepararDados() {
  const { data: ops } = await db.from('operators').select('*').eq('ativo', true).limit(1);
  if (!ops?.length) { console.error('sem operador ativo no banco local'); process.exit(1); }

  const produtos = Array.from({ length: QUANTOS }, (_, i) => ({
    codigo: `${MARCA}-${String(i + 1).padStart(4, '0')}`,
    nome: `Produto de teste de lista ${i + 1}`,
    unidade_medida: 'KG',
    consistencia: 'Liquido',
    categoria: 'Óleo',
  }));
  const { error: e1 } = await db.from('products').insert(produtos);
  if (e1) { console.error('nao consegui criar produtos de teste:', e1.message); process.exit(1); }

  const embalagens = Array.from({ length: QUANTOS }, (_, i) => ({
    codigo: `${MARCA}-${String(i + 1).padStart(4, '0')}`,
    descricao: `Embalagem de teste de lista ${i + 1}`,
    tipo: 'Balde',
    conteudo: 20,
    ultimos_4_digitos: String(1000 + i).slice(-4),
  }));
  const { error: e2 } = await db.from('embalagens').insert(embalagens);
  if (e2) { console.error('nao consegui criar embalagens de teste:', e2.message); process.exit(1); }

  const registros = Array.from({ length: QUANTOS }, (_, i) => ({
    data: new Date(2026, 8, 1 + (i % 28)).toISOString().slice(0, 10),
    op: `${MARCA}-${String(i + 1).padStart(4, '0')}`,
    sala: i % 2 ? 'Bio' : 'Industrial',
    operador: ops[0].nome,
    operator_id: ops[0].id,
    codigo_produto: produtos[i].codigo,
    descricao_produto: produtos[i].nome,
    quantidade_produzida: 100 + i,
    inicio: '08:00:00',
    termino: i % 3 === 0 ? '16:00:00' : null,
    material_retirado: i % 6 === 0,
  }));
  const { error: e3 } = await db.from('envase_records').insert(registros);
  if (e3) { console.error('nao consegui criar registros de teste:', e3.message); process.exit(1); }

  return ops;
}

async function limparDados() {
  await db.from('envase_records').delete().like('op', `${MARCA}-%`);
  await db.from('products').delete().like('codigo', `${MARCA}-%`);
  await db.from('embalagens').delete().like('codigo', `${MARCA}-%`);
}

await limparDados(); // sobra de uma execucao interrompida
const ops = await prepararDados();

const nav = await chromium.launch({ headless: true });

async function entrar(ctx) {
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  const b = p.getByRole('button', { name: /fazer login/i });
  await Promise.race([
    b.first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
    p.locator('#email').waitFor({ state: 'visible', timeout: 60000 }).catch(() => {}),
  ]);
  if (await b.count()) await b.first().click();
  await p.locator('#email').waitFor({ state: 'visible', timeout: 60000 });
  await p.locator('#email').fill(process.env.TEST_ADMIN_EMAIL);
  await p.locator('#password').fill(process.env.TEST_ADMIN_PASSWORD);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForFunction(() => !document.querySelector('#email'), null, { timeout: 60000 });
  return p;
}

const ctx0 = await nav.newContext({ viewport: { width: 1440, height: 900 } });
const pLogin = await entrar(ctx0);
const estado = await ctx0.storageState();
await pLogin.close();

/** Abre uma tela ja logado e com operador escolhido. */
async function abrir(ctx, tela) {
  const p = await ctx.newPage();
  await p.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.evaluate((op) => localStorage.setItem('envase_current_operator', JSON.stringify(op)), ops[0]);
  await p.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(
    () => /Mostrando \d+ de [1-9]\d* /.test(document.body.innerText || ''),
    null, { timeout: 90000 });
  return p;
}

const rodape = (p) => p.evaluate(() => {
  const m = (document.body.innerText || '').match(/Mostrando (\d+) de (\d+)/);
  return m ? { mostrando: +m[1], total: +m[2] } : null;
});

console.log('='.repeat(72));
console.log('LISTAS — ITEM (f) DA V1');
console.log('='.repeat(72));

// ----------------------------------------------- 1. corte em 50 e carregar mais
console.log('\n[1] a lista entra no DOM de 50 em 50');
{
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, storageState: estado });
  const p = await abrir(ctx, 'Produtos');

  const r1 = await rodape(p);
  checar('Produtos: mostra 50 de um catalogo maior', r1.mostrando === 50 && r1.total > 50,
    JSON.stringify(r1));
  const linhas1 = await p.locator('button[aria-label^="Excluir "]').count();
  checar('Produtos: 50 itens no DOM, nao o catalogo inteiro', linhas1 === 50, `foram ${linhas1}`);

  await p.getByRole('button', { name: /carregar mais 50/i }).click();
  await p.waitForFunction(() => /Mostrando 100 de /.test(document.body.innerText || ''),
    null, { timeout: 30000 });
  const linhas2 = await p.locator('button[aria-label^="Excluir "]').count();
  checar('Produtos: "Carregar mais 50" soma 50', linhas2 === 100, `foram ${linhas2}`);

  // ------------------------------------------------- 2. busca olha a lista toda
  console.log('\n[2] a busca filtra a lista inteira e volta para a 1a pagina');
  // um produto que esta DEPOIS das 100 ja carregadas: se a busca so olhasse a
  // pagina visivel, este nao apareceria
  const { data: fundo } = await db.from('products').select('codigo').order('codigo').range(110, 110);
  const codigoLaFundo = fundo?.[0]?.codigo;
  await p.getByLabel('Buscar produtos').fill(codigoLaFundo);
  await p.waitForFunction((cod) => {
    const m = (document.body.innerText || '').match(/Mostrando (\d+) de (\d+)/);
    return m && +m[2] >= 1 && document.body.innerText.includes(cod);
  }, codigoLaFundo, { timeout: 30000 });
  const r3 = await rodape(p);
  checar(`busca acha o codigo da posicao 110 (${codigoLaFundo}) sem carregar as paginas antes`,
    r3.total >= 1 && r3.total < 50, JSON.stringify(r3));
  checar('a busca reinicia a contagem na 1a pagina', r3.mostrando === r3.total,
    JSON.stringify(r3));

  await ctx.close();
}

// ------------------------------------------------ 3. excluir pede confirmacao
console.log('\n[3] excluir pede confirmacao e Cancelar nao apaga');
{
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, storageState: estado });
  const p = await abrir(ctx, 'Operadores');

  const antes = await db.from('operators').select('*', { count: 'exact', head: true });
  const primeiro = p.locator('button[aria-label^="Excluir "]').first();
  const rotulo = await primeiro.getAttribute('aria-label');

  // o confirm() do navegador nao pode mais aparecer: se aparecer, isto apaga
  let usouConfirmNativo = false;
  p.on('dialog', async (d) => { usouConfirmNativo = true; await d.dismiss(); });

  await primeiro.click();
  const dialogo = p.getByRole('alertdialog');
  await dialogo.waitFor({ state: 'visible', timeout: 15000 });
  checar('abre um dialogo da aplicacao, nao o confirm() do navegador', !usouConfirmNativo);

  const texto = await dialogo.innerText();
  const nome = rotulo.replace(/^Excluir /, '');
  checar('o dialogo diz QUAL item sera excluido', texto.includes(nome),
    texto.slice(0, 80).replace(/\n/g, ' '));

  await p.getByRole('button', { name: /^cancelar$/i }).click();
  await dialogo.waitFor({ state: 'hidden', timeout: 15000 });
  const depois = await db.from('operators').select('*', { count: 'exact', head: true });
  checar('Cancelar nao apaga nada', antes.count === depois.count,
    `${antes.count} -> ${depois.count}`);

  await ctx.close();
}

// ------------------------------------- 4. alvos e rolagem horizontal, 3 larguras
console.log('\n[4] alvos de 48px e nenhuma rolagem horizontal, nas 3 larguras');
for (const [nome, w, h] of LARGURAS) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, storageState: estado });
  for (const tela of ['Produtos', 'Embalagens', 'Operadores', 'Registros']) {
    const p = await abrir(ctx, tela);
    const m = await p.evaluate(() => {
      const acoes = [...document.querySelectorAll('button')]
        .filter(b => /^(editar|excluir|ver detalhes)/i.test(b.getAttribute('aria-label') || ''));
      const pequenos = acoes.filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && (r.width < 48 || r.height < 48);
      }).length;
      return {
        acoes: acoes.length, pequenos,
        estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    checar(`${nome}/${tela}: nenhum alvo abaixo de 48px (${m.acoes} alvos)`, m.pequenos === 0,
      `${m.pequenos} pequenos`);
    checar(`${nome}/${tela}: a pagina nao rola na horizontal`, m.estouro <= 0,
      `estouro de ${m.estouro}px`);
    await p.close();
  }
  await ctx.close();
}

await nav.close();
await limparDados();

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
