import React, { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import LoginModal from '@/components/auth/LoginModal';
import TelaLogin from '@/components/auth/TelaLogin';
import SelecionarOperadorModal from '@/components/auth/SelecionarOperadorModal';
import TelaTrocarSenhaObrigatoria from '@/components/auth/TelaTrocarSenhaObrigatoria';






import RotaProtegidaAdmin from '@/components/empilhadeira/RotaProtegidaAdmin';











import LimiteDeErro, { CarregandoTela } from '@/components/LimiteDeErro';

// Cada pagina vira um pedaco de JavaScript proprio, baixado so quando
// alguem abre aquela rota.
const ImportarCategorias = lazy(() => import('@/pages/ImportarCategorias'));
const Empilhadeira = lazy(() => import('@/pages/Empilhadeira'));
const NovaEmpilhaProgramacao = lazy(() => import('@/pages/NovaEmpilhaProgramacao'));
const ExecutarEmpilha = lazy(() => import('@/pages/ExecutarEmpilha'));
const EmpilhadeiraConfigPage = lazy(() => import('@/pages/EmpilhadeiraConfig'));
const IndicadoresEmpilha = lazy(() => import('@/pages/IndicadoresEmpilha'));
const GerenciarUsuarios = lazy(() => import('@/pages/GerenciarUsuarios'));
const Recebimento = lazy(() => import('@/pages/Recebimento'));
const ExecutarRecebimento = lazy(() => import('@/pages/ExecutarRecebimento'));
const IndicadoresRecebimento = lazy(() => import('@/pages/IndicadoresRecebimento'));
const ChecklistRecebimentoPage = lazy(() => import('@/pages/ChecklistRecebimento'));
const NovoChecklist = lazy(() => import('@/pages/NovoChecklist'));
const ChecklistDetalhe = lazy(() => import('@/pages/ChecklistDetalhe'));
const Painel = lazy(() => import('@/pages/Painel'));
const NotasFiscais = lazy(() => import('@/pages/NotasFiscais'));
const NovaNotaFiscal = lazy(() => import('@/pages/NovaNotaFiscal'));
const NotaFiscalDetalhe = lazy(() => import('@/pages/NotaFiscalDetalhe'));
const AlterarSenha = lazy(() => import('@/pages/AlterarSenha'));

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

/**
 * Páginas que só admin pode abrir.
 *
 * Antes, só 5 rotas declaradas uma a uma tinham `RotaProtegidaAdmin`. As telas
 * de catálogo e de importação vinham do mapa genérico de `Pages` e **não eram
 * protegidas**: não aparecem no menu do operador, mas quem digitasse a URL
 * abria a tela, via a lista inteira e via botões de editar que iam falhar no
 * RLS. O dado estava protegido; faltava a rota recusar antes de desenhar.
 *
 * Centralizado numa lista para que página nova entre aqui, e não em sete
 * lugares diferentes.
 */
const PAGINAS_SOMENTE_ADMIN = new Set([
  'Produtos',
  'Embalagens',
  'Operadores',
  'ImportarProdutos',
  'ImportarEmbalagens',
  'ImportarCategorias',
  'GerenciarUsuarios',
  'NovaEmpilhaProgramacao',
  'EmpilhadeiraConfig',
  'IndicadoresEmpilha',
  'IndicadoresRecebimento',
  'Metas',
]);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// As telas de TV NÃO são mais públicas, e o código que as tratava como tal foi
// removido daqui.
//
// A exceção vinha da época em que `anon` tinha acesso de leitura. Hoje não tem:
// a migration `remove_anon_rls` tirou as políticas e a `reconcile_security`
// revogou os GRANTs, portanto uma TV sem sessão não carregaria dado nenhum —
// renderizaria a moldura vazia e encheria o console de erro de permissão.
//
// As TVs da fábrica usam a conta `tv-fabrica`, com sessão persistente, e
// seguem imunes ao logout por inatividade (a isenção vive no AuthContext, via
// isTvPage, que continua existindo).

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated, user } = useAuth();
  const location = useLocation();

  // Spinner enquanto carrega a sessão, inclusive nas telas de TV.
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-fundo">
        <div className="w-10 h-10 border-4 border-borda border-t-marca rounded-full animate-spin"></div>
      </div>
    );
  }

  // Sem sessão, o FORMULÁRIO de login aparece direto — inclusive nas rotas de
  // TV. Antes era uma tela quase vazia com um botão que abria um modal: um
  // clique a mais para chegar no que a pessoa veio fazer.
  if (!isAuthenticated) {
    return <TelaLogin />;
  }

  // Senha temporária (conta nova ou senha resetada pelo admin): nada do
  // sistema abre antes de a pessoa escolher a própria senha.
  if (user?.trocarSenha) {
    return <TelaTrocarSenhaObrigatoria />;
  }

  return (
    <>
      {/* Um Suspense e um limite de erro em volta de TODAS as rotas:
          o Suspense mostra o indicador enquanto o pedaco daquela pagina
          baixa, e o limite de erro evita a tela em branco se o download
          falhar ou o render quebrar. */}
      <LimiteDeErro>
      <Suspense fallback={<CarregandoTela />}>
      <Routes>
        <Route path="/" element={
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        } />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                {PAGINAS_SOMENTE_ADMIN.has(path)
                  ? <RotaProtegidaAdmin><Page /></RotaProtegidaAdmin>
                  : <Page />}
              </LayoutWrapper>
            }
          />
        ))}
        <Route path="/ImportarCategorias" element={<LayoutWrapper currentPageName="ImportarCategorias"><RotaProtegidaAdmin><ImportarCategorias /></RotaProtegidaAdmin></LayoutWrapper>} />
        <Route path="/Empilhadeira" element={<LayoutWrapper currentPageName="Empilhadeira"><Empilhadeira /></LayoutWrapper>} />
        <Route path="/NovaEmpilhaProgramacao" element={<LayoutWrapper currentPageName="NovaEmpilhaProgramacao"><RotaProtegidaAdmin><NovaEmpilhaProgramacao /></RotaProtegidaAdmin></LayoutWrapper>} />
        <Route path="/ExecutarEmpilha" element={<LayoutWrapper currentPageName="ExecutarEmpilha"><ExecutarEmpilha /></LayoutWrapper>} />
        <Route path="/EmpilhadeiraConfig" element={<LayoutWrapper currentPageName="EmpilhadeiraConfig"><RotaProtegidaAdmin><EmpilhadeiraConfigPage /></RotaProtegidaAdmin></LayoutWrapper>} />
        <Route path="/IndicadoresEmpilha" element={<LayoutWrapper currentPageName="IndicadoresEmpilha"><RotaProtegidaAdmin><IndicadoresEmpilha /></RotaProtegidaAdmin></LayoutWrapper>} />
        <Route path="/GerenciarUsuarios" element={<LayoutWrapper currentPageName="GerenciarUsuarios"><RotaProtegidaAdmin><GerenciarUsuarios /></RotaProtegidaAdmin></LayoutWrapper>} />
        <Route path="/Recebimento" element={<LayoutWrapper currentPageName="Recebimento"><Recebimento /></LayoutWrapper>} />
        <Route path="/ExecutarRecebimento" element={<LayoutWrapper currentPageName="ExecutarRecebimento"><ExecutarRecebimento /></LayoutWrapper>} />
        <Route path="/IndicadoresRecebimento" element={<LayoutWrapper currentPageName="IndicadoresRecebimento"><RotaProtegidaAdmin><IndicadoresRecebimento /></RotaProtegidaAdmin></LayoutWrapper>} />
        <Route path="/ChecklistRecebimento" element={<LayoutWrapper currentPageName="ChecklistRecebimento"><ChecklistRecebimentoPage /></LayoutWrapper>} />
        <Route path="/NovoChecklist" element={<LayoutWrapper currentPageName="NovoChecklist"><NovoChecklist /></LayoutWrapper>} />
        <Route path="/ChecklistDetalhe" element={<LayoutWrapper currentPageName="ChecklistDetalhe"><ChecklistDetalhe /></LayoutWrapper>} />
        <Route path="/Painel" element={<LayoutWrapper currentPageName="Painel"><Painel /></LayoutWrapper>} />
        <Route path="/NotasFiscais" element={<LayoutWrapper currentPageName="NotasFiscais"><NotasFiscais /></LayoutWrapper>} />
        <Route path="/NovaNotaFiscal" element={<LayoutWrapper currentPageName="NovaNotaFiscal"><NovaNotaFiscal /></LayoutWrapper>} />
        <Route path="/NotaFiscalDetalhe" element={<LayoutWrapper currentPageName="NotaFiscalDetalhe"><NotaFiscalDetalhe /></LayoutWrapper>} />
        <Route path="/AlterarSenha" element={<LayoutWrapper currentPageName="AlterarSenha"><AlterarSenha /></LayoutWrapper>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
      </LimiteDeErro>

      <LoginModal />
      <SelecionarOperadorModal />
    </>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;