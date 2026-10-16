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

  // O marcador `tabela-antiga` foi REMOVIDO em 14/10/2026.
  //
  // Ele exigia `className` em todo <Table>/<TableHead>/<TableRow>, e fazia
  // sentido enquanto o Table carregava o estilo antigo: a tela precisava
  // corrigir caso a caso. Depois do Lote A o proprio Table ja tem linha de
  // 56px, cabecalho pequeno e nenhuma grade — usar o componente PURO passou
  // a ser o certo, e o marcador passou a acusar o codigo CORRETO.
  //
  // Eram 81 ocorrencias no baseline. Tirar o marcador NAO melhora o codigo:
  // melhora a medicao. Fica registrado para o numero nao parecer um ganho.
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

/**
 * Quais componentes de `ui/` o sistema realmente alcança, seguindo os imports
 * de forma transitiva a partir das telas.
 *
 * POR QUE SEPARAR
 *
 * `src/components/ui` tem 49 arquivos e o sistema importa 19. Os outros 30
 * vieram no pacote do shadcn e nunca foram usados — `menubar`, `carousel`,
 * `command`, e desde a troca da casca também `sidebar`.
 *
 * Somar a dívida deles no total mistura duas coisas muito diferentes: estilo
 * antigo que o operador VÊ, e estilo antigo em código que ninguém carrega.
 * O primeiro é o que o dono reclamou; o segundo é inventário.
 */
function uiAlcancados() {
  const importaDe = {};
  for (const f of arquivos) {
    const rel = f.split(path.sep).join('/');
    const nomes = [...fs.readFileSync(f, 'utf8')
      .matchAll(/from ["']@\/components\/ui\/([a-z-]+)["']/g)].map((m) => m[1]);
    importaDe[rel] = [...new Set(nomes)];
  }
  const vistos = new Set();
  const fila = [];
  for (const [rel, nomes] of Object.entries(importaDe)) {
    if (rel.includes('/components/ui/')) continue;
    fila.push(...nomes);
  }
  while (fila.length) {
    const n = fila.pop();
    if (vistos.has(n)) continue;
    vistos.add(n);
    const alvo = 'src/components/ui/' + n + '.jsx';
    if (importaDe[alvo]) fila.push(...importaDe[alvo]);
  }
  return vistos;
}

/** Pastas por módulo, para o relatório dizer onde está a dívida. */
function moduloDe(rel, alcancados) {
  if (rel.startsWith('src/components/ui/')) {
    const nome = rel.replace('src/components/ui/', '').replace(/\.jsx?$/, '');
    return alcancados.has(nome) ? 'ui (base, EM USO)' : 'ui (base, nunca importado)';
  }
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

const ALCANCADOS = uiAlcancados();
const porMarcador = {};
const porModulo = {};
const porArquivo = {};
const ocorrencias = [];
const novos = {};

for (const m of MARCADORES) porMarcador[m.id] = 0;
for (const n of NOVOS) novos[n.id] = 0;

for (const f of arquivos) {
  const rel = f.split(path.sep).join('/');
  const mod = moduloDe(rel, ALCANCADOS);
  porModulo[mod] = porModulo[mod] || { antigo: 0, novo: 0, arquivos: 0 };
  porModulo[mod].arquivos += 1;

  // Comentário JSX (`{/* ... */}`) sai ANTES de contar.
  //
  // O `ehComentario` só pula linha que COMEÇA com `*`, `//` ou `/*`; o corpo de
  // um comentário JSX de várias linhas começa com texto comum e passava direto.
  // Como os comentários desta reconstrução citam de propósito as classes que
  // foram REMOVIDAS ("o gradiente roxo-para-azul saiu", "era bg-amber-500"), o
  // contador estava contando as próprias explicações como dívida — e o número
  // que eu vinha relatando saía MAIOR que a realidade.
  //
  // Os espaços preservam a contagem de linhas, para o número da linha nas
  // ocorrências continuar certo.
  const texto = fs.readFileSync(f, 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (bloco) => bloco.replace(/[^\n]/g, ' '));
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
const morto = porModulo['ui (base, nunca importado)']?.antigo || 0;
const emUso = totalAntigo - morto;

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
console.log(`ESTILO ANTIGO EM CODIGO QUE O OPERADOR VE: ${emUso}      <- a meta e zero`);
console.log(`  (+ ${morto} em componentes de ui/ que o sistema NUNCA importa: inventario,`);
console.log(`   nao aparece em tela nenhuma e nao entra no bundle)`);
console.log(`TOTAL de uso de componente novo: ${totalNovo}`);
console.log('='.repeat(78));

if (saidaJson) {
  fs.mkdirSync(path.dirname(saidaJson), { recursive: true });
  fs.writeFileSync(saidaJson, JSON.stringify({
    quando: new Date().toISOString(),
    total_antigo: totalAntigo, em_uso: emUso, morto, total_novo: totalNovo,
    por_marcador: porMarcador, por_modulo: porModulo, novos,
    por_arquivo: porArquivo,
  }, null, 2));
  console.log(`-> ${saidaJson}`);
}
