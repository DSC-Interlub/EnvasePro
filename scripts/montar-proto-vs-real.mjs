/**
 * scripts/montar-proto-vs-real.mjs
 *
 * Monta a página "protótipo vs real" de uma tela: as duas imagens lado a lado,
 * mais a lista do que ainda diverge.
 *
 * A lista de divergências é OBRIGATÓRIA e vem de um arquivo .json ao lado. Sem
 * ela a comparação vira propaganda: quem olha duas imagens parecidas conclui
 * que está igual, e o que falta some.
 *
 * Uso:
 *   node scripts/montar-proto-vs-real.mjs <tela> <divergencias.json>
 */

import fs from 'node:fs';
import path from 'node:path';

const [tela, arqDiv] = process.argv.slice(2);
if (!tela || !arqDiv) {
  console.error('Uso: node scripts/montar-proto-vs-real.mjs <tela> <divergencias.json>');
  process.exit(1);
}

const dados = JSON.parse(fs.readFileSync(arqDiv, 'utf8'));
const saida = `scratch/redesenho/proto-vs-real-${tela}.html`;
const rel = (p) => path.relative(path.dirname(saida), p).split(path.sep).join('/');

const SEVERIDADE = {
  bloqueia: { rotulo: 'impede dizer que está igual', cor: '#E5484D', fundo: '#FFE7E8' },
  dado: { rotulo: 'falta dado no sistema', cor: '#B87500', fundo: '#FFF1D6' },
  escolha: { rotulo: 'escolha deliberada', cor: '#3B5BFF', fundo: '#EEF1FF' },
  menor: { rotulo: 'diferença pequena', cor: '#7A8296', fundo: '#F3F4F8' },
};

const pares = dados.pares.map((par) => `
  <section class="par">
    <h2>${par.titulo} <span class="faixa">${par.largura}</span></h2>
    <div class="lado">
      <figure>
        <figcaption>protótipo aprovado</figcaption>
        <img loading="lazy" src="${rel(par.proto)}" alt="protótipo ${par.titulo}">
      </figure>
      <figure>
        <figcaption>tela real</figcaption>
        <img loading="lazy" src="${rel(par.real)}" alt="tela real ${par.titulo}">
      </figure>
    </div>
  </section>`).join('\n');

const divergencias = (dados.divergencias || []).map((d) => {
  const s = SEVERIDADE[d.tipo] || SEVERIDADE.menor;
  return `
    <li>
      <span class="sev" style="background:${s.fundo};color:${s.cor}">${s.rotulo}</span>
      <div>
        <p class="oque">${d.o_que}</p>
        ${d.porque ? `<p class="porque">${d.porque}</p>` : ''}
      </div>
    </li>`;
}).join('\n');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Protótipo vs real — ${tela}</title>
<style>
  :root { --fundo:#F3F4F8; --cartao:#fff; --borda:#E6E8EF; --tinta:#141A2B; --fraco:#7A8296; --marca:#3B5BFF; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px 64px; background:var(--fundo); color:var(--tinta);
         font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  .capa { max-width:1500px; margin:0 auto 24px; }
  h1 { font-size:26px; margin:0 0 6px; letter-spacing:-.02em; }
  .sub { margin:0; color:var(--fraco); font-size:14px; }
  .aviso { background:#fffbeb; border:1px solid #fcd34d; color:#92400e; padding:12px 14px;
           border-radius:10px; font-size:14px; margin:14px 0 0; }
  .div { max-width:1500px; margin:20px auto 28px; background:var(--cartao);
         border:1px solid var(--borda); border-radius:16px; padding:18px 20px; }
  .div h2 { font-size:18px; margin:0 0 12px; }
  .div ul { list-style:none; margin:0; padding:0; display:grid; gap:12px; }
  .div li { display:flex; gap:12px; align-items:flex-start; }
  .sev { flex:none; font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap; }
  .oque { margin:0; font-weight:600; font-size:15px; }
  .porque { margin:3px 0 0; color:var(--fraco); font-size:14px; }
  .par { max-width:1500px; margin:0 auto 26px; background:var(--cartao);
         border:1px solid var(--borda); border-radius:16px; padding:16px; }
  .par h2 { font-size:18px; margin:0 0 12px; display:flex; align-items:center; gap:10px; }
  .faixa { font-size:12px; font-weight:700; background:#EEF1FF; color:#1d4ed8;
           padding:3px 9px; border-radius:999px; }
  .lado { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  figure { margin:0; }
  figcaption { font-size:13px; font-weight:700; color:var(--fraco); margin-bottom:6px;
               text-transform:uppercase; letter-spacing:.04em; }
  img { width:100%; height:auto; display:block; border:1px solid var(--borda);
        border-radius:8px; background:#fff; }
  @media (max-width:1000px) { .lado { grid-template-columns:1fr; } }
</style>
</head>
<body>
<div class="capa">
  <h1>Protótipo vs tela real — ${tela}</h1>
  <p class="sub">${dados.resumo || ''}</p>
  <p class="aviso">Arquivo local. Não foi publicado: as capturas têm dado do sistema.</p>
</div>

<div class="div">
  <h2>O que ainda diverge do protótipo (${(dados.divergencias || []).length})</h2>
  <ul>${divergencias || '<li><span class="sev" style="background:#DBF7EA;color:#12A66B">nada</span><div><p class="oque">Nenhuma divergência registrada.</p></div></li>'}</ul>
</div>

${pares}
</body>
</html>`;

fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, html);
console.log(`${dados.pares.length} par(es), ${(dados.divergencias || []).length} divergência(s) -> ${saida}`);
