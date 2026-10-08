import React from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import LoginModal from '@/components/auth/LoginModal';
import SelecionarOperadorModal from '@/components/auth/SelecionarOperadorModal';
import ImportarCategorias from '@/pages/ImportarCategorias';
import Empilhadeira from '@/pages/Empilhadeira';
import NovaEmpilhaProgramacao from '@/pages/NovaEmpilhaProgramacao';
import ExecutarEmpilha from '@/pages/ExecutarEmpilha';
import EmpilhadeiraConfigPage from '@/pages/EmpilhadeiraConfig';
import IndicadoresEmpilha from '@/pages/IndicadoresEmpilha';
import RotaProtegidaAdmin from '@/components/empilhadeira/RotaProtegidaAdmin';
import GerenciarUsuarios from '@/pages/GerenciarUsuarios';
import Recebimento from '@/pages/Recebimento';
import ExecutarRecebimento from '@/pages/ExecutarRecebimento';
import IndicadoresRecebimento from '@/pages/IndicadoresRecebimento';
import ChecklistRecebimentoPage from '@/pages/ChecklistRecebimento';
import NovoChecklist from '@/pages/NovoChecklist';
import ChecklistDetalhe from '@/pages/ChecklistDetalhe';
import Painel from '@/pages/Painel';
import NotasFiscais from '@/pages/NotasFiscais';
import NovaNotaFiscal from '@/pages/NovaNotaFiscal';
import NotaFiscalDetalhe from '@/pages/NotaFiscalDetalhe';

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
  const { isLoadingAuth, isAuthenticated, setLoginModalAberto } = useAuth();
  const location = useLocation();

  // Spinner enquanto carrega a sessão, inclusive nas telas de TV.
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Sem sessão, exibe a tela de login — inclusive nas rotas de TV.
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center p-4">
        <LoginModal />
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg font-bold text-2xl">
            EP
          </div>
          <h1 className="text-2xl font-bold text-slate-800">EnvasePro Interlub</h1>
          <p className="text-sm text-slate-600">
            Sistema de Controle de Produção, Empilhadeira e Recebimento.
          </p>
          <button
            onClick={() => setLoginModalAberto(true)}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow transition"
          >
            Fazer Login no Sistema
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
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
        <Route path="*" element={<PageNotFound />} />
      </Routes>

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