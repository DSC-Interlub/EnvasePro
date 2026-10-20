/**
 * scripts/montar-comparar-final.mjs — monta scratch/redesenho/COMPARAR-FINAL.html
 *
 * Página LOCAL (não publicada: as capturas têm nomes e dados de teste) com:
 *  1. todas as telas × 3 larguras, ANTES (531a76b, o último estado antes do
 *     redesenho v2) e DEPOIS (main), mesmo banco, mesmo dia, builds de produção;
 *  2. protótipo × real das 7 telas de referência, com a lista de desvios
 *     (scratch/redesenho/final/desvios.json, escrita olhando cada par);
 *  3. o que não foi capturado, e por quê.
 *
 * Uso: node scripts/montar-comparar-final.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'scratch/redesenho';
const FINAL = `${BASE}/final`;
const LARGURAS = [['celular', 'Celular · 390'], ['tablet', 'Tablet · 820'], ['desktop', 'Desktop · 1440']];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const existe = (p) => fs.existsSync(p);
const rel = (p) => path.relative(BASE, p).split(path.sep).join('/');

const desvios = existe(`${FINAL}/desvios.json`) ? JSON.parse(fs.readFileSync(`${FINAL}/desvios.json`, 'utf8')) : {};
const falhas = fs.readdirSync(BASE).filter((f) => /^final-.*\.log$/.test(f))
  .flatMap((f) => fs.readFileSync(`${BASE}/${f}`, 'utf8').split('\n').filter((l) => l.includes('FALHOU')).map((l) => `${f.replace(/^final-|\.log$/g, '')}: ${l.trim()}`));

function telas(papel) {
  const nomes = new Set();
  for (const lado of ['antes', 'depois']) {
    const d = `${FINAL}/${lado}/${papel}`;
    if (existe(d)) for (const f of fs.readdirSync(d)) nomes.add(f.replace(/^[a-z]+_/, '').replace(/\.png$/, ''));
  }
  return [...nomes].sort();
}

function bloco(papel, tela) {
  const colunas = LARGURAS.map(([l, rotulo]) => {
    const lados = ['antes', 'depois'].map((lado) => {
      const p = `${FINAL}/${lado}/${papel}/${l}_${tela}.png`;
      return `<figure class="lado ${lado}"><figcaption>${lado === 'antes' ? 'Antes' : 'Depois'}</figcaption>${existe(p)
        ? `<a href="${rel(p)}" target="_blank" rel="noopener"><img loading="lazy" src="${rel(p)}" alt="${esc(`${tela}, ${rotulo}, ${lado}`)}"></a>`
        : `<div class="vazio">${lado === 'antes' && tela === 'Metas' ? 'a tela não existia' : 'sem captura'}</div>`}</figure>`;
    }).join('');
    return `<div class="largura"><h4>${rotulo}</h4><div class="par">${lados}</div></div>`;
  }).join('');
  return `<details class="tela"><summary><span class="nome">/${esc(tela)}</span></summary><div class="larguras">${colunas}</div></details>`;
}

const PROTOS = [
  ['TV-fabrica', '/Televisao (conta TV)'], ['Painel-desktop', '/Painel'], ['Envase-tablet', '/NovoRegistro (operador)'],
  ['Checklist-celular', '/NovoChecklist (operador)'], ['Padrao-Lista', '/Registros'],
  ['Padrao-Formulario', '/NovaProgramacaoCheckout'], ['Padrao-Modulo-Empilhadeira', '/Empilhadeira'],
];
const protoReal = PROTOS.map(([p, tela]) => {
  const pp = `${FINAL}/proto-real/${p}--prototipo.png`;
  const pr = `${FINAL}/proto-real/${p}--real.png`;
  const d = desvios[p] || {};
  const lista = (d.desvios || []).map((x) => `<li><strong>${esc(x.tipo)}</strong> — ${esc(x.texto)}</li>`).join('');
  return `<section class="proto" id="${esc(p)}">
    <h3>${esc(p)} <span class="seta">→</span> <code>${esc(tela)}</code></h3>
    ${d.resumo ? `<p class="resumo">${esc(d.resumo)}</p>` : ''}
    <div class="par grande">
      <figure><figcaption>Protótipo aprovado</figcaption>${existe(pp) ? `<a href="${rel(pp)}" target="_blank" rel="noopener"><img loading="lazy" src="${rel(pp)}" alt="Protótipo ${esc(p)}"></a>` : '<div class="vazio">sem captura</div>'}</figure>
      <figure><figcaption>Tela real (main)</figcaption>${existe(pr) ? `<a href="${rel(pr)}" target="_blank" rel="noopener"><img loading="lazy" src="${rel(pr)}" alt="Tela real ${esc(tela)}"></a>` : '<div class="vazio">sem captura</div>'}</figure>
    </div>
    ${lista ? `<h4>Desvios</h4><ul class="desvios">${lista}</ul>` : '<p class="pendente">Desvios: ainda não registrados.</p>'}
  </section>`;
}).join('');

const contagem = (papel) => telas(papel).length;
const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comparação final</title>
<style>
:root{--fundo:#F3F4F8;--cartao:#fff;--tinta:#141A2B;--fraco:#5E6679;--borda:#E3E6EE;--marca:#3B5BFF;--suave:#EEF1FF;--atencao:#9A6700;--atencao-suave:#FFF4DB;--ok:#0E7C50;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--fundo:#0B0F1A;--cartao:#141A2B;--tinta:#EEF1F7;--fraco:#A3ABBD;--borda:#26304A;--suave:#1B2340;--atencao-suave:#3A2E10;--atencao:#F2C25B;--ok:#4BD39A;}}
:root[data-theme="dark"]{--fundo:#0B0F1A;--cartao:#141A2B;--tinta:#EEF1F7;--fraco:#A3ABBD;--borda:#26304A;--suave:#1B2340;--atencao-suave:#3A2E10;--atencao:#F2C25B;--ok:#4BD39A;}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--tinta);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1500px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:21px;margin:40px 0 12px}h3{font-size:18px;margin:0 0 8px}h4{font-size:14px;margin:12px 0 6px;color:var(--fraco)}
p{max-width:75ch}.legenda{color:var(--fraco);margin:0 0 16px}
nav.indice{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}nav.indice a{background:var(--cartao);border:1px solid var(--borda);border-radius:999px;padding:6px 14px;color:var(--tinta);text-decoration:none;font-weight:600;font-size:14px}
.caixa{background:var(--cartao);border:1px solid var(--borda);border-radius:16px;padding:16px 20px;margin:12px 0}
details.tela{background:var(--cartao);border:1px solid var(--borda);border-radius:14px;margin:8px 0}
details.tela summary{cursor:pointer;padding:12px 16px;font-weight:700;min-height:48px;display:flex;align-items:center}
.larguras{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 16px 16px}
@media (max-width:900px){.larguras{grid-template-columns:1fr}}
.par{display:grid;grid-template-columns:1fr 1fr;gap:8px}.par.grande{gap:16px}
@media (max-width:700px){.par.grande{grid-template-columns:1fr}}
figure{margin:0}figcaption{font-size:12px;font-weight:700;color:var(--fraco);margin-bottom:4px}
.lado.depois figcaption{color:var(--marca)}
img{display:block;width:100%;height:auto;max-height:520px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--borda);background:#fff}
.grande img{max-height:none;object-fit:contain}
.vazio{display:flex;align-items:center;justify-content:center;min-height:120px;border:1px dashed var(--borda);border-radius:8px;color:var(--fraco);font-size:13px;text-align:center;padding:8px}
section.proto{background:var(--cartao);border:1px solid var(--borda);border-radius:16px;padding:20px;margin:16px 0}
.seta{color:var(--fraco)}code{background:var(--suave);padding:1px 6px;border-radius:6px;font-size:.92em}
.resumo{color:var(--fraco)}ul.desvios{margin:0;padding-left:20px}ul.desvios li{margin:4px 0}
.pendente{background:var(--atencao-suave);color:var(--atencao);border-radius:8px;padding:8px 12px;font-weight:600}
.falhas li{font-family:ui-monospace,monospace;font-size:13px}
</style></head><body><main>
<h1>Comparação final — EnvasePro v2</h1>
<p class="legenda">Gerada em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Página local, não publicada: as capturas têm dados de teste.</p>
<div class="caixa">
<p><strong>Antes</strong> = commit <code>531a76b</code> (PR #9), o último estado antes do redesenho v2 (a mudança dele — a cor da marca virar token — tem diferença visual zero). <strong>Depois</strong> = <code>main</code>. Os dois lados foram capturados no <strong>mesmo banco local</strong>, carregado no volume da Base44 com as operações do dia, a partir de <strong>builds de produção</strong> servidos lado a lado. Telas cheias (rolagem inteira), nas larguras 390, 820 e 1440.</p>
<p>Admin: ${contagem('admin')} telas. Operador: ${contagem('operador')} telas (o que ele vê, com o menu dele). Clique numa imagem para abri-la inteira.</p>
</div>
<nav class="indice"><a href="#telas-admin">Telas · admin</a><a href="#telas-operador">Telas · operador</a><a href="#proto-real">Protótipo × real</a><a href="#falhas">O que não foi capturado</a></nav>
<h2 id="telas-admin">Telas — admin</h2>
${telas('admin').map((t) => bloco('admin', t)).join('\n')}
<h2 id="telas-operador">Telas — operador</h2>
${telas('operador').map((t) => bloco('operador', t)).join('\n')}
<h2 id="proto-real">Protótipo × real — as 7 telas de referência</h2>
<p>Cada protótipo foi fotografado no tamanho de janela em que foi desenhado, e a tela real no mesmo tamanho. Os dados dos protótipos são de exemplo; os da tela real, do banco de teste. <strong>A escolha da tela real de cada padrão é minha</strong> (o código não registra o mapeamento) e está declarada no título.</p>
${protoReal}
<h2 id="falhas">O que não foi capturado</h2>
${falhas.length ? `<ul class="falhas">${falhas.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p>Nada: todas as capturas pedidas foram feitas.</p>'}
</main></body></html>`;
fs.writeFileSync(`${BASE}/COMPARAR-FINAL.html`, html);
console.log(`${BASE}/COMPARAR-FINAL.html — admin ${contagem('admin')}, operador ${contagem('operador')}, protótipos ${PROTOS.length}, falhas ${falhas.length}`);
