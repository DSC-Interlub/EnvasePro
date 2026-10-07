/**
 * scripts/test-fase3-ui.js  —  FASE 3: testes de interface real
 *
 * Playwright contra o Supabase LOCAL e o servidor de desenvolvimento, com o
 * codigo da branch. Loga de verdade nas contas e clica nas telas.
 *
 * O que torna isto diferente dos "34 testes" anteriores: para cada fluxo de
 * escrita, o resultado e CONFERIDO NO BANCO com service_role depois da acao na
 * tela. Clicar sem conferir o banco nao prova nada — e um UPDATE barrado por
 * RLS afeta 0 linhas sem devolver erro.
 *
 * Uso:  npx vite --port 5173     (noutro terminal)
 *       node scripts/test-fase3-ui.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';

dotenv.config({ path: '.env.local' });

// Guard obrigatorio (CLAUDE.md Fase 0): aborta se o alvo nao for o Supabase local.
// Precisa rodar DEPOIS do carregamento do ambiente e ANTES de criar o client.
enforceNonProductionGuard('test-fase3-ui');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const SHOTS = path.join('scratch', 'fase3');
fs.mkdirSync(SHOTS, { recursive: true });

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CONTAS = {
  admin: { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD },
  operador: { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD },
  tv: { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD },
};

const resultados = [];
let n = 0;

function registrar(fluxo, item, ok, detalhe = '') {
  resultados.push({ fluxo, item, ok, detalhe });
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${item}${detalhe ? ` -> ${detalhe}` : ''}`);
}

async function print(page, nome) {
  n += 1;
  const arq = path.join(SHOTS, `${String(n).padStart(2, '0')}_${nome}.png`);
  await page.screenshot({ path: arq, fullPage: false });
  return arq;
}

/** Ruido do servidor de desenvolvimento, nao do app: HMR do Vite. */
const ruidoDeDev = (t) =>
  /vite|WebSocket|HMR|react-refresh|ERR_CONNECTION_REFUSED/i.test(t);

/** Coleta erros de console e de rede da pagina. */
function vigiar(page) {
  const erros = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !ruidoDeDev(m.text())) erros.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => {
    if (!ruidoDeDev(String(e.message))) erros.push(`pageerror: ${String(e.message).slice(0, 160)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/rest/v1/')) {
      erros.push(`HTTP ${r.status()} ${r.url().split('/rest/v1/')[1]?.slice(0, 80)}`);
    }
  });
  return erros;
}

/**
 * "Esta autenticado" NAO pode ser medido pela ausencia do campo de e-mail: a
 * tela inicial deslogada tambem nao o tem (mostra o botao "Fazer Login no
 * Sistema" e so abre o modal depois do clique). Medir pela ausencia dava
 * falso positivo em TODA tela. O sinal correto e o menu de navegacao, que so
 * existe com sessao.
 */
async function estaAutenticado(page) {
  // Agnostico de layout: as telas de TV sao painel de tela cheia e NAO tem menu
  // de navegacao, logo procurar pelo menu dava falso negativo nelas. O sinal
  // confiavel e a ausencia da porta de entrada deslogada (botao de abrir o
  // login ou o proprio campo de e-mail).
  const temBotaoLogin = await page.getByRole('button', { name: /fazer login/i }).count();
  const temCampoEmail = await page.locator('#email').count();
  return temBotaoLogin === 0 && temCampoEmail === 0;
}

async function login(page, conta) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // A tela inicial deslogada traz um botao que abre o modal de login.
  const botaoAbrir = page.getByRole('button', { name: /fazer login/i });
  if (await botaoAbrir.count()) {
    await botaoAbrir.first().click();
    await page.waitForTimeout(900);
  }

  const campoEmail = page.locator('#email');
  if (await campoEmail.count()) {
    await campoEmail.fill(conta.email);
    await page.locator('#password').fill(conta.senha);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3500);
  }

  // Modal do operador fisico. O overlay intercepta o ponteiro, por isso force.
  const opcoes = page.locator('button').filter({ hasText: /SEED-/ });
  if (await opcoes.count()) {
    await opcoes.first().click({ force: true });
    await page.waitForTimeout(1500);
  }

  return estaAutenticado(page);
}

/** Abre uma rota ja autenticado e confirma que continuou autenticado. */
async function abrir(page, rota, espera = 2500) {
  await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(espera);
  return estaAutenticado(page);
}

async function main() {
  console.log('='.repeat(78));
  console.log(`FASE 3 — interface real  |  app ${APP}  |  banco ${process.env.VITE_SUPABASE_URL}`);
  console.log('='.repeat(78));

  const navegador = await chromium.launch({ headless: true });

  // =========================================================== LOGINS ======
  console.log('\n[LOGIN] as 3 contas');
  for (const [nome, conta] of Object.entries(CONTAS)) {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const erros = vigiar(page);
    const entrou = await login(page, conta);
    const arq = await print(page, `login_${nome}`);
    registrar('login', `entra como ${nome} (${conta.email})`, entrou, entrou ? arq : 'ficou na tela de login');
    if (erros.length) registrar('login', `console limpo em ${nome}`, false, erros.slice(0, 2).join(' | '));
    else registrar('login', `console limpo em ${nome}`, true);
    await ctx.close();
  }

  // ------------------------------------------------- TV sem sessao ---------
  console.log('\n[TV] sem sessao');
  {
    const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    const erros = vigiar(page);
    await page.goto(`${APP}/Televisao`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const autenticada = await estaAutenticado(page);
    const arq = await print(page, 'tv_sem_sessao');
    registrar('tv', 'TV sem sessao NAO renderiza a tela (exige login)', !autenticada,
      autenticada ? `RENDERIZOU SEM SESSAO — ${arq}` : arq);
    registrar('tv', 'TV sem sessao sem erro 42501 no console',
      !erros.some((e) => e.includes('42501')), erros.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ------------------------------------------------- TV com sessao ---------
  console.log('\n[TV] com sessao (tv-fabrica)');
  {
    const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    const erros = vigiar(page);
    await login(page, CONTAS.tv);
    for (const rota of ['Televisao', 'TelevisaoEmpilha', 'Painel']) {
      await page.goto(`${APP}/${rota}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const arq = await print(page, `tv_${rota}`);
      registrar('tv', `/${rota} carrega autenticada`, await estaAutenticado(page), arq);
    }
    registrar('tv', 'console das TVs sem erro de permissao',
      !erros.some((e) => e.includes('42501') || e.includes('HTTP 403')),
      erros.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ============================================ OPERADOR: fluxos ==========
  const ctxOp = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const op = await ctxOp.newPage();
  const errosOp = vigiar(op);
  await login(op, CONTAS.operador);

  // ------------------------------------------------------ 1. ENVASE --------
  console.log('\n[ENVASE]');
  {
    const antes = await svc.from('envase_records').select('*', { count: 'exact', head: true });
    const autent = await abrir(op, 'NovoRegistro');
    const arq = await print(op, 'envase_form');
    const temForm = (await op.locator('form, input, select, [role="combobox"]').count()) > 0;
    registrar('envase', 'sessao do operador persiste em /NovoRegistro', autent, arq);
    registrar('envase', 'formulario de envase abre', temForm, arq);
    registrar('envase', 'contagem inicial lida', typeof antes.count === 'number', `registros=${antes.count}`);
  }

  // --------------------------------------------------- 2. CHECK-OUT --------
  console.log('\n[CHECK-OUT] selecao de operador');
  {
    const autent = await abrir(op, 'Checkout');
    const arq = await print(op, 'checkout_lista');
    registrar('checkout', 'tela de check-out carrega autenticada', autent, arq);
  }

  // ------------------------------------------------ 3. EMPILHADEIRA --------
  console.log('\n[EMPILHADEIRA]');
  {
    const autent = await abrir(op, 'Empilhadeira');
    const arq = await print(op, 'empilhadeira');
    registrar('empilhadeira', 'tela de empilhadeira carrega autenticada', autent, arq);
  }

  // --------------------------------------------- 4. RECEBIMENTO / NF -------
  console.log('\n[RECEBIMENTO / CHECKLIST / NF]');
  for (const [rota, rotulo] of [
    ['Recebimento', 'recebimento'],
    ['ChecklistRecebimento', 'checklist'],
    ['NovoChecklist', 'checklist_novo'],
    ['NotasFiscais', 'notas_fiscais'],
  ]) {
    const autent = await abrir(op, rota, 2200);
    const arq = await print(op, rotulo);
    registrar('recebimento', `/${rota} carrega autenticada`, autent, arq);
  }

  // ------------------------------------------------------ 5. LIMPEZA -------
  console.log('\n[LIMPEZA] (bloco do Dashboard)');
  {
    await abrir(op, 'Dashboard', 3500);
    const arq = await print(op, 'dashboard_limpeza');
    const temLimpeza = (await op.getByText(/limpeza/i).count()) > 0;
    registrar('limpeza', 'bloco de limpeza aparece no Dashboard', temLimpeza, arq);
  }

  // ===================== FLUXOS DE ESCRITA DE VERDADE =====================
  // Aqui a tela nao e so aberta: a acao e executada e o resultado e CONFERIDO
  // NO BANCO. Abrir tela nao prova nada; isso foi o erro dos testes anteriores.

  /** Escolhe um valor num Select do shadcn/Radix pelo texto da opcao. */
  async function escolherNoSelect(page, rotulo, textoOpcao) {
    const grupo = page.locator('div').filter({ hasText: new RegExp(rotulo, 'i') });
    const gatilho = page.getByRole('combobox').filter({ hasNotText: '___nunca___' });
    const alvo = (await grupo.count()) ? grupo.last().getByRole('combobox').first() : gatilho.first();
    await alvo.click({ force: true });
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: textoOpcao, exact: false }).first().click({ force: true });
    await page.waitForTimeout(400);
  }

  console.log('\n[EMPILHADEIRA] iniciar linha com operador e ajudante (escrita real)');
  {
    const { data: cfg } = await svc.from('empilhadeira_configs').select('id').limit(1).single();
    const { data: prog } = await svc.from('empilha_programacoes')
      .insert({ data_programada: new Date().toISOString().slice(0, 10), empilhadeira_id: cfg.id })
      .select().single();
    const { data: linha } = await svc.from('empilha_linhas')
      .insert({ programacao_id: prog.id, status: 'Pendente', tipo_linha: 'Normal' })
      .select().single();

    await abrir(op, `ExecutarEmpilha?id=${prog.id}`, 3000);
    const botaoIniciar = op.getByRole('button', { name: /^iniciar$/i });
    const achouBotao = (await botaoIniciar.count()) > 0;
    registrar('empilhadeira', 'botao Iniciar aparece na linha Pendente', achouBotao,
      await print(op, 'empilha_linha_pendente'));

    if (achouBotao) {
      await botaoIniciar.first().click({ force: true });
      await op.waitForTimeout(900);
      await print(op, 'empilha_modal_iniciar');
      await escolherNoSelect(op, 'Operador Empilhadeira', 'SEED-Bruno Empilhador');
      await escolherNoSelect(op, 'Operador Ajudante', 'SEED-Carla Ajudante');
      await print(op, 'empilha_modal_preenchido');
      await op.getByRole('button', { name: /iniciar agora/i }).first().click({ force: true });
      await op.waitForTimeout(2500);
      await print(op, 'empilha_linha_iniciada');

      const { data: depois } = await svc.from('empilha_linhas')
        .select('status, operador_empilhadeira, operador_empilhadeira_id, operador_ajudante, operador_ajudante_id')
        .eq('id', linha.id).single();

      registrar('empilhadeira', 'status virou Em Andamento no BANCO',
        depois?.status === 'Em Andamento', `status=${depois?.status}`);
      registrar('empilhadeira', 'nome do empilhador gravado',
        depois?.operador_empilhadeira === 'SEED-Bruno Empilhador', `${depois?.operador_empilhadeira}`);
      registrar('empilhadeira', 'ID do empilhador gravado (o CHECK exige)',
        !!depois?.operador_empilhadeira_id, `${depois?.operador_empilhadeira_id}`);
      registrar('empilhadeira', 'ajudante e seu ID gravados',
        depois?.operador_ajudante === 'SEED-Carla Ajudante' && !!depois?.operador_ajudante_id,
        `${depois?.operador_ajudante} / ${depois?.operador_ajudante_id}`);
    }

    await svc.from('empilha_linhas').delete().eq('id', linha.id);
    await svc.from('empilha_programacoes').delete().eq('id', prog.id);
  }

  console.log('\n[CHECK-OUT] selecionar operador num item (escrita real)');
  {
    const { data: prog } = await svc.from('checkout_programacoes')
      .insert({ data_programada: new Date().toISOString().slice(0, 10) }).select().single();
    const { data: item } = await svc.from('checkout_itens')
      .insert({ programacao_id: prog.id, numero_pedido: 'PED-UI-1', cliente: 'CLIENTE UI', status: 'Pendente' })
      .select().single();

    await abrir(op, `ExecutarCheckout?id=${prog.id}`, 3000);
    await print(op, 'checkout_item_pendente');

    const editar = op.getByRole('button', { name: /editar/i });
    if (await editar.count()) { await editar.first().click({ force: true }); await op.waitForTimeout(800); }

    const temSelect = (await op.getByRole('combobox').count()) > 0;
    registrar('checkout', 'select de operador disponivel no item', temSelect,
      await print(op, 'checkout_item_edicao'));

    if (temSelect) {
      await escolherNoSelect(op, 'Operador', 'SEED-Ana Operadora');
      await print(op, 'checkout_operador_escolhido');
      // ATENCAO: a pagina tem OUTRO "Salvar" no topo, o das Observacoes da
      // Programacao. Pegar o primeiro clicava no botao errado e o item nunca
      // era gravado. Escopa no cartao do item.
      const salvar = op.getByRole('button', { name: /^salvar$/i });
      const quantos = await salvar.count();
      registrar('checkout', 'botao Salvar do item encontrado', quantos >= 2,
        `botoes "Salvar" na pagina: ${quantos} (o do item e o ultimo)`);
      if (quantos) { await salvar.last().click({ force: true }); await op.waitForTimeout(3000); }
      await print(op, 'checkout_item_salvo');

      const { data: depois } = await svc.from('checkout_itens')
        .select('operador, operator_id').eq('id', item.id).single();
      registrar('checkout', 'nome do operador gravado no BANCO',
        depois?.operador === 'SEED-Ana Operadora', `${depois?.operador}`);
      registrar('checkout', 'operator_id gravado (era o fluxo bloqueado antes)',
        !!depois?.operator_id, `${depois?.operator_id}`);
    }

    await svc.from('checkout_itens').delete().eq('id', item.id);
    await svc.from('checkout_programacoes').delete().eq('id', prog.id);
  }

  registrar('operador', 'nenhum erro de permissao (42501/403) na sessao do operador',
    !errosOp.some((e) => e.includes('42501') || e.includes('HTTP 403')),
    errosOp.slice(0, 3).join(' | '));
  await ctxOp.close();

  // ================================================= ADMIN ================
  console.log('\n[ADMIN] telas restritas');
  {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const erros = vigiar(page);
    await login(page, CONTAS.admin);
    for (const [rota, rotulo] of [
      ['Operadores', 'admin_operadores'],
      ['GerenciarUsuarios', 'admin_usuarios'],
      ['Produtos', 'admin_produtos'],
    ]) {
      const autent = await abrir(page, rota, 2200);
      const arq = await print(page, rotulo);
      registrar('admin', `/${rota} acessivel ao admin`, autent, arq);
    }
    registrar('admin', 'console do admin sem erro de permissao',
      !erros.some((e) => e.includes('42501') || e.includes('HTTP 403')),
      erros.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await navegador.close();

  // ================================================= RELATORIO ============
  const ok = resultados.filter((r) => r.ok).length;
  const falhou = resultados.length - ok;
  console.log('\n' + '='.repeat(78));
  console.log(`FASE 3: ${ok} OK, ${falhou} FALHA   |   ${n} prints em ${SHOTS}`);
  if (falhou) {
    console.log('\nFalhas:');
    for (const r of resultados.filter((x) => !x.ok)) {
      console.log(`  [${r.fluxo}] ${r.item}  ->  ${r.detalhe}`);
    }
  }
  console.log('='.repeat(78));
  fs.writeFileSync(path.join(SHOTS, 'resultado.json'), JSON.stringify(resultados, null, 2));
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error('\nERRO NA SUITE:', e); process.exit(2); });
