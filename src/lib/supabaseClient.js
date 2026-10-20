import { createClient } from '@supabase/supabase-js';
import { fetchComDeteccao } from './sessaoRevogada.js';

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não encontradas no ambiente.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  // Toda resposta passa pelo detector de "sessão encerrada pelo administrador"
  // (ver sessaoRevogada.js): uma recusa em QUALQUER chamada desloga na hora.
  global: { fetch: fetchComDeteccao() },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

