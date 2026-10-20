/**
 * Só em DESENVOLVIMENTO: serve /api/admin-usuarios pelo próprio servidor do
 * Vite, chamando o MESMO arquivo que a Vercel executa em produção.
 *
 * Sem isto, a tela de Gerenciar Usuários não teria como ser testada na
 * interface real no banco local (o `vite` não roda funções serverless, e o
 * `vercel dev` exige login na Vercel).
 *
 * As variáveis vêm do .env.local, que aponta para o Supabase LOCAL (o
 * db-guard dos scripts recusa outro alvo). O plugin recusa subir se a URL não
 * for local, para que um .env.local trocado nunca faça o servidor de
 * desenvolvimento administrar contas de produção.
 */
import { loadEnv } from 'vite';

const ROTAS = { '/api/admin-usuarios': '/api/admin-usuarios.js' };

export function apiLocalPlugin(mode) {
  return {
    name: 'api-local',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '');
      const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
      if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
        server.config.logger.warn(`[api-local] desligado: ${url ? 'a URL do Supabase não é local' : 'sem URL do Supabase'}`);
        return;
      }
      for (const k of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY']) {
        if (env[k] && !process.env[k]) process.env[k] = env[k];
      }

      server.middlewares.use(async (req, res, next) => {
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
          const mod = await server.ssrLoadModule(arquivo);
          await mod.default({ method: req.method, headers: req.headers, body }, resposta);
        } catch (e) {
          server.config.logger.error(`[api-local] ${caminho}: ${e?.message || e}`);
          if (!res.headersSent) { res.statusCode = 500; res.end('{"erro":"falha no servidor local"}'); }
        }
      });
    },
  };
}
