// Portão estático: nenhum identificador indefinido no código do navegador.
//
// Por que existe: o commit becfbfa trocou duas chamadas por funções que não
// existiam (getOperadorTempoAnalysis) e a aba Check-out do Dashboard passou a
// derrubar a tela inteira. Build e testes de abertura passaram, porque o erro
// só acontece ao clicar na aba. O eslint `no-undef` acha isso sem clicar.
//
// Só `src/` (o navegador). `process` é aceito: supabaseClient.js o usa atrás de
// `typeof process !== "undefined"`, porque os scripts Node importam o mesmo arquivo.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['eslint', '--no-warn-ignored', '--no-inline-config', '--global', 'process', '--rule', '{"no-undef":"error"}', '-f', 'json', 'src'],
  { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
let resultado;
try { resultado = JSON.parse(r.stdout); } catch {
  console.log(`FALHA(S): o eslint não rodou\n${(r.stderr || r.stdout || '').slice(0, 800)}`);
  process.exit(1);
}
const achados = resultado.flatMap((f) => f.messages.filter((m) => m.ruleId === 'no-undef')
  .map((m) => `${f.filePath.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '')}:${m.line} ${m.message}`));
console.log(`Arquivos conferidos: ${resultado.length}`);
for (const a of achados) console.log(`  ${a}`);
console.log(achados.length ? `${achados.length} FALHA(S): identificador indefinido` : 'TUDO OK — nenhum identificador indefinido em src/');
process.exit(achados.length ? 1 : 0);
