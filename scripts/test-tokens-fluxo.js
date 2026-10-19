/**
 * scripts/test-tokens-fluxo.js
 *
 * A fundação visual da direção "Fluxo".
 *
 * Substitui o antigo `test-tokens-marca.js`, que tinha outro trabalho: provar
 * que trocar `bg-blue-600` por `bg-marca` NÃO mudava nada. Aquele contrato
 * acabou quando o dono aprovou a direção — agora a cor DEVE mudar, e o que
 * precisa ser provado é diferente:
 *
 *   1. os tokens valem os valores do LEIAME aprovado;
 *   2. nenhuma tela escreve cor à mão;
 *   3. o tema escuro redefine o conjunto, para a TV;
 *   4. as fontes vêm do próprio domínio, não do Google;
 *   5. trocar um token troca a cor renderizada — o ponto de ter token;
 *   6. `prefers-reduced-motion` desliga o movimento.
 *
 * Uso: node scripts/test-tokens-fluxo.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-tokens-fluxo');

const APP = 'http://127.0.0.1:5173';

let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

/** Os valores que o LEIAME aprovado define, em canais RGB. */
const ESPERADO_CLARO = {
  '--marca': '59 91 255',            // #3B5BFF
  '--marca-suave': '238 241 255',    // #EEF1FF
  '--marca-suave-2': '227 232 255',  // #E3E8FF
  '--fundo': '243 244 248',          // #F3F4F8
  '--tinta': '20 26 43',             // #141A2B
  '--texto-fraco': '122 130 150',    // #7A8296
  '--ok': '18 166 107',              // #12A66B
  '--atencao': '230 154 0',          // #E69A00
  '--erro': '229 72 77',             // #E5484D
};

/** No escuro os tons sobem de luminosidade: fundo quase preto, lido a 4 m. */
const ESPERADO_ESCURO = {
  '--fundo': '10 15 31',             // #0A0F1F
  '--tinta': '255 255 255',
  '--texto-fraco': '154 167 208',    // #9AA7D0
  '--ok': '61 214 140',              // #3DD68C
  '--atencao': '255 194 71',         // #FFC247
  '--erro': '255 107 112',           // #FF6B70
  '--marca': '91 123 255',           // #5B7BFF
};

console.log('='.repeat(72));
console.log('FUNDAÇÃO VISUAL — direção "Fluxo"');
console.log('='.repeat(72));

// ------------------------------------- 1. nenhuma cor escrita a mao no codigo
console.log('\n[1] nenhuma tela escreve cor à mão');

const fontes = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (/\.(jsx?|css)$/.test(e.name)) fontes.push(p);
  }
})('src');

const emCodigo = (linha) => !/^\s*(\*|\/\/|\/\*)/.test(linha);

const azuis = [];
for (const f of fontes) {
  for (const [i, linha] of fs.readFileSync(f, 'utf8').split('\n').entries()) {
    if (!emCodigo(linha)) continue;
    const m = linha.match(/\b[a-z-]+-blue-\d{2,3}(\/\d+)?\b/);
    if (m) azuis.push(`${f}:${i + 1} ${m[0]}`);
  }
}
checar('nenhum utilitário -blue-* em código', azuis.length === 0, azuis.slice(0, 4).join(' | '));

// hex solto em className: a cor tem de vir de token
const hexSoltos = [];
for (const f of fontes.filter((x) => x.endsWith('.jsx') || x.endsWith('.js'))) {
  for (const [i, linha] of fs.readFileSync(f, 'utf8').split('\n').entries()) {
    if (!emCodigo(linha)) continue;
    if (/className=[^>]*#[0-9A-Fa-f]{6}/.test(linha)) hexSoltos.push(`${f}:${i + 1}`);
  }
}
checar('nenhum hex dentro de className', hexSoltos.length === 0, hexSoltos.slice(0, 4).join(' | '));

// ------------------------------------------------ 2. Google Fonts em nenhum lugar
console.log('\n[2] as fontes vêm do próprio domínio');

/**
 * Tira comentários antes de procurar.
 *
 * Pela terceira vez nesta família de testes, o comentário que EXPLICA por que
 * não usamos algo foi contado como uso. O comentário cita "fonts.googleapis"
 * de propósito, para quem for mexer saber o motivo.
 */
const semComentario = (texto) => texto
  .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */ em CSS e JS
  .replace(/^\s*\/\/.*$/gm, '');      // // ... em JS

const comGoogle = [];
for (const f of [...fontes, 'index.html', 'vercel.json']) {
  if (!fs.existsSync(f)) continue;
  if (/fonts\.(googleapis|gstatic)\.com/.test(semComentario(fs.readFileSync(f, 'utf8')))) {
    comGoogle.push(f);
  }
}
checar('nenhuma referência a fonts.googleapis/gstatic (nem na CSP)',
  comGoogle.length === 0, comGoogle.join(', '));

const pacote = JSON.parse(fs.readFileSync('package.json', 'utf8'));
checar('@fontsource/manrope é dependência de produção',
  !!pacote.dependencies['@fontsource/manrope']);
checar('@fontsource/jetbrains-mono é dependência de produção',
  !!pacote.dependencies['@fontsource/jetbrains-mono']);

const css = fs.readFileSync('src/index.css', 'utf8');
checar('importa só o subconjunto latino (interface em português)',
  /@fontsource\/manrope\/latin-\d00\.css/.test(css) && !/@fontsource\/manrope\/\d00\.css/.test(css));

// --------------------------------------------- 3. os tokens no navegador
console.log('\n[3] os tokens valem os valores aprovados (tema claro)');

const nav = await chromium.launch({ headless: true });
const page = await (await nav.newContext()).newPage();
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.styleSheets.length > 0, null, { timeout: 60000 });

const lerTokens = (lista) => page.evaluate((nomes) => {
  const s = getComputedStyle(document.documentElement);
  const r = {};
  for (const n of nomes) r[n] = s.getPropertyValue(n).trim();
  return r;
}, lista);

const claro = await lerTokens(Object.keys(ESPERADO_CLARO));
for (const [nome, valor] of Object.entries(ESPERADO_CLARO)) {
  checar(`${nome} = ${valor}`, claro[nome] === valor, `leu "${claro[nome]}"`);
}

// --------------------------------------------- 4. tema escuro para a TV
console.log('\n[4] o tema escuro redefine o conjunto (é o que a TV usa)');
await page.evaluate(() => document.documentElement.classList.add('dark'));
const escuro = await lerTokens(Object.keys(ESPERADO_ESCURO));
for (const [nome, valor] of Object.entries(ESPERADO_ESCURO)) {
  checar(`escuro ${nome} = ${valor}`, escuro[nome] === valor, `leu "${escuro[nome]}"`);
}
await page.evaluate(() => document.documentElement.classList.remove('dark'));

// ------------------------------------ 5. o utilitario resolve para o token
console.log('\n[5] o utilitário do Tailwind resolve para o token');

const medida = await page.evaluate(() => {
  const criar = (classe) => {
    const d = document.createElement('div');
    d.className = classe;
    Object.assign(d.style, { width: '10px', height: '10px', position: 'fixed', top: '-100px' });
    document.body.appendChild(d);
    const s = getComputedStyle(d);
    const v = { bg: s.backgroundColor, cor: s.color, fonte: s.fontFamily, num: s.fontVariantNumeric };
    d.remove();
    return v;
  };
  const regraDe = (seletor) => {
    for (const folha of document.styleSheets) {
      let regras; try { regras = folha.cssRules; } catch { continue; }
      for (const r of regras || []) if (r.selectorText?.includes(seletor)) return r.cssText;
    }
    return null;
  };
  return {
    marca: criar('bg-marca'),
    fundo: criar('bg-fundo'),
    tinta: criar('text-tinta'),
    fraco: criar('text-texto-fraco'),
    numero: criar('num'),
    codigo: criar('codigo'),
    corpo: getComputedStyle(document.body).fontFamily,
    regraHoverForte: regraDe('bg-marca-forte'),
    regraReduzido: (() => {
      for (const folha of document.styleSheets) {
        let regras; try { regras = folha.cssRules; } catch { continue; }
        for (const r of regras || []) {
          if (r.conditionText?.includes('prefers-reduced-motion')) return r.conditionText;
        }
      }
      return null;
    })(),
  };
});

checar(`bg-marca = rgb(59, 91, 255)`, medida.marca.bg === 'rgb(59, 91, 255)', medida.marca.bg);
checar(`bg-fundo = rgb(243, 244, 248)`, medida.fundo.bg === 'rgb(243, 244, 248)', medida.fundo.bg);
checar(`text-tinta = rgb(20, 26, 43)`, medida.tinta.cor === 'rgb(20, 26, 43)', medida.tinta.cor);
checar(`text-texto-fraco = rgb(122, 130, 150)`, medida.fraco.cor === 'rgb(122, 130, 150)', medida.fraco.cor);
checar('a regra de hover:bg-marca-forte usa a variável',
  !!medida.regraHoverForte && /var\(--marca-forte\)/.test(medida.regraHoverForte),
  String(medida.regraHoverForte).slice(0, 90));

console.log('\n[6] tipografia');
checar(`o corpo usa Manrope (${medida.corpo.split(',')[0]})`, /Manrope/.test(medida.corpo), medida.corpo);
checar(`.codigo usa JetBrains Mono`, /JetBrains Mono/.test(medida.codigo.fonte), medida.codigo.fonte);
checar(`.num alinha os dígitos (tabular-nums)`, /tabular-nums/.test(medida.numero.num), medida.numero.num);
checar(`.codigo também alinha`, /tabular-nums/.test(medida.codigo.num), medida.codigo.num);

console.log('\n[7] movimento');
checar('existe uma regra @media prefers-reduced-motion',
  !!medida.regraReduzido, String(medida.regraReduzido));

const movimento = await page.evaluate(() => {
  const nomes = ['cartao-toca', 'press', 'cta-fluxo', 'foco-fluxo', 'entra', 'ao-vivo', 'anel'];
  const achadas = [];
  for (const folha of document.styleSheets) {
    let regras; try { regras = folha.cssRules; } catch { continue; }
    for (const r of regras || []) {
      for (const n of nomes) if (r.selectorText?.includes('.' + n) && !achadas.includes(n)) achadas.push(n);
    }
  }
  return achadas;
});
checar(`os utilitários de movimento existem (${movimento.join(', ')})`,
  movimento.length >= 6, `achei ${movimento.length} de 7: ${movimento.join(', ')}`);

// --------------------- 8. trocar o token troca a cor: o ponto de ter token
console.log('\n[8] trocar o token troca a marca inteira num lugar só');
const trocado = await page.evaluate(() => {
  document.documentElement.style.setProperty('--marca', '220 38 38');
  const d = document.createElement('div');
  d.className = 'bg-marca';
  Object.assign(d.style, { width: '10px', height: '10px', position: 'fixed', top: '-100px' });
  document.body.appendChild(d);
  const v = getComputedStyle(d).backgroundColor;
  d.remove();
  document.documentElement.style.removeProperty('--marca');
  return v;
});
checar(`mudando só --marca, bg-marca passa a ${trocado}`,
  trocado === 'rgb(220, 38, 38)', trocado);

await nav.close();

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
