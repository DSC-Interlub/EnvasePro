/**
 * Vercel Serverless Function — notificarOcorrencia
 * Notifica administradores por e-mail quando uma ocorrência de empilhadeira é registrada.
 * 
 * Regras:
 * - Roda no backend (Node.js runtime na Vercel).
 * - Usa SUPABASE_SERVICE_ROLE_KEY no servidor (nunca exposta ao frontend).
 * - Lição 5: Domínio de produção fixo (APP_BASE_URL), nunca headers de requisição ou VERCEL_URL.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lição 5: Domínio fixo de produção
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://envase.interlub.com.br';

// ── Rate limiting in-memory (por IP) ──────────────────────────────────────────
// Item 15: Limita 10 chamadas por IP por janela de 60 segundos.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateLimitMap = new Map(); // ip → { count, windowStart }

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true; // OK
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false; // Excedeu
  return true;
}

// ── UUID v4 validator ─────────────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // Rate limiting (Item 15)
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde antes de tentar novamente.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurações de servidor Supabase ausentes.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Item 4: Exigir Authorization Bearer e validar com supabase.auth.getUser(token)
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Autenticação obrigatória. Forneça o cabeçalho Authorization: Bearer <token>.' });
    }
    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação ausente.' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
    }

    const { ocorrencia_id } = req.body || {};
    if (!ocorrencia_id) {
      return res.status(400).json({ error: 'ocorrencia_id obrigatório' });
    }

    // Item 3: Validação de tipo/formato do parâmetro — deve ser UUID v4
    if (typeof ocorrencia_id !== 'string' || !UUID_REGEX.test(ocorrencia_id)) {
      return res.status(400).json({ error: 'ocorrencia_id inválido.' });
    }

    // 1. Buscar a ocorrência
    const { data: ocorrencia, error: errOcorr } = await supabase
      .from('empilha_ocorrencias')
      .select('*')
      .eq('id', ocorrencia_id)
      .maybeSingle();

    if (errOcorr || !ocorrencia) {
      return res.status(404).json({ error: 'Ocorrência não encontrada' });
    }

    // Item 4: Idempotência — se já possui notificado_em preenchido, aborta disparo duplicado
    if (ocorrencia.notificado_em) {
      return res.status(200).json({
        notificados: 0,
        ja_notificado: true,
        notificado_em: ocorrencia.notificado_em,
        message: `Esta ocorrência já foi notificada anteriormente em ${ocorrencia.notificado_em}. Disparo duplicado prevenido com sucesso.`
      });
    }

    // 2. Buscar destinatários configurados na tabela notificacao_destinatarios (somente ativos)
    const { data: destinatarios, error: errDest } = await supabase
      .from('notificacao_destinatarios')
      .select('email, nome')
      .eq('ativo', true);

    if (errDest) {
      console.error('[notificarOcorrencia] Erro ao consultar tabela notificacao_destinatarios:', errDest.message);
      return res.status(500).json({ error: 'Erro interno ao buscar destinatários.' });
    }

    if (!destinatarios || destinatarios.length === 0) {
      console.warn('[notificarOcorrencia] AVISO CRÍTICO: Nenhum destinatário ativo cadastrado em notificacao_destinatarios. Alerta não disparado.');
      return res.status(200).json({
        notificados: 0,
        aviso: 'Nenhum destinatário ativo configurado no sistema.',
        message: 'A ocorrência foi registrada, porém nenhum e-mail foi enviado pois a tabela notificacao_destinatarios está sem destinatários ativos.'
      });
    }

    // 3. Buscar dados da linha vinculada se houver
    let infoLinha = '';
    if (ocorrencia.linha_id) {
      const { data: linha } = await supabase
        .from('empilha_linhas')
        .select('*')
        .eq('id', ocorrencia.linha_id)
        .maybeSingle();

      if (linha) {
        infoLinha = `\nProduto: ${linha.descricao_produto || 'N/A'}\nLocal: ${linha.rua_torre || 'N/A'} — ${linha.deposito || 'N/A'}`;
      }
    }

    const assunto = `[EnvasePro] Nova ocorrência — ${ocorrencia.tipo || 'Ocorrência'} — ${ocorrencia.data || ''} ${ocorrencia.hora || ''}`;
    const linkSistema = `${APP_BASE_URL}/Empilhadeira`;

    const corpo = `Uma nova ocorrência foi registrada no módulo Empilhadeira do EnvasePro.

Tipo: ${ocorrencia.tipo || 'N/A'}
Descrição: ${ocorrencia.descricao || 'N/A'}
Registrado por: ${ocorrencia.registrado_por || 'N/A'} (${ocorrencia.registrado_por_funcao || 'N/A'})
Data/Hora: ${ocorrencia.data || ''} ${ocorrencia.hora || ''}${infoLinha}

Acesse o sistema para visualizar e resolver a ocorrência:
${linkSistema}`;

    console.log(`[notificarOcorrencia] Disparando notificação para ${destinatarios.length} destinatário(s) cadastrado(s):`, destinatarios.map(d => d.email));

    // Validação estrita do provedor de e-mail (Resend)
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('[notificarOcorrencia] ERRO: RESEND_API_KEY não configurada no ambiente.');
      return res.status(500).json({
        error: 'Provedor de e-mail não configurado. Defina a variável de ambiente RESEND_API_KEY na Vercel.'
      });
    }

    // Item 3: Reserva atômica de notificado_em ANTES de disparar e-mails
    // Impede race conditions onde duas chamadas simultâneas tentam enviar emails ao mesmo tempo
    const agoraIso = new Date().toISOString();
    const { data: reservado, error: errReserva } = await supabase
      .from('empilha_ocorrencias')
      .update({ notificado_em: agoraIso })
      .eq('id', ocorrencia_id)
      .is('notificado_em', null)
      .select('id, notificado_em');

    if (errReserva) {
      console.error('[notificarOcorrencia] Erro ao reservar atomicamente notificado_em:', errReserva.message);
      return res.status(500).json({ error: 'Erro ao reservar notificação da ocorrência.' });
    }

    if (!reservado || reservado.length === 0) {
      // Outra requisição paralela reservou ou notificou milissegundos antes
      const { data: atual } = await supabase
        .from('empilha_ocorrencias')
        .select('notificado_em')
        .eq('id', ocorrencia_id)
        .maybeSingle();

      return res.status(200).json({
        notificados: 0,
        ja_notificado: true,
        notificado_em: atual?.notificado_em || agoraIso,
        message: 'Esta ocorrência já foi reservada ou notificada por outra requisição simultânea. Disparo concorrente prevenido com sucesso.'
      });
    }

    let notificados = 0;
    const errosEnvio = [];

    for (const dest of destinatarios) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'EnvasePro <onboarding@resend.dev>',
            to: [dest.email],
            subject: assunto,
            text: corpo
          })
        });

        const emailJson = await emailRes.json();
        if (!emailRes.ok) {
          console.error(`Erro ao enviar e-mail para ${dest.email}:`, emailJson);
          errosEnvio.push({ email: dest.email, error: emailJson });
        } else {
          notificados++;
        }
      } catch (e) {
        console.error(`Erro ao enviar e-mail para ${dest.email}:`, e);
        errosEnvio.push({ email: dest.email, error: e.message });
      }
    }

    // Se todos os envios falharam, reverte a reserva atômica (rollback)
    if (notificados === 0 && errosEnvio.length > 0) {
      await supabase
        .from('empilha_ocorrencias')
        .update({ notificado_em: null })
        .eq('id', ocorrencia_id);

      return res.status(502).json({
        error: 'Falha no envio de e-mails pelo provedor.',
        detalhes: errosEnvio
      });
    }

    return res.status(200).json({
      notificados,
      notificado_em: agoraIso,
      message: `Notificação enviada com sucesso para ${notificados} destinatário(s).`
    });
  } catch (error) {
    console.error('[notificarOcorrencia] Erro interno:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a notificação. Verifique os logs do servidor.' });
  }
}
