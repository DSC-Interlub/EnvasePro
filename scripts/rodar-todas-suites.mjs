/**
 * scripts/rodar-todas-suites.mjs — a rodada completa, uma suíte por vez.
 *
 * Roda cada script de teste do repositório contra o banco LOCAL e o app em
 * http://127.0.0.1:5173, com tempo limite, e grava um relatório com o código
 * de saída e as últimas linhas de cada um. Não para na primeira falha: o
 * objetivo é o quadro inteiro.
 *
 * Fora da rodada, declarado: as suítes *staging* (miram um projeto de staging
 * que nunca existiu — ver CLAUDE.md, seção -1) e as que miram PRODUÇÃO em
 * endereço fixo (test-functional-audit, test-quick-gerenciar, audit-*).
 *
 * Uso: node scripts/rodar-todas-suites.mjs [saida.json]
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SAIDA = process.argv[2] || 'scratch/rodada-final/relatorio.json';
fs.mkdirSync('scratch/rodada-final', { recursive: true });

const GRUPOS = {
  'banco: migrations, permissões, segurança': [
    'test-security-signup.js', 'test-sql-injection.js', 'test-critical-columns-triggers.js',
    'test-author-immutability.js', 'test-reconcile-triggers.js', 'test-fuso-banco.js', 'test-dia-local.js',
    'test-upload-seguro.js', 'test-concurrent-notifications.js', 'test-status-completo.mjs',
    'test-401-intermitente.js', 'test-renovacao-sessao.js', 'test-metas.mjs',
  ],
  'paridade com o cálculo antigo': [
    'test-contadores-menu.js', 'test-painel-empilha.mjs', 'test-painel-televisao.mjs', 'test-painel-geral.mjs',
    'test-indicadores-empilha.mjs', 'test-indicadores-recebimento.mjs', 'test-dashboard-faixa.mjs',
    'test-meta-na-tela.mjs', 'test-checklist-criterio.js',
  ],
  'interface real (Playwright)': [
    'test-login.mjs', 'test-rotas-admin.js', 'test-telas-abrem.mjs', 'test-acessibilidade.mjs', 'test-imports.mjs',
    'test-fase3-ui.js', 'test-local-e2e-ui.js', 'test-browser.js',
    'test-contadores-menu-ui.js', 'test-aba-notificacoes.js', 'test-envase-m2.js',
    'test-leitor-codigo.js', 'test-listas-v1.js', 'test-tokens-fluxo.js', 'test-inactivity-timeout.js',
    'test-tv-authenticated.js', 'test-tv-paineis-ui.mjs', 'test-indicadores-ui.mjs', 'test-metas-ui.mjs',
    'test-nf-assinaturas-ui.mjs',
    'test-tv-layout.mjs',
  ],
};

// FORA DE PROPÓSITO: test-functional-audit.js e test-quick-gerenciar.js têm o
// endereço do app de PRODUÇÃO no código (o primeiro como padrão, o segundo fixo),
// e o db-guard só confere variáveis de ambiente. Ver CLAUDE.md §-2.
const relatorio = [];
for (const [grupo, suites] of Object.entries(GRUPOS)) {
  console.log(`\n=== ${grupo}`);
  for (const s of suites) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [`scripts/${s}`], { encoding: 'utf8', timeout: 15 * 60000, maxBuffer: 64 * 1024 * 1024 });
    const saida = `${r.stdout || ''}\n${r.stderr || ''}`;
    const linhas = saida.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !/injected env|^=+$/.test(l.trim()));
    const resumo = linhas.filter((l) => /RESULTADO|TUDO OK|FALHA\(S\)|\bOK\b.*de \d+|TELAS:|TV:|LOGIN:|passou|falhou|aprovad|reprovad/i.test(l)).slice(-2).join(' | ')
      || linhas.slice(-1)[0] || '(sem saída)';
    const item = {
      grupo, suite: s, codigo: r.status, sinal: r.signal || null,
      segundos: Math.round((Date.now() - t0) / 1000), resumo: resumo.slice(0, 300),
      falhas: linhas.filter((l) => /FALHA|✗|FAIL/.test(l)).slice(0, 8).map((l) => l.slice(0, 200)),
    };
    relatorio.push(item);
    fs.writeFileSync(`scratch/rodada-final/${s}.log`, saida);
    console.log(`  ${r.status === 0 ? 'OK   ' : 'FALHA'} ${s.padEnd(36)} ${String(item.segundos).padStart(4)}s  ${item.resumo.slice(0, 110)}`);
    fs.writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2));
  }
}
const falhas = relatorio.filter((x) => x.codigo !== 0);
console.log(`\n${relatorio.length - falhas.length} de ${relatorio.length} suítes OK`);
for (const f of falhas) console.log(`  FALHA ${f.suite}: ${f.falhas.join(' / ').slice(0, 300) || f.resumo}`);
process.exit(falhas.length ? 1 : 0);
