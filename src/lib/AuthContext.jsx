import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { EVENTO_SESSAO_REVOGADA, MENSAGEM_SESSAO_REVOGADA, rearmarAviso } from '@/lib/sessaoRevogada';

const AuthContext = createContext();

// Rotas públicas de TV e painéis que rodam sem autenticação (Ajuste 4)
const ROTAS_TV_PUBLICAS = [
  '/televisao',
  '/televisaoempilha',
  '/painel'
];

// SEM logout por inatividade, para nenhum papel (decisão do dono, 20/10/2026,
// revertendo o item 14 da auditoria). A sessão segue viva enquanto a aba estiver
// aberta, renovada pelo refresh normal do Supabase. Risco declarado no CLAUDE.md
// e no GO-LIVE.md: computador compartilhado deixado logado continua logado.
// Quem encerra sessão agora é o administrador (desativar, resetar, excluir) e
// o próprio usuário (Sair).
//
// Chave que a versão anterior gravava; apagada uma vez para não ficar lixo.
const CHAVE_ANTIGA_ULTIMA_ATIVIDADE = 'envase_last_activity';

function ehRotaTvPublica(pathname) {
  if (!pathname) return false;
  const limpo = pathname.toLowerCase().replace(/[-_]/g, '');
  return ROTAS_TV_PUBLICAS.some(r => limpo.includes(r.replace(/[-_]/g, '')));
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // "O papel autoritativo ja chegou?"
  //
  // Nao basta isLoadingAuth: quando a sessao resolve, o usuario entra com
  // role 'operator' como valor inicial SEGURO, e so depois carregarPerfilUsuario
  // le o papel de verdade em user_profiles. Quem decidir permissao nessa janela
  // trata um admin como operador. Foi o que aconteceu ao proteger as rotas de
  // catalogo: a guarda redirecionava o admin antes de o papel chegar.
  const [perfilCarregado, setPerfilCarregado] = useState(false);
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
          created_date: authUser.created_at,
          // "Trocar a senha no primeiro acesso": vem do app_metadata, que só o
          // servidor (service_role) escreve; o próprio usuário não consegue apagar.
          trocarSenha: Boolean(authUser.app_metadata?.trocar_senha),
        }));
      } catch (err) {
        console.warn('Aviso ao carregar perfil do usuário:', err.message);
      } finally {
        // Tanto no sucesso quanto na falha: a tentativa terminou e quem espera
        // o papel pode decidir. Sem o finally, uma falha deixaria a tela presa
        // no carregando para sempre.
        setPerfilCarregado(true);
      }
    }, 0);
  }, []);

  useEffect(() => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const ehTv = ehRotaTvPublica(pathname);
    setIsTvPage(ehTv);

    // isTvPage continua sendo usado para o modal de operador físico não abrir na TV.
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
          created_date: session.user.created_at,
          // "Trocar a senha no primeiro acesso": vem do app_metadata, que só o
          // servidor (service_role) escreve; o próprio usuário não consegue apagar.
          trocarSenha: Boolean(session.user.app_metadata?.trocar_senha),
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
          created_date: session.user.created_at,
          // "Trocar a senha no primeiro acesso": vem do app_metadata, que só o
          // servidor (service_role) escreve; o próprio usuário não consegue apagar.
          trocarSenha: Boolean(session.user.app_metadata?.trocar_senha),
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

  // Resto da versão com logout por inatividade: apaga a chave antiga.
  useEffect(() => {
    try { localStorage.removeItem(CHAVE_ANTIGA_ULTIMA_ATIVIDADE); } catch { /* sem localStorage */ }
  }, []);

  // Sessão encerrada pelo administrador (resetar, desativar, excluir, encerrar
  // sessões): o banco recusou o JWT ou o Auth recusou renová-lo. Sai LOCALMENTE
  // na hora — o servidor já encerrou tudo — e a tela de login diz o motivo.
  useEffect(() => {
    const aoRevogar = async () => {
      setAuthError(MENSAGEM_SESSAO_REVOGADA);
      clearOperator();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setUser(null);
      setIsAuthenticated(false);
    };
    window.addEventListener(EVENTO_SESSAO_REVOGADA, aoRevogar);
    return () => window.removeEventListener(EVENTO_SESSAO_REVOGADA, aoRevogar);
  }, [clearOperator]);

  // Bate-ponto: tela parada (TV, painel aberto) não faz requisição nenhuma por
  // minutos e não perceberia a revogação. A cada 20 s, com a aba VISÍVEL, uma
  // chamada mínima a checar_sessao() — a mesma checagem que o banco faz antes
  // de toda requisição. Recusada, o detector central desloga. Ao voltar a ficar
  // visível, confere na hora. Conta com senha temporária não bate ponto (o
  // banco recusaria com senha_temporaria, e a tela dela já é a de troca).
  const deveBaterPonto = isAuthenticated && !user?.trocarSenha;
  useEffect(() => {
    if (!deveBaterPonto || typeof document === 'undefined') return;
    const bater = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.rpc('checar_sessao').then(() => {}, () => {});
    };
    const id = setInterval(bater, 20000);
    const aoVoltar = () => { if (document.visibilityState === 'visible') bater(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [deveBaterPonto]);

  // Trocar a senha pelo servidor encerra TODAS as sessões da conta (o Auth
  // faz isso ao gravar senha nova), inclusive a desta aba. Em vez de deixar a
  // tela com uma sessão morta, sai e volta ao login com o aviso.
  const sairComAviso = useCallback(async (aviso) => {
    await logout();
    setAuthError(aviso);
  }, [logout]);

  const login = async (email, password) => {
    setAuthError(null);
    rearmarAviso();
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

  const navigateToLogin = () => {
    setLoginModalAberto(true);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      perfilCarregado,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: { id: 'envasepro' },
      logout,
      sairComAviso,
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
