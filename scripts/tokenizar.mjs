/**
 * scripts/tokenizar.mjs
 *
 * Troca classe solta do Tailwind por token da direção "Fluxo", num arquivo.
 *
 * O QUE ISTO É E O QUE NÃO É
 *
 * É a parte MECÂNICA do redesenho: `text-slate-500` sempre vira
 * `text-texto-fraco`, `bg-green-50` sempre vira `bg-ok-suave`. Não há decisão
 * de desenho nessas trocas — há só repetição, e repetição feita à mão erra.
 *
 * NÃO é o redesenho. Trocar cor não transforma um `<Card>` com um `<h2>` em
 * maiúsculas num `SectionCard` do padrão, não resolve alvo de toque pequeno,
 * não tira duplicação, não conserta rótulo acessível que falta. Isso continua
 * sendo trabalho de ler a tela e refazer o layout.
 *
 * REGRA DE USO: rode num arquivo, LEIA O DIFF, e só então siga. O mapa abaixo é
 * deliberadamente conservador — só entra o que tem um e só um destino certo.
 * Tudo o que depende do contexto (um `bg-blue-600` que é botão da marca contra
 * um que é faixa informativa) fica de fora e é decidido a olho.
 *
 * Uso:  node scripts/tokenizar.mjs <arquivo> [--aplicar]
 *       sem --aplicar, só mostra o que mudaria.
 */
import fs from 'node:fs';

/**
 * Mapa de troca. A ordem importa: os mais específicos primeiro, porque a
 * substituição é textual.
 */
const MAPA = [
  // ── superfícies ────────────────────────────────────────────────────────
  ['bg-white', 'bg-cartao'],
  ['bg-slate-50', 'bg-fundo'],
  ['bg-slate-100', 'bg-fundo'],
  ['bg-gray-50', 'bg-fundo'],
  ['bg-gray-100', 'bg-fundo'],

  // ── tinta ──────────────────────────────────────────────────────────────
  ['text-slate-900', 'text-tinta'],
  ['text-slate-800', 'text-tinta'],
  ['text-slate-700', 'text-tinta-media'],
  ['text-slate-600', 'text-texto-fraco'],
  ['text-slate-500', 'text-texto-fraco'],
  ['text-slate-400', 'text-texto-apagado'],
  ['text-slate-300', 'text-texto-apagado'],
  ['text-gray-800', 'text-tinta'],
  ['text-gray-600', 'text-texto-fraco'],
  ['text-gray-500', 'text-texto-fraco'],
  ['text-gray-400', 'text-texto-apagado'],

  // ── bordas ─────────────────────────────────────────────────────────────
  ['border-slate-200', 'border-borda'],
  ['border-slate-100', 'border-borda'],
  ['border-slate-300', 'border-borda'],
  ['border-gray-200', 'border-borda'],
  ['divide-slate-100', 'divide-borda'],
  ['divide-slate-200', 'divide-borda'],

  // ── OK (verde) ─────────────────────────────────────────────────────────
  ['bg-green-50', 'bg-ok-suave'],
  ['bg-green-100', 'bg-ok-suave'],
  ['bg-emerald-50', 'bg-ok-suave'],
  ['bg-green-500', 'bg-ok'],
  ['bg-green-600', 'bg-ok'],
  ['bg-green-700', 'bg-ok'],
  ['hover:bg-green-700', 'hover:bg-ok'],
  ['text-green-800', 'text-ok'],
  ['text-green-700', 'text-ok'],
  ['text-green-600', 'text-ok'],
  ['text-green-500', 'text-ok'],
  ['text-green-400', 'text-ok'],
  ['text-emerald-700', 'text-ok'],
  ['border-green-200', 'border-ok'],
  ['border-green-300', 'border-ok'],

  // ── ERRO (vermelho) ────────────────────────────────────────────────────
  ['bg-red-50', 'bg-erro-suave'],
  ['bg-red-100', 'bg-erro-suave'],
  ['bg-red-500', 'bg-erro'],
  ['bg-red-600', 'bg-erro'],
  ['hover:bg-red-700', 'hover:bg-erro'],
  ['hover:bg-red-50', 'hover:bg-erro-suave'],
  ['text-red-800', 'text-erro'],
  ['text-red-700', 'text-erro'],
  ['text-red-600', 'text-erro'],
  ['text-red-500', 'text-erro'],
  ['text-red-400', 'text-erro'],
  ['hover:text-red-700', 'hover:text-erro'],
  ['border-red-200', 'border-erro'],
  ['border-red-300', 'border-erro'],
  ['border-red-400', 'border-erro'],

  // ── ATENÇÃO (laranja, âmbar, amarelo) ──────────────────────────────────
  ['bg-orange-50', 'bg-atencao-suave'],
  ['bg-orange-100', 'bg-atencao-suave'],
  ['bg-amber-50', 'bg-atencao-suave'],
  ['bg-amber-100', 'bg-atencao-suave'],
  ['bg-yellow-50', 'bg-atencao-suave'],
  ['bg-yellow-100', 'bg-atencao-suave'],
  ['bg-orange-500', 'bg-atencao'],
  ['bg-orange-600', 'bg-atencao'],
  ['bg-amber-600', 'bg-atencao'],
  ['hover:bg-orange-700', 'hover:bg-atencao'],
  ['hover:bg-amber-700', 'hover:bg-atencao'],
  ['hover:bg-orange-50', 'hover:bg-atencao-suave'],
  ['text-orange-800', 'text-atencao'],
  ['text-orange-700', 'text-atencao'],
  ['text-orange-600', 'text-atencao'],
  ['text-orange-500', 'text-atencao'],
  ['text-amber-800', 'text-atencao'],
  ['text-amber-700', 'text-atencao'],
  ['text-amber-600', 'text-atencao'],
  ['text-yellow-800', 'text-atencao'],
  ['text-yellow-700', 'text-atencao'],
  ['text-yellow-600', 'text-atencao'],
  ['border-orange-200', 'border-atencao'],
  ['border-orange-300', 'border-atencao'],
  ['border-amber-200', 'border-atencao'],

  // ── raios ──────────────────────────────────────────────────────────────
  ['rounded-2xl', 'rounded-painel'],
  ['rounded-xl', 'rounded-painel'],
  ['rounded-lg', 'rounded-token'],
  ['rounded-md', 'rounded-token-sm'],

  // ── sombras ────────────────────────────────────────────────────────────
  ['shadow-lg', 'shadow-cartao'],
  ['shadow-md', 'shadow-cartao'],
  ['shadow-sm', 'shadow-cartao'],
  ['hover:shadow-lg', 'hover:shadow-cartao-alta'],
  ['hover:shadow-md', 'hover:shadow-cartao-alta'],
];

const [arquivo, ...resto] = process.argv.slice(2);
const aplicar = resto.includes('--aplicar');

if (!arquivo) {
  console.error('Uso: node scripts/tokenizar.mjs <arquivo> [--aplicar]');
  process.exit(1);
}

let s = fs.readFileSync(arquivo, 'utf8');
const original = s;
const contagem = new Map();

for (const [de, para] of MAPA) {
  // Fronteira de classe: evita que `bg-green-50` case dentro de
  // `bg-green-500`, e que `rounded-lg` case dentro de `rounded-lg-foo`.
  const re = new RegExp(`(?<![\\w-])${de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g');
  const antes = s;
  s = s.replace(re, para);
  if (s !== antes) {
    const n = (antes.match(re) || []).length;
    contagem.set(`${de} -> ${para}`, n);
  }
}

if (s === original) {
  console.log(`${arquivo}: nada a trocar.`);
  process.exit(0);
}

console.log(`${arquivo}:`);
let total = 0;
for (const [troca, n] of [...contagem.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${troca}`);
  total += n;
}
console.log(`  ${total} troca(s)${aplicar ? ' — APLICADAS' : ' — simulação, use --aplicar'}`);

if (aplicar) fs.writeFileSync(arquivo, s);
