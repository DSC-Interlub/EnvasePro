/**
 * scripts/contar-estilo-antigo.mjs
 *
 * Conta, no CÓDIGO, quanto estilo antigo ainda existe. A meta é zero.
 *
 * POR QUE ESTE SCRIPT EXISTE
 *
 * O dono olhou o PR da fundação e disse: "muita coisa ainda parece igual; só
 * o menu mudou". Ele estava certo, e eu não tinha instrumento para ver isso:
 * media cor e fonte, que mudaram, e não media ESTRUTURA — raio, sombra,
 * borda, altura de linha de tabela —, que não mudou.
 *
 * Então este conta o que sobrou do estilo antigo, por categoria, para que
 * "ficou diferente" seja um número e não uma impressão.
 *
 * Uso:
 *   node scripts/contar-estilo-antigo.mjs                 (resumo)
 *   node scripts/contar-estilo-antigo.mjs --detalhe       (arquivo:linha)
 *   node scripts/contar-estilo-antigo.mjs --json <saida>  (para comparar)
 */

import fs from 'node:fs';
import path from 'node:path';

const detalhe = process.argv.includes('--detalhe');
const iJson = process.argv.indexOf('--json');
const saidaJson = iJson >= 0 ? process.argv[iJson + 1] : null;

/**
 * Cada marcador é um sinal de que aquele pedaço não passou pela direção
 * "Fluxo". `o_que` explica o que deveria estar no lugar.
 */
const MARCADORES = [
  // --- raio ---------------------------------------------------------------
  { id: 'raio-antigo', re: /\brounded-(sm|md|lg|xl|2xl|3xl)\b/g,
    o_que: 'raio solto -> rounded-token / rounded-token-sm / rounded-cartao / rounded-painel' },

  // --- sombra -------------------------------------------------------------
  { id: 'sombra-antiga', re: /\bshadow-(sm|md|lg|xl|2xl)\b/g,
    o_que: 'sombra solta -> shadow-cartao / shadow-cartao-alta / shadow-leve / shadow-marca' },

  // --- cinzas do Tailwind em vez dos tokens ------------------------------
  { id: 'cinza-solto', re: /\b(bg|text|border|divide|ring|from|to|via)-(slate|gray|zinc|neutral|stone)-\d{2,3}(\/\d+)?\b/g,
    o_que: 'cinza do Tailwind -> bg-fundo / bg-cartao / text-tinta / text-texto-fraco / border-borda' },

  // --- estados em cor solta ----------------------------------------------
  { id: 'estado-solto', re: /\b(bg|text|border|divide|ring|from|to|via)-(green|red|amber|orange|yellow|emerald|rose)-\d{2,3}(\/\d+)?\b/g,
    o_que: 'estado em cor solta -> ok / atencao / erro (e os -suave)' },

  // --- borda dura onde o cartão deveria usar sombra ----------------------
  { id: 'borda-dura', re: /\bborder(-[0-9])?\s+border-(slate|gray|zinc)-\d{2,3}\b/g,
    o_que: 'borda dura de cartão -> cartao-fluxo (sombra, sem borda)' },

  // --- altura de linha de tabela -----------------------------------------
  { id: 'tabela-antiga', re: /<Table(Row|Head|Cell)?\b(?![^>]*className)/g,
    o_que: 'Table sem estilo novo -> o Table já carrega linha de 56px e cabeçalho pequeno' },

  // --- gradiente decorativo solto ----------------------------------------
  { id: 'gradiente-solto', re: /\bbg-gradient-to-[a-z]{1,2}\b/g,
    o_que: 'gradiente solto -> superfície de token, ou gradiente da marca' },

  // --- hex e rgb escritos à mão ------------------------------------------
  { id: 'cor-a-mao', re: /#[0-9A-Fa-f]{6}\b|rgba?\(\s*\d+\s*,/g,
    o_que: 'cor escrita à mão -> token' },
];

/** Componentes novos: contar o uso diz se a tela foi de fato migrada. */
const NOVOS = [
  { id: 'PageHeader', re: /<PageHeader\b/g },
  { id: 'StatCard', re: /<StatCard\b/g },
  { id: 'SectionCard', re: /<SectionCard\b/g },
  { id: 'StatusPill', re: /<StatusPill\b/g },
  { id: 'FilterBar', re: /<FilterBar\b/g },
  { id: 'EmptyState', re: /<EmptyState\b/g },
  { id: 'ChartCard', re: /<ChartCard\b/g },
  { id: 'cartao-fluxo', re: /\bcartao-fluxo\b/g },
  { id: 'rounded-cartao', re: /\brounded-(cartao|painel|token)\b/g },
  { id: 'shadow-cartao', re: /\bshadow-(cartao|cartao-alta|leve|marca)\b/g },
  { id: 'tokens-de-cor', re: /\b(bg|text|border|ring|from|to|via)-(marca|fundo|cartao|tinta|texto-fraco|texto-apagado|borda|trilha|ok|atencao|erro)\b/g },
];

/** Linha de comentário não é código. */
const ehComentario = (l) => /^\s*(\*|\/\/|\/\*|--)/.test(l);

/** Pastas por módulo, para o relatório dizer onde está a dívida. */
function moduloDe(rel) {
  if (rel.startsWith('src/components/ui/')) return 'ui (base)';
  if (rel.startsWith('src/components/casca/')) return 'casca';
  if (rel.startsWith('src/components/')) return 'componentes/' + rel.split('/')[2];
  if (rel.startsWith('src/pages/')) return 'telas';
  return 'outros';
}

const arquivos = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (/\.jsx?$/.test(e.name)) arquivos.push(p);
  }
})('src');

const porMarcador = {};
const porModulo = {};
const porArquivo = {};
const ocorrencias = [];
const novos = {};

for (const m of MARCADORES) porMarcador[m.id] = 0;
for (const n of NOVOS) novos[n.id] = 0;

for (const f of arquivos) {
  const rel = f.split(path.sep).join('/');
  const mod = moduloDe(rel);
  porModulo[mod] = porModulo[mod] || { antigo: 0, novo: 0, arquivos: 0 };
  porModulo[mod].arquivos += 1;

  const texto = fs.readFileSync(f, 'utf8');
  const linhas = texto.split('\n');

  for (const [i, linha] of linhas.entries()) {
    if (ehComentario(linha)) continue;
    for (const m of MARCADORES) {
      const achados = linha.match(m.re);
      if (!achados) continue;
      porMarcador[m.id] += achados.length;
      porModulo[mod].antigo += achados.length;
      porArquivo[rel] = (porArquivo[rel] || 0) + achados.length;
      ocorrencias.push({ arquivo: rel, linha: i + 1, marcador: m.id, trecho: achados[0] });
    }
  }

  const semComentario = linhas.filter((l) => !ehComentario(l)).join('\n');
  for (const n of NOVOS) {
    const achados = semComentario.match(n.re);
    if (achados) { novos[n.id] += achados.length; porModulo[mod].novo += achados.length; }
  }
}

const totalAntigo = Object.values(porMarcador).reduce((a, b) => a + b, 0);
const totalNovo = Object.values(novos).reduce((a, b) => a + b, 0);

console.log('='.repeat(78));
console.log('ESTILO ANTIGO RESTANTE — a meta e zero');
console.log('='.repeat(78));

console.log('\nPOR MARCADOR\n');
for (const m of MARCADORES) {
  const n = porMarcador[m.id];
  console.log(`  ${m.id.padEnd(18)} ${String(n).padStart(5)}   ${n === 0 ? 'ok' : m.o_que}`);
}

console.log('\nPOR MODULO  (antigo / uso de componente novo)\n');
for (const [mod, v] of Object.entries(porModulo).sort((a, b) => b[1].antigo - a[1].antigo)) {
  console.log(`  ${mod.padEnd(26)} ${String(v.antigo).padStart(5)} antigo  ${String(v.novo).padStart(5)} novo   (${v.arquivos} arquivos)`);
}

console.log('\nOS 12 ARQUIVOS COM MAIS DIVIDA\n');
for (const [f, n] of Object.entries(porArquivo).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(5)}  ${f}`);
}

console.log('\nUSO DOS COMPONENTES NOVOS\n');
for (const n of NOVOS) console.log(`  ${n.id.padEnd(18)} ${String(novos[n.id]).padStart(5)}`);

if (detalhe) {
  console.log('\nDETALHE (primeiras 60)\n');
  for (const o of ocorrencias.slice(0, 60)) {
    console.log(`  ${o.arquivo}:${o.linha}  ${o.marcador}  "${o.trecho}"`);
  }
}

console.log('\n' + '='.repeat(78));
console.log(`TOTAL de estilo antigo: ${totalAntigo}`);
console.log(`TOTAL de uso novo:      ${totalNovo}`);
console.log('='.repeat(78));

if (saidaJson) {
  fs.mkdirSync(path.dirname(saidaJson), { recursive: true });
  fs.writeFileSync(saidaJson, JSON.stringify({
    quando: new Date().toISOString(),
    total_antigo: totalAntigo, total_novo: totalNovo,
    por_marcador: porMarcador, por_modulo: porModulo, novos,
    por_arquivo: porArquivo,
  }, null, 2));
  console.log(`-> ${saidaJson}`);
}
