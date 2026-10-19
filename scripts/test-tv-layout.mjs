/**
 * scripts/test-tv-layout.mjs — a TV não pode transbordar, sobrepor nem cortar
 *
 * POR QUE ISTO EXISTE
 *
 * Em 16/10/2026 o dono fotografou a TV numa tela de 800×395: os números
 * gigantes cobriam a lista de operações, a legenda da meta escapava do cartão
 * e o nome "Empilhadeira El…" saía cortado no rodapé. Nenhum portão viu,
 * porque nenhum olhava a TV em tela baixa, com dado, depois das animações.
 *
 * O QUE ELE MEDE — no texto DESENHADO, não na caixa do elemento
 *
 * Um número de 200px dentro de um cartão de 120px de altura não muda a caixa
 * do elemento: o texto é que vaza. Por isso a medição usa `Range` sobre cada
 * nó de texto (a caixa real dos glifos), não `getBoundingClientRect` do pai.
 *
 *   - SOBREPOSIÇÃO: glifos de dois textos diferentes se cruzando, ou texto
 *     cruzando imagem/SVG de outro bloco;
 *   - ESTOURO: glifo fora do cartão a que pertence (`data-tv-cartao`) ou fora
 *     da janela;
 *   - CORTE: glifo fora do ancestral que recorta (`overflow` ≠ visible), ou
 *     reticências ativas (`text-overflow: ellipsis` com conteúdo maior);
 *   - LEGIBILIDADE: texto menor que 14 px em 1920×1080.
 *
 * MATRIZ: 4 resoluções (1920×1080, 1366×768, 1280×720 e a 800×395 do dono)
 * × 3 volumes (0, 1 e 12 operações em andamento) × 5 telas (os 4 painéis do
 * carrossel da Televisao e a TelevisaoEmpilha) × cada página da grade.
 *
 * Os dados de teste são criados no banco LOCAL e apagados no fim.
 *
 * Uso:  npx vite --port 5173     (noutro terminal)
 *       node scripts/test-tv-layout.mjs [--so=800x395] [--n=12]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enforceNonProductionGuard } from './lib/db-guard.js';
import { criarAjudantes, esperarPor } from './lib/ui-teste.js';

dotenv.config({ path: '.env.local' });
enforceNonProductionGuard('test-tv-layout');

const APP = process.env.APP_BASE_URL || 'http://127.0.0.1:5173';
const SHOTS = path.join('scratch', 'tv-layout');
fs.mkdirSync(SHOTS, { recursive: true });

const svc = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const { login } = criarAjudantes({ app: APP, svc });

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));

const RESOLUCOES = [[1920, 1080], [1366, 768], [1280, 720], [800, 395]]
  .filter(([w, h]) => !args.so || args.so === `${w}x${h}`);
const VOLUMES = [0, 1, 12].filter((n) => !args.n || String(n) === args.n);

const MARCA = 'TVTESTE';
const hoje = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const horaMenos = (min) => {
  const d = new Date(Date.now() - min * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ───────────────────────── dados de teste ───────────────────────── */

const criados = { envase: [], checkoutProg: [], checkoutItens: [], empilhaProg: [], empilhaLinhas: [] };

async function limpar() {
  // Pelo marcador, e não só pelos ids: uma rodada interrompida deixa sobra.
  await svc.from('envase_records').delete().like('op', `${MARCA}%`);
  await svc.from('checkout_itens').delete().like('numero_pedido', `${MARCA}%`);
  await svc.from('empilha_linhas').delete().like('numero_item', `${MARCA}%`);
  if (criados.checkoutProg.length) await svc.from('checkout_programacoes').delete().in('id', criados.checkoutProg);
  if (criados.empilhaProg.length) await svc.from('empilha_programacoes').delete().in('id', criados.empilhaProg);
  await svc.from('checkout_programacoes').delete().like('observacoes', `${MARCA}%`);
  await svc.from('empilha_programacoes').delete().like('observacoes', `${MARCA}%`);
  criados.checkoutProg = [];
  criados.empilhaProg = [];
}

async function semear(n) {
  await limpar();
  if (n === 0) return;

  const { data: ops } = await svc.from('operators').select('id, nome').eq('ativo', true).order('nome');
  const { data: prods } = await svc.from('products').select('codigo, nome').order('codigo').limit(5);
  const op = (i) => ops[i % ops.length];
  const prod = (i) => prods[i % prods.length];

  // Nomes longos DE PROPÓSITO: é com eles que layout quebra.
  const descricao = (i) => i % 3 === 0
    ? `${prod(i).nome} — GRAXA DE ALTA PERFORMANCE PARA ROLAMENTOS EM AMBIENTE ÚMIDO`
    : prod(i).nome;

  const envase = Array.from({ length: n }, (_, i) => ({
    sala: i % 2 === 0 ? 'Bio' : 'Industrial',
    data: hoje(),
    op: `${MARCA}-${String(i + 1).padStart(3, '0')}`,
    operador: op(i).nome,
    operator_id: op(i).id,
    codigo_produto: prod(i).codigo,
    descricao_produto: descricao(i),
    quantidade_produzida: 120 * (i + 1),
    inicio: horaMenos(15 + i * 7),
  }));
  const r1 = await svc.from('envase_records').insert(envase).select('id');
  if (r1.error) throw new Error(`envase: ${r1.error.message}`);

  const { data: cp, error: e2 } = await svc.from('checkout_programacoes')
    .insert({ data_programada: hoje(), observacoes: `${MARCA} programação de teste` }).select('id').single();
  if (e2) throw new Error(`checkout prog: ${e2.message}`);
  criados.checkoutProg.push(cp.id);
  const itens = Array.from({ length: n }, (_, i) => ({
    programacao_id: cp.id,
    numero_pedido: `${MARCA}-PV-${20230 + i}`,
    cliente: i % 3 === 0 ? 'Cooperativa Agroindustrial dos Produtores Rurais do Vale' : `Cliente ${i + 1} Ltda`,
    data_entrega: i % 4 === 0 ? '2026-01-02' : hoje(),
    operador: op(i).nome,
    operator_id: op(i).id,
    status: 'Em Andamento',
    hora_inicio: horaMenos(10 + i * 5),
    critico: i % 5 === 0,
  }));
  const r3 = await svc.from('checkout_itens').insert(itens);
  if (r3.error) throw new Error(`checkout itens: ${r3.error.message}`);

  const { data: emp } = await svc.from('empilhadeira_configs').select('id').limit(1).maybeSingle();
  if (!emp) throw new Error('nenhuma empilhadeira cadastrada no banco local');
  const { data: ep, error: e4 } = await svc.from('empilha_programacoes')
    .insert({ data_programada: hoje(), empilhadeira_id: emp.id, observacoes: `${MARCA} programação de teste` })
    .select('id').single();
  if (e4) throw new Error(`empilha prog: ${e4.message}`);
  criados.empilhaProg.push(ep.id);
  const linhas = Array.from({ length: n }, (_, i) => ({
    programacao_id: ep.id,
    tipo_linha: i % 4 === 0 ? 'Crítico' : 'Normal',
    numero_item: `${MARCA}-${i + 1}`,
    codigo_produto: prod(i).codigo,
    descricao_produto: descricao(i),
    deposito: 'EPB',
    rua_torre: `R${i + 1}-T2`,
    quantidade: 40 + i,
    status: 'Em Andamento',
    operador_empilhadeira: op(i).nome,
    operador_empilhadeira_id: op(i).id,
    operador_ajudante: op(i + 1).nome,
    operador_ajudante_id: op(i + 1).id,
    hora_inicio: horaMenos(8 + i * 4),
  }));
  const r5 = await svc.from('empilha_linhas').insert(linhas);
  if (r5.error) throw new Error(`empilha linhas: ${r5.error.message}`);
}

/* ───────────────────────── a medição ───────────────────────── */

/** Espera as animações FINITAS terminarem (as de entrada). As infinitas — o
 *  brilho do fundo, o ponto "ao vivo" — nunca terminam e ficam de fora. */
async function esperarAnimacoes(page) {
  await page.evaluate(() => Promise.all(
    document.getAnimations()
      .filter((a) => a.effect?.getTiming?.().iterations !== Infinity)
      .map((a) => a.finished.catch(() => {}))));
}

async function medir(page, conferirFonte, rola = false) {
  return page.evaluate(({ conferirFonte, rola }) => {
    const problemas = [];
    const vw = innerWidth, vh = innerHeight;

    const visivel = (el) => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
        if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return false;
        // `sr-only`: texto SÓ para leitor de tela, recortado num quadro de 1px.
        // O Range devolve a caixa dos glifos ANTES do recorte, e o rótulo do
        // menu recolhido aparecia "sobre" o conteúdo da página em 800px.
        const r = n.getBoundingClientRect();
        if (cs.clip && cs.clip !== 'auto' && r.width <= 2 && r.height <= 2) return false;
        if (cs.overflow === 'hidden' && r.width <= 2 && r.height <= 2) return false;
      }
      return true;
    };
    const area = (a, b) => {
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return x * y;
    };
    const dentro = (r, c, folga = 1) =>
      r.left >= c.left - folga && r.right <= c.right + folga && r.top >= c.top - folga && r.bottom <= c.bottom + folga;
    const nome = (el) => {
      const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
      return `${el.tagName.toLowerCase()} "${t}"`;
    };

    // Os blocos de texto, com a caixa REAL dos glifos.
    const textos = [];
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let no = andar.nextNode(); no; no = andar.nextNode()) {
      if (!no.textContent.trim()) continue;
      const el = no.parentElement;
      if (!el || el.closest('svg') || el.closest('script,style')) continue;
      if (!visivel(el)) continue;
      const rg = document.createRange();
      rg.selectNodeContents(no);
      const caixas = [...rg.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!caixas.length) continue;
      // CAIXA DE TINTA, não caixa de conteúdo. `getClientRects` devolve a área
      // de conteúdo da fonte (~1,37em na Manrope: ascendente + descendente),
      // MAIOR que a linha quando a entrelinha é 1,0–1,1. Duas linhas vizinhas
      // do mesmo bloco — o relógio e o dia da semana, por exemplo — cruzam
      // essas caixas sem nenhum glifo se tocar. A tinta fica entre ~0,3em
      // abaixo do topo e ~0,1em acima do fundo. A tolerância é pequena perto
      // do defeito que se procura: um número de 200px sobre uma lista.
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      // Sem letra de descendente (g j p q y ç , ;), a tinta para na linha de
      // base, ~0,28em acima do fundo da caixa. "07:53" sobre "Segunda-Feira"
      // foi acusado em 1366×768 por esta diferença — sem nenhum pixel em comum.
      const desce = /[gjpqyçQ,;()]/.test(no.textContent);
      const recuoBaixo = (desce ? 0.1 : 0.28) * fs;
      const rects = caixas.map((r) => ({
        left: r.left, right: r.right,
        top: r.top + 0.3 * fs, bottom: r.bottom - recuoBaixo,
        width: r.width, height: Math.max(0, r.height - 0.3 * fs - recuoBaixo),
      }));
      textos.push({ el, rects, caixas });
    }

    // Imagens e SVGs que importam (fotos, logos, anel).
    const figuras = [...document.querySelectorAll('img, svg')]
      .filter((f) => visivel(f) && f.getBoundingClientRect().width > 4)
      .map((f) => ({ el: f, r: f.getBoundingClientRect() }));

    for (const t of textos) {
      const cs = getComputedStyle(t.el);

      // legibilidade
      if (conferirFonte && parseFloat(cs.fontSize) < 14) {
        problemas.push({ tipo: 'fonte < 14px', alvo: nome(t.el), detalhe: cs.fontSize });
      }

      for (const r of t.rects) {
        // estouro da janela
        // Numa tela que ROLA (o /Painel), passar da altura da janela é normal.
        if (r.left < -1 || r.right > vw + 1 || (!rola && (r.top < -1 || r.bottom > vh + 1))) {
          problemas.push({ tipo: 'estoura a tela', alvo: nome(t.el),
            detalhe: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}` });
          break;
        }
        // estouro do cartão
        const cartao = t.el.closest('[data-tv-cartao]');
        if (cartao && !dentro(r, cartao.getBoundingClientRect(), 1.5)) {
          problemas.push({ tipo: 'estoura o cartão', alvo: nome(t.el),
            detalhe: `texto ${Math.round(r.bottom)}px, cartão até ${Math.round(cartao.getBoundingClientRect().bottom)}px` });
          break;
        }
        // corte por ancestral que recorta
        for (let n = t.el.parentElement; n && n !== document.body; n = n.parentElement) {
          const ov = getComputedStyle(n);
          if (ov.overflow !== 'visible' || ov.overflowX !== 'visible' || ov.overflowY !== 'visible') {
            // Em tela que ROLA, um contêiner com rolagem (o menu lateral, por
            // exemplo) esconde de propósito o que está fora da vista. Recorte
            // de verdade é `hidden`/`clip`.
            const rolavel = /auto|scroll/.test(ov.overflowY + ov.overflowX);
            if (rola && rolavel) break;
            if (!dentro(r, n.getBoundingClientRect(), 1.5)) {
              problemas.push({ tipo: 'texto cortado', alvo: nome(t.el), detalhe: `recortado por ${n.tagName.toLowerCase()}` });
            }
            break;
          }
        }
      }

      // reticências ativas
      if (cs.textOverflow === 'ellipsis' && t.el.scrollWidth > t.el.clientWidth + 1) {
        problemas.push({ tipo: 'texto cortado com …', alvo: nome(t.el), detalhe: '' });
      }
    }

    // sobreposição texto × texto
    for (let i = 0; i < textos.length; i += 1) {
      for (let j = i + 1; j < textos.length; j += 1) {
        const a = textos[i], b = textos[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const sob = a.rects.some((ra) => b.rects.some((rb) => area(ra, rb) > 6));
        if (sob) problemas.push({ tipo: 'sobreposição', alvo: nome(a.el), detalhe: `com ${nome(b.el)}` });
      }
    }

    // sobreposição texto × figura de outro bloco
    for (const t of textos) {
      for (const f of figuras) {
        if (f.el.contains(t.el) || t.el.contains(f.el)) continue;
        const mesmoBloco = t.el.closest('[data-tv-bloco]') && t.el.closest('[data-tv-bloco]') === f.el.closest('[data-tv-bloco]');
        if (mesmoBloco) continue;
        if (t.rects.some((r) => area(r, f.r) > 6)) {
          problemas.push({ tipo: 'texto sobre figura', alvo: nome(t.el), detalhe: `sobre ${f.el.tagName.toLowerCase()}` });
        }
      }
    }

    // Um problema por (tipo, alvo): sem isso doze linhas iguais viram 400 avisos.
    const vistos = new Set();
    return problemas.filter((p) => {
      const k = `${p.tipo}|${p.alvo}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }, { conferirFonte, rola });
}

/* ───────────────────────── a rodada ───────────────────────── */

const resultados = [];

async function conferirTela(page, rotulo, w, h, n, rola = false) {
  await esperarAnimacoes(page);
  await page.waitForTimeout(250);

  // Cada página da grade de operações, se houver mais de uma.
  const paginas = await page.locator('[data-tv-pagina]').count();
  const total = Math.max(1, paginas);
  for (let p = 0; p < total; p += 1) {
    if (paginas > 1) {
      await page.locator('[data-tv-pagina]').nth(p).click();
      await esperarAnimacoes(page);
      await page.waitForTimeout(200);
    }
    const problemas = await medir(page, w === 1920 && h === 1080 && !rola, rola);
    const nomeArq = `${w}x${h}_${n}op_${rotulo}${total > 1 ? `_p${p + 1}` : ''}.png`;
    await page.screenshot({ path: path.join(SHOTS, nomeArq) });

    const item = `${String(w).padStart(4)}×${h} · ${String(n).padStart(2)} op · ${rotulo}${total > 1 ? ` (pág. ${p + 1}/${total})` : ''}`;
    resultados.push({ item, problemas, arquivo: nomeArq });
    console.log(`  ${problemas.length ? 'FALHA' : 'OK   '} ${item}${problemas.length ? ` — ${problemas.length} problema(s)` : ''}`);
    for (const pr of problemas.slice(0, 4)) console.log(`          ${pr.tipo}: ${pr.alvo} ${pr.detalhe}`);
  }
}

async function main() {
  console.log('='.repeat(84));
  console.log(`TV — LAYOUT  |  app ${APP}`);
  console.log('='.repeat(84));

  const nav = await chromium.launch({ headless: true });
  const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const entrou = await login(page, { email: process.env.TEST_TV_EMAIL, senha: process.env.TEST_TV_PASSWORD });
  if (!entrou) throw new Error('a conta da TV não entrou');

  try {
    for (const n of VOLUMES) {
      await semear(n);
      console.log(`\n[${n} operação(ões) em andamento]`);

      for (const [w, h] of RESOLUCOES) {
        await page.setViewportSize({ width: w, height: h });

        // Televisao: quatro painéis no carrossel. A rotação é pausada antes de
        // medir, senão o painel troca no meio da medição.
        await page.goto(`${APP}/Televisao`, { waitUntil: 'domcontentloaded' });
        await esperarPor(async () => (await page.getByRole('tab').count()) >= 4, 30000);
        await page.waitForTimeout(1500);   // as consultas chegam
        const pausar = page.getByRole('button', { name: /pausar rotação/i });
        if (await pausar.count()) await pausar.click();

        const abas = page.getByRole('tab');
        const nAbas = await abas.count();
        for (let a = 0; a < nAbas; a += 1) {
          const rotulo = (await abas.nth(a).getAttribute('aria-label')) || `painel${a}`;
          await abas.nth(a).click();
          await page.waitForTimeout(400);
          await conferirTela(page, `Televisao-${rotulo}`, w, h, n);
        }

        await page.goto(`${APP}/TelevisaoEmpilha`, { waitUntil: 'domcontentloaded' });
        await esperarPor(async () => (await page.locator('[data-tv-cartao]').count()) > 0
          || (await page.getByText(/Movimentação de hoje/i).count()) > 0, 30000);
        await page.waitForTimeout(1500);
        await conferirTela(page, 'TelevisaoEmpilha', w, h, n);

        // O /Painel também vai para a parede, na conta da TV. Ele ROLA, então
        // "estoura a tela" não se aplica e a regra de 14px também não (é tela
        // de escritório, lida de perto); sobreposição e corte, sim.
        await page.goto(`${APP}/Painel`, { waitUntil: 'domcontentloaded' });
        await esperarPor(async () => (await page.getByText(/Painel geral/i).count()) > 0, 30000);
        await page.waitForTimeout(1500);
        await conferirTela(page, 'Painel', w, h, n, true);
      }
    }
  } finally {
    await limpar();
    await nav.close();
  }

  const falhas = resultados.filter((r) => r.problemas.length);
  fs.writeFileSync(path.join(SHOTS, 'resultado.json'), JSON.stringify(resultados, null, 2));
  console.log('\n' + '='.repeat(84));
  console.log(`TV: ${resultados.length - falhas.length} OK, ${falhas.length} FALHA(S), de ${resultados.length} telas medidas`);
  console.log(`capturas em ${SHOTS}`);
  console.log('='.repeat(84));
  process.exit(falhas.length ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await limpar().catch(() => {}); process.exit(1); });
