/**
 * scripts/montar-comparacao.mjs
 *
 * Monta uma pagina HTML local que mostra as capturas ANTES e DEPOIS lado a
 * lado, com um controle para alternar entre as duas na mesma posicao.
 *
 * Fica no disco, nao e publicada em lugar nenhum: as capturas tem nome de
 * operador e dado de producao.
 *
 * Uso: node scripts/montar-comparacao.mjs <pasta-antes> <pasta-depois> <saida.html> ["titulo"]
 */

import fs from 'node:fs';
import path from 'node:path';

const [antesDir, depoisDir, saida, titulo] = process.argv.slice(2);
if (!antesDir || !depoisDir || !saida) {
  console.error('Uso: node scripts/montar-comparacao.mjs <antes> <depois> <saida.html> ["titulo"]');
  process.exit(1);
}

const rel = (de, para) => path.relative(path.dirname(de), para).split(path.sep).join('/');

const arquivos = fs.readdirSync(antesDir)
  .filter((f) => f.endsWith('.png') && fs.existsSync(path.join(depoisDir, f)))
  .sort((a, b) => {
    const ordem = { celular: 0, tablet: 1, desktop: 2 };
    const [la] = a.split('_'); const [lb] = b.split('_');
    if (ordem[la] !== ordem[lb]) return ordem[la] - ordem[lb];
    return a.localeCompare(b);
  });

const blocos = arquivos.map((f) => {
  const [largura, ...resto] = f.replace('.png', '').split('_');
  const tela = resto.join('_');
  return `
  <section class="par" data-largura="${largura}">
    <h2>${tela} <span class="faixa">${largura}</span></h2>
    <div class="lado-a-lado">
      <figure>
        <figcaption>antes</figcaption>
        <img loading="lazy" src="${rel(saida, path.join(antesDir, f))}" alt="${tela} ${largura} antes">
      </figure>
      <figure>
        <figcaption>depois</figcaption>
        <img loading="lazy" src="${rel(saida, path.join(depoisDir, f))}" alt="${tela} ${largura} depois">
      </figure>
    </div>
    <div class="sobrepor">
      <figcaption>sobrepostas — passe o mouse para ver o "antes"</figcaption>
      <div class="pilha">
        <img loading="lazy" class="base" src="${rel(saida, path.join(depoisDir, f))}" alt="">
        <img loading="lazy" class="topo" src="${rel(saida, path.join(antesDir, f))}" alt="">
      </div>
    </div>
  </section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo || 'Antes e depois'}</title>
<style>
  :root {
    --fundo: #f8fafc; --cartao: #fff; --borda: #e2e8f0;
    --texto: #0f172a; --fraco: #475569; --marca: #2563eb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 64px; background: var(--fundo); color: var(--texto);
    font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header { max-width: 1400px; margin: 0 auto 24px; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  .aviso {
    background: #fffbeb; border: 1px solid #fcd34d; color: #92400e;
    padding: 12px 14px; border-radius: 10px; font-size: 14px; margin: 12px 0 0;
  }
  .filtros { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; }
  .filtros button {
    min-height: 44px; padding: 0 16px; border-radius: 10px; cursor: pointer;
    border: 2px solid var(--borda); background: #fff; color: var(--texto);
    font: inherit; font-weight: 600; font-size: 14px;
  }
  .filtros button[aria-pressed="true"] { background: var(--marca); border-color: var(--marca); color: #fff; }
  .par {
    max-width: 1400px; margin: 0 auto 28px; background: var(--cartao);
    border: 1px solid var(--borda); border-radius: 14px; padding: 16px;
  }
  .par[hidden] { display: none; }
  h2 { font-size: 18px; margin: 0 0 12px; display: flex; align-items: center; gap: 10px; }
  .faixa {
    font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
    background: #eff6ff; color: #1d4ed8; padding: 3px 9px; border-radius: 999px;
  }
  .lado-a-lado { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  figure { margin: 0; }
  figcaption {
    font-size: 13px; font-weight: 600; color: var(--fraco);
    margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em;
  }
  img { width: 100%; height: auto; display: block; border: 1px solid var(--borda); border-radius: 8px; background: #fff; }
  .sobrepor { margin-top: 16px; }
  .pilha { position: relative; }
  .pilha .topo { position: absolute; inset: 0; transition: opacity .12s; }
  .pilha:hover .topo { opacity: 0; }
  @media (max-width: 900px) { .lado-a-lado { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>${titulo || 'Antes e depois'}</h1>
  <p style="margin:0;color:var(--fraco);font-size:14px">
    ${arquivos.length} pares. As imagens sao a pagina inteira, por isso o "depois"
    costuma ficar mais alto: os controles cresceram.
  </p>
  <p class="aviso">
    Arquivo local. Nao foi publicado em lugar nenhum — as capturas tem nome de
    operador e dado do sistema.
  </p>
  <div class="filtros" role="group" aria-label="Filtrar por largura">
    <button data-f="todas" aria-pressed="true">Todas</button>
    <button data-f="celular" aria-pressed="false">Celular 390</button>
    <button data-f="tablet" aria-pressed="false">Tablet 820</button>
    <button data-f="desktop" aria-pressed="false">Desktop 1440</button>
  </div>
</header>
${blocos}
<script>
  const botoes = [...document.querySelectorAll('.filtros button')];
  const pares = [...document.querySelectorAll('.par')];
  botoes.forEach((b) => b.addEventListener('click', () => {
    botoes.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    const f = b.dataset.f;
    pares.forEach((p) => { p.hidden = f !== 'todas' && p.dataset.largura !== f; });
  }));
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, html);
console.log(`${arquivos.length} pares -> ${saida}`);
