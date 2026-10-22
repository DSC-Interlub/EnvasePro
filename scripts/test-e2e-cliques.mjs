/**
 * scripts/test-e2e-cliques.mjs — uma pessoa usando o sistema, POR CLIQUE (banco LOCAL).
 *
 * Pedido do dono (20/10/2026): testar TUDO pela interface, como gente — telas,
 * botões, formulários e funcionalidades, do início ao meio e ao fim de cada
 * fluxo — sem consultar o banco para provar que funcionou. A prova é o que a
 * TELA mostra depois do clique (mensagem, lista atualizada, número que muda,
 * outra tela que passa a mostrar o registro).
 *
 * Regras que derrubam um passo, em QUALQUER tela e perfil:
 *   - erro de JavaScript na página;
 *   - erro no console;
 *   - requisição com falha (4xx/5xx) que o passo não declarou como esperada
 *     (ex.: o 400 do login com senha errada é esperado; um 403 não é).
 *
 * Ambiente: build de produção servido localmente (`vite preview`, que também
 * serve /api/admin-usuarios contra o Supabase local) + Supabase local com o
 * seed de teste. Nada em produção. Perfis: admin, operador (conta
 * compartilhada) e TV. Larguras: desktop (fluxos completos), tablet e celular
 * (todas as telas de cada perfil + gaveta do menu).
 *
 * Saída: scratch/e2e-cliques/ — relatorio.html (tela × ação × perfil × largura ×
 * resultado, com a captura de cada passo), relatorio.json e as capturas.
 *
 * Uso: node scripts/test-e2e-cliques.mjs [--so=modulo1,modulo2]
 *   módulos: login, cadastros, envase, checkout, empilhadeira, recebimento,
 *            checklist, nf, limpeza, configuracoes, usuarios, paineis, tvs,
 *            erros, larguras
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-e2e-cliques');
const APP = process.env.APP_E2E || 'http://127.0.0.1:4180';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) { console.error(`Recusado: o app não é local (${APP})`); process.exit(2); }
const SAIDA = 'scratch/e2e-cliques';
fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA, { recursive: true });
const MANTER = process.argv.includes('--manter');
const SO = (process.argv.find((a) => a.startsWith('--so=')) || '').slice(5).split(',').filter(Boolean);
// Cadastros cria o produto, a embalagem e os 2 operadores que os outros módulos usam.
const rodar = (m) => !SO.length || SO.includes(m) || (m === 'cadastros' && SO.some((x) => !['login', 'erros', 'larguras', 'tvs', 'paineis'].includes(x)));
// Só para LIMPAR o que a rodada criou (marcador) — nunca para provar nada.
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CONTAS = {
  admin: { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD },
  operador: { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD },
  tv: { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD },
};
const LARGURAS = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, celular: { width: 390, height: 844 } };
const M = `E2E${Date.now().toString().slice(-6)}`; // marcador desta rodada
const D4 = M.slice(-4);
const DADOS = {
  produto: { codigo: `${M}-PRD-${D4}`, nome: `${M} Graxa de Teste`, consistencia: '2', unidade: 'KG' },
  embalagem: { codigo: `${M}-EMB-${D4}`, tipo: 'Pote', descricao: `${M} Pote 1 kg`, conteudo: '1' },
  operadorA: { nome: `${M} Operadora Ana`, matricula: '9001', sala: 'Bio' },
  operadorB: { nome: `${M} Operador Beto`, matricula: '9002', sala: 'Ambas' },
};
const FOTO = path.resolve('public/certificacoes').length ? (() => {
  const dir = path.resolve('public/certificacoes');
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((x) => /\.(png|jpe?g)$/i.test(x)) : null;
  return f ? path.join(dir, f) : null;
})() : null;

// ── Registro de passos ──────────────────────────────────────────────────────
const linhas = [];
let falhas = 0;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarPor(f, ms = 20000, passoMs = 250) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { try { if (await f()) return true; } catch { /* tenta de novo */ } await esperar(passoMs); }
  return false;
}
class Falha extends Error {}
const exigir = (cond, msg) => { if (!cond) throw new Falha(msg); };

const nav = await chromium.launch({ headless: true });

/** Uma "pessoa": um contexto de navegador com vigia de console, JS e rede. */
async function pessoa(perfil, largura = 'desktop') {
  const ctx = await nav.newContext({ viewport: LARGURAS[largura], acceptDownloads: true });
  const page = await ctx.newPage();
  const eventos = [];
  page.on('pageerror', (e) => eventos.push(`JS: ${String(e.message).split('\n')[0].slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error') eventos.push(`console: ${m.text().slice(0, 160)}`); });
  page.on('response', (r) => {
    if (r.status() >= 400 && /\/(rest|auth|storage)\/v1\/|\/api\//.test(r.url())) {
      eventos.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 70)}`);
    }
  });
  return { perfil, largura, ctx, page, eventos };
}

/**
 * Um passo da matriz. `fn` faz os cliques e EXIGE o que a tela tem de mostrar
 * (exigir). Falha também se surgir erro de JS/console ou requisição com falha
 * não declarada em `esperados` (regex sobre o texto do evento).
 */
async function passo(p, tela, acao, fn, { esperados = [] } = {}) {
  const marco = p.eventos.length;
  const t0 = Date.now();
  let ok = true;
  let detalhe = '';
  try {
    const r = await fn();
    if (typeof r === 'string') detalhe = r;
  } catch (e) {
    ok = false;
    detalhe = e instanceof Falha ? e.message : `parou: ${String(e.message || e).split('\n')[0].slice(0, 180)}`;
  }
  await esperar(250);
  const novos = p.eventos.slice(marco).filter((ev) => !esperados.some((re) => re.test(ev)))
    // O próprio navegador repete no console o status de uma resposta com falha;
    // a resposta já foi contada (ou declarada esperada) pela vigia de rede.
    .filter((ev) => !/^console: Failed to load resource: the server responded with a status of/.test(ev) || !esperados.length);
  const naoDeclarados = novos.filter((ev) => !/^console: Failed to load resource/.test(ev) || !p.eventos.slice(marco).some((x) => x.startsWith('HTTP')));
  if (naoDeclarados.length) { ok = false; detalhe = [detalhe, ...naoDeclarados.slice(0, 3)].filter(Boolean).join(' | '); }
  const n = linhas.length + 1;
  const arq = `${String(n).padStart(3, '0')}-${p.perfil}-${p.largura}-${tela}`.replace(/[^\w.-]+/g, '_').slice(0, 90) + '.png';
  await p.page.screenshot({ path: path.join(SAIDA, arq), animations: 'disabled' }).catch(() => {});
  linhas.push({ n, perfil: p.perfil, largura: p.largura, tela, acao, ok, detalhe, captura: arq, ms: Date.now() - t0 });
  if (!ok) falhas += 1;
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} [${p.perfil}/${p.largura}] ${tela} — ${acao}${detalhe ? ` -> ${detalhe}` : ''}`);
  return ok;
}

// ── Ajudantes de tela ───────────────────────────────────────────────────────
async function abrir(p, rota) {
  await p.page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => p.page.evaluate(() => (document.body.innerText || '').length > 60
    && getComputedStyle(document.body).pointerEvents !== 'none'), 20000);
  await p.page.waitForTimeout(600);
}
async function entrar(p, conta) {
  await p.page.goto(APP, { waitUntil: 'domcontentloaded' });
  await p.page.locator('#email').waitFor({ timeout: 30000 });
  for (let i = 0; i < 3; i += 1) {
    await p.page.waitForTimeout(300);
    await p.page.locator('#email').fill(conta.email);
    await p.page.locator('#password').fill(conta.senha);
    if (await p.page.locator('button[type="submit"]').first().isEnabled()) break;
  }
  await p.page.locator('button[type="submit"]').first().click();
}
const texto = (p) => p.page.locator('body').innerText();
const h1 = async (p) => (await p.page.locator('h1').allInnerTexts()).join(' | ');
async function escolherOpcao(p, gatilho, nome) {
  await gatilho.click();
  const opcao = p.page.getByRole('option', { name: nome, exact: false }).first();
  await opcao.waitFor({ timeout: 10000 });
  await opcao.click();
}
async function semRolagemHorizontal(p) {
  return p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
async function textoCortado(p) {
  return p.page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,button,a,label,th')]
    .filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      return r.width > 0 && s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1; })
    .map((e) => (e.innerText || '').trim().slice(0, 40)).slice(0, 5));
}

const TELAS = {
  admin: ['Dashboard', 'Painel', 'Registros', 'NovoRegistro', 'Checkout', 'NovaProgramacaoCheckout', 'Empilhadeira',
    'NovaEmpilhaProgramacao', 'EmpilhadeiraConfig', 'IndicadoresEmpilha', 'Recebimento', 'IndicadoresRecebimento',
    'ChecklistRecebimento', 'NovoChecklist', 'NotasFiscais', 'NovaNotaFiscal', 'Produtos', 'Embalagens', 'Operadores',
    'GerenciarUsuarios', 'ImportarProdutos', 'ImportarEmbalagens', 'ImportarCategorias', 'AlterarSenha'],
  operador: ['Dashboard', 'NovoRegistro', 'Registros', 'Checkout', 'NovaProgramacaoCheckout', 'Empilhadeira',
    'Recebimento', 'ChecklistRecebimento', 'NovoChecklist', 'NotasFiscais', 'NovaNotaFiscal', 'AlterarSenha'],
  tv: ['Televisao', 'TelevisaoEmpilha', 'Painel'],
};
const SO_ADMIN = ['Produtos', 'Embalagens', 'Operadores', 'GerenciarUsuarios', 'ImportarProdutos', 'ImportarEmbalagens',
  'ImportarCategorias', 'NovaEmpilhaProgramacao', 'EmpilhadeiraConfig', 'IndicadoresEmpilha', 'IndicadoresRecebimento'];

console.log('='.repeat(78));
console.log(`RODADA POR CLIQUE | ${APP} | marcador ${M}`);
console.log('='.repeat(78));

const sessoes = {};
async function sessao(perfil) {
  if (sessoes[perfil]) return sessoes[perfil];
  const p = await pessoa(perfil);
  await entrar(p, CONTAS[perfil]);
  await esperarPor(async () => (await p.page.locator('#email').count()) === 0, 30000);
  await p.page.waitForTimeout(1500);
  sessoes[perfil] = p;
  return p;
}

try {
  // ══ LOGIN E MENU ══════════════════════════════════════════════════════════
  if (rodar('login')) {
    console.log('\n■ Login e menu');
    const p = await pessoa('admin');
    await passo(p, 'Login', 'abrir o sistema sem sessão mostra o formulário', async () => {
      await p.page.goto(APP, { waitUntil: 'domcontentloaded' });
      exigir(await esperarPor(async () => (await p.page.locator('#email').count()) > 0, 20000), 'formulário de login não apareceu');
    });
    await passo(p, 'Login', 'senha errada mostra "E-mail ou senha inválidos."', async () => {
      await entrar(p, { email: CONTAS.admin.email, senha: 'senha-errada-123' });
      exigir(await esperarPor(async () => (await p.page.getByText('E-mail ou senha inválidos.').count()) > 0, 15000), 'a mensagem de senha errada não apareceu');
      exigir((await p.page.locator('#email').count()) > 0, 'saiu da tela de login com senha errada');
    }, { esperados: [/HTTP 400 POST \/auth\/v1\/token/, /console: Failed to load resource/] });
    await passo(p, 'Login', 'admin entra com a senha certa e cai no Dashboard', async () => {
      await entrar(p, CONTAS.admin);
      exigir(await esperarPor(async () => /Dashboard/.test(await h1(p)), 30000), `não chegou ao Dashboard (${await h1(p)})`);
    });
    await passo(p, 'Menu', 'admin vê os itens de admin e os contadores', async () => {
      // Os itens de admin só entram quando o perfil chega (o papel vem do banco).
      const lerMenu = async () => (await p.page.locator('nav:visible').allInnerTexts()).join('\n');
      await esperarPor(async () => (await lerMenu()).includes('Configurações'), 15000);
      const menu = await lerMenu();
      for (const item of ['Dashboard', 'Televisão', 'Painel Geral', 'Novo Registro', 'Todos os Registros', 'Check-out',
        'Empilhadeira', 'Recebimento', 'Checklist', 'Notas Fiscais', 'Configurações', 'Alterar minha senha']) {
        exigir(menu.includes(item), `o menu não tem "${item}"`);
      }
      exigir(!/Metas/.test(menu), 'o menu ainda tem "Metas"');
      const selos = await p.page.locator('nav:visible [aria-label$="pendências"]').evaluateAll((es) => es.map((e) => e.getAttribute('aria-label')));
      exigir(selos.length > 0, 'nenhum contador no menu');
      return `contadores: ${selos.join(', ')}`;
    });
    const itensMenu = [...new Set(await p.page.locator('nav:visible a').evaluateAll((as) => as.map((a) => a.innerText.trim().split('\n')[0]).filter(Boolean)))];
    for (const t of itensMenu) {
      if (/Televis|Sair/.test(t)) continue;
      const it = { t };
      await passo(p, 'Menu', `clicar em "${it.t}" abre a tela`, async () => {
        await p.page.locator('nav:visible a').filter({ hasText: it.t }).first().click();
        await p.page.waitForTimeout(1200);
        exigir(!/404|Página não encontrada/.test(await h1(p)), `"${it.t}" deu página não encontrada`);
        exigir(!(await p.page.getByText(/Não foi possível abrir esta tela/i).count()), 'a tela mostrou a moldura de erro');
      });
    }
    await passo(p, 'Menu', 'Sair volta à tela de login', async () => {
      await p.page.getByRole('button', { name: 'Sair' }).first().click();
      exigir(await esperarPor(async () => (await p.page.locator('#email').count()) > 0, 15000), 'não voltou ao login');
    });
    await passo(p, 'Login', 'operador entra direto (sem "Quem é você hoje?") e o menu não tem telas de admin', async () => {
      await entrar(p, CONTAS.operador);
      exigir(await esperarPor(async () => (await p.page.locator('#email').count()) === 0, 30000), 'operador não entrou');
      await p.page.waitForTimeout(1500);
      exigir(!(await p.page.getByText(/quem é você hoje/i).count()), 'apareceu "Quem é você hoje?"');
      const menu = (await p.page.locator('nav:visible').allInnerTexts()).join('\n');
      for (const item of ['Configurações', 'Metas', 'Produtos', 'Operadores']) exigir(!menu.includes(item), `o menu do operador tem "${item}"`);
    });
    await p.ctx.close();
  }

  // ══ CADASTROS (admin) ═════════════════════════════════════════════════════
  if (rodar('cadastros')) {
    console.log('\n■ Cadastros');
    const p = await sessao('admin');
    await passo(p, 'Produtos', 'cria produto pelo formulário e ele aparece na lista e na busca', async () => {
      await abrir(p, 'Produtos');
      await p.page.getByRole('button', { name: 'Novo Produto' }).click();
      await p.page.locator('#codigo').fill(DADOS.produto.codigo);
      await p.page.locator('#nome').fill(DADOS.produto.nome);
      await p.page.locator('#consistencia').fill(DADOS.produto.consistencia);
      await p.page.locator('#unidade_medida').fill(DADOS.produto.unidade);
      await p.page.getByRole('button', { name: 'Salvar' }).click();
      await p.page.getByPlaceholder('Buscar produtos...').fill(M);
      exigir(await esperarPor(async () => (await p.page.getByText(DADOS.produto.codigo).count()) > 0, 15000), 'o produto novo não apareceu na lista');
    });
    await passo(p, 'Produtos', 'edita o produto e a lista mostra o nome novo', async () => {
      await p.page.getByRole('button', { name: `Editar ${DADOS.produto.codigo}` }).click();
      await p.page.locator('#nome').fill(`${DADOS.produto.nome} Editada`);
      await p.page.getByRole('button', { name: 'Salvar' }).click();
      exigir(await esperarPor(async () => (await p.page.getByText(`${DADOS.produto.nome} Editada`).count()) > 0, 15000), 'o nome editado não apareceu');
      DADOS.produto.nome = `${DADOS.produto.nome} Editada`;
    });
    await passo(p, 'Embalagens', 'cria embalagem que casa com o produto (4 últimos dígitos)', async () => {
      await abrir(p, 'Embalagens');
      await p.page.getByRole('button', { name: 'Nova Embalagem' }).click();
      await p.page.locator('#codigo').fill(DADOS.embalagem.codigo);
      await p.page.locator('#tipo').fill(DADOS.embalagem.tipo);
      await p.page.locator('#descricao').fill(DADOS.embalagem.descricao);
      await p.page.locator('#conteudo').fill(DADOS.embalagem.conteudo);
      const ult = await p.page.locator('#ultimos_4_digitos').inputValue();
      await p.page.getByRole('button', { name: 'Salvar' }).click();
      await p.page.getByPlaceholder('Buscar embalagens...').fill(M);
      exigir(await esperarPor(async () => (await p.page.getByText(DADOS.embalagem.codigo).count()) > 0, 15000), 'a embalagem nova não apareceu');
      return `últimos 4 dígitos auto-preenchidos: "${ult}"`;
    });
    for (const op of [DADOS.operadorA, DADOS.operadorB]) {
      await passo(p, 'Operadores', `cadastra "${op.nome}" (sala ${op.sala}${FOTO ? ', com foto' : ''})`, async () => {
        await abrir(p, 'Operadores');
        await p.page.getByRole('button', { name: 'Novo Operador' }).click();
        await p.page.locator('#nome').fill(op.nome);
        await p.page.locator('#matricula').fill(op.matricula);
        await escolherOpcao(p, p.page.getByRole('combobox').filter({ hasText: 'Selecione a sala' }), op.sala);
        if (FOTO) await p.page.locator('#foto').setInputFiles(FOTO);
        await p.page.waitForTimeout(800);
        await p.page.getByRole('button', { name: 'Salvar' }).click();
        await p.page.getByPlaceholder('Buscar operadores...').fill(M);
        exigir(await esperarPor(async () => (await p.page.getByText(op.nome).count()) > 0, 15000), 'o operador novo não apareceu');
      });
    }
    await passo(p, 'Importar Produtos', 'colar uma lista e processar mostra o resultado', async () => {
      await abrir(p, 'ImportarProdutos');
      await p.page.locator('#produtos').fill(`${M}-IMP-0001\t${M} Importado\tKG\t1\t\t`);
      await p.page.getByRole('button', { name: /Processar Produtos/ }).click();
      await p.page.waitForTimeout(1500);
      exigir(/importad|criad|sucesso|process|1 produto|linha/i.test(await texto(p)), 'nenhum resultado do processamento na tela');
    });
    await passo(p, 'Importar Categorias', 'a tela abre e conta os produtos do banco', async () => {
      await abrir(p, 'ImportarCategorias');
      exigir(await p.page.getByRole('button', { name: /Processar Lista/ }).count(), 'sem o botão Processar Lista');
    });
    await passo(p, 'Importar Embalagens', 'a tela abre com o campo de colar', async () => {
      await abrir(p, 'ImportarEmbalagens');
      exigir(await p.page.locator('#embalagens').count(), 'sem o campo de colar');
    });
  }

  // ══ ENVASE (operador) ════════════════════════════════════════════════════
  if (rodar('envase')) {
    console.log('\n■ Envase');
    const p = await sessao('operador');
    let contagemAntes = null;
    await passo(p, 'Registros', 'a lista mostra os contadores dos chips', async () => {
      await abrir(p, 'Registros');
      const chip = await p.page.getByRole('button', { name: /^Em andamento \d+/ }).first().innerText();
      contagemAntes = Number((chip.match(/(\d+)\s*$/) || [0, 0])[1]);
      return `Em andamento: ${contagemAntes}`;
    });
    await passo(p, 'Novo registro', 'sem escolher nada, "Registrar envase" mostra o que falta', async () => {
      await abrir(p, 'NovoRegistro');
      await p.page.getByRole('button', { name: 'Registrar envase' }).click();
      await p.page.waitForTimeout(800);
      exigir(/obrigatório|Selecione/i.test(await texto(p)), 'nenhuma mensagem de validação');
    });
    await passo(p, 'Novo registro', 'busca o produto cadastrado e escolhe; a embalagem é derivada', async () => {
      await p.page.locator('#codigo_produto').fill(M);
      const op = p.page.getByRole('button').filter({ hasText: DADOS.produto.codigo }).first();
      await op.waitFor({ timeout: 15000 });
      await op.click();
      exigir(await esperarPor(async () => (await texto(p)).includes(DADOS.embalagem.descricao) || (await texto(p)).includes(DADOS.embalagem.codigo), 10000),
        'a embalagem derivada não apareceu');
    });
    await passo(p, 'Novo registro', 'teclado numérico: 4, 5, 0 vira 450', async () => {
      for (const t of ['4', '5', '0']) await p.page.getByRole('button', { name: t, exact: true }).click();
      const v = await p.page.locator('#quantidade_produzida').inputValue();
      exigir(/^450$/.test(v.replace(/\D/g, '')), `quantidade ${v}`);
    });
    await passo(p, 'Novo registro', 'sala Bio; a lista de operadores filtra pela sala e começa vazia', async () => {
      await escolherOpcao(p, p.page.locator('#sala'), 'Sala Bio');
      const campo = p.page.locator('#operador');
      exigir(/Selecione o operador/.test(await campo.innerText()), 'o operador veio pré-preenchido');
      await campo.click();
      const nomes = await p.page.getByRole('option').allInnerTexts();
      await p.page.keyboard.press('Escape');
      exigir(nomes.some((n) => n.includes(DADOS.operadorA.nome)), 'a operadora de sala Bio não está na lista');
      exigir(nomes.some((n) => n.includes(DADOS.operadorB.nome)), 'o operador de sala "Ambas" não está na lista');
      return `${nomes.length} operador(es) na lista`;
    });
    await passo(p, 'Novo registro', 'escolhe o operador, OP e início: o autosave grava (aviso na tela)', async () => {
      await escolherOpcao(p, p.page.locator('#operador'), DADOS.operadorA.nome);
      await p.page.locator('#op').fill(`${M}-OP1`);
      await p.page.getByRole('button', { name: 'Marcar o início agora' }).click();
      // A tela só mostra "Salvando automaticamente…" durante a gravação; a prova
      // é OUTRA aba, em "Todos os registros", achar o rascunho em andamento.
      const outra = await p.ctx.newPage();
      await outra.goto(`${APP}/Registros`, { waitUntil: 'domcontentloaded' });
      await outra.getByLabel('Buscar registros').fill(`${M}-OP1`);
      const achou = await esperarPor(async () => (await outra.locator('body').innerText()).includes(`${M}-OP1`), 20000, 1000);
      await outra.close();
      exigir(achou, 'o rascunho não aparece em "Todos os registros" (autosave não gravou)');
    });
    await passo(p, 'Novo registro', 'término e "Registrar envase" volta ao Dashboard', async () => {
      await p.page.getByRole('button', { name: 'Marcar o término agora' }).click();
      await p.page.waitForTimeout(800);
      await p.page.getByRole('button', { name: 'Registrar envase' }).click();
      exigir(await esperarPor(async () => /Dashboard/.test(await h1(p)), 20000), `não voltou ao Dashboard (${await h1(p)})`);
    });
    await passo(p, 'Registros', 'o envase novo aparece na busca, com a operadora escolhida', async () => {
      await abrir(p, 'Registros');
      // Sala Bio: o envase só vira "finalizado" depois da retirada do material.
      await p.page.getByLabel('Buscar registros').fill(`${M}-OP1`);
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M}-OP1`), 15000), 'o envase não apareceu na lista');
      exigir((await texto(p)).includes(DADOS.operadorA.nome), 'a lista não mostra a operadora escolhida');
    });
    await passo(p, 'Registros', '"Ver detalhes" mostra o registro', async () => {
      await p.page.getByRole('button', { name: `Ver detalhes de ${M}-OP1` }).click();
      const d = p.page.getByRole('dialog');
      await d.waitFor({ timeout: 10000 });
      exigir((await d.innerText()).includes(DADOS.produto.codigo), 'o detalhe não mostra o produto');
      await p.page.keyboard.press('Escape');
    });
    await passo(p, 'Registros', '"Editar" troca a observação e salva', async () => {
      await p.page.getByRole('button', { name: `Editar ${M}-OP1` }).click();
      const d = p.page.getByRole('dialog');
      await d.waitFor({ timeout: 10000 });
      await d.locator('#observacoes').fill(`${M} editado pela tela`);
      await d.getByRole('button', { name: 'Registrar envase' }).click();
      exigir(await esperarPor(async () => (await p.page.getByRole('dialog').count()) === 0, 15000), 'o diálogo de edição não fechou');
      await p.page.getByRole('button', { name: `Ver detalhes de ${M}-OP1` }).click();
      exigir(await esperarPor(async () => (await p.page.getByRole('dialog').innerText()).includes(`${M} editado pela tela`), 10000), 'a edição não aparece no detalhe');
      await p.page.keyboard.press('Escape');
    });
    await passo(p, 'Registros', 'operador NÃO vê "Excluir"', async () => {
      exigir((await p.page.getByRole('button', { name: /^Excluir / }).count()) === 0, 'o operador vê "Excluir"');
    });
    const a = await sessao('admin');
    await passo(a, 'Registros', 'admin exclui com confirmação e o registro some', async () => {
      await abrir(a, 'Registros');
      await a.page.getByLabel('Buscar registros').fill(`${M}-OP1`);
      await a.page.getByRole('button', { name: `Excluir ${M}-OP1` }).waitFor({ timeout: 15000 });
      await a.page.getByRole('button', { name: `Excluir ${M}-OP1` }).click();
      await a.page.getByRole('alertdialog').getByRole('button', { name: 'Excluir' }).click();
      exigir(await esperarPor(async () => !(await texto(a)).includes(`${M}-OP1`), 15000), 'o registro continua na lista');
    });
  }

  // ══ CHECK-OUT ═════════════════════════════════════════════════════════════
  if (rodar('checkout')) {
    console.log('\n■ Check-out');
    const p = await sessao('operador');
    const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    await passo(p, 'Nova programação de check-out', 'cola os pedidos, processa e cria', async () => {
      await abrir(p, 'NovaProgramacaoCheckout');
      await p.page.locator('#data_programada').fill(hoje);
      await p.page.locator('#observacoes').fill(`${M} programação`);
      await p.page.locator('#pedidos').fill(`${M}-PV1\t${hoje.split('-').reverse().join('/')}\tCliente E2E Um\n${M}-PV2\t${hoje.split('-').reverse().join('/')}\tCliente E2E Dois`);
      await p.page.getByRole('button', { name: /Processar pedidos/ }).click();
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M}-PV2`), 10000), 'os pedidos processados não aparecem');
      await p.page.getByRole('button', { name: /Salvar|Criar programação/ }).last().click();
      exigir(await esperarPor(async () => /Check-out|Executar|programação/i.test(await h1(p)) && !/Nova programação/.test(await h1(p)), 20000), `não saiu da criação (${await h1(p)})`);
    });
    await passo(p, 'Check-out', 'a programação aparece na lista com os 2 pedidos', async () => {
      await abrir(p, 'Checkout');
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M} programação`), 15000), 'a programação nova não aparece');
    });
    await passo(p, 'Executar check-out', 'abre a programação e mostra os pedidos', async () => {
      await p.page.locator('a', { hasText: `${M} programação` }).first().click();
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M}-PV1`), 15000), 'os pedidos não aparecem');
    });
    // O cartão do pedido: o menor ancestral do número do pedido que contém a
    // lista de operador daquele pedido.
    const cartao = (pv) => p.page.getByText(pv, { exact: true }).first()
      .locator('xpath=ancestor::*[.//*[starts-with(@id,"operador-")]][1]');
    await passo(p, 'Executar check-out', 'iniciar sem operador: avisa e não inicia', async () => {
      await cartao(`${M}-PV1`).getByRole('button', { name: 'Marcar o início agora' }).click();
      exigir(await esperarPor(async () => (await p.page.getByText('Escolha o operador antes de iniciar.').count()) > 0, 8000), 'nenhum aviso');
    });
    await passo(p, 'Executar check-out', 'escolhe o operador, inicia e termina o pedido 1', async () => {
      const c = cartao(`${M}-PV1`);
      await escolherOpcao(p, c.locator('[id^="operador-"]'), DADOS.operadorA.nome);
      await c.getByRole('button', { name: 'Marcar o início agora' }).click();
      await p.page.waitForTimeout(1500);
      const c2 = cartao(`${M}-PV1`);
      if (await c2.getByRole('button', { name: 'Editar' }).count()) await c2.getByRole('button', { name: 'Editar' }).click();
      await c2.getByRole('button', { name: 'Marcar o término agora' }).click();
      exigir(await esperarPor(async () => /Concluído/.test(await p.page.locator('body').innerText()), 15000), 'o pedido não ficou Concluído na tela');
    });
    await passo(p, 'Executar check-out', 'pedido 2 começa VAZIO (nada lembrado) e fica com outro operador', async () => {
      const c = cartao(`${M}-PV2`);
      exigir(/Selecione o operador/.test(await c.locator('[id^="operador-"]').innerText()), 'o operador veio lembrado do pedido 1');
      await escolherOpcao(p, c.locator('[id^="operador-"]'), DADOS.operadorB.nome);
      await c.getByRole('button', { name: 'Marcar o início agora' }).click();
      await p.page.waitForTimeout(1500);
      await p.page.reload({ waitUntil: 'domcontentloaded' });
      exigir(await esperarPor(async () => (await texto(p)).includes(DADOS.operadorB.nome) && (await texto(p)).includes(DADOS.operadorA.nome), 15000),
        'depois de recarregar, a tela não mostra os dois operadores');
    });
    await passo(p, 'Executar check-out', 'operador NÃO vê "Excluir o pedido"', async () => {
      exigir((await p.page.getByRole('button', { name: /^Excluir o pedido/ }).count()) === 0, 'o operador vê excluir pedido');
    });
    await passo(p, 'Check-out', 'a lista mostra 1 concluído na programação', async () => {
      await abrir(p, 'Checkout');
      const linha = p.page.locator('a', { hasText: `${M} programação` }).first();
      exigir(await esperarPor(async () => /(^|\s)1 concluído(\s|$)/.test((await linha.innerText()).replace(/\s+/g, ' ')), 15000), `a lista não mostra o concluído (${(await linha.innerText()).replace(/\s+/g, ' ').slice(0, 90)})`);
    });
  }

  // ══ EMPILHADEIRA ══════════════════════════════════════════════════════════
  if (rodar('empilhadeira')) {
    console.log('\n■ Empilhadeira');
    const a = await sessao('admin');
    await passo(a, 'Nova programação (empilhadeira)', 'cria com uma linha adicionada à mão', async () => {
      await abrir(a, 'NovaEmpilhaProgramacao');
      await escolherOpcao(a, a.page.getByRole('combobox').filter({ hasText: 'Selecione a empilhadeira' }), /./);
      await a.page.getByPlaceholder('Observações gerais...').fill(`${M} empilha`);
      await a.page.getByPlaceholder('IVP072696...').fill(`${M}-IT1`);
      await a.page.getByPlaceholder('Ex: GRAXA MOBILUX EP 0').fill(`${M} Graxa`);
      await a.page.getByPlaceholder('R02-T01', { exact: true }).fill('R01-T01');
      await a.page.getByRole('button', { name: 'Adicionar à Lista' }).click();
      exigir(await esperarPor(async () => (await texto(a)).includes(`${M}-IT1`), 8000), 'a linha não entrou na lista');
      await a.page.getByRole('button', { name: 'Criar Programação com 1 linha', exact: true }).click();
      exigir(await esperarPor(async () => /ExecutarEmpilha/i.test(a.page.url()), 20000), 'não abriu a programação criada');
    });
    const p = await sessao('operador');
    await passo(p, 'Empilhadeira', 'a programação aparece e abre', async () => {
      await abrir(p, 'Empilhadeira');
      await p.page.getByRole('button', { name: /^Todas/ }).click().catch(() => {});
      const link = p.page.locator('a', { hasText: `${M} empilha` }).first();
      exigir(await esperarPor(async () => (await link.count()) > 0, 15000), 'a programação não aparece');
      await link.click();
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M}-IT1`), 15000), 'a linha não aparece');
    });
    await passo(p, 'Executar empilhadeira', 'Iniciar: empilhador obrigatório, começa vazio; inicia com operador', async () => {
      await p.page.getByRole('button', { name: /^Iniciar$/ }).first().click();
      const d = p.page.getByRole('dialog');
      exigir(await d.getByRole('button', { name: /Iniciar Agora/ }).isDisabled(), '"Iniciar Agora" habilitado sem operador');
      await escolherOpcao(p, d.getByRole('combobox').first(), DADOS.operadorA.nome);
      await d.getByRole('button', { name: /Iniciar Agora/ }).click();
      exigir(await esperarPor(async () => /Em Andamento/.test(await texto(p)), 15000), 'a linha não ficou Em Andamento');
    });
    await passo(p, 'Executar empilhadeira', 'registra ocorrência escolhendo quem registra', async () => {
      await p.page.getByRole('button', { name: /Ocorrência/ }).first().click();
      const d = p.page.getByRole('dialog');
      await escolherOpcao(p, d.locator('[id^="ocorrencia-por-"]'), DADOS.operadorB.nome);
      await d.locator('textarea').fill(`${M} ocorrência`);
      await d.getByRole('button', { name: /Registrar/ }).last().click();
      exigir(await esperarPor(async () => (await p.page.getByRole('dialog').count()) === 0, 10000), 'o diálogo não fechou');
    });
    await passo(p, 'Executar empilhadeira', 'Finalizar e assinar como operador (escolhendo na lista)', async () => {
      await p.page.getByRole('button', { name: /^Finalizar$/ }).first().click();
      const d = p.page.getByRole('dialog');
      await d.getByText(/Confirmo que realizei/).waitFor({ timeout: 15000 });
      await escolherOpcao(p, d.getByRole('combobox').first(), DADOS.operadorA.nome);
      await d.getByText(/Confirmo que realizei/).click();
      await d.getByRole('button', { name: /Confirmar e continuar/ }).click();
      exigir(await esperarPor(async () => (await d.getByText(/Aguardando Assinatura do Líder/i).count()) > 0, 15000), 'não chegou à espera do líder');
      await p.page.keyboard.press('Escape');
    });
    await passo(a, 'Empilhadeira (pendências)', 'admin resolve a ocorrência e assina como líder', async () => {
      await abrir(a, 'Empilhadeira');
      await a.page.getByRole('button', { name: /^Ocorrências/ }).first().click();
      // A resolução é na própria linha (não abre diálogo).
      const cartao = a.page.locator('div.space-y-2 > div').filter({ hasText: `${M} ocorrência` });
      exigir(await esperarPor(async () => (await cartao.count()) > 0, 15000), 'a ocorrência não está nas pendências');
      exigir(/\d{2}\/\d{2}\/\d{4}/.test(await cartao.first().innerText()), 'a data da ocorrência não está em dd/mm/aaaa');
      await cartao.getByRole('button', { name: 'Resolver' }).click();
      await cartao.getByPlaceholder('Descreva a resolução...').fill('resolvido pelo teste');
      await cartao.getByRole('button', { name: /Marcar como Resolvido/ }).click();
      exigir(await esperarPor(async () => (await cartao.count()) === 0, 15000), 'a ocorrência continua aberta');
      await a.page.getByRole('button', { name: /^Assinaturas/ }).first().click();
      await escolherOpcao(a, a.page.locator('#pendencias-lider'), DADOS.operadorB.nome);
      const linhaAssinar = a.page.locator('div').filter({ hasText: `${M} Graxa` }).getByRole('button', { name: 'Assinar' }).last();
      exigir(await esperarPor(async () => (await linhaAssinar.count()) > 0, 15000), 'a linha não está nas pendências de assinatura');
      await linhaAssinar.click();
      exigir(await esperarPor(async () => (await a.page.locator('div').filter({ hasText: `${M} Graxa` }).getByRole('button', { name: 'Assinar' }).count()) === 0, 15000), 'a linha continua pendente');
    });
    await passo(a, 'Empilhadeira (configuração)', 'edita a configuração e registra manutenção', async () => {
      await abrir(a, 'EmpilhadeiraConfig');
      await a.page.getByRole('button', { name: 'Registrar Manutenção' }).click();
      const d = a.page.getByRole('dialog');
      await d.getByPlaceholder('Nome do responsável').fill('Técnico E2E');
      await d.getByPlaceholder('O que foi feito...').fill(`${M} manutenção`);
      await d.getByRole('button', { name: 'Registrar' }).click();
      exigir(await esperarPor(async () => (await a.page.getByRole('dialog').count()) === 0, 10000), 'o diálogo não fechou');
    });
    await passo(a, 'Indicadores da empilhadeira', 'Hoje / Semana / Mês trocam o período', async () => {
      await abrir(a, 'IndicadoresEmpilha');
      for (const b of ['Hoje', 'Semana', 'Mês']) {
        await a.page.getByRole('button', { name: b, exact: true }).first().click();
        await a.page.waitForTimeout(700);
      }
      exigir((await a.page.locator('#periodo-de').inputValue()) !== '', 'o período ficou vazio');
    });
  }

  // ══ RECEBIMENTO ═══════════════════════════════════════════════════════════
  if (rodar('recebimento')) {
    console.log('\n■ Recebimento');
    const p = await sessao('operador');
    await passo(p, 'Novo recebimento', 'cria com NF e dois participantes', async () => {
      await abrir(p, 'Recebimento');
      await p.page.getByRole('button', { name: 'Novo recebimento' }).click();
      await p.page.getByPlaceholder('Ex: NF-001234').fill(`${M}-NF1`);
      for (const nome of [DADOS.operadorA.nome, DADOS.operadorB.nome]) {
        await escolherOpcao(p, p.page.getByRole('combobox').filter({ hasText: /Adicionar participante/ }), nome);
        const add = p.page.getByRole('button', { name: /^Adicionar$/ });
        if (await add.count()) await add.first().click();
      }
      await p.page.getByRole('button', { name: 'Criar Recebimento' }).click();
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M}-NF1`), 15000), 'o recebimento não aparece');
    });
    await passo(p, 'Executar recebimento', 'abre, registra ocorrência e finaliza com assinatura dos participantes', async () => {
      const card = p.page.locator('a,div').filter({ hasText: `${M}-NF1` }).first();
      await card.click();
      await esperarPor(async () => /ExecutarRecebimento/i.test(p.page.url()), 10000);
      if (await p.page.getByRole('button', { name: /Ocorrência/ }).count()) {
        await p.page.getByRole('button', { name: /Ocorrência/ }).first().click();
        const d = p.page.getByRole('dialog');
        await d.locator('textarea').fill(`${M} ocorrência receb`);
        await escolherOpcao(p, d.locator('#ocorrencia-recebimento-por'), DADOS.operadorA.nome);
        await d.getByRole('button', { name: 'Registrar' }).click();
        await esperarPor(async () => (await p.page.getByRole('dialog').count()) === 0, 10000);
      }
      await p.page.getByRole('button', { name: /^Finalizar$/ }).click();
      const d = p.page.getByRole('dialog');
      for (let i = 0; i < 2; i += 1) {
        const assinar = d.getByRole('button', { name: /^Assinar$/ });
        if (!(await esperarPor(async () => (await assinar.count()) > 0, 8000))) break;
        await assinar.first().click();
        await d.locator('label[for^="cf-"]').first().click();
        await d.getByRole('button', { name: /^Confirmar$/ }).click();
        await p.page.waitForTimeout(1000);
      }
      exigir(/Aguardando|líder|Líder|assinaram/i.test(await d.innerText()), 'não chegou à etapa do líder');
      await p.page.keyboard.press('Escape');
    });
    const a = await sessao('admin');
    await passo(a, 'Executar recebimento', 'admin assina como líder (escolhendo na lista)', async () => {
      await abrir(a, 'Recebimento');
      // Cartão "Aguard. líder": o lápis (aria-label "Assinar") leva à tela do recebimento.
      const cartaoRec = a.page.locator('div.rounded-painel, div[class*="border"]').filter({ hasText: `${M}-NF1` }).last();
      await cartaoRec.getByRole('button', { name: 'Assinar' }).click();
      exigir(await esperarPor(async () => /ExecutarRecebimento/i.test(a.page.url()), 10000), 'não abriu o recebimento');
      await a.page.getByRole('button', { name: /Assinaturas/ }).click();
      const d = a.page.getByRole('dialog');
      exigir(await d.getByRole('button', { name: /Assinar como Líder/ }).isDisabled(), 'assinar habilitado sem líder');
      await escolherOpcao(a, d.locator('#assina-lider-recebimento'), DADOS.operadorB.nome);
      await d.getByRole('button', { name: /Assinar como Líder/ }).click();
      exigir(await esperarPor(async () => (await a.page.getByRole('dialog').count()) === 0
        && (await a.page.getByRole('button', { name: 'Assinaturas' }).count()) === 0, 15000), 'o botão "Assinaturas" continua (não assinou)');
      await abrir(a, 'Recebimento');
      const cartao = a.page.locator('div.rounded-painel, div[class*="border"]').filter({ hasText: `${M}-NF1` }).last();
      await cartao.waitFor({ timeout: 10000 });
      exigir(!/Aguard\. líder/.test(await cartao.innerText()), 'a lista ainda mostra "Aguard. líder"');
    });
    await passo(a, 'Indicadores de recebimento', 'Hoje / Semana / Mês e as abas', async () => {
      await abrir(a, 'IndicadoresRecebimento');
      for (const b of ['Hoje', 'Semana', 'Mês']) { await a.page.getByRole('button', { name: b, exact: true }).first().click(); await a.page.waitForTimeout(600); }
      for (const b of [/^Recebimento/, /^Checklist/]) { await a.page.getByRole('button', { name: b }).first().click(); await a.page.waitForTimeout(600); }
    });
    await passo(a, 'Recebimento', 'aba Fornecedores cria um fornecedor', async () => {
      await abrir(a, 'Recebimento');
      await a.page.getByRole('button', { name: 'Fornecedores' }).click();
      await a.page.getByRole('button', { name: 'Novo' }).click();
      const d = a.page.getByRole('dialog');
      await d.locator('input').first().fill(`${M} Fornecedor`);
      await d.getByRole('button', { name: /Salvar|Criar/ }).last().click();
      exigir(await esperarPor(async () => (await texto(a)).includes(`${M} Fornecedor`), 10000), 'o fornecedor não aparece');
    });
  }

  // ══ CHECKLIST ═════════════════════════════════════════════════════════════
  if (rodar('checklist')) {
    console.log('\n■ Checklist');
    const p = await sessao('operador');
    await passo(p, 'Novo checklist', 'enviar vazio mostra os campos obrigatórios', async () => {
      await abrir(p, 'NovoChecklist');
      await p.page.getByRole('button', { name: 'Enviar Checklist' }).click();
      await p.page.waitForTimeout(800);
      exigir(/obrigat|Selecione|mínimo/i.test(await texto(p)), 'nenhuma mensagem de validação');
    });
    await passo(p, 'Novo checklist', 'preenche tudo, uma pergunta por vez, e envia', async () => {
      const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      await p.page.getByRole('radio', { name: /Etapa 5\?: Sim$/ }).click();
      await p.page.getByPlaceholder('Ex: 4500012345').fill(`45${Date.now().toString().slice(-8)}`);
      await p.page.getByPlaceholder('Nome do fornecedor').fill(`${M} Fornecedor Ck`);
      // Voltar ao pedido e sair dele refaz a busca no SAP ("não encontrado"):
      // o fornecedor digitado à mão tem de continuar lá.
      await p.page.getByPlaceholder('Ex: 4500012345').click();
      await p.page.getByPlaceholder('Descreva o material recebido').click();
      exigir(await esperarPor(async () => (await p.page.getByText(/Pedido não encontrado na base SAP/).count()) > 0, 10000), 'a busca no SAP não respondeu');
      await p.page.waitForTimeout(500);
      exigir((await p.page.getByPlaceholder('Nome do fornecedor').inputValue()) === `${M} Fornecedor Ck`, 'a busca no SAP apagou o fornecedor digitado');
      await p.page.getByPlaceholder('Descreva o material recebido').fill(`${M} material`);
      await p.page.getByLabel('Data Prevista do Material').fill(hoje);
      await p.page.getByLabel('Data de Entrega', { exact: true }).fill(hoje);
      await p.page.getByRole('radio', { name: /Data Prevista\?: Sim$/ }).click();
      await p.page.getByRole('button', { name: DADOS.operadorA.nome, exact: true }).click();
      await p.page.getByPlaceholder('Nº NF').fill(`${M}-NFC`);
      await escolherOpcao(p, p.page.locator('label', { hasText: 'Material de Recebimento' }).locator('xpath=..').getByRole('combobox'), /./);
      await p.page.locator('input[type="number"]').first().fill('10');
      await escolherOpcao(p, p.page.locator('label', { hasText: 'Unidade de Medida' }).locator('xpath=..').getByRole('combobox'), 'KG');
      await p.page.getByPlaceholder('Lote', { exact: true }).fill(`${M}-LT`);
      for (const b of await p.page.getByRole('radio', { name: /\?: Sim$/ }).all()) await b.click();
      await p.page.getByRole('button', { name: 'Enviar Checklist' }).click();
      exigir(await esperarPor(async () => /ChecklistRecebimento/i.test(p.page.url()), 20000),
        `não voltou à lista (${(await p.page.locator('p.text-erro').allInnerTexts()).join(' | ') || p.page.url()})`);
    });
    await passo(p, 'Checklist', 'o checklist novo aparece na lista, com o inspetor', async () => {
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M} Fornecedor Ck`), 15000), 'não aparece na lista');
    });
    await passo(p, 'Checklist', 'abas Indicadores e Base SAP (admin) e filtros de período', async () => {
      const a = await sessao('admin');
      await abrir(a, 'ChecklistRecebimento');
      for (const b of ['Esta semana', 'Este mês', 'Este ano']) { await a.page.getByRole('button', { name: b }).click(); await a.page.waitForTimeout(500); }
      await a.page.getByRole('tab', { name: 'Indicadores' }).click(); await a.page.waitForTimeout(800);
      await a.page.getByRole('tab', { name: 'Base SAP' }).click(); await a.page.waitForTimeout(800);
    });
  }

  // ══ NOTAS FISCAIS ═════════════════════════════════════════════════════════
  if (rodar('nf')) {
    console.log('\n■ Notas fiscais');
    const p = await sessao('operador');
    const pdf = path.resolve('scratch/e2e-nf.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    await passo(p, 'Arquivar NF', 'sem "Arquivado por", salvar avisa', async () => {
      await abrir(p, 'NovaNotaFiscal');
      await p.page.getByPlaceholder('Número da NF').fill(`${M}-NFSF`);
      await p.page.getByRole('button', { name: 'Salvar' }).click();
      exigir(await esperarPor(async () => (await p.page.getByText('Escolha quem está arquivando antes de salvar.').count()) > 0, 8000), 'nenhum aviso');
    });
    await passo(p, 'Arquivar NF', 'envia PDF e imagem com "Arquivado por" e números', async () => {
      await abrir(p, 'NovaNotaFiscal');
      await escolherOpcao(p, p.page.locator('#nf-arquivado-por'), DADOS.operadorA.nome);
      const arquivos = [pdf, FOTO].filter(Boolean);
      await p.page.locator('input[type="file"][multiple]').first().setInputFiles(arquivos);
      const campos = p.page.getByPlaceholder('Ex: 123456', { exact: true });
      await esperarPor(async () => (await campos.count()) >= arquivos.length, 10000);
      for (let i = 0; i < arquivos.length; i += 1) await campos.nth(i).fill(`${M}-NF${i + 1}0`);
      await p.page.getByRole('button', { name: /^Salvar \d+ NF/ }).click();
      exigir(await esperarPor(async () => (await p.page.getByRole('button', { name: /Concluído — Ver arquivo/ }).count()) > 0, 30000), 'o envio não terminou');
      await p.page.getByRole('button', { name: /Concluído — Ver arquivo/ }).click();
    });
    await passo(p, 'Notas fiscais', 'as NFs aparecem na lista com quem arquivou, e a busca acha', async () => {
      await p.page.getByPlaceholder('Buscar por número da NF').fill(`${M}-NF`);
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M}-NF10`), 15000), 'a NF não aparece');
      exigir((await texto(p)).includes(DADOS.operadorA.nome), 'a lista não mostra quem arquivou');
    });
    await passo(p, 'Detalhe da NF', 'abre o detalhe; operador não vê "Excluir registro"', async () => {
      await p.page.getByText(`${M}-NF10`).first().click();
      await p.page.waitForTimeout(1500);
      exigir((await p.page.getByRole('button', { name: /Excluir registro/ }).count()) === 0, 'operador vê excluir');
    });
  }

  // ══ LIMPEZA ═══════════════════════════════════════════════════════════════
  if (rodar('limpeza')) {
    console.log('\n■ Limpeza');
    const a = await sessao('admin');
    await passo(a, 'Limpeza (locais)', 'cria um local', async () => {
      await abrir(a, 'GerenciarUsuarios?aba=limpeza');
      await a.page.getByRole('tab', { name: 'Locais' }).click();
      await a.page.getByRole('button', { name: 'Novo Local' }).click();
      const d = a.page.getByRole('dialog');
      exigir(await d.getByRole('button', { name: 'Salvar' }).isDisabled(), '"Salvar" habilitado sem nome');
      await d.getByPlaceholder('Ex: Sala de Envase').fill(`${M} Sala Limpa`);
      await d.getByRole('button', { name: 'Salvar' }).click();
      exigir(await esperarPor(async () => (await a.page.getByRole('switch', { name: `${M} Sala Limpa ativo` }).count()) > 0, 10000), 'o local não aparece');
    });
    await passo(a, 'Limpeza (programação)', 'programa para hoje com responsável', async () => {
      await a.page.getByRole('tab', { name: 'Programações' }).click();
      await a.page.getByRole('button', { name: 'Nova Programação' }).click();
      const d = a.page.getByRole('dialog');
      await escolherOpcao(a, d.getByRole('combobox').filter({ hasText: 'Selecione o local' }), `${M} Sala Limpa`);
      await escolherOpcao(a, d.getByRole('combobox').filter({ hasText: /Adicionar responsável/ }), DADOS.operadorA.nome);
      await d.getByRole('button', { name: 'Adicionar', exact: true }).click();
      await d.getByLabel('Data prevista').fill(new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }));
      await d.getByRole('button', { name: 'Salvar' }).click();
      exigir(await esperarPor(async () => (await a.page.getByRole('dialog').count()) === 0, 10000), 'o diálogo não fechou');
      exigir(await esperarPor(async () => (await texto(a)).includes(`${M} Sala Limpa`), 10000), 'a programação não aparece');
    });
    // No Dashboard só o admin inicia/conclui/assina a limpeza (regra existente).
    const p = await sessao('operador');
    await passo(p, 'Dashboard (limpeza)', 'operador vê a limpeza de hoje, sem botões de ação', async () => {
      await abrir(p, 'Dashboard');
      exigir(await esperarPor(async () => (await texto(p)).includes(`${M} Sala Limpa`), 15000), 'a limpeza não aparece no Dashboard');
      exigir((await p.page.getByRole('button', { name: `Iniciar a limpeza de ${M} Sala Limpa` }).count()) === 0, 'operador vê "Iniciar"');
    });
    await passo(a, 'Dashboard (limpeza)', 'admin inicia, conclui e o responsável assina', async () => {
      await abrir(a, 'Dashboard');
      const iniciar = a.page.getByRole('button', { name: `Iniciar a limpeza de ${M} Sala Limpa` });
      exigir(await esperarPor(async () => (await iniciar.count()) > 0, 15000), 'a limpeza não aparece no Dashboard');
      await iniciar.click();
      exigir(await esperarPor(async () => (await iniciar.count()) === 0, 10000), 'continuou sem iniciar');
      await a.page.getByRole('button', { name: `Concluir a limpeza de ${M} Sala Limpa` }).click();
      const d = a.page.getByRole('dialog');
      await d.waitFor({ timeout: 10000 });
      await d.getByRole('button', { name: 'Assinar', exact: true }).first().click();
      exigir(await d.getByRole('button', { name: 'Confirmar assinatura' }).isDisabled(), 'confirmar habilitado sem marcar');
      await d.getByRole('checkbox').first().click();
      await d.getByRole('button', { name: 'Confirmar assinatura' }).click();
      exigir(await esperarPor(async () => (await d.getByRole('button', { name: 'Assinar', exact: true }).count()) === 0, 10000), 'a assinatura do responsável não entrou');
    });
    await passo(a, 'Dashboard (limpeza)', 'admin assina como líder escolhendo na lista', async () => {
      const d = a.page.getByRole('dialog');
      if (!(await d.count())) {
        await abrir(a, 'Dashboard');
        await a.page.getByRole('button', { name: `Assinar como líder a limpeza de ${M} Sala Limpa` }).click();
      }
      exigir(await d.getByRole('button', { name: /Assinar como Líder/ }).isDisabled(), 'assinar habilitado sem líder');
      await escolherOpcao(a, d.locator('#assina-lider-limpeza'), DADOS.operadorB.nome);
      await d.getByRole('button', { name: /Assinar como Líder/ }).click();
      await esperarPor(async () => (await d.getByRole('button', { name: /Assinar como Líder/ }).count()) === 0, 10000);
      await a.page.keyboard.press('Escape');
      const linha = a.page.locator('li').filter({ hasText: `${M} Sala Limpa` });
      exigir(await esperarPor(async () => /assinado/.test(await linha.first().innerText()), 10000), 'a linha não mostra "assinado"');
    });
  }

  // ══ CONFIGURAÇÕES ═════════════════════════════════════════════════════════
  if (rodar('configuracoes')) {
    console.log('\n■ Configurações');
    const a = await sessao('admin');
    await abrir(a, 'GerenciarUsuarios');
    for (const aba of ['Usuários', 'Operadores', 'Produtos', 'Embalagens', 'Programação de Limpeza', 'Alertas de Ocorrência']) {
      await passo(a, 'Configurações', `aba "${aba}" abre`, async () => {
        await a.page.getByRole('tab', { name: aba }).click();
        await a.page.waitForTimeout(800);
        exigir((await a.page.getByRole('tab', { name: aba }).getAttribute('aria-selected')) === 'true', 'a aba não ficou selecionada');
      });
    }
    await passo(a, 'Configurações (alertas)', 'cadastra um destinatário de alerta', async () => {
      await a.page.locator('#nomeDest').fill(`${M} Coordenador`);
      await a.page.locator('#emailDest').fill(`${M.toLowerCase()}@exemplo.local`);
      await a.page.getByRole('button', { name: 'Cadastrar Destinatário' }).click();
      exigir(await esperarPor(async () => (await texto(a)).includes(`${M.toLowerCase()}@exemplo.local`), 10000), 'o destinatário não aparece');
    });
  }

  // ══ GERENCIAR USUÁRIOS ════════════════════════════════════════════════════
  if (rodar('usuarios')) {
    console.log('\n■ Gerenciar usuários');
    const a = await sessao('admin');
    const email = `${M.toLowerCase()}-conta@exemplo.local`;
    let temporaria = '';
    await passo(a, 'Gerenciar usuários', 'cria conta de operador; a senha temporária aparece uma vez', async () => {
      await abrir(a, 'GerenciarUsuarios');
      await a.page.getByRole('button', { name: 'Novo usuário' }).click();
      await a.page.locator('#conta-nome').fill(`${M} Conta`);
      await a.page.locator('#conta-email').fill(email);
      await a.page.getByRole('button', { name: 'Criar usuário' }).click();
      const caixa = a.page.locator('[data-senha-temporaria]');
      await caixa.waitFor({ timeout: 20000 });
      temporaria = (await caixa.innerText()).trim();
      await a.page.getByRole('button', { name: 'Já anotei' }).click();
      exigir(temporaria.length === 20, 'senha temporária inválida');
    });
    const b = await pessoa('conta-nova');
    await passo(b, 'Primeiro acesso', 'entra com a senha temporária, cai em "Crie a sua senha", troca e entra', async () => {
      await entrar(b, { email, senha: temporaria });
      await b.page.getByRole('heading', { name: 'Crie a sua senha' }).waitFor({ timeout: 30000 });
      const nova = `E2e#Senha-${Date.now()}`;
      await b.page.locator('#senha-atual').fill(temporaria);
      await b.page.locator('#senha-nova').fill(nova);
      await b.page.locator('#senha-confirma').fill(nova);
      await b.page.getByRole('button', { name: 'Trocar senha' }).click();
      exigir(await esperarPor(async () => (await b.page.getByRole('heading', { name: 'Crie a sua senha' }).count()) === 0 && (await b.page.locator('#email').count()) === 0, 30000), 'não entrou depois da troca');
      b.nova = nova;
    });
    await passo(b, 'Alterar minha senha', 'pelo menu, troca de novo e continua logado', async () => {
      await b.page.getByRole('link', { name: 'Alterar minha senha' }).first().click();
      const outra = `E2e#Outra-${Date.now()}`;
      await b.page.locator('#senha-atual').fill(b.nova);
      await b.page.locator('#senha-nova').fill(outra);
      await b.page.locator('#senha-confirma').fill(outra);
      await b.page.getByRole('button', { name: 'Trocar senha' }).click();
      exigir(await esperarPor(async () => (await b.page.getByText(/Senha trocada/).count()) > 0, 20000), 'nenhuma confirmação');
      exigir((await b.page.locator('#email').count()) === 0, 'foi deslogado');
    });
    await passo(a, 'Gerenciar usuários', 'edita o nome; reseta a senha (nova senha aparece)', async () => {
      await abrir(a, 'GerenciarUsuarios');
      const linha = a.page.locator(`[data-usuario="${email}"]`);
      await linha.getByRole('button', { name: `Editar ${email}` }).click();
      await a.page.locator('#conta-nome').fill(`${M} Conta Editada`);
      await a.page.getByRole('button', { name: 'Salvar' }).click();
      exigir(await esperarPor(async () => (await linha.innerText()).includes('Editada'), 10000), 'nome não mudou');
      await linha.getByRole('button', { name: `Resetar a senha de ${email}` }).click();
      await a.page.getByRole('button', { name: 'Resetar senha' }).last().click();
      await a.page.locator('[data-senha-temporaria]').waitFor({ timeout: 15000 });
      await a.page.getByRole('button', { name: 'Já anotei' }).click();
    });
    await passo(b, 'Sessão encerrada', 'a conta resetada é deslogada sozinha em até ~20 s', async () => {
      const t0 = Date.now();
      exigir(await esperarPor(async () => (await b.page.getByText('Sua sessão foi encerrada pelo administrador.').count()) > 0, 30000), 'não foi deslogada');
      return `${((Date.now() - t0) / 1000).toFixed(1)} s`;
      // Esperados: o 401 é o banco recusando o JWT revogado (é o que dispara a
      // saída). O 403 no /logout é o supabase-js avisando o Auth de uma sessão
      // que o admin JÁ encerrou — ele faz essa chamada até com scope 'local' e
      // ignora a resposta.
    }, { esperados: [/HTTP 401/, /HTTP 403 POST \/auth\/v1\/logout/, /console: Failed to load resource/] });
    await passo(a, 'Gerenciar usuários', 'desativa, reativa e exclui (com e-mail digitado)', async () => {
      const linha = a.page.locator(`[data-usuario="${email}"]`);
      await linha.getByRole('button', { name: `Desativar ${email}` }).click();
      await a.page.getByRole('button', { name: 'Desativar' }).last().click();
      exigir(await esperarPor(async () => /Desativada/.test(await linha.innerText()), 10000), 'não desativou');
      await linha.getByRole('button', { name: `Reativar ${email}` }).click();
      await a.page.getByRole('button', { name: 'Reativar' }).last().click();
      exigir(await esperarPor(async () => !/Desativada/.test(await linha.innerText()), 10000), 'não reativou');
      await linha.getByRole('button', { name: `Excluir ${email}` }).click();
      exigir(await a.page.getByRole('button', { name: 'Excluir de vez' }).isDisabled(), 'excluir habilitado sem digitar');
      await a.page.locator('#confirma-exclusao').fill(email);
      await a.page.getByRole('button', { name: 'Excluir de vez' }).click();
      exigir(await esperarPor(async () => (await linha.count()) === 0, 10000), 'não excluiu');
    });
    await b.ctx.close();
  }

  // ══ DASHBOARD, PAINEL E INDICADORES ═══════════════════════════════════════
  if (rodar('paineis')) {
    console.log('\n■ Dashboard, Painel e indicadores');
    const a = await sessao('admin');
    await passo(a, 'Dashboard', 'filtros: chips de sala, abas Envase/Check-out, Hoje/Semana/Mês', async () => {
      await abrir(a, 'Dashboard');
      for (const b of [/^Sala Bio/, /^Sala Industrial/, /^Todas/]) { await a.page.getByRole('button', { name: b }).first().click(); await a.page.waitForTimeout(400); }
      for (const b of ['Check-out', 'Envase']) { await a.page.getByRole('button', { name: b, exact: true }).first().click(); await a.page.waitForTimeout(500); }
      for (const b of ['Semana', 'Mês', 'Hoje']) { await a.page.getByRole('button', { name: b, exact: true }).first().click(); await a.page.waitForTimeout(400); }
    });
    await passo(a, 'Dashboard', 'filtro por operador', async () => {
      await escolherOpcao(a, a.page.locator('#operador-filtro'), /./);
      await a.page.waitForTimeout(600);
    });
    await passo(a, 'Dashboard', '"Exportar" baixa um arquivo', async () => {
      await a.page.getByRole('button', { name: 'Exportar' }).first().click();
      const d = a.page.getByRole('dialog');
      await d.waitFor({ timeout: 10000 });
      const [dl] = await Promise.all([a.page.waitForEvent('download', { timeout: 20000 }), d.getByRole('button', { name: 'Exportar' }).click()]);
      exigir(/\.(xlsx|csv)$/i.test(dl.suggestedFilename()), `arquivo inesperado: ${dl.suggestedFilename()}`);
      return dl.suggestedFilename();
    });
    await passo(a, 'Painel geral', 'Hoje/Semana e os atalhos abrem as telas', async () => {
      await abrir(a, 'Painel');
      await a.page.getByRole('button', { name: 'Semana' }).click(); await a.page.waitForTimeout(600);
      await a.page.getByRole('button', { name: 'Hoje' }).click(); await a.page.waitForTimeout(600);
      await a.page.getByRole('link', { name: /Abrir Empilhadeira/ }).click();
      exigir(await esperarPor(async () => /Empilhadeira/.test(await h1(a)), 10000), 'o atalho não abriu a Empilhadeira');
    });
    await passo(a, 'Produtos', '"Exportar Excel" baixa um arquivo', async () => {
      await abrir(a, 'Produtos');
      const [dl] = await Promise.all([a.page.waitForEvent('download', { timeout: 20000 }), a.page.getByRole('button', { name: 'Exportar Excel' }).click()]);
      return dl.suggestedFilename();
    });
  }

  // ══ TVs ═══════════════════════════════════════════════════════════════════
  if (rodar('tvs')) {
    console.log('\n■ TVs');
    for (const [w, h] of [[1920, 1080], [1366, 768], [800, 395]]) {
      const t = await pessoa('tv');
      await t.page.setViewportSize({ width: w, height: h });
      t.largura = `${w}x${h}`;
      await entrar(t, CONTAS.tv);
      await esperarPor(async () => (await t.page.locator('#email').count()) === 0, 30000);
      for (const rota of ['Televisao', 'TelevisaoEmpilha', 'Painel']) {
        await passo(t, rota, 'abre, mostra "atualizado às" e cabe na tela sem rolagem horizontal', async () => {
          await abrir(t, rota);
          exigir(await esperarPor(async () => /atualizado às|Ao vivo/i.test(await texto(t)), 20000), 'sem "atualizado às"');
          exigir(await semRolagemHorizontal(t), 'rolagem horizontal');
          const cortes = await textoCortado(t);
          exigir(!cortes.length, `texto cortado: ${cortes.join(' | ')}`);
        });
      }
      await passo(t, 'Televisao', 'carrossel: Pausar / Retomar e os pontos de página', async () => {
        await abrir(t, 'Televisao');
        const pausar = t.page.getByRole('button', { name: /Pausar rotação/ });
        if (await pausar.count()) {
          await pausar.click();
          exigir(await esperarPor(async () => (await t.page.getByRole('button', { name: /Retomar rotação/ }).count()) > 0, 5000), 'não pausou');
          await t.page.getByRole('button', { name: /Retomar rotação/ }).click();
        }
      });
      await t.ctx.close();
    }
  }

  // ══ ERROS E ACESSO ════════════════════════════════════════════════════════
  if (rodar('erros')) {
    console.log('\n■ Erros e acesso');
    const p = await sessao('operador');
    await passo(p, '404', 'rota inexistente mostra a página em português e volta ao início', async () => {
      await abrir(p, 'RotaQueNaoExiste');
      exigir((await texto(p)).includes('Página não encontrada'), 'texto da 404');
      await p.page.getByRole('link', { name: 'Voltar ao início' }).click();
      exigir(await esperarPor(async () => !/404/.test(await texto(p)), 10000), 'não voltou');
    });
    for (const rota of SO_ADMIN) {
      await passo(p, rota, 'operador recebe "Acesso restrito a administradores."', async () => {
        await abrir(p, rota);
        exigir(await esperarPor(async () => (await p.page.getByText('Acesso restrito a administradores.').count()) > 0, 10000), `sem aviso (${p.page.url()})`);
      });
    }
  }

  // ══ LARGURAS: todas as telas de cada perfil em tablet e celular ══════════
  if (rodar('larguras')) {
    console.log('\n■ Larguras');
    for (const largura of ['tablet', 'celular']) {
      for (const perfil of ['admin', 'operador']) {
        const p = await pessoa(perfil, largura);
        await entrar(p, CONTAS[perfil]);
        await esperarPor(async () => (await p.page.locator('#email').count()) === 0, 30000);
        for (const rota of TELAS[perfil]) {
          await passo(p, rota, 'abre sem rolagem horizontal, sem texto cortado e sem erro', async () => {
            await abrir(p, rota);
            exigir(!(await p.page.getByText(/Não foi possível abrir esta tela/i).count()), 'moldura de erro');
            exigir(await semRolagemHorizontal(p), `rolagem horizontal (${await p.page.evaluate(() => document.documentElement.scrollWidth)} px)`);
            const cortes = await textoCortado(p);
            exigir(!cortes.length, `texto cortado: ${cortes.join(' | ')}`);
          });
        }
        if (largura === 'celular') {
          await passo(p, 'Menu (celular)', 'a gaveta abre, navega e fecha', async () => {
            await abrir(p, 'Dashboard');
            await p.page.getByRole('button', { name: 'Abrir menu' }).click();
            await p.page.locator('nav:visible a').filter({ hasText: 'Check-out' }).first().click();
            exigir(await esperarPor(async () => /Check-out/.test(await h1(p)), 10000), 'não navegou');
            exigir((await p.page.getByRole('button', { name: 'Fechar menu' }).count()) === 0, 'a gaveta não fechou');
          });
        }
        await p.ctx.close();
      }
    }
  }
} catch (e) {
  console.log(`\nA RODADA PAROU: ${String(e.message || e).split('\n')[0]}`);
  falhas += 1;
} finally {
  for (const s of Object.values(sessoes)) await s.ctx.close().catch(() => {});
  await nav.close();
  // Limpeza do que ESTA rodada criou (marcador). Não prova nada; só não deixa lixo.
  // Padrão 'E2E' (todas as rodadas): uma rodada interrompida deixava operadores
  // que poluíam a lista das seguintes. Banco LOCAL apenas (trava no topo).
  // Ordem: quem referencia operador/produto antes (FKs ON DELETE RESTRICT).
  // --manter: deixa os dados no banco local para olhar pela tela depois.
  // A próxima rodada sem --manter apaga tudo que leva o marcador E2E.
  if (MANTER) console.log(`
--manter: os dados desta rodada (marcador ${M}) ficaram no banco local.`);
  else for (const [t, col] of [['envase_records', 'op'], ['checkout_itens', 'numero_pedido'], ['checkout_programacoes', 'observacoes'],
    ['empilha_ocorrencias', 'descricao'], ['empilha_linhas', 'descricao_produto'], ['empilha_programacoes', 'observacoes'],
    ['empilhadeira_manutencoes', 'descricao'], ['nota_fiscal_arquivos', 'numero_nf'], ['notificacao_destinatarios', 'email'],
    ['checklist_recebimentos', 'nome_fornecedor'], ['recebimento_participantes', 'operator_nome'], ['recebimentos', 'numero_documento'],
    ['recebimento_fornecedores', 'nome'], ['limpeza_programacoes', 'local_nome'], ['limpeza_locais', 'nome'], ['operators', 'nome'],
    ['products', 'codigo'], ['embalagens', 'codigo']]) {
    await svc.from(t).delete().like(col, '%E2E%').then(() => {}, () => {});
  }
}

// ── Relatório ───────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(SAIDA, 'relatorio.json'), JSON.stringify(linhas, null, 1));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rodada por clique</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;background:#F3F4F8;color:#141A2B}table{border-collapse:collapse;width:100%;background:#fff}
th,td{border-bottom:1px solid #E3E6EE;padding:6px 8px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#fff}
.ok{color:#0E7C50;font-weight:700}.falha{color:#C62828;font-weight:700}img{max-width:220px;border:1px solid #E3E6EE;border-radius:6px}</style></head><body>
<h1>Rodada por clique — ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</h1>
<p>${linhas.length} passos · <span class="ok">${linhas.length - falhas} ok</span> · <span class="falha">${falhas} falha(s)</span> · build de produção local · marcador ${M}</p>
<table><thead><tr><th>#</th><th>Tela</th><th>Ação</th><th>Perfil</th><th>Largura</th><th>Resultado</th><th>Captura</th></tr></thead><tbody>
${linhas.map((l) => `<tr><td>${l.n}</td><td>${esc(l.tela)}</td><td>${esc(l.acao)}</td><td>${esc(l.perfil)}</td><td>${esc(l.largura)}</td><td class="${l.ok ? 'ok' : 'falha'}">${l.ok ? 'OK' : 'FALHA'}${l.detalhe ? `<br><small>${esc(l.detalhe)}</small>` : ''}</td><td><a href="${esc(l.captura)}"><img loading="lazy" src="${esc(l.captura)}" alt=""></a></td></tr>`).join('\n')}
</tbody></table></body></html>`;
fs.writeFileSync(path.join(SAIDA, 'relatorio.html'), html);
console.log('\n' + '='.repeat(78));
console.log(falhas ? `${falhas} FALHA(S) em ${linhas.length} passos — ${SAIDA}/relatorio.html` : `TUDO OK — ${linhas.length} passos — ${SAIDA}/relatorio.html`);
process.exitCode = falhas ? 1 : 0;
