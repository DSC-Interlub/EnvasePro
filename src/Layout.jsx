import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard, ClipboardList, Package, List, Warehouse, Settings,
  Truck, ClipboardCheck, FileText, Activity, Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import MenuLateral from "@/components/casca/MenuLateral";

/**
 * Itens de navegação.
 *
 * `grupo` é só apresentação — nasceu com a direção "Fluxo", que separa o menu
 * em "Acompanhar", "Operação" e "Cadastros". **As rotas e os `roles` não
 * mudaram**: quem via um item antes vê o mesmo item agora, e quem era barrado
 * continua barrado. A guarda de permissão é `RotaProtegidaAdmin` e
 * `PAGINAS_SOMENTE_ADMIN` em App.jsx, não esta lista.
 */
const allNavItems = [
  { title: "Dashboard", url: createPageUrl("Dashboard"), icon: LayoutDashboard, roles: ["admin", "operator"], grupo: "Acompanhar" },
  { title: "Televisão", url: createPageUrl("Televisao"), icon: LayoutDashboard, roles: ["admin", "operator"], grupo: "Acompanhar" },
  { title: "Painel Geral", url: "/Painel", icon: Activity, roles: ["admin", "operator"], grupo: "Acompanhar" },
  { title: "Novo Registro", url: createPageUrl("NovoRegistro"), icon: ClipboardList, roles: ["admin", "operator"], grupo: "Operação" },
  { title: "Todos os Registros", url: createPageUrl("Registros"), icon: List, roles: ["admin", "operator"], grupo: "Operação" },
  { title: "Check-out", url: createPageUrl("Checkout"), icon: Package, roles: ["admin", "operator"], grupo: "Operação" },
  { title: "Empilhadeira", url: createPageUrl("Empilhadeira"), icon: Warehouse, roles: ["admin", "operator"], badgeKey: "empilhadeira", grupo: "Operação" },
  { title: "Recebimento", url: "/Recebimento", icon: Truck, roles: ["admin", "operator"], badgeKey: "recebimento", grupo: "Operação" },
  { title: "Checklist Recebimento", url: "/ChecklistRecebimento", icon: ClipboardCheck, roles: ["admin", "operator"], grupo: "Operação" },
  { title: "Notas Fiscais", url: "/NotasFiscais", icon: FileText, roles: ["admin", "operator"], grupo: "Operação" },
  { title: "Configurações", url: "/GerenciarUsuarios", icon: Settings, roles: ["admin"], grupo: "Cadastros" },
];

const ORDEM_GRUPOS = ["Acompanhar", "Operação", "Cadastros"];

export default function Layout({ children }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const rawRole = user?.role || "operator";
  const role = rawRole === "user" ? "operator" : rawRole;

  const [badgeCount, setBadgeCount] = useState(0);
  const [recBadgeCount, setRecBadgeCount] = useState(0);
  const [contadoresFalharam, setContadoresFalharam] = useState(false);

  // Contadores dos selos (apenas admin).
  //
  // Antes isto baixava SETE tabelas inteiras a cada 60 segundos e contava no
  // navegador, com `catch {}` no fim. Duas consequências: a tela que o admin
  // deixa aberta o dia todo puxava todos os registros de minuto em minuto, e
  // qualquer falha era engolida — o menu continuava exibindo o último número
  // que deu certo, sem nada dizendo que ele estava velho.
  //
  // Agora a contagem é uma chamada só, feita no banco, e a falha aparece.
  useEffect(() => {
    if (role !== "admin") return;
    let cancelado = false;

    const buscarContadores = async () => {
      try {
        const c = await base44.functions.contadoresDoMenu();
        if (cancelado) return;
        setBadgeCount(
          Number(c.assinaturas_pendentes) + Number(c.ocorrencias_abertas) +
          Number(c.paradas_abertas) + Number(c.alertas_manutencao) +
          Number(c.limpezas_atrasadas) + Number(c.limpezas_aguardando)
        );
        setRecBadgeCount(Number(c.receb_aguarda_lider) + Number(c.receb_ocorr_abertas));
        setContadoresFalharam(false);
      } catch (erro) {
        if (cancelado) return;
        console.error("[menu] não consegui atualizar os contadores:", erro?.message || erro);
        setContadoresFalharam(true);
      }
    };

    buscarContadores();
    const interval = setInterval(buscarContadores, 60000);
    return () => { cancelado = true; clearInterval(interval); };
  }, [role]);

  // Fecha a gaveta ao trocar de tela: senão ela fica aberta sobre a tela nova.
  useEffect(() => { setGavetaAberta(false); }, [location.pathname]);

  const navItems = allNavItems.filter((item) => item.roles.includes(role));
  const grupos = ORDEM_GRUPOS
    .map((nome) => ({ nome, itens: navItems.filter((i) => i.grupo === nome) }))
    .filter((g) => g.itens.length > 0);

  const contadorDe = (item) => {
    if (role !== "admin") return 0;
    if (item.badgeKey === "empilhadeira") return badgeCount;
    if (item.badgeKey === "recebimento") return recBadgeCount;
    return 0;
  };

  // Telas de TV / Painel em tela cheia sem navegação (Ajuste 4)
  const pathnameLower = location.pathname.toLowerCase();
  if (
    pathnameLower === '/televisao' ||
    pathnameLower === '/televisaoempilha' ||
    pathnameLower === createPageUrl("Televisao").toLowerCase() ||
    pathnameLower === createPageUrl("TelevisaoEmpilha").toLowerCase()
  ) {
    return <>{children}</>;
  }

  const propsMenu = {
    grupos, role, user, contadorDe, contadoresFalharam,
    urlAtual: pathnameLower,
    aoSair: logout,
  };

  return (
    <>
      {/* O cartão flutuante exige fundo em volta: daí o padding e o gap, e o
          fundo da página vir de --fundo em vez de um gradiente. */}
      <div className="min-h-screen w-full bg-fundo text-tinta flex gap-4 p-0 md:p-4">

        {/* --- tablet: rail de 80px | desktop: menu completo de 248px -----
            `sticky` e a altura limitada à janela: numa tela longa (o Dashboard
            tem 3.485px) um menu de altura automática sai de vista na primeira
            rolagem, e o operador perde a navegação justo quando desce a lista.
            `overflow-y-auto` para o caso de o próprio menu não caber. */}
        <aside className="hidden md:flex flex-shrink-0 sticky top-4 self-start
                          max-h-[calc(100vh-2rem)]">
          <div className="lg:hidden h-full"><MenuLateral {...propsMenu} modo="rail" /></div>
          <div className="hidden lg:block h-full"><MenuLateral {...propsMenu} modo="completo" /></div>
        </aside>

        {/* min-w-0: um item flex nao encolhe abaixo da largura do conteudo por
            padrao (min-width:auto). Sem isto, uma tabela larga empurra o
            <main> e a PAGINA inteira passa a rolar na horizontal, em vez de
            so a tabela rolar dentro do proprio overflow-x-auto. Media no
            tablet (820px): Registros estourava 375px, Produtos 211px. */}
        <main className="flex-1 min-w-0 flex flex-col">

          {/* --- celular: barra com o botão da gaveta -------------------- */}
          <header className="md:hidden bg-cartao border-b border-borda px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setGavetaAberta(true)}
                  aria-label="Abrir menu"
                  aria-expanded={gavetaAberta}
                  className="press foco-fluxo w-12 h-12 rounded-token flex items-center
                             justify-center text-tinta hover:bg-marca-suave hover:text-marca"
                >
                  <Menu className="w-6 h-6" aria-hidden="true" />
                </button>
                <h1 className="text-lg font-extrabold tracking-[-0.02em] truncate">
                  Operações Interlub
                </h1>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto">{children}</div>
        </main>
      </div>

      {/* --- celular: a gaveta ------------------------------------------
          Renderizada só quando aberta, e não escondida com CSS: um menu
          sempre montado deixa os links no DOM e no foco do teclado mesmo
          invisível. */}
      {gavetaAberta && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setGavetaAberta(false)}
            className="absolute inset-0 bg-tinta/40"
          />
          <div className="relative m-3 flex entra">
            <MenuLateral
              {...propsMenu}
              modo="completo"
              aoNavegar={() => setGavetaAberta(false)}
            />
            <button
              type="button"
              onClick={() => setGavetaAberta(false)}
              aria-label="Fechar menu"
              className="press foco-fluxo absolute -right-14 top-0 w-12 h-12 rounded-token
                         bg-cartao text-tinta flex items-center justify-center shadow-cartao"
            >
              <X className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

    </>
  );
}
