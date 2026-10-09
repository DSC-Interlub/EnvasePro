import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ClipboardList, Package, Factory, List, Warehouse, Settings, ShieldAlert, Truck, ClipboardCheck, FileText, Activity, LogOut, UserCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import SelecionarOperadorModal from "@/components/auth/SelecionarOperadorModal";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// Itens de navegação — com flag para role restrição
const allNavItems = [
  { title: "Dashboard", url: createPageUrl("Dashboard"), icon: LayoutDashboard, roles: ["admin", "operator"] },
  { title: "Televisão", url: createPageUrl("Televisao"), icon: LayoutDashboard, roles: ["admin", "operator"] },
  { title: "Novo Registro", url: createPageUrl("NovoRegistro"), icon: ClipboardList, roles: ["admin", "operator"] },
  { title: "Todos os Registros", url: createPageUrl("Registros"), icon: List, roles: ["admin", "operator"] },
  { title: "Check-out", url: createPageUrl("Checkout"), icon: Package, roles: ["admin", "operator"] },
  { title: "Empilhadeira", url: createPageUrl("Empilhadeira"), icon: Warehouse, roles: ["admin", "operator"], badgeKey: "empilhadeira" },
  { title: "Recebimento", url: "/Recebimento", icon: Truck, roles: ["admin", "operator"], badgeKey: "recebimento" },
  { title: "Checklist Recebimento", url: "/ChecklistRecebimento", icon: ClipboardCheck, roles: ["admin", "operator"] },
  { title: "Painel Geral", url: "/Painel", icon: Activity, roles: ["admin", "operator"] },
  { title: "Notas Fiscais", url: "/NotasFiscais", icon: FileText, roles: ["admin", "operator"] },
  { title: "Configurações", url: "/GerenciarUsuarios", icon: Settings, roles: ["admin"] },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { user, logout, currentOperator } = useAuth();
  const [modalOperadorAberto, setModalOperadorAberto] = useState(false);
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

  const navItems = allNavItems.filter(item => item.roles.includes(role));

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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 to-blue-50">
        <Sidebar className="border-r border-slate-200 bg-white">
          <SidebarHeader className="border-b border-slate-200 p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
                <Factory className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">Operações Interlub</h2>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  {role === "admin" ? (
                    <><ShieldAlert className="w-3 h-3 text-amber-500" /> Admin</>
                  ) : "Operador"}
                </p>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-3">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                Navegação
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        className={`hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 rounded-lg mb-1 ${location.pathname === item.url ? 'bg-blue-100 text-blue-700 shadow-sm' : ''}`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium flex-1">{item.title}</span>
                          {item.badgeKey === "empilhadeira" && role === "admin" && badgeCount > 0 && (
                            <span className="bg-red-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          )}
                          {item.badgeKey === "recebimento" && role === "admin" && recBadgeCount > 0 && (
                            <span className="bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                              {recBadgeCount > 99 ? "99+" : recBadgeCount}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>

                {/* O aviso ocupa o lugar do antigo `catch {}`: se a contagem
                    falhar, os selos acima estão velhos, e quem está olhando
                    precisa saber disso em vez de confiar num número parado. */}
                {role === "admin" && contadoresFalharam && (
                  <p
                    role="status"
                    className="mx-3 mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                    <span>Contadores desatualizados: não consegui consultar as pendências.</span>
                  </p>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-200 p-4 space-y-3 bg-slate-50/50">
            {/* Bloco de Operador Ativo — Lição 3 */}
            {role === "operator" && (
              <div className="p-2.5 rounded-lg bg-white border border-blue-200 shadow-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-blue-600" /> Operador do Turno
                  </span>
                  <button
                    onClick={() => setModalOperadorAberto(true)}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
                    title="Trocar operador ativo"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Trocar
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate">
                  {currentOperator?.nome || "Nenhum selecionado"}
                </p>
                {currentOperator?.sala && (
                  <p className="text-[10px] text-slate-500">Sala: {currentOperator.sala}</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
              <span className="truncate max-w-[130px]" title={user?.email}>
                {user?.email || "Conectado"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1"
                title="Sair do sistema"
              >
                <LogOut className="w-3 h-3" />
                Sair
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>

        {/* min-w-0: um item flex nao encolhe abaixo da largura do conteudo por
            padrao (min-width:auto). Sem isto, uma tabela larga empurra o
            <main> e a PAGINA inteira passa a rolar na horizontal, em vez de
            so a tabela rolar dentro do proprio overflow-x-auto. Media no
            tablet (820px): Registros estourava 375px, Produtos 211px. */}
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="bg-white border-b border-slate-200 px-6 py-4 md:hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
                <h1 className="text-xl font-bold text-slate-900">Operações Interlub</h1>
              </div>
              {role === "operator" && currentOperator && (
                <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-1 rounded-full">
                  {currentOperator.nome}
                </span>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>

      <SelecionarOperadorModal
        abertoManualmente={modalOperadorAberto}
        aoFechar={() => setModalOperadorAberto(false)}
      />
    </SidebarProvider>
  );
}