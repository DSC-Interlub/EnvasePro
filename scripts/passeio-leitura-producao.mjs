// Passeio SOMENTE LEITURA em produção, com a conta de administrador.
//
// Abre todas as telas, não salva nem cria nada, e confere o console e a rede.
// Quem roda é o DONO, com a senha dele em variável de ambiente (nunca em
// arquivo, nunca na linha de comando):
//
//   PowerShell:
//     $env:PASSEIO_EMAIL = "adm.sp1@interlub.com"
//     $env:PASSEIO_SENHA = Read-Host "senha"   # não fica no histórico
//     node scripts/passeio-leitura-producao.mjs --allow-production --confirm-ref=xifzjpbkpxislqrowswd
//
// TRAVA DE LEITURA (no navegador, antes de sair da máquina): toda requisição ao
// Supabase que não seja leitura é DERRUBADA e conta como falha. Passam só:
//   - GET/HEAD em /rest/v1 e /storage/v1;
//   - POST /auth/v1/token (o próprio login e a renovação do token);
//   - POST /rest/v1/rpc/<função de leitura> (lista fechada abaixo);
//   - POST /api/admin-usuarios com ação "listar" ou "auditoria".
// O único efeito do passeio no banco é o Auth registrar o horário do login.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const REF = 'xifzjpbkpxislqrowswd';
// --ensaio-local: o mesmo passeio contra a build local (vite preview) e o banco
// local, para provar o script e a trava antes de usá-lo em produção.
const ENSAIO = process.argv.includes('--ensaio-local');
const APP = ENSAIO ? 'http://127.0.0.1:4180' : 'https://envase-pro.vercel.app';
const ehSupabase = (u) => (ENSAIO ? u.port === '35421' : /supabase\.co$/.test(u.hostname));
if (!ENSAIO && (!process.argv.includes('--allow-production') || !process.argv.includes(`--confirm-ref=${REF}`))) {
  console.error(`Recusado: passe --allow-production --confirm-ref=${REF}`);
  process.exit(2);
}
const EMAIL = process.env.PASSEIO_EMAIL;
const SENHA = process.env.PASSEIO_SENHA;
if (!EMAIL || !SENHA) { console.error('Defina PASSEIO_EMAIL e PASSEIO_SENHA.'); process.exit(2); }

const RPC_LEITURA = new Set(['checar_sessao', 'contadores_do_menu', 'indicadores_empilhadeira', 'indicadores_recebimento',
  'painel_geral', 'painel_televisao', 'painel_televisao_empilha']);
const TELAS = ['Dashboard', 'Painel', 'Registros', 'NovoRegistro', 'Checkout', 'NovaProgramacaoCheckout', 'Empilhadeira',
  'NovaEmpilhaProgramacao', 'EmpilhadeiraConfig', 'IndicadoresEmpilha', 'Recebimento', 'IndicadoresRecebimento',
  'ChecklistRecebimento', 'NovoChecklist', 'NotasFiscais', 'NovaNotaFiscal', 'Produtos', 'Embalagens', 'Operadores',
  'GerenciarUsuarios', 'ImportarProdutos', 'ImportarEmbalagens', 'ImportarCategorias', 'AlterarSenha',
  'Televisao', 'TelevisaoEmpilha'];

const SAIDA = ENSAIO ? 'scratch/passeio-ensaio' : 'scratch/passeio-producao';
fs.mkdirSync(SAIDA, { recursive: true });

const bloqueadas = [];
const eventos = [];
function permitida(req) {
  const u = new URL(req.url());
  const m = req.method();
  if (!ehSupabase(u) && !u.pathname.startsWith('/api/')) return true; // a própria página, fontes
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  if (m === 'POST' && u.pathname === '/auth/v1/token') return true;
  if (m === 'POST' && u.pathname.startsWith('/rest/v1/rpc/')) return RPC_LEITURA.has(u.pathname.slice('/rest/v1/rpc/'.length));
  if (m === 'POST' && u.pathname === '/api/admin-usuarios') {
    try { return ['listar', 'auditoria'].includes(JSON.parse(req.postData() || '{}').acao); } catch { return false; }
  }
  return false;
}

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.route('**/*', (route) => {
  const req = route.request();
  if (permitida(req)) return route.continue();
  bloqueadas.push(`${req.method()} ${new URL(req.url()).pathname}`);
  return route.abort('blockedbyclient');
});
let telaAtual = 'login';
page.on('pageerror', (e) => eventos.push(`[${telaAtual}] erro de JS: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') eventos.push(`[${telaAtual}] console: ${m.text().slice(0, 200)}`); });
page.on('response', (r) => {
  const u = new URL(r.url());
  if (r.status() >= 400 && (ehSupabase(u) || u.pathname.startsWith('/api/'))) {
    eventos.push(`[${telaAtual}] HTTP ${r.status()} ${r.request().method()} ${u.pathname}`);
  }
});

const linhas = [];
try {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor({ timeout: 30000 });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SENHA);
  await page.locator('#password').press('Enter');
  const t0 = Date.now();
  while ((await page.locator('#email').count()) > 0 && Date.now() - t0 < 30000) await page.waitForTimeout(250);
  if (await page.locator('#email').count()) throw new Error('não entrou (senha errada?)');
  if (await page.getByRole('heading', { name: 'Crie a sua senha' }).count()) throw new Error('a conta está com senha temporária; o passeio não troca senha');

  for (const [i, tela] of TELAS.entries()) {
    telaAtual = tela;
    const antes = eventos.length;
    const bloqAntes = bloqueadas.length;
    await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const h1 = (await page.locator('h1:visible').first().innerText({ timeout: 5000 }).catch(() => '')).trim();
    const quebrou = (await page.getByText('Não foi possível abrir esta tela').count()) > 0;
    const captura = `${String(i + 1).padStart(2, '0')}-${tela}.png`;
    await page.screenshot({ path: path.join(SAIDA, captura) });
    const problemas = [...eventos.slice(antes), ...bloqueadas.slice(bloqAntes).map((b) => `ESCRITA BLOQUEADA: ${b}`)];
    if (quebrou) problemas.push('a tela caiu em "Não foi possível abrir esta tela"');
    linhas.push({ tela, h1, ok: problemas.length === 0, problemas, captura });
    console.log(`${problemas.length ? 'FALHA' : 'OK   '} ${tela.padEnd(26)} ${h1}${problemas.length ? ' -> ' + problemas.join(' | ') : ''}`);
  }
  if (ENSAIO) {
    // Prova da trava: uma escrita feita de dentro da página tem de ser derrubada.
    telaAtual = 'prova-da-trava';
    const antes = bloqueadas.length;
    const chegou = await page.evaluate(async (url) => {
      try { await fetch(`${url}/rest/v1/operators`, { method: 'POST', body: '{}' }); return true; } catch { return false; }
    }, 'http://127.0.0.1:35421');
    const ok = !chegou && bloqueadas.length === antes + 1;
    bloqueadas.splice(antes); // a escrita de prova não conta como falha do passeio
    eventos.splice(0, eventos.length, ...eventos.filter((e) => !e.startsWith('[prova-da-trava]')));
    linhas.push({ tela: 'prova-da-trava', ok, problemas: ok ? [] : ['a escrita de prova NÃO foi bloqueada'] });
    console.log(`${ok ? 'OK   ' : 'FALHA'} prova da trava: POST /rest/v1/operators ${ok ? 'derrubado no navegador' : 'PASSOU'}`);
  }
} catch (e) {
  console.log(`O PASSEIO PAROU: ${String(e.message).split('\n')[0]}`);
  linhas.push({ tela: telaAtual, ok: false, problemas: [String(e.message).split('\n')[0]] });
} finally {
  await nav.close();
}
fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify({ quando: new Date().toISOString(), bloqueadas, linhas }, null, 1));
const falhas = linhas.filter((l) => !l.ok).length;
console.log('='.repeat(70));
console.log(`Escritas bloqueadas: ${bloqueadas.length}`);
console.log(falhas ? `${falhas} FALHA(S) em ${linhas.length} telas` : `TUDO OK — ${linhas.length} telas, console limpo, nada escrito`);
process.exit(falhas ? 1 : 0);
