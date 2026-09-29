/**
 * Vercel Serverless Function — /api/tv-session
 * Autentica com segurança os quiosques de TV físicos da fábrica (telas /Televisao e /TelevisaoEmpilha)
 * sem expor credenciais fixas no frontend público.
 * 
 * Regras de Segurança:
 * - Valida cabeçalho 'x-kiosk-secret' contra process.env.TV_KIOSK_SECRET (Vercel Sensitive).
 * - Rate limiting in-memory por IP (máx 10 tentativas / minuto).
 * - Retorna 401 Unauthorized se o segredo for inválido ou ausente.
 * - Retorna sessão de operador do Supabase para consumo estrito pelas telas de TV.
 */

import { createClient } from '@supabase/supabase-js';

// In-memory rate limiting por IP (10 requisições a cada 60 segundos)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const clientData = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW_MS;
    rateLimitMap.set(ip, clientData);
    return true;
  }

  clientData.count++;
  rateLimitMap.set(ip, clientData);
  return clientData.count <= MAX_REQUESTS_PER_WINDOW;
}

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const TV_KIOSK_SECRET = process.env.TV_KIOSK_SECRET;
  const TV_USER_EMAIL = process.env.TV_USER_EMAIL || 'tv-fabrica@interlub.com';
  const TV_USER_PASSWORD = process.env.TV_USER_PASSWORD;

  // 1. Método estrito POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  }

  // 2. Extrair IP para Rate Limiting
  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();

  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde um minuto antes de tentar novamente.' });
  }

  // 3. Validação do Kiosk Secret
  const clientSecret = req.headers['x-kiosk-secret'];
  if (!TV_KIOSK_SECRET) {
    console.error('[/api/tv-session] Erro de configuração: TV_KIOSK_SECRET não definida no servidor.');
    return res.status(500).json({ error: 'Configuração do servidor pendente (TV_KIOSK_SECRET ausente).' });
  }

  if (!clientSecret || clientSecret !== TV_KIOSK_SECRET) {
    return res.status(401).json({ error: 'Acesso não autorizado: Kiosk Secret ausente ou inválido.' });
  }

  // 4. Verificação de credenciais de serviço
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Configuração do Supabase ausente no servidor.' });
  }

  if (!TV_USER_PASSWORD) {
    console.error('[/api/tv-session] Erro de configuração: TV_USER_PASSWORD não definida no servidor.');
    return res.status(500).json({ error: 'Configuração do servidor pendente (TV_USER_PASSWORD ausente).' });
  }

  try {
    // 5. Autenticar usuário tv-fabrica@interlub.com no Supabase Auth
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: TV_USER_EMAIL,
      password: TV_USER_PASSWORD,
    });

    if (error || !data.session) {
      console.error('[/api/tv-session] Falha na autenticação do usuário de TV no Supabase:', error?.message);
      return res.status(502).json({ error: 'Não foi possível autenticar o usuário da TV no Supabase.' });
    }

    // 6. Retorna tokens de sessão válidos
    return res.status(200).json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role
      }
    });
  } catch (err) {
    console.error('[/api/tv-session] Erro inesperado:', err);
    return res.status(500).json({ error: 'Erro interno ao processar sessão de TV.' });
  }
}
