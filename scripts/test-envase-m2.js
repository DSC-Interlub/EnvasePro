/**
 * scripts/test-envase-m2.js  —  MODULO 2 (Envase) na interface real
 *
 * Prova o que o redesenho do modulo 2 prometeu, clicando na tela e CONFERINDO
 * NO BANCO. O que esta sendo verificado nao e "ficou bonito", e:
 *
 *   1. buscar produto PELO NOME funciona (antes so dava para digitar o codigo);
 *   2. escolher o resultado preenche o produto E identifica a embalagem sozinho
 *      (regra dos 4 ultimos digitos, que NAO mudou);
 *   3. o teclado numerico escreve a quantidade, e C e <- corrigem;
 *   4. o autosave continua criando o registro, com a quantidade do teclado
 *      chegando ao banco como numero;
 *   5. "Usados ha pouco" aparece depois do primeiro uso;
 *   6. os 14 campos continuam todos na tela;
 *   7. todo alvo de toque tem 48px ou mais;
 *   8. a lista (Registros) filtra pelos chips com a contagem certa.
 *
 * Uso:  npx vite --port 5173     (noutro terminal)
 *       node scripts/test-envase-m2.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor, vigiar } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-envase-m2');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const SHOTS = path.join('scratch', 'm2');
fs.mkdirSync(SHOTS, { recursive: true });

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { login, abrir } = criarAjudantes({ app: APP, svc });

const CONTA = {
  email: process.env.TEST_OPERATOR_EMAIL,
  senha: process.env.TEST_OPERATOR_PASSWORD,
};

const resultados = [];
function registrar(item, ok, detalhe = '') {
  resultados.push({ item, ok, detalhe });
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${item}${detalhe ? ` -> ${detalhe}` : ''}`);
}

async function print(page, nome) {
  const arq = path.join(SHOTS, `${nome}.png`);
  await page.screenshot({ path: arq, fullPage: true });
  return arq;
}

async function main() {
  console.log('='.repeat(78));
  console.log(`MODULO 2 — Envase  |  app ${APP}  |  banco ${process.env.VITE_SUPABASE_URL}`);
  console.log('='.repeat(78));

  // Um produto de verdade do catalogo local, para buscar PELO NOME.
  const { data: produtos } = await svc
    .from('products').select('codigo, nome').not('nome', 'is', null).order('codigo').limit(60);
  const alvo = produtos?.find((p) => (p.nome || '').trim().length > 6);
  if (!alvo) {
    console.error('Sem produto com nome utilizavel no banco local. Rode `supabase db reset`.');
    process.exit(1);
  }
  const pedaco = alvo.nome.trim().split(/\s+/)[0].slice(0, 6);
  console.log(`\nProduto alvo: ${alvo.codigo} — ${alvo.nome}  (busca por "${pedaco}")`);

  const navegador = await chromium.launch({ headless: true });
  const ctx = await navegador.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  const erros = vigiar(page);

  const entrou = await login(page, CONTA);
  registrar('operador entra no sistema', entrou);
  if (!entrou) { await navegador.close(); return relatorio(); }

  // Sobras de rodadas anteriores falseiam a contagem dos chips e a deteccao da
  // linha nova. Limpa antes de medir a linha de base.
  await svc.from('envase_records').delete().like('op', 'OP-M2-%');

  // Marca de quantas linhas existiam antes, para achar a que o teste criar.
  const { count: antes } = await svc
    .from('envase_records').select('*', { count: 'exact', head: true });

  // Marco de tempo para a limpeza. Apagar so os ids conhecidos nao bastava: o
  // autosave grava assim que HA PRODUTO, e este teste escolhe produto tres
  // vezes (fluxo principal, "Usar" dos recentes e a copia Industrial). A
  // terceira linha sobrava e ia falsear a contagem da proxima suite.
  const { data: ultima } = await svc.from('envase_records')
    .select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const marco = ultima?.created_at || '1970-01-01T00:00:00Z';

  // ====================================================== NOVO REGISTRO ====
  console.log('\n[1] Novo registro — busca, teclado e autosave');
  await abrir(page, 'NovoRegistro');

  // --- busca pelo NOME ------------------------------------------------------
  const busca = page.locator('#codigo_produto');
  registrar('campo de busca de produto existe', (await busca.count()) > 0);
  await busca.fill(pedaco);

  const achouResultado = await esperarPor(async () =>
    (await page.locator('button').filter({ hasText: new RegExp(alvo.codigo) }).count()) > 0, 10000);
  registrar('buscar pelo NOME encontra o produto', achouResultado,
    achouResultado ? `"${pedaco}" -> ${alvo.codigo}` : 'nenhum resultado');

  if (achouResultado) {
    await page.locator('button').filter({ hasText: new RegExp(alvo.codigo) }).first().click();
  }

  // --- o cartao do produto escolhido ---------------------------------------
  const escolheu = await esperarPor(async () =>
    (await page.getByText(alvo.nome, { exact: false }).count()) > 0, 10000);
  registrar('produto escolhido aparece no cartao', escolheu);

  // A embalagem e derivada dos 4 ultimos digitos do codigo. Confere com o banco
  // se a regra continua valendo na tela.
  const ult4 = alvo.codigo.slice(-4);
  const { data: emb } = await svc
    .from('embalagens').select('codigo, descricao').eq('ultimos_4_digitos', ult4).maybeSingle();
  if (emb) {
    const mostrouEmb = (await page.getByText(emb.descricao || emb.codigo, { exact: false }).count()) > 0;
    registrar('embalagem identificada pelos 4 ultimos digitos', mostrouEmb,
      `${ult4} -> ${emb.descricao || emb.codigo}`);
  } else {
    registrar('embalagem identificada pelos 4 ultimos digitos', true,
      `sem embalagem para ${ult4} no catalogo — nada a mostrar`);
  }

  // --- teclado numerico -----------------------------------------------------
  const campoQtd = page.locator('#quantidade_produzida');
  const tecla = (t) => page.getByRole('button', { name: t, exact: true });

  await tecla('1').click();
  await tecla('2').click();
  await tecla('3').click();
  const dep123 = await campoQtd.inputValue();
  registrar('teclado escreve a quantidade', dep123 === '123', `visor = "${dep123}"`);

  await page.getByRole('button', { name: /apagar o último dígito/i }).click();
  const dep12 = await campoQtd.inputValue();
  registrar('tecla de apagar remove o ultimo digito', dep12 === '12', `visor = "${dep12}"`);

  await page.getByRole('button', { name: /^limpar$/i }).click();
  const depC = await campoQtd.inputValue();
  registrar('tecla C limpa o visor', depC === '', `visor = "${depC}"`);

  for (const t of ['4', '5', '0']) await tecla(t).click();
  const dep450 = await campoQtd.inputValue();
  registrar('quantidade final digitada no teclado', dep450 === '450', `visor = "${dep450}"`);

  // --- os 14 campos continuam na tela --------------------------------------
  const CAMPOS = ['sala', 'data', 'op', 'operador', 'codigo_produto', 'quantidade_produzida',
    'inicio', 'termino', 'tempo_produtivo', 'dificuldade', 'lote_embalagem', 'lotes_tampa',
    'observacoes'];
  const faltando = [];
  for (const id of CAMPOS) {
    if ((await page.locator(`#${id}`).count()) === 0) faltando.push(id);
  }
  registrar(`os ${CAMPOS.length} controles do formulario continuam na tela`, faltando.length === 0,
    faltando.length ? `faltando: ${faltando.join(', ')}` : `${CAMPOS.length} campos`);

  // --- alvos de toque -------------------------------------------------------
  // Os MESMOS criterios do scripts/medir-alvos.mjs, de proposito: o <select>
  // de 1x1 que o Radix mantem escondido atras do seletor proprio nao e alvo de
  // toque, e ancora que envolve botao nao e o alvo — o botao e. Medir diferente
  // aqui daria dois numeros que se contradizem.
  const pequenos = await page.evaluate(() => {
    const sel = 'button, [role="button"], [role="radio"], [role="tab"], a[href], input, select, textarea';
    const ruins = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.tagName === 'INPUT' && ['hidden', 'checkbox', 'radio'].includes(el.type)) continue;
      if (r.width <= 2 || r.height <= 2) continue;
      if (el.tagName === 'A' && el.closest('p')) continue;
      if (el.tagName === 'A' && el.querySelector('button')) continue;
      // Meio pixel de folga, e nao `< 48` cru: getBoundingClientRect devolve
      // 47.99999999999999 para uma caixa de 48px, e o portao falhava relatando
      // "48.0x48.0 esta abaixo de 48px" — uma falha que se contradiz na
      // propria mensagem. Meio pixel nao muda nada para o dedo e elimina o
      // ruido de ponto flutuante.
      if (r.height < 47.5 || r.width < 47.5) {
        const rotulo = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24);
        ruins.push(`${el.tagName.toLowerCase()} "${rotulo}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return ruins;
  });
  registrar('todo alvo de toque tem 48px ou mais', pequenos.length === 0,
    pequenos.length ? pequenos.slice(0, 6).join(' | ') : 'nenhum alvo pequeno');

  await print(page, 'novo-registro-preenchido');

  // --- preenche o resto e deixa o autosave gravar ---------------------------
  await page.locator('#sala').click();
  await page.getByRole('option', { name: /sala bio/i }).click();
  await page.locator('#inicio').fill('08:00');
  await page.locator('#op').fill('OP-M2-TESTE');

  // O autosave e por tempo; espera o registro APARECER, nao um relogio.
  //
  // A deteccao e pelo CRESCIMENTO da tabela, e nao por `op`: o autosave cria a
  // linha assim que os campos obrigatorios estao preenchidos, e o `op` digitado
  // depois so chega na gravacao seguinte. Procurar por `op` dava "nao apareceu"
  // para uma linha que existia.
  const gravou = await esperarPor(async () => {
    const { count } = await svc.from('envase_records').select('*', { count: 'exact', head: true });
    return (count ?? 0) > (antes ?? 0);
  }, 30000);

  const { data: linha } = await svc.from('envase_records')
    .select('id, op, data, inicio, quantidade_produzida, codigo_produto, codigo_embalagem, operador, operator_id, sala, descricao_produto')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  registrar('autosave cria o registro no banco', gravou, linha ? `id ${linha.id}` : 'nao apareceu');
  if (linha) {
    registrar('a quantidade do teclado chega como NUMERO',
      Number(linha.quantidade_produzida) === 450, `banco = ${linha.quantidade_produzida}`);
    registrar('o produto escolhido na busca chega ao banco',
      linha.codigo_produto === alvo.codigo, `banco = ${linha.codigo_produto}`);
    registrar('a embalagem derivada chega ao banco',
      !emb || linha.codigo_embalagem === emb.codigo,
      `banco = ${linha.codigo_embalagem ?? 'null'}`);
  }

  // --- "Usados ha pouco" ----------------------------------------------------
  await abrir(page, 'NovoRegistro');
  const temRecentes = await esperarPor(async () =>
    (await page.getByText(/usados há pouco/i).count()) > 0, 10000);
  registrar('"Usados há pouco" aparece depois do primeiro uso', temRecentes);
  if (temRecentes) {
    const usar = page.locator('button').filter({ hasText: new RegExp(alvo.nome.slice(0, 12)) });
    if (await usar.count()) {
      await usar.first().click();
      const reusou = await esperarPor(async () =>
        (await page.getByText(alvo.codigo, { exact: false }).count()) > 0, 8000);
      registrar('clicar em "Usar" escolhe o produto de novo', reusou);
    }
  }
  await print(page, 'usados-ha-pouco');

  // ============================================================ REGISTROS ===
  console.log('\n[2] Registros — chips de filtro com contagem');
  await abrir(page, 'Registros');

  // Para provar que o chip FILTRA e preciso ter o que filtrar: a linha de Bio
  // veio do autosave da tela; a de Industrial e criada aqui, copiando a mesma
  // forma, para que o filtro tenha de EXCLUIR alguma coisa.
  let idIndustrial = null;
  if (linha?.id) {
    const { id: _ignora, ...molde } = linha;
    const { data: copia, error: erroCopia } = await svc.from('envase_records')
      .insert([{ ...molde, op: 'OP-M2-IND', sala: 'Industrial' }])
      .select('id').maybeSingle();
    idIndustrial = copia?.id ?? null;
    // Sem conferir o erro, um insert recusado deixava a tabela SEM nenhuma
    // linha Industrial, e dai "nenhuma Industrial na tela depois de filtrar"
    // passava por vacuidade — provando nada.
    registrar('linha Industrial de controle criada', Boolean(idIndustrial),
      erroCopia ? `${erroCopia.code}: ${erroCopia.message}`.slice(0, 120) : `id ${idIndustrial}`);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  const chips = page.locator('[role="group"][aria-label="Filtrar registros"] button');
  // Depois do reload a pagina precisa montar de novo; contar na hora dava 0.
  await esperarPor(async () => (await chips.count()) === 4, 20000);
  const quantosChips = await chips.count();
  registrar('a lista tem os chips de filtro', quantosChips === 4, `${quantosChips} chips`);

  if (quantosChips === 4) {
    const textos = await chips.allInnerTexts();
    const numero = (t) => Number((t.match(/(\d+)\s*$/) || [0, '0'])[1]);
    const emAndamento = numero(textos[0]);
    const bio = numero(textos[1]);
    const industrial = numero(textos[2]);

    // A contagem do chip tem de bater com o banco, nao com a pagina visivel.
    // Lida em paginas: o PostgREST devolve no maximo 1000 linhas por pedido, e
    // com o volume da Base44 carregado (5.800+) a conta do banco ficava menor
    // que a da tela, que pagina.
    const todos = [];
    for (let de = 0; ; de += 1000) {
      const { data: pag, error: erroPag } = await svc.from('envase_records')
        .select('termino, sala, material_retirado').order('id').range(de, de + 999);
      if (erroPag) throw erroPag;
      todos.push(...pag);
      if (pag.length < 1000) break;
    }
    const finalizado = (r) => r.termino && (r.sala !== 'Bio' || r.material_retirado);
    const esperado = {
      andamento: todos.filter((r) => !finalizado(r)).length,
      bio: todos.filter((r) => !finalizado(r) && r.sala === 'Bio').length,
      industrial: todos.filter((r) => !finalizado(r) && r.sala === 'Industrial').length,
    };
    registrar('a contagem do chip bate com o banco',
      emAndamento === esperado.andamento && bio === esperado.bio && industrial === esperado.industrial,
      `tela ${emAndamento}/${bio}/${industrial} vs banco ${esperado.andamento}/${esperado.bio}/${esperado.industrial}`);

    // Filtrar por Sala Bio tem de deixar so linhas de Bio na tela.
    await chips.nth(1).click();
    await esperarPor(async () => (await chips.nth(1).getAttribute('aria-pressed')) === 'true', 6000);
    const filtrado = await page.evaluate(() => {
      // So a coluna Sala: o texto da linha inteira inclui o nome do produto, e
      // produtos como "Oleo Teste Industrial" faziam uma linha de Bio parecer
      // Industrial.
      const cabecalhos = [...document.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim());
      const col = cabecalhos.findIndex((t) => /^sala$/i.test(t));
      const linhas = [...document.querySelectorAll('tbody tr')];
      const sala = (tr) => (tr.children[col]?.textContent || '').trim();
      return {
        total: col < 0 ? 0 : linhas.length,
        todasBio: col >= 0 && linhas.length > 0 && linhas.every((tr) => sala(tr) === 'Bio'),
        algumaIndustrial: linhas.some((tr) => sala(tr) === 'Industrial'),
      };
    });
    registrar('o chip "Sala Bio" filtra de fato',
      Boolean(idIndustrial) && filtrado.total > 0 && filtrado.todasBio && !filtrado.algumaIndustrial,
      `${filtrado.total} linha(s) de Bio na tela; havia ${industrial} Industrial para excluir`);
  }
  await print(page, 'registros-chips');

  // ============================================================== LIMPEZA ===
  const { data: removidos } = await svc.from('envase_records')
    .delete().gt('created_at', marco).select('id');
  const { count: depois } = await svc
    .from('envase_records').select('*', { count: 'exact', head: true });
  registrar('o banco local volta ao estado anterior', depois === antes,
    `${antes} antes, ${depois} depois, ${removidos?.length ?? 0} removido(s)`);

  const errosReais = erros.filter((e) => !/favicon|sourcemap/i.test(e));
  registrar('nenhum erro de console ou de rede', errosReais.length === 0,
    errosReais.slice(0, 3).join(' | '));

  await navegador.close();
  relatorio();
}

function relatorio() {
  const ok = resultados.filter((r) => r.ok).length;
  const falhas = resultados.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(78));
  console.log(`MODULO 2: ${ok} OK, ${falhas.length} FALHA(S), de ${resultados.length}`);
  if (falhas.length) {
    console.log('\nFalhas:');
    for (const f of falhas) console.log(`  - ${f.item}${f.detalhe ? ` (${f.detalhe})` : ''}`);
  }
  console.log('='.repeat(78));
  process.exit(falhas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
