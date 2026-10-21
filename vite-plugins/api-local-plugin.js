/**
 * Só LOCAL (`vite` de desenvolvimento e `vite preview` do build de produção):
 * serve /api/admin-usuarios pelo próprio servidor do Vite, chamando o MESMO
 * arquivo que a Vercel executa em produção. Não entra no build.
 *
 * Sem isto, a tela de Gerenciar Usuários não teria como ser testada na
 * interface real no banco local (o `vite` não roda funções serverless, e o
 * `vercel dev` exige login na Vercel).
 *
 * As variáveis vêm do .env.local, que aponta para o Supabase LOCAL (o
 * db-guard dos scripts recusa outro alvo). O plugin recusa subir se a URL não
 * for local, para que um .env.local trocado nunca faça o servidor local
 * administrar contas de produção.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

const ROTAS = { '/api/admin-usuarios': '/api/admin-usuarios.js' };
const URL_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

function prepararAmbiente(mode, logger) {
  const env = loadEnv(mode, process.cwd(), '');
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  if (!URL_LOCAL.test(url)) {
    logger.warn(`[api-local] desligado: ${url ? 'a URL do Supabase não é local' : 'sem URL do Supabase'}`);
    return false;
  }
  for (const k of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY']) {
    if (env[k] && !process.env[k]) process.env[k] = env[k];
  }
  return true;
}

function middleware(carregar, logger) {
  return async (req, res, next) => {
    const caminho = (req.url || '').split('?')[0];
    const arquivo = ROTAS[caminho];
    if (!arquivo) return next();

    let bruto = '';
    for await (const pedaco of req) {
      bruto += pedaco;
      if (bruto.length > 16384) break;
    }
    let body = bruto;
    try { body = bruto ? JSON.parse(bruto) : {}; } catch { /* a função responde 400 */ }

    const resposta = {
      status(c) { res.statusCode = c; return resposta; },
      setHeader(k, v) { res.setHeader(k, v); return resposta; },
      json(obj) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(obj));
        return resposta;
      },
    };
    try {
      const mod = await carregar(arquivo);
      await mod.default({ method: req.method, headers: req.headers, body }, resposta);
    } catch (e) {
      logger.error(`[api-local] ${caminho}: ${e?.message || e}`);
      if (!res.headersSent) { res.statusCode = 500; res.end('{"erro":"falha no servidor local"}'); }
    }
  };
}

export function apiLocalPlugin(mode) {
  return {
    name: 'api-local',
    configureServer(server) {
      if (!prepararAmbiente(mode, server.config.logger)) return;
      server.middlewares.use(middleware((arq) => server.ssrLoadModule(arq), server.config.logger));
    },
    // `vite preview` (build de produção servido localmente): sem grafo de
    // módulos, a função é carregada pelo import nativo do Node.
    configurePreviewServer(server) {
      if (!prepararAmbiente(mode, server.config.logger)) return;
      const carregar = (arq) => import(pathToFileURL(path.join(process.cwd(), arq)).href);
      server.middlewares.use(middleware(carregar, server.config.logger));
    },
  };
}
