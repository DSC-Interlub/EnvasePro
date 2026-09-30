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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Configurações de servidor Supabase ausentes.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { ocorrencia_id } = req.body || {};
    if (!ocorrencia_id) {
      return res.status(400).json({ error: 'ocorrencia_id obrigatório' });
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

    // 2. Buscar destinatários configurados na tabela notificacao_destinatarios (somente ativos)
    const { data: destinatarios, error: errDest } = await supabase
      .from('notificacao_destinatarios')
      .select('email, nome')
      .eq('ativo', true);

    if (errDest) {
      console.error('[notificarOcorrencia] Erro ao consultar tabela notificacao_destinatarios:', errDest.message);
      return res.status(500).json({ error: `Erro ao buscar destinatários: ${errDest.message}` });
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

    if (notificados === 0 && errosEnvio.length > 0) {
      return res.status(502).json({
        error: 'Falha no envio de e-mails pelo provedor.',
        detalhes: errosEnvio
      });
    }

    return res.status(200).json({
      notificados,
      message: `Notificação enviada com sucesso para ${notificados} destinatário(s).`
    });
  } catch (error) {
    console.error('[notificarOcorrencia] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
