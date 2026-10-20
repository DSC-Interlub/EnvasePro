/**
 * scripts/test-sistema-do-zero.mjs — o sistema funciona a partir de um banco VAZIO? (banco LOCAL)
 *
 * Reproduz, no banco local, o estado de produção depois da limpeza total:
 *   1. APAGA o banco local (todas as tabelas de public, todas as contas) e
 *      zera os protocolos — exige --apagar-banco-local;
 *   2. cria SÓ a conta admin, com senha temporária (como criar-admin-producao);
 *   3. na TELA: o admin entra, troca a senha, e em Configurações → Usuários
 *      cria a conta de operador e a de TV ("Uso em TV"); cada uma entra com a
 *      senha temporária e troca a senha;
 *   4. abre todas as telas de admin, de operador e as 3 de TV com o banco
 *      vazio e relata, tela por tela: abre? quebra? depende de algum cadastro
 *      ou configuração para servir de algo?
 *   5. confere que gerar_protocolo começa em 000001.
 *
 * As senhas que cada conta escolhe são as TEST_*_PASSWORD do .env.local, para
 * as outras suítes continuarem rodando depois. Para voltar ao estado de teste
 * normal: supabase db reset + seed-local-auth + semear-volume (o script lembra).
 *
 * Uso: node scripts/test-sistema-do-zero.mjs --apagar-banco-local
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { gerarSenhaTemporaria } from '../api/admin-usuarios.js';

dotenv.config({ path: '.env.local', quiet: true });
enforceNonProductionGuard('test-sistema-do-zero');
const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP) || !/127\.0\.0\.1|localhost/.test(process.env.VITE_SUPABASE_URL)) {
  console.error('Recusado: só roda contra o app e o banco LOCAIS.'); process.exit(2);
}
if (!process.argv.includes('--apagar-banco-local')) {
  console.error('Este script APAGA o banco local inteiro. Confirme com --apagar-banco-local.'); process.exit(2);
}
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'supabase_db_envase', 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
const SAIDA = 'scratch/sistema-do-zero';
fs.mkdirSync(SAIDA, { recursive: true });

let falhas = 0;
const ok = (c, m, extra = '') => { console.log(`  ${c ? 'OK   ' : 'FALHA'} ${m}${extra ? ` -> ${extra}` : ''}`); if (!c) falhas += 1; };
const nota = (m) => console.log(`  NOTA  ${m}`);
const esperarPor = async (f, ms = 20000, passo = 250) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (await f()) return true; } catch { /* tenta de novo */ } await new Promise((r) => setTimeout(r, passo)); } return false; };

const CONTAS = {
  admin: { email: process.env.TEST_ADMIN_EMAIL, final: process.env.TEST_ADMIN_PASSWORD },
  operador: { email: process.env.TEST_OPERATOR_EMAIL, final: process.env.TEST_OPERATOR_PASSWORD, nome: 'Operações Equipe' },
  tv: { email: process.env.TEST_TV_EMAIL, final: process.env.TEST_TV_PASSWORD, nome: 'TV Fábrica' },
};

console.log('='.repeat(78));
console.log('O SISTEMA FUNCIONA DO ZERO? — banco LOCAL');
console.log('='.repeat(78));

// ── 1. Zerar ──────────────────────────────────────────────────────────────
console.log('\n1. Zerando o banco local');
psql(`
DO $$ DECLARE lista text; BEGIN
  ALTER TABLE public.auditoria_usuarios DISABLE TRIGGER trg_auditoria_usuarios_sem_truncate;
  SELECT string_agg(format('public.%I', c.relname), ', ') INTO lista
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p');
  EXECUTE 'truncate table ' || lista || ' restart identity cascade';
  ALTER TABLE public.auditoria_usuarios ENABLE TRIGGER trg_auditoria_usuarios_sem_truncate;
  PERFORM setval(format('public.%I', s.sequencename), 1, false) FROM pg_sequences s WHERE s.schemaname = 'public' AND s.sequencename LIKE 'seq_%';
  DELETE FROM auth.users;
END $$;`);
const contagem = psql(`select (select count(*) from auth.users) || '/' ||
  (select sum((xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int)
     from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r')`).trim();
ok(contagem === '0/0', 'banco local vazio: 0 contas, 0 linhas em public', contagem);

// ── 2. Só o admin ─────────────────────────────────────────────────────────
console.log('\n2. Criando só a conta admin (senha temporária)');
const tempAdmin = gerarSenhaTemporaria();
const { data: ca, error: eCa } = await svc.auth.admin.createUser({
  email: CONTAS.admin.email, password: tempAdmin, email_confirm: true,
  user_metadata: { full_name: 'PCP Brasil' }, app_metadata: { trocar_senha: true, uso_tv: false },
});
if (eCa) throw new Error(eCa.message);
const { error: eP } = await svc.from('user_profiles').update({ role: 'admin', full_name: 'PCP Brasil' }).eq('id', ca.user.id);
ok(!eP, 'perfil admin gravado pela service_role');

const nav = await chromium.launch({ headless: true });
const erros = [];
async function contexto(nome) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Ruído do servidor de desenvolvimento (recarregamento automático), não do app.
  page.on('pageerror', (e) => { if (!/vite|WebSocket|HMR|react-refresh/i.test(String(e.message))) erros.push(`${nome}: ${String(e.message).slice(0, 140)}`); });
  return { ctx, page };
}
async function entrarETrocar(page, email, temporaria, final, rotulo) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.locator('#email').waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(temporaria);
  await page.locator('button[type="submit"]').first().click();
  await page.getByRole('heading', { name: 'Crie a sua senha' }).waitFor({ timeout: 30000 });
  ok(true, `${rotulo}: com a senha temporária, cai em "Crie a sua senha"`);
  await page.locator('#senha-atual').fill(temporaria);
  await page.locator('#senha-nova').fill(final);
  await page.locator('#senha-confirma').fill(final);
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  const entrou = await esperarPor(async () => (await page.getByRole('heading', { name: 'Crie a sua senha' }).count()) === 0
    && (await page.locator('#email').count()) === 0, 30000);
  ok(entrou, `${rotulo}: trocou a senha e entrou no sistema`);
}

try {
  // ── 3. Admin cria operador e TV pela tela ──────────────────────────────
  console.log('\n3. Pela tela: admin entra, troca a senha e cria operador e TV');
  const A = await contexto('admin');
  await entrarETrocar(A.page, CONTAS.admin.email, tempAdmin, CONTAS.admin.final, 'admin');
  await A.page.goto(`${APP}/GerenciarUsuarios`, { waitUntil: 'domcontentloaded' });
  await A.page.getByRole('button', { name: 'Novo usuário' }).waitFor({ timeout: 30000 });
  const temporarias = {};
  for (const papel of ['operador', 'tv']) {
    await A.page.getByRole('button', { name: 'Novo usuário' }).click();
    await A.page.locator('#conta-nome').fill(CONTAS[papel].nome);
    await A.page.locator('#conta-email').fill(CONTAS[papel].email);
    if (papel === 'tv') await A.page.getByText('Uso em TV').click();
    await A.page.getByRole('button', { name: 'Criar usuário' }).click();
    const caixa = A.page.locator('[data-senha-temporaria]');
    await caixa.waitFor({ timeout: 20000 });
    temporarias[papel] = (await caixa.innerText()).trim();
    await A.page.getByRole('button', { name: 'Já anotei' }).click();
    await esperarPor(async () => (await caixa.count()) === 0, 5000);
    ok(temporarias[papel].length === 20, `admin criou a conta ${papel === 'tv' ? 'de TV (Operador + Uso em TV)' : 'de operador'} pela tela`);
  }
  await A.page.screenshot({ path: `${SAIDA}/1-usuarios-criados.png`, fullPage: true });
  for (const papel of ['operador', 'tv']) {
    const X = await contexto(papel);
    await entrarETrocar(X.page, CONTAS[papel].email, temporarias[papel], CONTAS[papel].final, papel);
    await X.ctx.close();
  }

  // ── 4. Todas as telas com o banco vazio ────────────────────────────────
  console.log('\n4. Todas as telas, banco vazio');
  const TELAS = {
    admin: ['Dashboard', 'Painel', 'Registros', 'NovoRegistro', 'Checkout', 'NovaProgramacaoCheckout', 'Empilhadeira',
      'NovaEmpilhaProgramacao', 'EmpilhadeiraConfig', 'IndicadoresEmpilha', 'Recebimento', 'IndicadoresRecebimento',
      'ChecklistRecebimento', 'NovoChecklist', 'NotasFiscais', 'NovaNotaFiscal', 'Produtos', 'Embalagens', 'Operadores',
      'GerenciarUsuarios', 'ImportarProdutos', 'ImportarEmbalagens', 'ImportarCategorias', 'AlterarSenha'],
    operador: ['Dashboard', 'NovoRegistro', 'Registros', 'Checkout', 'Empilhadeira', 'Recebimento', 'ChecklistRecebimento', 'NotasFiscais', 'AlterarSenha'],
    tv: ['Televisao', 'TelevisaoEmpilha', 'Painel'],
  };
  const sessoes = { admin: A };
  for (const papel of ['operador', 'tv']) {
    const X = await contexto(papel);
    await X.page.goto(APP, { waitUntil: 'domcontentloaded' });
    await X.page.locator('#email').waitFor({ timeout: 30000 });
    await X.page.waitForTimeout(300);
    await X.page.locator('#email').fill(CONTAS[papel].email);
    await X.page.locator('#password').fill(CONTAS[papel].final);
    await X.page.locator('button[type="submit"]').first().click();
    await esperarPor(async () => (await X.page.locator('#email').count()) === 0, 30000);
    sessoes[papel] = X;
  }
  // Operador com o banco vazio: o modal "Quem é você hoje?" não tem ninguém.
  const op = sessoes.operador.page;
  await op.waitForTimeout(2000);
  const modal = await op.getByText(/quem é você hoje/i).count();
  if (modal) {
    const opcoes = await op.locator('[role="dialog"] button').filter({ hasNotText: /fechar|cancelar|close/i }).count();
    nota(`operador: o modal "Quem é você hoje?" abre com ${opcoes} botão(ões) — sem operadores cadastrados não há quem escolher (DEPENDE do cadastro de operadores)`);
    await op.screenshot({ path: `${SAIDA}/2-operador-modal-vazio.png` });
    await op.keyboard.press('Escape').catch(() => {});
  }
  for (const [papel, telas] of Object.entries(TELAS)) {
    const page = sessoes[papel].page;
    for (const tela of telas) {
      const antes = erros.length;
      await page.goto(`${APP}/${tela}`, { waitUntil: 'domcontentloaded' });
      await esperarPor(async () => page.evaluate(() => (document.body.innerText || '').length > 80), 15000);
      await page.waitForTimeout(1500);
      const d = await page.evaluate(() => {
        const t = document.body.innerText || '';
        return { moldura: /Não foi possível abrir esta tela/i.test(t), login: !!document.querySelector('#email'),
          tamanho: t.replace(/\s+/g, ' ').trim().length, url: location.pathname };
      });
      const novos = erros.slice(antes);
      const bom = !d.moldura && !d.login && novos.length === 0 && d.tamanho > 80;
      ok(bom, `${papel} /${tela} abre com o banco vazio`, bom ? (d.url.toLowerCase() !== `/${tela}`.toLowerCase() ? `redirecionou para ${d.url}` : '')
        : [d.moldura && 'moldura de erro', d.login && 'caiu no login', novos[0], d.tamanho <= 80 && `só ${d.tamanho} caracteres`].filter(Boolean).join(' | '));
      await page.screenshot({ path: `${SAIDA}/tela-${papel}-${tela}.png` });
    }
  }

  // Telas que abrem mas DEPENDEM de cadastro/configuração para servir.
  console.log('\n   O que depende de cadastro ou configuração (banco vazio):');
  const ad = sessoes.admin.page;
  await ad.goto(`${APP}/NovoRegistro`, { waitUntil: 'domcontentloaded' });
  await ad.waitForTimeout(2500);
  nota('NovoRegistro (envase): sem produtos cadastrados a busca não acha nada — DEPENDE de products (e embalagens)');
  await ad.goto(`${APP}/Empilhadeira`, { waitUntil: 'domcontentloaded' });
  await ad.waitForTimeout(2500);
  const textoEmp = await ad.evaluate(() => document.body.innerText);
  nota(`Empilhadeira: ${/manuten/i.test(textoEmp) ? 'abre; manutenção/paradas usam empilhadeira_configs' : 'abre'} — sem empilhadeira cadastrada (EmpilhadeiraConfig), a TV da empilhadeira e a manutenção ficam sem equipamento`);
  nota('Limpeza: as programações dependem de limpeza_locais (Configurações → Programação de Limpeza)');
  nota('Recebimento: fornecedores (recebimento_fornecedores) e operadores participantes vêm de cadastro');
  nota('Alertas de ocorrência por e-mail: sem notificacao_destinatarios, ninguém recebe');

  // ── 5. Protocolos começam em 000001 ────────────────────────────────────
  console.log('\n5. Protocolos');
  const prot = psql("select public.gerar_protocolo('ENV', 'public.seq_envase_protocolo')").trim();
  ok(/^ENV-\d{4}-000001$/.test(prot), 'o primeiro protocolo depois de zerar é 000001', prot);
  psql("select setval('public.seq_envase_protocolo', 1, false)");
  ok(erros.length === 0, 'nenhum erro de JavaScript em tela nenhuma', erros[0] || '');
} catch (e) {
  ok(false, `parou: ${String(e.message || e).split('\n')[0].slice(0, 200)}`);
} finally {
  await nav.close();
}
console.log('\n' + (falhas ? `${falhas} FALHA(S)` : `TUDO OK — capturas em ${SAIDA}/`));
console.log('Para voltar ao estado de teste: npx supabase db reset && npm run seed:local-auth && node scripts/semear-volume.mjs');
process.exitCode = falhas ? 1 : 0;
