import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext();

// Rotas públicas de TV e painéis que rodam sem autenticação (Ajuste 4)
const ROTAS_TV_PUBLICAS = [
  '/televisao',
  '/televisaoempilha',
  '/painel'
];

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
          role: profile?.role || authUser.user_metadata?.role || 'operator',
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

    // Se for tela de TV, não bloqueia com loading nem exige login (Ajuste 4)
    if (ehTv) {
      setIsLoadingAuth(false);
    }

    // 1. Checa sessão inicial existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          role: session.user.user_metadata?.role || 'operator',
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
          role: session.user.user_metadata?.role || 'operator',
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
    setLoginModalAberto(false);
    return data;
  };

  const logout = async () => {
    clearOperator();
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
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
