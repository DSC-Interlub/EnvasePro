/**
 * scripts/comparar-capturas.mjs
 *
 * Compara dois conjuntos de capturas e diz, por tela, quantos pixels mudaram.
 * Serve para provar que uma mudanca de ESTRUTURA (trocar uma cor escrita a mao
 * por um token com o MESMO valor) nao mexeu na aparencia.
 *
 * Duas etapas, nesta ordem, para nao gastar tempo onde nao precisa:
 *  1. sha256 dos arquivos. As capturas do Playwright sao deterministicas, logo
 *     arquivos identicos = imagens identicas, sem precisar decodificar.
 *  2. so para os que diferem, conta os pixels num canvas. Usa o Chromium do
 *     proprio Playwright, para nao acrescentar dependencia de imagem.
 *
 * Uso: node scripts/comparar-capturas.mjs <pasta-antes> <pasta-depois>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const [antesDir, depoisDir] = process.argv.slice(2);
if (!antesDir || !depoisDir) {
  console.error('Uso: node scripts/comparar-capturas.mjs <pasta-antes> <pasta-depois>');
  process.exit(1);
}

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const base64 = (p) => fs.readFileSync(p).toString('base64');

const arquivos = fs.readdirSync(antesDir).filter(f => f.endsWith('.png')).sort();
const paraInspecionar = [];
let identicos = 0, ausentes = 0;

for (const nome of arquivos) {
  const a = path.join(antesDir, nome), d = path.join(depoisDir, nome);
  if (!fs.existsSync(d)) { ausentes += 1; console.log(`  AUSENTE   ${nome}`); continue; }
  if (sha(a) === sha(d)) identicos += 1; else paraInspecionar.push(nome);
}

console.log(`\n${arquivos.length} telas | ${identicos} byte-a-byte identicas | ` +
  `${paraInspecionar.length} a inspecionar | ${ausentes} ausentes\n`);

const comDiferenca = [];
if (paraInspecionar.length) {
  const nav = await chromium.launch({ headless: true });
  const page = await (await nav.newContext()).newPage();
  await page.setContent('<canvas id="a"></canvas><canvas id="b"></canvas>');

  for (const nome of paraInspecionar) {
    const r = await page.evaluate(async ([b64a, b64b]) => {
      const carregar = (b64) => new Promise((ok, falha) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = falha;
        im.src = 'data:image/png;base64,' + b64;
      });
      const [ia, ib] = await Promise.all([carregar(b64a), carregar(b64b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return { tamanho: `${ia.width}x${ia.height} -> ${ib.width}x${ib.height}` };
      }
      const pegar = (im) => {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(im, 0, 0);
        return x.getImageData(0, 0, im.width, im.height).data;
      };
      const da = pegar(ia), dbb = pegar(ib);
      let mudados = 0, maiorDelta = 0;
      for (let i = 0; i < da.length; i += 4) {
        const delta = Math.max(
          Math.abs(da[i] - dbb[i]), Math.abs(da[i + 1] - dbb[i + 1]),
          Math.abs(da[i + 2] - dbb[i + 2]), Math.abs(da[i + 3] - dbb[i + 3]));
        if (delta > 0) { mudados += 1; if (delta > maiorDelta) maiorDelta = delta; }
      }
      return { mudados, maiorDelta, total: ia.width * ia.height, largura: ia.width, altura: ia.height };
    }, [base64(path.join(antesDir, nome)), base64(path.join(depoisDir, nome))]);

    if (r.tamanho) {
      comDiferenca.push({ nome, nota: r.tamanho });
      console.log(`  TAMANHO   ${nome.padEnd(42)} ${r.tamanho}`);
    } else if (r.mudados > 0) {
      comDiferenca.push({ nome, ...r });
      console.log(`  DIFERE    ${nome.padEnd(42)} ${String(r.mudados).padStart(8)} px de ` +
        `${r.total} (${(r.mudados / r.total * 100).toFixed(4)}%)  maior delta ${r.maiorDelta}`);
    } else {
      console.log(`  IGUAL     ${nome.padEnd(42)} 0 px (arquivo diferente, imagem igual)`);
    }
  }
  await nav.close();
}

const pxTotal = comDiferenca.reduce((s, c) => s + (c.mudados || 0), 0);
console.log('\n' + '='.repeat(78));
console.log(`Telas comparadas:          ${arquivos.length}`);
console.log(`Sem NENHUM pixel diferente: ${arquivos.length - comDiferenca.length - ausentes}`);
console.log(`Com diferenca:             ${comDiferenca.length}`);
console.log(`Pixels diferentes no total: ${pxTotal}`);
console.log('='.repeat(78));
process.exit(comDiferenca.length + ausentes === 0 ? 0 : 1);
