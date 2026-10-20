/**
 * scripts/test-telas-abrem.mjs
 *
 * Abre TODAS as telas, nos dois papéis, e falha se alguma quebrar.
 *
 * POR QUE ISTO FALTAVA
 *
 * Em 15/10/2026 a tela `IndicadoresEmpilha` ficou completamente quebrada —
 * `CORES_GRAFICO is not defined`, só a moldura de erro aparecia — e TODOS os
 * portões continuaram verdes:
 *
 *  - `vite build` não pega: o projeto não tem checagem de tipos, e um
 *    identificador inexistente só explode quando aquele componente renderiza;
 *  - `test-imports` não pega: ele procura COMPONENTE usado sem import, e isto
 *    era uma função;
 *  - `test-rotas-admin` não pega: ele confere que a URL ficou na rota, e uma
 *    tela quebrada fica na mesma URL.
 *
 * Este teste olha para o que importa: a tela DESENHOU? Falha se houver erro não
 * capturado, se a moldura de erro aparecer, ou se a tela vier praticamente
 * vazia.
 *
 * Uso:  npx vite --port 5173     (noutro terminal)
 *       node scripts/test-telas-abrem.mjs
 */
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-telas-abrem');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { login, abrir } = criarAjudantes({ app: APP, svc });

const TELAS = {
  admin: ['Dashboard', 'Painel', 'Registros', 'NovoRegistro', 'Checkout',
    'NovaProgramacaoCheckout', 'Empilhadeira', 'NovaEmpilhaProgramacao',
    'EmpilhadeiraConfig', 'IndicadoresEmpilha', 'Recebimento', 'IndicadoresRecebimento',
    'ChecklistRecebimento', 'NovoChecklist', 'NotasFiscais', 'NovaNotaFiscal',
    'Produtos', 'Embalagens', 'Operadores', 'GerenciarUsuarios',
    'ImportarProdutos', 'ImportarEmbalagens', 'ImportarCategorias'],
  operador: ['Dashboard', 'NovoRegistro', 'Registros', 'Checkout', 'Empilhadeira',
    'Recebimento', 'ChecklistRecebimento', 'NotasFiscais'],
};

const CONTAS = {
  admin: { email: process.env.TEST_ADMIN_EMAIL, senha: process.env.TEST_ADMIN_PASSWORD },
  operador: { email: process.env.TEST_OPERATOR_EMAIL, senha: process.env.TEST_OPERATOR_PASSWORD },
};

/** Ruído do servidor de desenvolvimento, não da aplicação. */
const ruidoDeDev = (t) => /vite|WebSocket|HMR|react-refresh|ERR_CONNECTION_REFUSED|favicon/i.test(t);

const resultados = [];
function registrar(item, ok, detalhe = '') {
  resultados.push({ item, ok, detalhe });
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${item}${detalhe ? ` -> ${detalhe}` : ''}`);
}

async function main() {
  console.log('='.repeat(78));
  console.log(`TODAS AS TELAS ABREM  |  app ${APP}`);
  console.log('='.repeat(78));

  const nav = await chromium.launch({ headless: true });

  for (const [papel, telas] of Object.entries(TELAS)) {
    console.log(`\n[${papel}]`);
    const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    const quebras = [];
    page.on('pageerror', (e) => {
      if (!ruidoDeDev(String(e.message))) quebras.push(String(e.message).slice(0, 140));
    });

    await login(page, CONTAS[papel]);

    for (const tela of telas) {
      quebras.length = 0;
      await abrir(page, tela);

      // Espera a tela assentar: ou veio conteúdo, ou veio a moldura de erro.
      await esperarPor(async () => page.evaluate(() => {
        const texto = document.body.innerText || '';
        return texto.length > 120 || /Não foi possível abrir esta tela/i.test(texto);
      }), 15000);

      const diag = await page.evaluate(() => {
        const texto = document.body.innerText || '';
        return {
          molduraDeErro: /Não foi possível abrir esta tela/i.test(texto),
          tamanho: texto.replace(/\s+/g, ' ').trim().length,
        };
      });

      const ok = !diag.molduraDeErro && quebras.length === 0 && diag.tamanho > 120;
      registrar(`/${tela} desenha`, ok,
        ok ? '' : [
          diag.molduraDeErro ? 'moldura de erro na tela' : null,
          quebras.length ? `erro: ${quebras[0]}` : null,
          diag.tamanho <= 120 ? `só ${diag.tamanho} caracteres na tela` : null,
        ].filter(Boolean).join(' | '));
    }

    await ctx.close();
  }

  await nav.close();

  const ok = resultados.filter((r) => r.ok).length;
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(78));
  console.log(`TELAS: ${ok} OK, ${falhas.length} FALHA(S), de ${resultados.length}`);
  if (falhas.length) {
    console.log('\nFalhas:');
    for (const f of falhas) console.log(`  - ${f.item} (${f.detalhe})`);
  }
  console.log('='.repeat(78));
  process.exit(falhas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
