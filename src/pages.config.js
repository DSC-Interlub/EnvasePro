/**
 * src/pages.config.js — registro das páginas, carregadas sob demanda.
 *
 * Antes, cada página era importada direto, o que fazia o Vite juntar TUDO num
 * único arquivo de 1.973 KB: quem abria a TV baixava também o checklist, as
 * telas de importação e o cadastro de produtos.
 *
 * Com `lazy()`, cada página vira um pedaço separado, baixado só quando alguém
 * abre aquela rota. O `Suspense` que mostra o "carregando" e o limite de erro
 * que evita a tela branca ficam no App.jsx, em volta das rotas.
 */
import { lazy } from 'react';
import Layout from './Layout';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const NovoRegistro = lazy(() => import('./pages/NovoRegistro'));
const Produtos = lazy(() => import('./pages/Produtos'));
const Embalagens = lazy(() => import('./pages/Embalagens'));
const Operadores = lazy(() => import('./pages/Operadores'));
const Registros = lazy(() => import('./pages/Registros'));
const Checkout = lazy(() => import('./pages/Checkout'));
const NovaProgramacaoCheckout = lazy(() => import('./pages/NovaProgramacaoCheckout'));
const ExecutarCheckout = lazy(() => import('./pages/ExecutarCheckout'));
const ImportarProdutos = lazy(() => import('./pages/ImportarProdutos'));
const ImportarEmbalagens = lazy(() => import('./pages/ImportarEmbalagens'));
const Televisao = lazy(() => import('./pages/Televisao'));
const Empilhadeira = lazy(() => import('./pages/Empilhadeira'));
const NovaEmpilhaProgramacao = lazy(() => import('./pages/NovaEmpilhaProgramacao'));
const ExecutarEmpilha = lazy(() => import('./pages/ExecutarEmpilha'));
const EmpilhadeiraConfigPage = lazy(() => import('./pages/EmpilhadeiraConfig'));
const TelevisaoEmpilha = lazy(() => import('./pages/TelevisaoEmpilha'));



export const PAGES = {
    "Dashboard": Dashboard,
    "NovoRegistro": NovoRegistro,
    "Produtos": Produtos,
    "Embalagens": Embalagens,
    "Operadores": Operadores,
    "Registros": Registros,
    "Checkout": Checkout,
    "NovaProgramacaoCheckout": NovaProgramacaoCheckout,
    "ExecutarCheckout": ExecutarCheckout,
    "ImportarProdutos": ImportarProdutos,
    "ImportarEmbalagens": ImportarEmbalagens,
    "Televisao": Televisao,
    "Empilhadeira": Empilhadeira,
    "NovaEmpilhaProgramacao": NovaEmpilhaProgramacao,
    "ExecutarEmpilha": ExecutarEmpilha,
    "EmpilhadeiraConfig": EmpilhadeiraConfigPage,
    "TelevisaoEmpilha": TelevisaoEmpilha,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: Layout,
};