/**
 * Utilitário cliente para gerenciar a autenticação das telas de TV físicas da fábrica
 * (/Televisao e /TelevisaoEmpilha).
 */

import { supabase } from '@/lib/supabaseClient';

export async function ensureTvSession() {
  try {
    // 1. Verificar se já existe uma sessão ativa válida
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      return { success: true, authenticated: true };
    }

    // 2. Extrair Kiosk Key da URL (se fornecida via parâmetro)
    const urlParams = new URLSearchParams(window.location.search);
    const kioskKeyFromUrl = urlParams.get('kiosk_key') || urlParams.get('kiosk_secret');

    if (kioskKeyFromUrl) {
      try {
        sessionStorage.setItem('tv_kiosk_secret', kioskKeyFromUrl);
        // Limpar a URL do navegador para não manter o segredo visível na barra de endereços
        urlParams.delete('kiosk_key');
        urlParams.delete('kiosk_secret');
        const newSearch = urlParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      } catch (e) {
        console.warn('[TV Session] Falha ao armazenar segredo em sessionStorage:', e);
      }
    }

    // 3. Obter segredo armazenado na TV física
    const kioskSecret = sessionStorage.getItem('tv_kiosk_secret');
    if (!kioskSecret) {
      return { success: false, requiresAuth: true, reason: 'Nenhum Kiosk Secret configurado nesta tela.' };
    }

    // 4. Solicitar sessão autenticada à API serverless da Vercel
    const response = await fetch('/api/tv-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-kiosk-secret': kioskSecret,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        requiresAuth: true,
        reason: errorData.error || `Erro de autenticação (${response.status})`,
      };
    }

    const sessionData = await response.json();
    if (sessionData.access_token && sessionData.refresh_token) {
      const { error: setSessionErr } = await supabase.auth.setSession({
        access_token: sessionData.access_token,
        refresh_token: sessionData.refresh_token,
      });

      if (setSessionErr) {
        console.error('[TV Session] Falha ao injetar sessão no cliente Supabase:', setSessionErr);
        return { success: false, requiresAuth: true, reason: setSessionErr.message };
      }

      return { success: true, authenticated: true };
    }

    return { success: false, requiresAuth: true, reason: 'Resposta de sessão inválida.' };
  } catch (err) {
    console.error('[TV Session] Erro inesperado ao obter sessão de TV:', err);
    return { success: false, requiresAuth: true, reason: err.message };
  }
}
