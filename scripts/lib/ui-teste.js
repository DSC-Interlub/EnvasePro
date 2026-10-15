/**
 * scripts/lib/ui-teste.js
 *
 * Os ajudantes de teste de interface — login, espera por condicao, abrir rota,
 * vigiar erros — num lugar so.
 *
 * Nasceu no `test-fase3-ui.js`, que ainda mantem a propria copia. Unificar os
 * dois no meio de um modulo de redesenho significaria mexer numa suite verde
 * para provar outra coisa; a unificacao esta marcada para a rodada de testes do
 * fechamento (Bloco 4), quando a suite inteira e reexecutada de qualquer jeito.
 *
 * A regra que vale aqui, e que custou caro aprender: ESPERA POR CONDICAO, nunca
 * por tempo fixo. Espera fixa produz falso negativo em 1 de cada 5 rodadas e
 * faz perder tempo investigando o que nao esta quebrado.
 */

export async function esperarPor(condicao, limiteMs = 20000, intervaloMs = 250) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (await condicao()) return true;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return false;
}

/** Ruido do servidor de desenvolvimento, nao do app. */
const ruidoDeDev = (t) => /vite|WebSocket|HMR|react-refresh|ERR_CONNECTION_REFUSED/i.test(t);

export function vigiar(page) {
  const erros = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !ruidoDeDev(m.text())) erros.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on('pageerror', (e) => {
    if (!ruidoDeDev(String(e.message))) erros.push(`pageerror: ${String(e.message).slice(0, 160)}`);
  });
  // O CORPO da resposta vai junto de proposito. "HTTP 409" sozinho nao diz se
  // foi chave duplicada ou chave estrangeira — o PostgREST usa 409 para as
  // duas —, e sem a mensagem do Postgres o diagnostico vira adivinhacao.
  page.on('response', async (r) => {
    if (r.status() < 400 || !r.url().includes('/rest/v1/')) return;
    let corpo = '';
    try { corpo = (await r.text()).slice(0, 240); } catch { /* corpo ja consumido */ }
    erros.push(`HTTP ${r.status()} ${r.url().split('/rest/v1/')[1]?.slice(0, 60)} ${corpo}`);
  });
  return erros;
}

/**
 * "Esta autenticado" nao pode ser medido pela ausencia do campo de e-mail: a
 * tela deslogada tambem nao o tem (mostra o botao que abre o modal).
 */
export async function estaAutenticado(page) {
  const temBotaoLogin = await page.getByRole('button', { name: /fazer login/i }).count();
  const temCampoEmail = await page.locator('#email').count();
  return temBotaoLogin === 0 && temCampoEmail === 0;
}

export function criarAjudantes({ app, svc }) {
  async function login(page, conta) {
    await page.goto(app, { waitUntil: 'domcontentloaded' });

    await esperarPor(async () =>
      (await page.getByRole('button', { name: /fazer login/i }).count()) > 0 ||
      (await page.locator('#email').count()) > 0 ||
      (await estaAutenticado(page)));

    const botaoAbrir = page.getByRole('button', { name: /fazer login/i });
    if (await botaoAbrir.count()) {
      await botaoAbrir.first().click();
      await esperarPor(async () => (await page.locator('#email').count()) > 0, 10000);
    }

    const campoEmail = page.locator('#email');
    if (await campoEmail.count()) {
      await campoEmail.fill(conta.email);
      await page.locator('#password').fill(conta.senha);
      await page.locator('button[type="submit"]').first().click();
      await esperarPor(async () =>
        (await estaAutenticado(page)) ||
        (await page.locator('button').filter({ hasText: /SEED-/ }).count()) > 0);
    }

    // Modal do operador fisico. O overlay intercepta o ponteiro (`force`) e a
    // lista chega de forma assincrona, trocando o no sob o cursor.
    const tituloOperador = page.getByText(/quem é você hoje/i);
    if (await esperarPor(async () => (await tituloOperador.count()) > 0, 6000)) {
      for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
        const opcoes = page.locator('button').filter({ hasText: /SEED-/ });
        if (!(await opcoes.count())) break;
        await opcoes.first().click({ force: true });
        if (await esperarPor(async () => (await tituloOperador.count()) === 0, 6000)) break;
      }
    }

    // O que mantem o modal fechado e a chave no localStorage. Se o clique nao a
    // gravou, o modal reabre em toda navegacao e bloqueia as telas seguintes.
    const temOperador = await page.evaluate(() => {
      try { return !!localStorage.getItem('envase_current_operator'); } catch { return false; }
    });
    if (!temOperador && svc) {
      const { data: umOperador } = await svc
        .from('operators').select('*').eq('ativo', true).order('nome').limit(1).single();
      await page.evaluate((op) => {
        try { localStorage.setItem('envase_current_operator', JSON.stringify(op)); } catch { /* vazio */ }
      }, umOperador);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }

    await esperarPor(() => estaAutenticado(page), 10000);
    return estaAutenticado(page);
  }

  /**
   * Abre a rota e espera a pagina ficar CLICAVEL, nao um tempo fixo.
   *
   * O Radix poe `pointer-events: none` no body enquanto um dialogo esta aberto
   * e o restaura fora do ciclo do React. Clicar nesse intervalo falha com
   * "element intercepts pointer events" e parece defeito do app.
   */
  async function abrir(page, rota) {
    await page.goto(`${app}/${rota}`, { waitUntil: 'domcontentloaded' });
    await esperarPor(async () =>
      page.evaluate(() => {
        const corpo = getComputedStyle(document.body).pointerEvents !== 'none';
        const pronto = document.querySelectorAll('button,a,input').length > 3;
        return corpo && pronto;
      }), 20000);
    return estaAutenticado(page);
  }

  return { login, abrir };
}
