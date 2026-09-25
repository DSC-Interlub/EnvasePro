import Dashboard from './pages/Dashboard';
import NovoRegistro from './pages/NovoRegistro';
import Produtos from './pages/Produtos';
import Embalagens from './pages/Embalagens';
import Operadores from './pages/Operadores';
import Registros from './pages/Registros';
import Checkout from './pages/Checkout';
import NovaProgramacaoCheckout from './pages/NovaProgramacaoCheckout';
import ExecutarCheckout from './pages/ExecutarCheckout';
import ImportarProdutos from './pages/ImportarProdutos';
import ImportarEmbalagens from './pages/ImportarEmbalagens';
import Televisao from './pages/Televisao';
import Empilhadeira from './pages/Empilhadeira';
import NovaEmpilhaProgramacao from './pages/NovaEmpilhaProgramacao';
import ExecutarEmpilha from './pages/ExecutarEmpilha';
import EmpilhadeiraConfigPage from './pages/EmpilhadeiraConfig';
import TelevisaoEmpilha from './pages/TelevisaoEmpilha';
import Layout from './Layout.jsx';


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