/**
 * scripts/test-acessibilidade.mjs
 *
 * Confere, no código, três coisas que quebram o uso com leitor de tela e que
 * já apareceram várias vezes nesta reconstrução:
 *
 *  1. BOTÃO SÓ COM ÍCONE, SEM NOME. Um `<Button size="icon"><Trash2/></Button>`
 *     é anunciado como "botão" e mais nada. Apareceu nos três botões de ação de
 *     cada limpeza, no excluir do check-out, no excluir da programação e no
 *     "buscar no SAP" do checklist.
 *  2. IMAGEM SEM `alt`. Foto de operador sem alternativa textual.
 *  3. CAMPO SEM RÓTULO. `<Input>` ou `<Textarea>` sem `id` ligado a um
 *     `<Label htmlFor>` e sem `aria-label`: o leitor de tela anuncia "campo de
 *     edição" sem dizer de quê.
 *
 * É análise ESTÁTICA, e por isso tem limite: não enxerga rótulo montado em
 * tempo de execução nem `aria-labelledby` apontando para um id distante. Quando
 * acusar um caso desses, a saída é acrescentar o `aria-label` mesmo assim — ele
 * não atrapalha — ou documentar a exceção aqui.
 *
 * Uso: node scripts/test-acessibilidade.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = 'src';

/**
 * Arquivos onde o padrão não se aplica.
 * `ui/` são os primitivos: quem usa é que dá o nome.
 */
const FORA = [
  'src/components/ui/',
];

function arquivos(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) saida.push(...arquivos(p));
    else if (/\.jsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

const problemas = [];

for (const arq of arquivos(RAIZ)) {
  const caminho = arq.split(path.sep).join('/');
  if (FORA.some((f) => caminho.startsWith(f))) continue;

  const cru = fs.readFileSync(arq, 'utf8');
  // Sem comentários: eles citam de propósito o que foi corrigido.
  const s = cru.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  // ── 1. botão só com ícone ───────────────────────────────────────────────
  // Pega <Button ...>  <Icone .../>  </Button> sem texto no meio.
  // `(?:[^>]|=>)*?` e não `[^>]*?`: toda arrow function dentro das
  // propriedades (`onClick={() => ...}`) tem um `>`, e com o padrão ingênuo a
  // leitura das propriedades parava ali — o checador lia metade e acusava
  // elemento que TINHA o atributo. Foi exatamente o que aconteceu na primeira
  // execução: 72 campos acusados, todos com `placeholder` que o checador não
  // chegava a ver.
  const reBotao = /<Button((?:[^>]|=>)*?)(?<!=)>\s*(?:\{[^{}]*\}\s*)?<([A-Z]\w+)(?:[^>]|=>)*?\/>\s*(?:\{[^{}]*\}\s*)?<\/Button>/g;
  for (const m of s.matchAll(reBotao)) {
    const props = m[1];
    if (/aria-label/.test(props)) continue;
    const linha = s.slice(0, m.index).split('\n').length;
    problemas.push({ arq: caminho, linha, tipo: 'botão só com ícone, sem aria-label', detalhe: `<${m[2]}>` });
  }

  // ── 2. imagem sem alt ──────────────────────────────────────────────────
  for (const m of s.matchAll(/<img\b([^>]*)>/g)) {
    if (/\balt\s*=/.test(m[1])) continue;
    const linha = s.slice(0, m.index).split('\n').length;
    problemas.push({ arq: caminho, linha, tipo: 'imagem sem alt', detalhe: '<img>' });
  }

  // ── 3. campo sem rótulo ────────────────────────────────────────────────
  // Só acusa quando o campo NÃO tem id, aria-label nem aria-labelledby: sem id
  // não há como um <Label htmlFor> alcançá-lo.
  // O `(?<!=)` no fim é o que resolve: sem ele, o padrão simplesmente TERMINA
  // no `>` da primeira arrow function (`onChange={e =>`), e o checador lê só
  // meia dúzia de caracteres de propriedade. Alternar `(?:[^>]|=>)` não basta,
  // porque o motor pode encerrar o grupo ali e casar o `>` do fecho.
  for (const m of s.matchAll(/<(Input|Textarea)\b((?:[^>]|=>)*?)\/?(?<!=)>/g)) {
    const props = m[2];
    if (/\b(id|aria-label|aria-labelledby|placeholder)\s*=/.test(props)) continue;
    if (/\btype\s*=\s*["']hidden["']/.test(props)) continue;
    const linha = s.slice(0, m.index).split('\n').length;
    problemas.push({ arq: caminho, linha, tipo: 'campo sem id nem rótulo acessível', detalhe: `<${m[1]}>` });
  }
}

console.log('='.repeat(78));
console.log('ACESSIBILIDADE — análise estática do JSX');
console.log('='.repeat(78));

if (problemas.length === 0) {
  console.log('\nOK   nenhum botão sem nome, nenhuma imagem sem alt, nenhum campo sem rótulo.\n');
  process.exit(0);
}

const porTipo = {};
for (const p of problemas) (porTipo[p.tipo] ||= []).push(p);

for (const [tipo, lista] of Object.entries(porTipo)) {
  console.log(`\n${tipo} — ${lista.length}`);
  for (const p of lista) console.log(`  ${p.arq}:${p.linha}  ${p.detalhe}`);
}
console.log(`\n${problemas.length} problema(s).`);
process.exit(1);
