/**
 * scripts/test-nf-assinaturas-ui.mjs — nota fiscal e assinaturas na
 * INTERFACE REAL (Playwright, banco LOCAL), telas v2.
 *
 * Substitui test-nota-fiscal.js, que só imprimia (não falhava) e gravava a
 * captura na pasta de outra ferramenta.
 *
 * 1. NOTA FISCAL, como OPERADOR: envia um PDF e uma imagem de uma vez pela
 *    tela /NovaNotaFiscal; no banco, o caminho (não URL) e os bytes no
 *    storage iguais aos enviados; no detalhe, a imagem por URL ASSINADA que
 *    abre, e o PDF com "Abrir PDF" apontando para URL assinada que abre.
 *    O operador NÃO consegue excluir a NF (só admin apaga).
 * 2. ASSINATURAS:
 *    - empilhadeira: operador finaliza e assina; operador não vê "Assinar
 *      (Líder)"; admin assina como líder → Completo;
 *    - limpeza: responsável assina e líder assina (as duas na tela de
 *      Configurações > Limpeza — é onde a v2 executa a limpeza);
 *    - recebimento: operador finaliza e o participante assina; admin assina
 *      como líder.
 *
 * Tudo o que cria leva a marca TESTE-NFA e é apagado no fim (registros por
 * service_role, arquivos pela API de Storage).
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-nf-assinaturas-ui');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { login } = criarAjudantes({ app: APP, svc });
const SAIDA = 'scratch/nf-assinaturas';
fs.mkdirSync(SAIDA, { recursive: true });
const MARCA = `TESTE-NFA-${Date.now()}`;
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}`); if (!c) falhas += 1; };
const limpar = [];   // [tabela, id]
const arquivos = []; // caminhos no bucket notas-fiscais

const nav = await chromium.launch({ headless: true });
async function sessao(email, senha) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  if (!(await login(page, { email, senha }))) throw new Error(`${email} não entrou`);
  return page;
}
const pronto = (page) => esperarPor(() => page.evaluate(() =>
  getComputedStyle(document.body).pointerEvents !== 'none' && document.querySelectorAll('button').length > 3), 20000);
async function escolher(page, escopo, indice, texto) {
  const caixas = escopo.getByRole('combobox');
  await esperarPor(async () => (await caixas.count()) > indice, 15000);
  await caixas.nth(indice).click({ force: true });
  const opcao = texto ? page.getByRole('option', { name: texto, exact: false }) : page.getByRole('option');
  await esperarPor(async () => (await opcao.count()) > 0, 10000);
  const nome = (await opcao.first().innerText()).trim();
  await opcao.first().click({ force: true });
  return nome;
}

try {
  const op = await sessao(process.env.TEST_OPERATOR_EMAIL, process.env.TEST_OPERATOR_PASSWORD);
  const adm = await sessao(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);

  // Arquivos de verdade: um PNG e um PDF gerados pelo próprio navegador.
  const gerador = await nav.newPage();
  await gerador.setContent(`<h1 style="font:40px sans-serif">${MARCA}</h1><p>NF de teste</p>`);
  const png = `${SAIDA}/nf-teste.png`;
  const pdf = `${SAIDA}/nf-teste.pdf`;
  await gerador.screenshot({ path: png });
  await gerador.pdf({ path: pdf });
  await gerador.close();

  /* ── 1. Nota fiscal ─────────────────────────────────────────────────── */
  console.log('\n1. NOTA FISCAL (operador): PDF e imagem de uma vez');
  await op.goto(`${APP}/NovaNotaFiscal`, { waitUntil: 'domcontentloaded' });
  await pronto(op);
  // "Arquivado por" é obrigatório desde d593a02: escolhido na lista, nunca pré-preenchido.
  const arquivador = await escolher(op, op.locator('main'), 0, null);
  ok(Boolean(arquivador), `"Arquivado por" escolhido na lista (${arquivador})`);
  await op.locator('input[type="file"][multiple]').setInputFiles([pdf, png]);
  const campos = op.getByPlaceholder('Ex: 123456');
  await esperarPor(async () => (await campos.count()) === 2, 10000);
  ok(await campos.count() === 2, 'os dois arquivos entram na lista');
  await campos.nth(0).fill(`${MARCA}-PDF`);
  await campos.nth(1).fill(`${MARCA}-IMG`);
  await op.getByRole('button', { name: /Salvar 2 NF/ }).click();
  const salvou = await esperarPor(async () => (await op.getByRole('button', { name: /Concluído/ }).count()) > 0, 30000);
  ok(salvou, 'a tela confirma "Concluído — Ver arquivo"');
  await op.screenshot({ path: `${SAIDA}/1-nf-enviadas.png`, fullPage: true });

  const { data: nfs } = await svc.from('nota_fiscal_arquivos').select('*').like('numero_nf', `${MARCA}%`).order('numero_nf');
  for (const n of nfs) { limpar.push(['nota_fiscal_arquivos', n.id]); if (n.arquivo_url) arquivos.push(n.arquivo_url); }
  ok(nfs.length === 2, `2 registros no banco (${nfs.length})`);
  for (const [n, origem, tipo] of [[nfs.find((x) => x.numero_nf.endsWith('-PDF')), pdf, 'application/pdf'], [nfs.find((x) => x.numero_nf.endsWith('-IMG')), png, 'image/png']]) {
    if (!n) continue;
    ok(n.arquivo_url && !/^https?:/.test(n.arquivo_url), `${n.numero_nf}: arquivo_url é só o caminho no bucket (${n.arquivo_url})`);
    ok(!!n.data_expiracao_legal, `${n.numero_nf}: retenção legal calculada (${n.data_expiracao_legal})`);
    const { data: blob } = await svc.storage.from('notas-fiscais').download(n.arquivo_url);
    const bytes = blob ? Buffer.from(await blob.arrayBuffer()) : Buffer.alloc(0);
    ok(bytes.equals(fs.readFileSync(origem)), `${n.numero_nf}: os bytes no storage são os enviados (${bytes.length} bytes, ${tipo})`);
  }

  // Detalhe da imagem: URL assinada que abre.
  const img = nfs.find((x) => x.numero_nf.endsWith('-IMG'));
  await op.goto(`${APP}/NotaFiscalDetalhe?id=${img.id}`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await op.locator('img[alt="NF"]').count()) > 0, 20000);
  const src = await op.locator('img[alt="NF"]').getAttribute('src');
  ok(/token=/.test(src || ''), 'a imagem vem por URL ASSINADA (bucket privado)');
  const rImg = await fetch(src);
  ok(rImg.ok && Buffer.from(await rImg.arrayBuffer()).equals(fs.readFileSync(png)), `a URL assinada abre a imagem (${rImg.status})`);
  await op.screenshot({ path: `${SAIDA}/2-nf-detalhe-imagem.png`, fullPage: true });

  // Detalhe do PDF: "Abrir PDF" abre URL assinada.
  const doc = nfs.find((x) => x.numero_nf.endsWith('-PDF'));
  await op.goto(`${APP}/NotaFiscalDetalhe?id=${doc.id}`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await op.getByRole('button', { name: /Abrir PDF/ }).count()) > 0, 20000);
  await op.evaluate(() => { window.__abertos = []; window.open = (u) => { window.__abertos.push(u); return null; }; });
  await op.getByRole('button', { name: /Abrir PDF/ }).click();
  const urlPdf = await op.evaluate(() => window.__abertos[0]);
  const rPdf = await fetch(urlPdf);
  const corpoPdf = Buffer.from(await rPdf.arrayBuffer());
  ok(/token=/.test(urlPdf || '') && rPdf.ok && corpoPdf.subarray(0, 5).toString() === '%PDF-', `"Abrir PDF" abre o PDF por URL assinada (${rPdf.status})`);
  await op.screenshot({ path: `${SAIDA}/3-nf-detalhe-pdf.png`, fullPage: true });

  // Operador NÃO exclui: ou o botão não aparece, ou o registro continua.
  const btExcluir = op.getByRole('button', { name: /Excluir registro/ });
  if (await btExcluir.count()) {
    await btExcluir.click();
    await op.getByRole('button', { name: /Confirmar exclusão/ }).click();
    await op.waitForTimeout(2500);
    const { data: ainda } = await svc.from('nota_fiscal_arquivos').select('id').eq('id', doc.id);
    ok(ainda.length === 1, 'operador NÃO apaga a NF: o registro continua no banco (retenção legal)');
    const avisou = await op.getByRole('alert').count() + await op.getByText(/não foi possível|somente administradores|não pode/i).count();
    ok(avisou > 0, 'e a tela AVISA que não excluiu (em vez de voltar à lista como se tivesse excluído)');
  } else {
    ok(true, 'operador não vê "Excluir registro"');
  }
  // Admin vê o botão e exclui de fato (a NF de teste).
  await adm.goto(`${APP}/NotaFiscalDetalhe?id=${doc.id}`, { waitUntil: 'domcontentloaded' });
  await esperarPor(async () => (await adm.getByRole('button', { name: /Excluir registro/ }).count()) > 0, 20000);
  await adm.getByRole('button', { name: /Excluir registro/ }).click();
  await adm.getByRole('button', { name: /Confirmar exclusão/ }).click();
  const sumiu = await esperarPor(async () => {
    const { data } = await svc.from('nota_fiscal_arquivos').select('id').eq('id', doc.id);
    return data.length === 0;
  }, 15000);
  // A tela confere de novo no banco que a NF sumiu e SÓ ENTÃO navega: olhar a
  // URL no instante em que o banco já mostra a exclusão era corrida (falhou 3
  // vezes em rodadas longas em 20/10/2026). Espera as duas coisas.
  const voltou = sumiu && await esperarPor(async () => /\/NotasFiscais/.test(adm.url()), 15000);
  ok(sumiu && voltou, 'admin exclui a NF e volta para a lista', adm.url().replace(APP, ''));

  /* ── 2a. Empilhadeira ───────────────────────────────────────────────── */
  console.log('\n2a. ASSINATURAS — empilhadeira');
  const { data: cfg } = await svc.from('empilhadeira_configs').select('id').limit(1).single();
  const { data: opsSeed } = await svc.from('operators').select('id, nome').eq('ativo', true).like('nome', 'SEED-%').order('nome').limit(2);
  const { data: prog } = await svc.from('empilha_programacoes').insert({ data_programada: hoje, empilhadeira_id: cfg.id, observacoes: MARCA }).select('id').single();
  limpar.push(['empilha_programacoes', prog.id]);
  const { data: linha } = await svc.from('empilha_linhas').insert({
    programacao_id: prog.id, tipo_linha: 'Normal', status: 'Em Andamento', numero_item: MARCA,
    operador_empilhadeira: opsSeed[0].nome, operador_empilhadeira_id: opsSeed[0].id, hora_inicio: '06:00',
  }).select('id').single();
  limpar.push(['empilha_linhas', linha.id]);

  await op.goto(`${APP}/ExecutarEmpilha?id=${prog.id}`, { waitUntil: 'domcontentloaded' });
  await pronto(op);
  await op.getByRole('button', { name: /^Finalizar$/ }).click();
  const modalOp = op.getByRole('dialog');
  await esperarPor(async () => (await modalOp.getByText(/Confirmo que realizei esta movimentação/).count()) > 0, 15000);
  // Quem assina como operador é escolhido na lista (sem pré-preenchimento).
  const assinou = await escolher(op, modalOp, 0, opsSeed[0].nome);
  await modalOp.getByText(/Confirmo que realizei esta movimentação/).click();
  await modalOp.getByRole('button', { name: /Confirmar e continuar/ }).click();
  await esperarPor(async () => (await modalOp.getByText(/Aguardando Assinatura do Líder/i).count()) > 0, 15000);
  await op.screenshot({ path: `${SAIDA}/4-empilha-operador-assinou.png`, fullPage: true });
  await esperarPor(async () => {
    const { data } = await svc.from('empilha_linhas').select('status_assinatura').eq('id', linha.id).single();
    return data.status_assinatura === 'Parcial';
  }, 15000);
  const { data: l1 } = await svc.from('empilha_linhas').select('*').eq('id', linha.id).single();
  ok(l1.status === 'Concluído' && l1.assinatura_operador && l1.status_assinatura === 'Parcial',
    `operador finaliza e assina (${assinou}): ${l1.status}, assinatura_operador=${l1.assinatura_operador}, ${l1.status_assinatura}`);
  ok(l1.assinatura_operador_nome === opsSeed[0].nome, `a assinatura grava o nome ESCOLHIDO na lista (${l1.assinatura_operador_nome})`);
  await op.keyboard.press('Escape');
  await op.goto(`${APP}/ExecutarEmpilha?id=${prog.id}`, { waitUntil: 'domcontentloaded' });
  await pronto(op);
  ok(await op.getByRole('button', { name: /Assinar \(Líder\)/ }).count() === 0, 'operador NÃO vê "Assinar (Líder)"');

  await adm.goto(`${APP}/ExecutarEmpilha?id=${prog.id}`, { waitUntil: 'domcontentloaded' });
  await pronto(adm);
  await adm.getByRole('button', { name: /Assinar \(Líder\)/ }).click();
  const modalAdm = adm.getByRole('dialog');
  await esperarPor(async () => (await modalAdm.getByText(/Confirmo e assino como líder/).count()) > 0, 15000);
  const lider = await escolher(adm, modalAdm, 0, null);
  await modalAdm.getByText(/Confirmo e assino como líder/).click();
  await modalAdm.getByRole('button', { name: /Assinar como Líder/ }).click();
  await esperarPor(async () => {
    const { data } = await svc.from('empilha_linhas').select('status_assinatura').eq('id', linha.id).single();
    return data.status_assinatura === 'Completo';
  }, 15000);
  const { data: l2 } = await svc.from('empilha_linhas').select('*').eq('id', linha.id).single();
  ok(l2.assinatura_lider && l2.status_assinatura === 'Completo', `admin assina como líder (${lider}): ${l2.status_assinatura}`);
  await adm.screenshot({ path: `${SAIDA}/5-empilha-lider-assinou.png`, fullPage: true });

  /* ── 2b. Limpeza ────────────────────────────────────────────────────── */
  console.log('\n2b. ASSINATURAS — limpeza (responsável e líder)');
  const { data: local } = await svc.from('limpeza_locais').insert({ nome: `${MARCA} sala` }).select('id, nome').single();
  limpar.push(['limpeza_locais', local.id]);
  const { data: limp } = await svc.from('limpeza_programacoes').insert({
    local_id: local.id, local_nome: local.nome, data_prevista: hoje, tipo_limpeza: 'Varrição', status: 'Pendente',
    assinaturas_responsaveis: [{ id: 'r1', nome: opsSeed[1].nome, assinado: false, hora: null }],
  }).select('id').single();
  limpar.unshift(['limpeza_programacoes', limp.id]);

  await adm.goto(`${APP}/GerenciarUsuarios`, { waitUntil: 'domcontentloaded' });
  await pronto(adm);
  await adm.getByRole('tab', { name: /Limpeza/ }).click();
  const linhaLimp = adm.locator('div').filter({ hasText: local.nome }).filter({ has: adm.getByRole('button', { name: /Concluir/ }) }).last();
  await esperarPor(async () => (await linhaLimp.count()) > 0, 20000);
  await linhaLimp.getByRole('button', { name: /Concluir/ }).click();
  const modalL = adm.getByRole('dialog');
  await esperarPor(async () => (await modalL.getByText(opsSeed[1].nome).count()) > 0, 15000);
  await modalL.getByRole('button', { name: /^Assinar$/ }).click();
  await modalL.getByText(/Confirmo que realizei a limpeza/).click();
  await modalL.getByRole('button', { name: /Confirmar assinatura/ }).click();
  await esperarPor(async () => (await modalL.getByRole('button', { name: /Assinar como Líder/ }).count()) > 0, 15000);
  const { data: lp1 } = await svc.from('limpeza_programacoes').select('*').eq('id', limp.id).single();
  ok(lp1.status === 'Concluído' && lp1.assinatura_responsavel && lp1.status_assinatura === 'Parcial',
    `responsável assina: ${lp1.status}, assinatura_responsavel=${lp1.assinatura_responsavel}, ${lp1.status_assinatura}`);
  // O líder é escolhido na lista de operadores (antes: texto livre já
  // preenchido com o nome da conta). Sem escolher, o botão fica desabilitado.
  ok(await modalL.getByRole('button', { name: /Assinar como Líder/ }).isDisabled(), 'limpeza: sem escolher o líder, "Assinar como Líder" fica desabilitado');
  const liderLimpeza = await escolher(adm, modalL, 0, null);
  await modalL.getByRole('button', { name: /Assinar como Líder/ }).click();
  await esperarPor(async () => {
    const { data } = await svc.from('limpeza_programacoes').select('status_assinatura').eq('id', limp.id).single();
    return data.status_assinatura === 'Completo';
  }, 15000);
  const { data: lp2 } = await svc.from('limpeza_programacoes').select('*').eq('id', limp.id).single();
  ok(lp2.assinatura_lider && lp2.status_assinatura === 'Completo', `líder assina a limpeza: ${lp2.status_assinatura}`);
  await adm.screenshot({ path: `${SAIDA}/6-limpeza-assinada.png`, fullPage: true });

  /* ── 2c. Recebimento ────────────────────────────────────────────────── */
  console.log('\n2c. ASSINATURAS — recebimento (participante e líder)');
  const { data: rec } = await svc.from('recebimentos').insert({
    tipo: 'Nacional', numero_documento: MARCA, status: 'Em andamento',
    datetime_inicio: new Date(Date.now() - 30 * 60000).toISOString(),
  }).select('id').single();
  limpar.unshift(['recebimentos', rec.id]);
  const { data: part } = await svc.from('recebimento_participantes').insert({
    recebimento_id: rec.id, operator_id: opsSeed[0].id, operator_nome: opsSeed[0].nome, funcao: 'Coordenador',
  }).select('id').single();
  limpar.unshift(['recebimento_participantes', part.id]);

  await op.goto(`${APP}/ExecutarRecebimento?id=${rec.id}`, { waitUntil: 'domcontentloaded' });
  await pronto(op);
  await op.getByRole('button', { name: /^Finalizar$/ }).click();
  const modalR = op.getByRole('dialog');
  await esperarPor(async () => (await modalR.getByRole('button', { name: /^Assinar$/ }).count()) > 0, 15000);
  await modalR.getByRole('button', { name: /^Assinar$/ }).click();
  await modalR.locator(`label[for^="cf-"]`).first().click();
  await modalR.getByRole('button', { name: /^Confirmar$/ }).click();
  await esperarPor(async () => {
    const { data } = await svc.from('recebimentos').select('status_assinatura').eq('id', rec.id).single();
    return data.status_assinatura === 'Parcial';
  }, 15000);
  const { data: r1 } = await svc.from('recebimentos').select('*').eq('id', rec.id).single();
  const { data: p1 } = await svc.from('recebimento_participantes').select('assinou').eq('id', part.id).single();
  ok(r1.status === 'Concluído' && p1.assinou && r1.assinatura_coordenador && r1.status_assinatura === 'Parcial',
    `operador finaliza e o participante assina: ${r1.status}, coordenador=${r1.assinatura_coordenador}, ${r1.status_assinatura}`);
  await op.screenshot({ path: `${SAIDA}/7-recebimento-participante-assinou.png`, fullPage: true });

  await adm.goto(`${APP}/ExecutarRecebimento?id=${rec.id}`, { waitUntil: 'domcontentloaded' });
  await pronto(adm);
  await adm.getByRole('button', { name: /Assinaturas/ }).click();
  const modalRA = adm.getByRole('dialog');
  await esperarPor(async () => (await modalRA.getByRole('button', { name: /Assinar como Líder/ }).count()) > 0, 15000);
  ok(await modalRA.getByRole('button', { name: /Assinar como Líder/ }).isDisabled(), 'recebimento: sem escolher o líder, "Assinar como Líder" fica desabilitado');
  const liderReceb = await escolher(adm, modalRA, 0, null);
  await modalRA.getByRole('button', { name: /Assinar como Líder/ }).click();
  await esperarPor(async () => {
    const { data } = await svc.from('recebimentos').select('status_assinatura').eq('id', rec.id).single();
    return data.status_assinatura === 'Completo';
  }, 15000);
  const { data: r2 } = await svc.from('recebimentos').select('*').eq('id', rec.id).single();
  ok(r2.assinatura_lider && r2.status_assinatura === 'Completo', `admin assina como líder o recebimento: ${r2.status_assinatura}`);
  await adm.screenshot({ path: `${SAIDA}/8-recebimento-lider-assinou.png`, fullPage: true });
} catch (e) {
  ok(false, `a suíte parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  if (arquivos.length) await svc.storage.from('notas-fiscais').remove(arquivos);
  for (const [t, id] of limpar) await svc.from(t).delete().eq('id', id);
  await nav.close();
}
console.log('\n' + '='.repeat(72));
console.log(falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`);
process.exitCode = falhas ? 1 : 0;
