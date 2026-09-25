
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Camera, 
  ExternalLink, 
  Download,
  CheckCircle,
  LayoutDashboard,
  Tv,
  ClipboardList,
  Package,
  Box,
  Users
} from "lucide-react";

export default function GuiaCapturas() {
  const [capturas, setCapturas] = useState({});

  const toggleCaptura = (id) => {
    setCapturas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalCapturas = 47;
  const capturasCompletas = Object.values(capturas).filter(Boolean).length;
  const progresso = Math.round((capturasCompletas / totalCapturas) * 100);

  const sections = [
    {
      titulo: "DASHBOARD",
      icon: LayoutDashboard,
      cor: "bg-blue-100 text-blue-700",
      capturas: [
        {
          id: "dash-1",
          nome: "Dashboard - Aba Envase (Completo)",
          url: "/Dashboard",
          instrucoes: "Clique na aba 'Envase' se não estiver selecionada",
          captura: "Página completa com scroll (use extensão GoFullPage)",
          arquivo: "01-dashboard-envase.png",
          elementos: [
            "Header com título e data",
            "Botões Exportar e Novo Registro",
            "Cards de filtros (Sala, Operador, Período)",
            "4 Cards de estatísticas",
            "Todos os gráficos de análise (scroll até o final)"
          ]
        },
        {
          id: "dash-2",
          nome: "Dashboard - Aba Check-out",
          url: "/Dashboard",
          instrucoes: "Clique na aba 'Check-out'",
          captura: "Página completa com scroll",
          arquivo: "02-dashboard-checkout.png",
          elementos: [
            "Aba Check-out selecionada",
            "3 Cards de estatísticas",
            "Gráficos de análise de check-out"
          ]
        },
        {
          id: "dash-3",
          nome: "Filtros Aplicados",
          url: "/Dashboard",
          instrucoes: "Selecione 'Sala Bio', um operador e um mês específico",
          captura: "Capture apenas a área de filtros",
          arquivo: "03-dashboard-filtros.png",
          elementos: [
            "Filtros preenchidos",
            "Texto mostrando período selecionado"
          ]
        },
        {
          id: "dash-4",
          nome: "Diálogo de Exportação",
          url: "/Dashboard",
          instrucoes: "Clique no botão 'Exportar'",
          captura: "Capture o modal/dialog aberto",
          arquivo: "04-dashboard-exportar.png",
          elementos: [
            "Modal de exportação",
            "Campos de data",
            "Botões Cancelar e Exportar"
          ]
        }
      ]
    },
    {
      titulo: "TELEVISÃO",
      icon: Tv,
      cor: "bg-purple-100 text-purple-700",
      capturas: [
        {
          id: "tv-1",
          nome: "Televisão - Tela Completa",
          url: "/Televisao",
          instrucoes: "Certifique-se de ter registros em andamento",
          captura: "Página completa (fundo escuro)",
          arquivo: "05-televisao-completa.png",
          elementos: [
            "Header com relógio",
            "4 Cards de KPIs",
            "Seção ENVASE EM ANDAMENTO",
            "Seção CHECK-OUT EM ANDAMENTO"
          ]
        },
        {
          id: "tv-2",
          nome: "Card de Envase em Andamento (Close)",
          url: "/Televisao",
          instrucoes: "Dê zoom em um card de envase",
          captura: "Screenshot de um card individual",
          arquivo: "06-televisao-card-envase.png",
          elementos: [
            "Badge de sala",
            "Foto do operador",
            "Logos de certificações",
            "Badge PRONTO (se tiver)",
            "Tempo decorrido"
          ]
        },
        {
          id: "tv-3",
          nome: "Card de Check-out Crítico (Close)",
          url: "/Televisao",
          instrucoes: "Dê zoom em um card de check-out crítico",
          captura: "Screenshot de um card crítico",
          arquivo: "07-televisao-card-checkout.png",
          elementos: [
            "Fundo vermelho",
            "Badge CRÍTICO",
            "Tempo em vermelho",
            "Detalhes do pedido"
          ]
        }
      ]
    },
    {
      titulo: "NOVO REGISTRO DE ENVASE",
      icon: ClipboardList,
      cor: "bg-green-100 text-green-700",
      capturas: [
        {
          id: "envase-1",
          nome: "Formulário Vazio",
          url: "/NovoRegistro",
          instrucoes: "Página inicial sem preencher nada",
          captura: "Página completa com scroll",
          arquivo: "08-novo-envase-vazio.png",
          elementos: [
            "Botão voltar",
            "Título da página",
            "Todos os campos vazios"
          ]
        },
        {
          id: "envase-2",
          nome: "Seleção de Sala e Operador",
          url: "/NovoRegistro",
          instrucoes: "Abra os dropdowns de Sala e Operador",
          captura: "Capture com dropdown aberto",
          arquivo: "09-novo-envase-selects.png",
          elementos: [
            "Dropdown de Sala aberto (Bio/Industrial)",
            "Lista de operadores"
          ]
        },
        {
          id: "envase-3",
          nome: "Produto Identificado",
          url: "/NovoRegistro",
          instrucoes: "Preencha um código de produto válido",
          captura: "Capture a área do produto + embalagem",
          arquivo: "10-novo-envase-produto.png",
          elementos: [
            "Card azul com dados do produto",
            "Card verde com dados da embalagem identificada",
            "Todos os campos preenchidos automaticamente"
          ]
        },
        {
          id: "envase-4",
          nome: "Controle de Tempo - Botões",
          url: "/NovoRegistro",
          instrucoes: "Foque na área de controle de tempo",
          captura: "Capture os campos de tempo",
          arquivo: "11-novo-envase-tempo.png",
          elementos: [
            "Campo Início com botão Play verde",
            "Campo Término com botão Stop vermelho",
            "Campo Tempo Produtivo (calculado)",
            "Card com Qtd Embalagens e Tempo/Embalagem"
          ]
        },
        {
          id: "envase-5",
          nome: "Tempo em Execução",
          url: "/NovoRegistro",
          instrucoes: "Clique em Play e aguarde alguns segundos",
          captura: "Capture com tempo rodando",
          arquivo: "12-novo-envase-tempo-ativo.png",
          elementos: [
            "Horário de início preenchido",
            "Mensagem 'Salvando automaticamente...'"
          ]
        },
        {
          id: "envase-6",
          nome: "Formulário Completo Preenchido",
          url: "/NovoRegistro",
          instrucoes: "Preencha todos os campos",
          captura: "Página completa com scroll",
          arquivo: "13-novo-envase-completo.png",
          elementos: [
            "Todos os campos preenchidos",
            "Botão 'Finalizar Registro' destacado",
            "Observações preenchidas"
          ]
        }
      ]
    },
    {
      titulo: "TODOS OS REGISTROS",
      icon: ClipboardList,
      cor: "bg-orange-100 text-orange-700",
      capturas: [
        {
          id: "registros-1",
          nome: "Lista Completa de Registros",
          url: "/Registros",
          instrucoes: "Visualize a lista completa",
          captura: "Página completa",
          arquivo: "14-registros-lista.png",
          elementos: [
            "Abas de filtro (Em Andamento, Bio, Industrial, Finalizados)",
            "Barra de busca",
            "Tabela com registros",
            "Badges de status"
          ]
        },
        {
          id: "registros-2",
          nome: "Filtro Em Andamento",
          url: "/Registros",
          instrucoes: "Clique na aba 'Em Andamento'",
          captura: "Lista filtrada",
          arquivo: "15-registros-andamento.png",
          elementos: [
            "Apenas registros não finalizados",
            "Badge 'Em Andamento' azul"
          ]
        },
        {
          id: "registros-3",
          nome: "Registro PRONTO (Sala Bio)",
          url: "/Registros",
          instrucoes: "Encontre um registro da sala Bio finalizado mas não retirado",
          captura: "Linha da tabela com botão destacado",
          arquivo: "16-registros-pronto.png",
          elementos: [
            "Badge 'Pronto' amarelo",
            "Botão 'Material Retirado' verde"
          ]
        },
        {
          id: "registros-4",
          nome: "Modal de Detalhes",
          url: "/Registros",
          instrucoes: "Clique no ícone de olho em qualquer registro",
          captura: "Modal/Dialog aberto",
          arquivo: "17-registros-detalhes.png",
          elementos: [
            "Todos os dados do registro",
            "Informações organizadas em seções",
            "Botões Editar e Fechar"
          ]
        },
        {
          id: "registros-5",
          nome: "Modal de Edição",
          url: "/Registros",
          instrucoes: "Clique no ícone de lápis em qualquer registro",
          captura: "Modal de edição aberto",
          arquivo: "18-registros-editar.png",
          elementos: [
            "Formulário de edição",
            "Campos preenchidos com dados atuais",
            "Botões Cancelar e Salvar"
          ]
        }
      ]
    },
    {
      titulo: "CHECK-OUT - PROGRAMAÇÕES",
      icon: Package,
      cor: "bg-indigo-100 text-indigo-700",
      capturas: [
        {
          id: "checkout-1",
          nome: "Lista de Programações",
          url: "/Checkout",
          instrucoes: "Visualize a lista de programações",
          captura: "Página completa",
          arquivo: "19-checkout-lista.png",
          elementos: [
            "3 Cards de estatísticas",
            "Filtros de período",
            "Cards de programações",
            "Botão 'Nova Programação'"
          ]
        },
        {
          id: "checkout-2",
          nome: "Card de Programação Expandido",
          url: "/Checkout",
          instrucoes: "Hover ou foque em um card",
          captura: "Um card individual",
          arquivo: "20-checkout-card.png",
          elementos: [
            "Data da programação",
            "Total de pedidos",
            "Pedidos concluídos",
            "Badge de status",
            "Observações (se houver)"
          ]
        },
        {
          id: "checkout-3",
          nome: "Filtros de Período",
          url: "/Checkout",
          instrucoes: "Preencha os filtros",
          captura: "Área de filtros",
          arquivo: "21-checkout-filtros.png",
          elementos: [
            "Campo Mês",
            "Data Inicial e Final",
            "Texto explicativo do período"
          ]
        }
      ]
    },
    {
      titulo: "NOVA PROGRAMAÇÃO CHECK-OUT",
      icon: Package,
      cor: "bg-pink-100 text-pink-700",
      capturas: [
        {
          id: "novacheckout-1",
          nome: "Formulário Inicial",
          url: "/NovaProgramacaoCheckout",
          instrucoes: "Página inicial",
          captura: "Página completa",
          arquivo: "22-nova-programacao-form.png",
          elementos: [
            "Campo Data Programada",
            "Campo Observações",
            "Área de importação de pedidos"
          ]
        },
        {
          id: "novacheckout-2",
          nome: "Área de Importação",
          url: "/NovaProgramacaoCheckout",
          instrucoes: "Foque na área de colar pedidos",
          captura: "Seção de importação",
          arquivo: "23-nova-programacao-importar.png",
          elementos: [
            "Textarea com placeholder",
            "Exemplo de formato",
            "Botão 'Processar Pedidos'"
          ]
        },
        {
          id: "novacheckout-3",
          nome: "Pedidos Processados",
          url: "/NovaProgramacaoCheckout",
          instrucoes: "Cole dados e clique em Processar",
          captura: "Lista de pedidos importados",
          arquivo: "24-nova-programacao-processados.png",
          elementos: [
            "Cards de pedidos importados",
            "Contador de pedidos",
            "Botão de remover em cada pedido"
          ]
        },
        {
          id: "novacheckout-4",
          nome: "Pronto para Criar",
          url: "/NovaProgramacaoCheckout",
          instrucoes: "Com pedidos processados",
          captura: "Página completa com pedidos",
          arquivo: "25-nova-programacao-pronto.png",
          elementos: [
            "Todos os campos preenchidos",
            "Lista de pedidos",
            "Botão 'Criar Programação' destacado"
          ]
        }
      ]
    },
    {
      titulo: "EXECUTAR CHECK-OUT",
      icon: Package,
      cor: "bg-cyan-100 text-cyan-700",
      capturas: [
        {
          id: "executar-1",
          nome: "Tela de Execução Completa",
          url: "/ExecutarCheckout?id=[ID_DA_PROGRAMACAO]",
          instrucoes: "Abra uma programação existente (clique em um card na lista)",
          captura: "Página completa",
          arquivo: "26-executar-checkout-completo.png",
          elementos: [
            "Header com data",
            "Card de observações",
            "4 Cards de stats",
            "Lista de pedidos"
          ]
        },
        {
          id: "executar-2",
          nome: "Card de Pedido Pendente",
          url: "/ExecutarCheckout?id=[ID]",
          instrucoes: "Pedido não iniciado",
          captura: "Um card fechado",
          arquivo: "27-executar-pedido-pendente.png",
          elementos: [
            "Badge 'Pendente' amarelo",
            "Número do pedido",
            "Cliente e data",
            "Botão 'Iniciar'"
          ]
        },
        {
          id: "executar-3",
          nome: "Card de Pedido em Edição",
          url: "/ExecutarCheckout?id=[ID]",
          instrucoes: "Clique para expandir um pedido",
          captura: "Card expandido com formulário",
          arquivo: "28-executar-pedido-form.png",
          elementos: [
            "Formulário aberto",
            "Dropdown de operador",
            "Campos de tempo",
            "Botões Play/Stop",
            "Checkbox 'Marcar como crítico'",
            "Campo observações"
          ]
        },
        {
          id: "executar-4",
          nome: "Controle de Tempo Check-out",
          url: "/ExecutarCheckout?id=[ID]",
          instrucoes: "Com tempo em execução",
          captura: "Área de tempo",
          arquivo: "29-executar-tempo.png",
          elementos: [
            "Horário de início",
            "Botões Play/Stop",
            "Tempo calculado",
            "Badge 'Em Andamento'"
          ]
        },
        {
          id: "executar-5",
          nome: "Formulário de Atraso",
          url: "/ExecutarCheckout?id=[ID]",
          instrucoes: "Expanda um pedido e role até 'Marcar Atraso'",
          captura: "Seção de atraso",
          arquivo: "30-executar-atraso.png",
          elementos: [
            "Checkbox 'Finalizado fora do prazo'",
            "Campo Data de Finalização Real",
            "Campo Motivo do Atraso"
          ]
        },
        {
          id: "executar-6",
          nome: "Pedido Concluído",
          url: "/ExecutarCheckout?id=[ID]",
          instrucoes: "Pedido finalizado",
          captura: "Card concluído",
          arquivo: "31-executar-concluido.png",
          elementos: [
            "Badge 'Concluído' verde",
            "Todos os dados salvos",
            "Card fechado"
          ]
        },
        {
          id: "executar-7",
          nome: "Adicionar Pedidos Críticos",
          url: "/ExecutarCheckout?id=[ID]",
          instrucoes: "Clique em 'Adicionar Pedidos Críticos'",
          captura: "Formulário de adição",
          arquivo: "32-executar-adicionar.png",
          elementos: [
            "Card de importação aberto",
            "Textarea para colar dados",
            "Botões Cancelar e Adicionar"
          ]
        }
      ]
    },
    {
      titulo: "PRODUTOS",
      icon: Package,
      cor: "bg-emerald-100 text-emerald-700",
      capturas: [
        {
          id: "produtos-1",
          nome: "Lista de Produtos",
          url: "/Produtos",
          instrucoes: "Visualize a tabela completa",
          captura: "Página completa",
          arquivo: "33-produtos-lista.png",
          elementos: [
            "Barra de busca",
            "Botões 'Importar Excel' e 'Novo Produto'",
            "Tabela com colunas",
            "Badges de certificações"
          ]
        },
        {
          id: "produtos-2",
          nome: "Formulário Novo Produto",
          url: "/Produtos",
          instrucoes: "Clique em 'Novo Produto'",
          captura: "Formulário aberto",
          arquivo: "34-produtos-form.png",
          elementos: [
            "Todos os campos",
            "Checkboxes de certificações",
            "Botões Cancelar e Salvar"
          ]
        },
        {
          id: "produtos-3",
          nome: "Produto com Certificações",
          url: "/Produtos",
          instrucoes: "Linha da tabela com badges",
          captura: "Linha com certificações",
          arquivo: "35-produtos-certificacoes.png",
          elementos: [
            "Badges NSF 3H (azul)",
            "Badge NSF H1 (verde)",
            "Badge HALAL (roxo)"
          ]
        },
        {
          id: "produtos-4",
          nome: "Importar Produtos (Excel)",
          url: "/ImportarProdutos",
          instrucoes: "Clique em 'Importar Excel'",
          captura: "Página de importação",
          arquivo: "36-produtos-importar.png",
          elementos: [
            "Instruções de importação",
            "Textarea para colar dados",
            "Exemplo de formato",
            "Botão 'Processar Produtos'"
          ]
        }
      ]
    },
    {
      titulo: "EMBALAGENS",
      icon: Box,
      cor: "bg-amber-100 text-amber-700",
      capturas: [
        {
          id: "embalagens-1",
          nome: "Lista de Embalagens",
          url: "/Embalagens",
          instrucoes: "Visualize a tabela",
          captura: "Página completa",
          arquivo: "37-embalagens-lista.png",
          elementos: [
            "Tabela de embalagens",
            "Coluna '4 Dígitos'",
            "Botões de ação"
          ]
        },
        {
          id: "embalagens-2",
          nome: "Formulário Nova Embalagem",
          url: "/Embalagens",
          instrucoes: "Clique em 'Nova Embalagem'",
          captura: "Formulário",
          arquivo: "38-embalagens-form.png",
          elementos: [
            "Campo Código",
            "Campo 'Últimos 4 dígitos' (auto-preenchido)",
            "Explicação sobre os 4 dígitos"
          ]
        },
        {
          id: "embalagens-3",
          nome: "Importar Embalagens",
          url: "/ImportarEmbalagens",
          instrucoes: "Página de importação",
          captura: "Página completa",
          arquivo: "39-embalagens-importar.png",
          elementos: [
            "Instruções",
            "Textarea",
            "Lista de embalagens processadas"
          ]
        }
      ]
    },
    {
      titulo: "OPERADORES",
      icon: Users,
      cor: "bg-rose-100 text-rose-700",
      capturas: [
        {
          id: "operadores-1",
          nome: "Lista de Operadores",
          url: "/Operadores",
          instrucoes: "Visualize a tabela",
          captura: "Página completa",
          arquivo: "40-operadores-lista.png",
          elementos: [
            "Tabela com operadores",
            "Coluna de foto (se tiver)",
            "Badges de status (Ativo/Inativo)",
            "Badges de sala"
          ]
        },
        {
          id: "operadores-2",
          nome: "Formulário Novo Operador",
          url: "/Operadores",
          instrucoes: "Clique em 'Novo Operador'",
          captura: "Formulário",
          arquivo: "41-operadores-form.png",
          elementos: [
            "Campo Nome",
            "Campo Matrícula",
            "Dropdown Sala",
            "Checkbox Ativo",
            "Campo URL da Foto"
          ]
        },
        {
          id: "operadores-3",
          nome: "Operador Ativo vs Inativo",
          url: "/Operadores",
          instrucoes: "Capture dois operadores na tabela",
          captura: "Duas linhas da tabela",
          arquivo: "42-operadores-status.png",
          elementos: [
            "Badge 'Ativo' (azul)",
            "Badge 'Inativo' (cinza)"
          ]
        }
      ]
    },
    {
      titulo: "NAVEGAÇÃO",
      icon: LayoutDashboard,
      cor: "bg-slate-100 text-slate-700",
      capturas: [
        {
          id: "nav-1",
          nome: "Sidebar (Menu Lateral)",
          url: "/Dashboard",
          instrucoes: "Capture o menu lateral",
          captura: "Apenas a sidebar",
          arquivo: "43-navegacao-sidebar.png",
          elementos: [
            "Logo e nome do sistema",
            "Todos os itens do menu",
            "Item selecionado destacado"
          ]
        },
        {
          id: "nav-2",
          nome: "Header Mobile",
          url: "/Dashboard",
          instrucoes: "Reduza a janela para mobile ou use DevTools (F12 > Toggle device toolbar)",
          captura: "Header mobile com hamburger menu",
          arquivo: "44-navegacao-mobile.png",
          elementos: [
            "Botão hamburger",
            "Título da página"
          ]
        },
        {
          id: "nav-3",
          nome: "Menu Mobile Aberto",
          url: "/Dashboard",
          instrucoes: "No mobile, clique no menu hamburger",
          captura: "Sidebar mobile aberta",
          arquivo: "45-navegacao-mobile-open.png",
          elementos: [
            "Menu deslizante aberto",
            "Todos os itens visíveis"
          ]
        }
      ]
    },
    {
      titulo: "EXTRAS",
      icon: Camera,
      cor: "bg-violet-100 text-violet-700",
      capturas: [
        {
          id: "extra-1",
          nome: "Loading State",
          url: "/Dashboard",
          instrucoes: "F5 e capture rapidamente ou simule slow 3G no DevTools",
          captura: "Tela de carregamento",
          arquivo: "46-loading.png",
          elementos: [
            "Spinner/Loading",
            "Mensagem 'Carregando...'"
          ]
        },
        {
          id: "extra-2",
          nome: "Tema Geral da Aplicação",
          url: "/Dashboard",
          instrucoes: "Capture para mostrar o design geral",
          captura: "Uma tela qualquer bem preenchida",
          arquivo: "47-tema-geral.png",
          elementos: [
            "Cores do sistema",
            "Estilos de cards",
            "Botões e badges",
            "Tipografia"
          ]
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-8 border border-slate-200">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-slate-900">
                📸 Guia de Capturas para Apresentação
              </h1>
              <p className="text-slate-600 mt-1">
                Siga este guia para capturar todas as telas do sistema
              </p>
            </div>
          </div>

          {/* Progresso */}
          <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-lg font-semibold text-blue-900">
                Progresso: {capturasCompletas} de {totalCapturas} capturas
              </span>
              <span className="text-2xl font-bold text-blue-600">{progresso}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-4 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-500 rounded-full"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>

          {/* Instruções */}
          <div className="mt-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">🎯 Como usar este guia:</h3>
            <ol className="list-decimal list-inside space-y-2 text-slate-700">
              <li>Clique no botão <strong>"IR PARA ESTA TELA"</strong> em cada item</li>
              <li>Siga as instruções específicas de cada captura</li>
              <li>Use <strong>Win + Shift + S</strong> (Windows) ou <strong>Cmd + Shift + 4</strong> (Mac) para capturar</li>
              <li>Para páginas com scroll, use a extensão <strong>"GoFullPage"</strong> do Chrome</li>
              <li>Salve com o nome sugerido (ex: 01-dashboard-envase.png)</li>
              <li>Marque como concluída clicando no checkbox ✅</li>
            </ol>
          </div>

          {/* Link para extensão */}
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-900 font-semibold mb-2">
              📥 Instale a extensão para capturar páginas completas:
            </p>
            <a 
              href="https://chrome.google.com/webstore/detail/gofullpage-full-page-scre/fdpohaocaechififmbbbbbknoalclacl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-medium"
            >
              GoFullPage - Full Page Screen Capture →
            </a>
          </div>
        </div>

        {/* Seções de Capturas */}
        {sections.map((section, sectionIdx) => (
          <Card key={sectionIdx} className="border-slate-200 shadow-lg overflow-hidden">
            <CardHeader className={`${section.cor} border-b border-slate-200`}>
              <div className="flex items-center gap-3">
                <section.icon className="w-6 h-6" />
                <CardTitle className="text-xl font-bold">
                  {section.titulo}
                </CardTitle>
                <Badge variant="secondary" className="ml-auto">
                  {section.capturas.filter(c => capturas[c.id]).length} / {section.capturas.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                {section.capturas.map((captura) => (
                  <div 
                    key={captura.id}
                    className={`p-5 rounded-lg border-2 transition-all ${
                      capturas[captura.id] 
                        ? 'bg-green-50 border-green-300' 
                        : 'bg-white border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <Checkbox
                        id={captura.id}
                        checked={capturas[captura.id] || false}
                        onCheckedChange={() => toggleCaptura(captura.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <h4 className="font-bold text-lg text-slate-900 mb-1">
                              {captura.nome}
                            </h4>
                            <p className="text-sm text-slate-600 mb-2">
                              <strong>📁 Salvar como:</strong> <code className="bg-slate-100 px-2 py-1 rounded text-xs">{captura.arquivo}</code>
                            </p>
                          </div>
                          <Link to={createPageUrl(captura.url.split('?')[0].replace('/', ''))}>
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 shrink-0">
                              <ExternalLink className="w-4 h-4 mr-2" />
                              IR PARA ESTA TELA
                            </Button>
                          </Link>
                        </div>

                        <div className="space-y-3 text-sm">
                          <div className="bg-blue-50 border border-blue-200 rounded p-3">
                            <strong className="text-blue-900">📋 Instruções:</strong>
                            <p className="text-blue-800 mt-1">{captura.instrucoes}</p>
                          </div>

                          <div className="bg-purple-50 border border-purple-200 rounded p-3">
                            <strong className="text-purple-900">📸 Como capturar:</strong>
                            <p className="text-purple-800 mt-1">{captura.captura}</p>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded p-3">
                            <strong className="text-slate-900">✅ O que deve aparecer:</strong>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-slate-700">
                              {captura.elementos.map((elem, idx) => (
                                <li key={idx}>{elem}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Footer com resumo */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <h3 className="font-bold text-lg text-green-900">
                  Depois de capturar todas as telas:
                </h3>
                <ul className="list-disc list-inside mt-2 space-y-1 text-green-800">
                  <li>Organize todas as imagens em uma pasta</li>
                  <li>Verifique se todas estão com boa qualidade</li>
                  <li>Use os nomes sugeridos para facilitar a organização</li>
                  <li>Envie para a IA que vai criar a apresentação</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botão de Download */}
        <div className="flex justify-center">
          <Button 
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            onClick={() => {
              const lista = sections.flatMap(s => 
                s.capturas.map(c => c.arquivo)
              ).join('\n');
              navigator.clipboard.writeText(lista);
              alert('✅ Lista de arquivos copiada para área de transferência!');
            }}
          >
            <Download className="w-5 h-5 mr-2" />
            Copiar Lista de Arquivos
          </Button>
        </div>
      </div>
    </div>
  );
}
