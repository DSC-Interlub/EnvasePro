/**
 * scripts/test-imports.mjs
 *
 * Procura componente USADO como JSX mas não importado, em todo o `src/`.
 *
 * POR QUE ISTO EXISTE
 *
 * O `vite build` não pega esse erro. O projeto não tem checagem de tipos, e um
 * `<Card>` sem import vira um `ReferenceError` só no instante em que aquele
 * ramo do JSX é renderizado — ou seja, numa tela específica, talvez só com um
 * filtro específico, talvez só em produção.
 *
 * Já aconteceu duas vezes nesta reconstrução:
 *  - `currentOperator` referenciado e não definido no Televisao.jsx;
 *  - `format` removido dos imports do Checkout.jsx enquanto ainda era usado na
 *    inicialização do estado — quebraria a tela inteira ao abrir.
 *
 * O CHECADOR IGNORA COMENTÁRIOS, e isso não é detalhe: os comentários desta
 * reconstrução citam de propósito os componentes que foram REMOVIDOS
 * ("eram cinco `<TabsContent>`", "`<Badge>` cinza"). Uma versão anterior deste
 * teste acusou cinco arquivos por causa disso — o mesmo erro de ler o próprio
 * comentário como se fosse código já tinha aparecido três vezes antes neste
 * projeto.
 *
 * Uso: node scripts/test-imports.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = 'src';

/** Tags de HTML/SVG que começam com maiúscula não existem; tudo o que o JSX
 *  escreve com maiúscula é componente. React e Fragment são do runtime. */
const DO_RUNTIME = new Set(['React', 'Fragment']);

function arquivos(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) saida.push(...arquivos(p));
    else if (/\.jsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** Tira comentários de bloco, de linha e o conteúdo de strings/templates. */
function semComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const problemas = [];
let analisados = 0;

for (const arq of arquivos(RAIZ)) {
  const cru = fs.readFileSync(arq, 'utf8');
  if (!/<[A-Z]/.test(cru)) continue;            // sem JSX de componente
  analisados += 1;

  const codigo = semComentarios(cru);

  // O que entra por import.
  const importados = new Set();
  for (const m of codigo.matchAll(/import\s+([^;]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const alvo = m[1];
    const chaves = alvo.match(/\{([^}]*)\}/);
    if (chaves) {
      for (const parte of chaves[1].split(',')) {
        const nome = parte.trim().split(/\s+as\s+/).pop().trim();
        if (nome) importados.add(nome);
      }
    }
    // `import * as SelectPrimitive from ...` — e assim que todo componente do
    // Radix e importado neste projeto. Sem tratar isso, o checador acusava 27
    // arquivos de `ui/` que estao corretos.
    const estrela = alvo.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (estrela) importados.add(estrela[1]);

    const padrao = alvo.replace(/\{[^}]*\}/g, '').replace(/\*\s+as\s+[\w$]+/, '')
      .replace(/,/g, ' ').trim();
    if (padrao && /^[A-Za-z_$][\w$]*$/.test(padrao)) importados.add(padrao);
  }

  // O que é definido no próprio arquivo.
  const locais = new Set();
  for (const m of codigo.matchAll(/(?:function|class)\s+([A-Z][\w$]*)/g)) locais.add(m[1]);
  for (const m of codigo.matchAll(/(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)) locais.add(m[1]);
  // Desestruturação com renome: `{ icone: Icone }` e `const { A, B } = x`.
  for (const m of codigo.matchAll(/:\s*([A-Z][\w$]*)/g)) locais.add(m[1]);
  for (const m of codigo.matchAll(/\{([^{}]*)\}\s*=/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().split(/[:=]/).pop().trim();
      if (/^[A-Z][\w$]*$/.test(nome)) locais.add(nome);
    }
  }

  // Nome que chega como PARAMETRO desestruturado, por exemplo
  // `Object.entries(Pages).map(([path, Page]) => ...)`. E componente valido e
  // nao tem import nenhum: vem do proprio argumento.
  for (const m of codigo.matchAll(/\(\s*\[([^\]]*)\]/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim();
      if (/^[A-Z][\w$]*$/.test(nome)) locais.add(nome);
    }
  }

  // O que é usado como JSX. `<Pacote.Coisa>` conta só o `Pacote`.
  const usados = new Set();
  for (const m of codigo.matchAll(/<([A-Z][\w$]*)/g)) usados.add(m[1]);

  const faltando = [...usados].filter(
    (u) => !importados.has(u) && !locais.has(u) && !DO_RUNTIME.has(u));

  if (faltando.length) {
    problemas.push({ arq: arq.split(path.sep).join('/'), faltando });
  }
}

console.log('='.repeat(74));
console.log(`IMPORTS — ${analisados} arquivos com JSX analisados`);
console.log('='.repeat(74));

if (problemas.length === 0) {
  console.log('\nOK   nenhum componente usado sem import.\n');
  process.exit(0);
}

for (const p of problemas) {
  console.log(`FALHA ${p.arq} -> ${p.faltando.join(', ')}`);
}
console.log(`\n${problemas.length} arquivo(s) com componente usado sem import.`);
process.exit(1);
