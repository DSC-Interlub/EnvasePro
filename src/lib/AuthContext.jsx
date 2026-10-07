import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

// Rotas públicas de TV e painéis que rodam sem autenticação (Ajuste 4)
const ROTAS_TV_PUBLICAS = [
  '/televisao',
  '/televisaoempilha',
  '/painel'
];

// Configurações de Inatividade (Item 14 / Auditoria de Segurança)
// Admin: logout automático após 60 minutos sem interação real
export const ADMIN_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutos
export const STORAGE_KEY_LAST_ACTIVITY = 'envase_last_activity';
const EVENTOS_INTERACAO = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

function ehRotaTvPublica(pathname) {
  if (!pathname) return false;
  const limpo = pathname.toLowerCase().replace(/[-_]/g, '');
  return ROTAS_TV_PUBLICAS.some(r => limpo.includes(r.replace(/[-_]/g, '')));
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [loginModalAberto, setLoginModalAberto] = useState(false);
  const [isTvPage, setIsTvPage] = useState(false);

  // Operador físico ativo no chão de fábrica (Lição 3)
  const [currentOperator, setCurrentOperator] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('envase_current_operator');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const selectOperator = useCallback((operator) => {
    setCurrentOperator(operator);
    if (typeof window !== 'undefined') {
      if (operator) {
        localStorage.setItem('envase_current_operator', JSON.stringify(operator));
      } else {
        localStorage.removeItem('envase_current_operator');
      }
    }
  }, []);

  const clearOperator = useCallback(() => {
    selectOperator(null);
  }, [selectOperator]);

  const logout = useCallback(async () => {
    clearOperator();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_LAST_ACTIVITY);
    }
    await supabase.auth.signOut().catch(() => {});
    setUser(null);
    setIsAuthenticated(false);
  }, [clearOperator]);

  // Carrega perfil estendido com atraso seguro (Lição 2: fora do lock do auth)
  const carregarPerfilUsuario = useCallback((authUser) => {
    if (!authUser) return;
    setTimeout(async () => {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        setUser(prev => ({
          id: authUser.id,
          email: authUser.email,
          role: profile?.role || 'operator',
          full_name: profile?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
          created_date: authUser.created_at
        }));
      } catch (err) {
        console.warn('Aviso ao carregar perfil do usuário:', err.message);
      }
    }, 0);
  }, []);

  useEffect(() => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const ehTv = ehRotaTvPublica(pathname);
    setIsTvPage(ehTv);

    // isTvPage continua sendo usado para isentar a TV do logout por inatividade.
    // O que NÃO se faz mais aqui: encerrar o loading antes de getSession(). Isso
    // vinha da época da "TV pública" e, numa TV já logada, fazia a tela de login
    // piscar por um instante antes de a sessão resolver.

    // 1. Checa sessão inicial existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          role: 'operator', // Papel inicial seguro; papel autoritativo vem de user_profiles via carregarPerfilUsuario
          full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          created_date: session.user.created_at
        });
        setIsAuthenticated(true);
        carregarPerfilUsuario(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
    }).catch(err => {
      console.error('Erro ao verificar sessão Supabase:', err);
      setIsLoadingAuth(false);
    });

    // 2. Ouvinte de estado de autenticação (Lição 2: NUNCA chamar supabase.auth.* dentro do callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Constrói usuário imediatamente a partir do próprio session recebido
        setUser({
          id: session.user.id,
          email: session.user.email,
          role: 'operator', // Papel inicial seguro; papel autoritativo vem de user_profiles via carregarPerfilUsuario
          full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          created_date: session.user.created_at
        });
        setIsAuthenticated(true);
        setLoginModalAberto(false);
        carregarPerfilUsuario(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        clearOperator();
      }
      setIsLoadingAuth(false);
    });

    // Ouvinte para abrir modal de login via evento global
    const handleOpenLogin = () => setLoginModalAberto(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('envase_open_login_modal', handleOpenLogin);
    }

    return () => {
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('envase_open_login_modal', handleOpenLogin);
      }
    };
  }, [carregarPerfilUsuario, clearOperator]);

  // 3. Monitor de inatividade exclusivo para administradores (Item 14 / Auditoria de Segurança)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Regra: monitor ativo APENAS para administradores; operadores e conta de TV (tv-fabrica@interlub.com) são 100% imunes
    const ehAdmin = user?.role === 'admin';
    const ehContaTv = user?.email === 'tv-fabrica@interlub.com';
    const monitorarInatividade = ehAdmin && !ehContaTv;

    if (!monitorarInatividade) {
      return;
    }

    // A. Verificação imediata na inicialização / restauração de página
    const rawLastActivity = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
    const agora = Date.now();

    if (rawLastActivity) {
      const tempoInativo = agora - Number(rawLastActivity);
      if (tempoInativo > ADMIN_INACTIVITY_TIMEOUT_MS) {
        console.warn(`[AuthContext] Sessão admin expirada por inatividade (${Math.round(tempoInativo / 60000)} min). Deslogando.`);
        logout();
        setAuthError('Sessão encerrada por inatividade (limite de 60 minutos para administradores).');
        setLoginModalAberto(true);
        return;
      }
    } else {
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, agora.toString());
    }

    // B. Ouvintes de interação real do usuário com throttle de 10 segundos
    let ultimoRegistro = Date.now();
    const handleInteracao = () => {
      const current = Date.now();
      if (current - ultimoRegistro > 10000) {
        ultimoRegistro = current;
        try {
          localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, current.toString());
        } catch {}
      }
    };

    EVENTOS_INTERACAO.forEach(evento => {
      window.addEventListener(evento, handleInteracao, { passive: true });
    });

    // C. Verificação periódica a cada 30 segundos durante a aba aberta
    const intervalId = setInterval(() => {
      try {
        const lastRaw = localStorage.getItem(STORAGE_KEY_LAST_ACTIVITY);
        const lastTime = lastRaw ? Number(lastRaw) : Date.now();
        const decorrido = Date.now() - lastTime;
        if (decorrido > ADMIN_INACTIVITY_TIMEOUT_MS) {
          console.warn(`[AuthContext] 60 minutos de inatividade atingidos para admin. Deslogando.`);
          clearInterval(intervalId);
          logout();
          setAuthError('Sessão encerrada por inatividade (limite de 60 minutos para administradores).');
          setLoginModalAberto(true);
        }
      } catch (err) {
        console.error('Erro na checagem de inatividade:', err);
      }
    }, 30000);

    return () => {
      EVENTOS_INTERACAO.forEach(evento => {
        window.removeEventListener(evento, handleInteracao);
      });
      clearInterval(intervalId);
    };
  }, [user?.role, user?.email, logout]);

  const login = async (email, password) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) {
      setAuthError(error.message);
      throw error;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_LAST_ACTIVITY, Date.now().toString());
    }
    setLoginModalAberto(false);
    return data;
  };

  const navigateToLogin = () => {
    setLoginModalAberto(true);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: { id: 'envasepro' },
      logout,
      navigateToLogin,
      login,
      currentOperator,
      selectOperator,
      clearOperator,
      loginModalAberto,
      setLoginModalAberto,
      isTvPage,
      checkAppState: () => {}
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useCurrentOperator = () => {
  const context = useAuth();
  return {
    currentOperator: context.currentOperator,
    selectOperator: context.selectOperator,
    clearOperator: context.clearOperator
  };
};
