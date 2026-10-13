/**
 * scripts/test-tokens-marca.js
 *
 * Prova que o token da marca resolve EXATAMENTE para a cor que estava escrita
 * a mao, e que nao sobrou nenhum `bg-blue-600`/`bg-blue-700` no codigo.
 *
 * Esta e a prova direta, e nao depende de captura de tela: `bg-marca` e
 * `#2563eb` sao medidos no mesmo navegador, no mesmo instante. Se o valor
 * computado e o mesmo, qualquer elemento que trocou de uma classe para a
 * outra nao mudou de cor — nao ha o que uma captura possa revelar.
 *
 * Uso: node scripts/test-tokens-marca.js
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-tokens-marca');

const APP = 'http://127.0.0.1:5173';

let ok = 0, falhou = 0;
const falhas = [];
function checar(nome, cond, detalhe = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nome}`); }
  else { falhou += 1; falhas.push(nome); console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`); }
}

console.log('='.repeat(72));
console.log('TOKEN DA COR DA MARCA');
console.log('='.repeat(72));

// --------------------------------------------- 1. a cor de referencia do Tailwind
console.log('\n[1] a cor de referencia vem da propria biblioteca, nao de memoria');
const cores = JSON.parse(execFileSync(process.execPath,
  ['-e', "const c=require('tailwindcss/colors');process.stdout.write(JSON.stringify({b600:c.blue[600],b700:c.blue[700]}))"],
  { encoding: 'utf8' }));
checar(`blue-600 do Tailwind = #2563eb (lido: ${cores.b600})`, cores.b600.toLowerCase() === '#2563eb');
checar(`blue-700 do Tailwind = #1d4ed8 (lido: ${cores.b700})`, cores.b700.toLowerCase() === '#1d4ed8');

// ------------------------------------------------- 2. o codigo nao usa mais a cor
console.log('\n[2] o codigo nao escreve mais a cor a mao');
const fontes = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) varrer(p);
    else if (/\.(jsx?|css)$/.test(e.name)) fontes.push(p);
  }
})('src');

const comAzulCru = [];
for (const f of fontes) {
  const texto = fs.readFileSync(f, 'utf8');
  for (const [i, linha] of texto.split('\n').entries()) {
    // o comentario do index.css cita os nomes de proposito, para explicar a troca
    if (/^\s*\*/.test(linha) || /^\s*\/\//.test(linha)) continue;
    if (/\bbg-blue-(600|700)\b/.test(linha)) comAzulCru.push(`${f}:${i + 1}`);
  }
}
checar('nenhum bg-blue-600/700 em codigo', comAzulCru.length === 0, comAzulCru.join(', '));

const usosMarca = fontes.reduce((s, f) =>
  s + (fs.readFileSync(f, 'utf8').match(/\bbg-marca\b(?!-)/g) || []).length, 0);
const usosForte = fontes.reduce((s, f) =>
  s + (fs.readFileSync(f, 'utf8').match(/\bbg-marca-forte\b/g) || []).length, 0);
checar(`bg-marca em 58 lugares (lido: ${usosMarca})`, usosMarca === 58);
checar(`bg-marca-forte em 52 lugares (lido: ${usosForte})`, usosForte === 52);
checar(`somando 110, o numero que o dono definiu`, usosMarca + usosForte === 110);

// ------------------------------- 3. o token resolve para a MESMA cor, no navegador
console.log('\n[3] no navegador, bg-marca resolve para a cor de antes');
const nav = await chromium.launch({ headless: true });
const page = await (await nav.newContext()).newPage();
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.styleSheets.length > 0, null, { timeout: 60000 });

// O Tailwind so gera as classes que ENCONTRA nos arquivos. No codigo,
// `bg-marca-forte` aparece sempre como `hover:bg-marca-forte` (todas as 52
// vezes), entao a classe sem variante nao existe e medi-la daria
// transparente. Por isso a medicao usa a variante de verdade.
const medida = await page.evaluate(({ b600, b700 }) => {
  const criar = (attrs) => {
    const d = document.createElement('div');
    Object.assign(d.style, { width: '10px', height: '10px', position: 'fixed', top: '-100px' });
    if (attrs.classe) d.className = attrs.classe;
    if (attrs.cor) d.style.backgroundColor = attrs.cor;
    document.body.appendChild(d);
    const v = getComputedStyle(d).backgroundColor;
    d.remove();
    return v;
  };

  // Procura a regra gerada para a variante de hover e le o valor que ela usa.
  const regraDe = (seletor) => {
    for (const folha of document.styleSheets) {
      let regras;
      try { regras = folha.cssRules; } catch { continue; }
      for (const r of regras || []) {
        if (r.selectorText && r.selectorText.includes(seletor)) return r.cssText;
      }
    }
    return null;
  };

  return {
    marca: criar({ classe: 'bg-marca' }),
    referencia600: criar({ cor: b600 }),
    referencia700: criar({ cor: b700 }),
    regraMarca: regraDe('.bg-marca'),
    regraForte: regraDe('bg-marca-forte'),
    varMarca: getComputedStyle(document.documentElement).getPropertyValue('--marca').trim(),
    varForte: getComputedStyle(document.documentElement).getPropertyValue('--marca-forte').trim(),
  };
}, { b600: cores.b600, b700: cores.b700 });

checar(`bg-marca = ${medida.referencia600} (igual a ${cores.b600})`,
  medida.marca === medida.referencia600, `bg-marca deu ${medida.marca}`);
checar(`--marca definida no :root (${medida.varMarca})`, medida.varMarca === '37 99 235');
checar(`--marca-forte definida no :root (${medida.varForte})`, medida.varForte === '29 78 216');
checar('a regra de hover:bg-marca-forte existe e usa a variavel',
  !!medida.regraForte && /var\(--marca-forte\)/.test(medida.regraForte),
  String(medida.regraForte).slice(0, 110));
checar('a regra de bg-marca preserva o canal de opacidade do Tailwind',
  !!medida.regraMarca && /--tw-bg-opacity/.test(medida.regraMarca),
  String(medida.regraMarca).slice(0, 110));

// -------------------------- 4. trocar o token troca a cor — e o objetivo da mudanca
console.log('\n[4] trocar o token troca a marca inteira num lugar so');
const depoisDaTroca = await page.evaluate(() => {
  document.documentElement.style.setProperty('--marca', '220 38 38');  // vermelho
  const d = document.createElement('div');
  d.className = 'bg-marca';
  Object.assign(d.style, { width: '10px', height: '10px', position: 'fixed', top: '-100px' });
  document.body.appendChild(d);
  const v = getComputedStyle(d).backgroundColor;
  d.remove();
  document.documentElement.style.removeProperty('--marca');
  return v;
});
checar(`mudando so --marca, bg-marca passa a ${depoisDaTroca}`,
  depoisDaTroca === 'rgb(220, 38, 38)', depoisDaTroca);

await nav.close();

console.log('\n' + '='.repeat(72));
console.log(`RESULTADO: ${ok} OK, ${falhou} FALHA`);
if (falhou) console.log('Falhas:\n  - ' + falhas.join('\n  - '));
console.log('='.repeat(72));
process.exit(falhou ? 1 : 0);
