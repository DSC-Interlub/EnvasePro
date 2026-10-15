import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/AuthContext";
import BlocoLimpeza from "@/components/dashboard/BlocoLimpeza";
import BlocoRecebimento from "@/components/dashboard/BlocoRecebimento";
import { 
  Plus,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

import StatsGrid from "../components/dashboard/StatsGrid";
import AnalysisGrid from "../components/dashboard/AnalysisGrid";
import CategoryStatsGrid from "../components/dashboard/CategoryStatsGrid";
import CheckoutStatsGrid from "../components/dashboard/CheckoutStatsGrid"; 
import CheckoutAnalysisGrid from "../components/dashboard/CheckoutAnalysisGrid"; 
import { formatarData, paraData } from '@/lib/datas';
import { PageHeader, SegmentoPeriodo, ChipsFiltro } from "@/components/fluxo";

export default function Dashboard() {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const [selectedSala, setSelectedSala] = useState("all");
  const [selectedOperator, setSelectedOperator] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState("envase");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  
  const { data: records, isLoading } = useQuery({
    queryKey: ['envase-records'],
    queryFn: () => base44.entities.EnvaseRecord.list("-data"),
    initialData: [],
  });

  const { data: checkoutItems, isLoading: loadingCheckout } = useQuery({
    queryKey: ['checkout-items-all'],
    queryFn: () => base44.entities.CheckoutItem.list("-created_date"),
    initialData: [],
    enabled: viewMode === "checkout",
  });

  const { data: checkoutProgramacoes } = useQuery({
    queryKey: ['checkout-programacoes-all'],
    queryFn: () => base44.entities.CheckoutProgramacao.list(),
    initialData: [],
    enabled: viewMode === "checkout",
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    staleTime: Infinity,
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['operators'],
    queryFn: () => base44.entities.Operator.list(),
    staleTime: Infinity,
  });

  /**
   * O filtro de periodo e de operador, SEM a sala.
   *
   * Separado de proposito: a contagem do chip de sala tem de ser calculada
   * sobre os registros do periodo, nao sobre os que ja passaram pelo filtro de
   * sala — senao a aba "Sala Bio" mostraria sempre a propria contagem e as
   * outras duas apareceriam zeradas.
   *
   * A regra de data e EXATAMENTE a mesma de antes, inclusive o cuidado com
   * data invalida (sem data valida o registro nao pertence a mes nenhum).
   */
  const combinaPeriodoEOperador = (record) => {
    const operatorMatch = selectedOperator === 'all' || record.operador === selectedOperator;

    let dateMatch = true;
    if (selectedMonth) {
      const recordDate = paraData(record.data);
      const recordMonth = recordDate ? format(recordDate, 'yyyy-MM') : null;
      dateMatch = recordMonth === selectedMonth;

      if (startDate || endDate) {
        const recordDateStr = record.data;
        if (startDate && endDate) {
          dateMatch = recordDateStr >= startDate && recordDateStr <= endDate;
        } else if (startDate) {
          dateMatch = recordDateStr >= startDate;
        } else if (endDate) {
          dateMatch = recordDateStr <= endDate;
        }
      }
    }

    return operatorMatch && dateMatch;
  };

  const registrosDoPeriodo = records.filter(combinaPeriodoEOperador);

  const filteredRecords = registrosDoPeriodo.filter(
    (record) => selectedSala === 'all' || record.sala === selectedSala);

  const filteredCheckoutItems = checkoutItems.filter(item => {
    const itemProgramacao = checkoutProgramacoes.find(p => p.id === item.programacao_id);

    if (!itemProgramacao || !itemProgramacao.data_programada) {
      return false; 
    }

    const operatorMatch = selectedOperator === "all" || item.operador === selectedOperator;
    
    let dateMatch = true;
    const itemDateStr = itemProgramacao.data_programada;

    if (startDate || endDate) {
      if (startDate && endDate) {
        dateMatch = itemDateStr >= startDate && itemDateStr <= endDate;
      } else if (startDate) {
        dateMatch = itemDateStr >= startDate;
      } else if (endDate) {
        dateMatch = itemDateStr <= endDate;
      }
    } else if (selectedMonth) {
      const itemMonth = formatarData(itemDateStr, "yyyy-MM");
      dateMatch = itemMonth === selectedMonth;
    }
    
    return operatorMatch && dateMatch;
  });

  const filteredProgramacoes = checkoutProgramacoes.filter(programacao => {
    if (!programacao || !programacao.data_programada) {
      return false;
    }

    let dateMatch = true;
    const programacaoDateStr = programacao.data_programada;

    if (startDate || endDate) {
      if (startDate && endDate) {
        dateMatch = programacaoDateStr >= startDate && programacaoDateStr <= endDate;
      } else if (startDate) {
        dateMatch = programacaoDateStr >= startDate;
      } else if (endDate) {
        dateMatch = programacaoDateStr <= endDate;
      }
    } else if (selectedMonth) {
      const programacaoMonth = formatarData(programacaoDateStr, "yyyy-MM");
      dateMatch = programacaoMonth === selectedMonth;
    }

    return dateMatch;
  });

  const exportToExcel = async () => {
    // Filtrar registros pela data de exportação
    let recordsToExport = records;
    
    if (exportStartDate || exportEndDate) {
      recordsToExport = records.filter(record => {
        const recordDateStr = record.data;
        if (exportStartDate && exportEndDate) {
          return recordDateStr >= exportStartDate && recordDateStr <= exportEndDate;
        } else if (exportStartDate) {
          return recordDateStr >= exportStartDate;
        } else if (exportEndDate) {
          return recordDateStr <= exportEndDate;
        }
        return true;
      });
    }

    let csvContent = "";
    let fileName = "";

    if (viewMode === "envase") {
      // Cabeçalhos separados por ponto-e-vírgula
      const headers = [
        "Data", "Mês", "Ano", "OP", "Operador", "Código Produto", "Descrição Produto", 
        "Consistência", "Código Embalagem", "Descrição Embalagem", "Múltiplo", 
        "Qtd Produzida", "Início", "Término", "Tempo Produtivo", "Qtd Embalagens", 
        "Tempo/Embalagem", "Dificuldade Código", "Tipo Dificuldade", "Lote Embalagem", 
        "Lotes Tampa", "Observações", "Sala", "Material Retirado"
      ];
      
      csvContent = headers.join(";") + "\n";
      
      recordsToExport.forEach(record => {
        const row = [
          formatarData(record.data, "dd/MM/yyyy"),
          record.mes || "",
          record.ano || "",
          record.op || "",
          record.operador || "",
          record.codigo_produto || "",
          record.descricao_produto || "",
          record.consistencia || "",
          record.codigo_embalagem || "",
          record.descricao_embalagem || "",
          record.multiplo || "",
          record.quantidade_produzida || "",
          record.inicio || "",
          record.termino || "",
          record.tempo_produtivo || "",
          record.quantidade_embalagens || "",
          record.tempo_por_embalagem || "",
          record.dificuldade_codigo !== undefined ? record.dificuldade_codigo : "",
          record.dificuldade_tipo || "",
          record.lote_embalagem || "",
          record.lotes_tampa || "",
          record.observacoes || "",
          record.sala || "",
          record.material_retirado ? "Sim" : "Não"
        ];
        
        csvContent += row.map(cell => {
          const cellStr = String(cell);
          // Escapar aspas duplas e envolver células com ponto-e-vírgula ou quebras de linha
          if (cellStr.includes(";") || cellStr.includes("\n") || cellStr.includes('"')) {
            return '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        }).join(";") + "\n";
      });
      
      fileName = `registros-envase-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;

    } else if (viewMode === "checkout") {
      // Filtrar checkout items pela data de exportação
      let itemsToExport = checkoutItems;
      
      if (exportStartDate || exportEndDate) {
        itemsToExport = checkoutItems.filter(item => {
          const itemProgramacao = checkoutProgramacoes.find(p => p.id === item.programacao_id);
          if (!itemProgramacao || !itemProgramacao.data_programada) return false;
          
          const itemDateStr = itemProgramacao.data_programada;
          if (exportStartDate && exportEndDate) {
            return itemDateStr >= exportStartDate && itemDateStr <= exportEndDate;
          } else if (exportStartDate) {
            return itemDateStr >= exportStartDate;
          } else if (exportEndDate) {
            return itemDateStr <= exportEndDate;
          }
          return true;
        });
      }

      // Cabeçalhos
      const headers = [
        "ID Item", "ID Programação", "Data Programada", "Turno", "Número Pedido", 
        "Cliente", "Data Entrega", "Operador", "Status", "Crítico", "Data Saída",
        "Previsão Início", "Início Real", "Atraso Início (min)", 
        "Previsão Término", "Término Real", "Atraso Término (min)",
        "Duração Prevista (min)", "Duração Real (min)", 
        "Finalizado Fora do Prazo", "Data Finalização Real", "Motivo Atraso",
        "Observações Programação", "Observações Item"
      ];
      
      csvContent = headers.join(";") + "\n";
      
      itemsToExport.forEach(item => {
        const programacao = checkoutProgramacoes.find(p => p.id === item.programacao_id);
        const dataProgramada = programacao ? formatarData(programacao.data_programada, "dd/MM/yyyy") : '';
        
        // Calcular atrasos e durações
        const previsaoInicio = programacao?.previsao_inicio ? new Date(`2000-01-01T${programacao.previsao_inicio}`) : null;
        const previsaoTermino = programacao?.previsao_termino ? new Date(`2000-01-01T${programacao.previsao_termino}`) : null;
        const horaInicio = item.hora_inicio ? new Date(`2000-01-01T${item.hora_inicio}`) : null;
        const horaTermino = item.hora_termino ? new Date(`2000-01-01T${item.hora_termino}`) : null;

        let atrasoInicio = '';
        if (previsaoInicio && horaInicio) {
          const diffMinutes = (horaInicio.getTime() - previsaoInicio.getTime()) / (1000 * 60);
          atrasoInicio = Math.round(diffMinutes);
        }

        let atrasoTermino = '';
        if (previsaoTermino && horaTermino) {
          const diffMinutes = (horaTermino.getTime() - previsaoTermino.getTime()) / (1000 * 60);
          atrasoTermino = Math.round(diffMinutes);
        }

        let duracaoReal = '';
        if (horaInicio && horaTermino) {
          const diffMinutes = (horaTermino.getTime() - horaInicio.getTime()) / (1000 * 60);
          duracaoReal = Math.round(diffMinutes);
        }
        
        let duracaoPrevista = '';
        if (previsaoInicio && previsaoTermino) {
          const diffMinutes = (previsaoTermino.getTime() - previsaoInicio.getTime()) / (1000 * 60);
          duracaoPrevista = Math.round(diffMinutes);
        }

        const row = [
          item.id || "",
          item.programacao_id || "",
          dataProgramada,
          programacao?.turno || "",
          item.numero_pedido || "",
          item.cliente || "",
          item.data_entrega ? formatarData(item.data_entrega, "dd/MM/yyyy") : "",
          item.operador || "",
          item.status || "",
          item.critico ? "Sim" : "Não",
          item.data_saida ? formatarData(item.data_saida, "dd/MM/yyyy") : "",
          programacao?.previsao_inicio || "",
          item.hora_inicio || "",
          atrasoInicio,
          programacao?.previsao_termino || "",
          item.hora_termino || "",
          atrasoTermino,
          duracaoPrevista,
          duracaoReal,
          item.finalizado_fora_do_prazo ? "Sim" : "Não",
          item.data_finalizacao_real ? formatarData(item.data_finalizacao_real, "dd/MM/yyyy") : "",
          item.motivo_atraso || "",
          programacao?.observacoes || "",
          item.observacoes || ""
        ];
        
        csvContent += row.map(cell => {
          const cellStr = String(cell);
          if (cellStr.includes(";") || cellStr.includes("\n") || cellStr.includes('"')) {
            return '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        }).join(";") + "\n";
      });
      
      fileName = `registros-checkout-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;
    }

    if (!csvContent) {
      alert("Não há dados para exportar no modo selecionado.");
      return;
    }

    // Adicionar BOM para UTF-8
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Fechar o diálogo e limpar datas
    setShowExportDialog(false);
    setExportStartDate("");
    setExportEndDate("");
  };

  const todayRecords = filteredRecords.filter(r => {
    const recordDate = paraData(r.data);
    if (!recordDate) return false; // sem data válida, não conta como "de hoje"
    const today = new Date();
    return recordDate.toDateString() === today.toDateString();
  });

  const totalProduction = filteredRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0);
  const todayProduction = todayRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0);

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Acompanhar" }, { rotulo: "Dashboard" }]}
          titulo="Dashboard"
          legenda={format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          acoes={
            <>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowExportDialog(true)}
                disabled={viewMode === "envase" ? records.length === 0 : checkoutItems.length === 0}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Exportar
              </Button>
              <Link to={createPageUrl("NovoRegistro")}>
                <Button size="lg">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Novo registro
                </Button>
              </Link>
            </>
          }
        />

        {/*
          FILTROS — eram DOIS cartões brancos de 6rem de altura, um só para
          escolher entre Envase e Check-out e outro com sala, operador e
          período, cada campo com o seu `<Label>` em cima. Ocupavam a primeira
          tela inteira: para ver qualquer número era preciso rolar.

          Agora é uma barra só. O que mudou de verdade:
           - "Visualizar dados de" virou o controle segmentado do padrão;
           - "Filtrar por sala" virou chip COM CONTAGEM, calculada sobre os
             registros do período — antes era aba, e não dava para saber se a
             Sala Bio tinha algum registro sem trocar de aba;
           - os três campos de data ficaram, porque são três coisas diferentes
             (mês fechado, ou intervalo livre), mas sem rótulo acima de cada um:
             o `aria-label` informa o leitor de tela e o `type` já diz ao olho.
        */}
        <div className="cartao-fluxo flex min-w-0 flex-col gap-4 p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <SegmentoPeriodo
              rotulo="Visualizar dados de"
              opcoes={[
                { valor: "envase", rotulo: "Envase" },
                { valor: "checkout", rotulo: "Check-out" },
              ]}
              valor={viewMode}
              aoEscolher={setViewMode}
            />

            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <Input
                id="month"
                type="month"
                aria-label="Filtrar por mês"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setStartDate("");
                  setEndDate("");
                }}
                className="w-44"
              />
              <Input
                id="startDate"
                type="date"
                aria-label="Data inicial"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate || undefined}
                className="w-40"
              />
              <span className="text-sm font-bold text-texto-apagado">até</span>
              <Input
                id="endDate"
                type="date"
                aria-label="Data final"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-40"
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            {viewMode === "envase" ? (
              <ChipsFiltro
                rotulo="Filtrar por sala"
                opcoes={[
                  { valor: "all", rotulo: "Todas", contagem: registrosDoPeriodo.length },
                  { valor: "Bio", rotulo: "Sala Bio",
                    contagem: registrosDoPeriodo.filter((r) => r.sala === "Bio").length },
                  { valor: "Industrial", rotulo: "Sala Industrial",
                    contagem: registrosDoPeriodo.filter((r) => r.sala === "Industrial").length },
                ]}
                valor={selectedSala}
                aoEscolher={setSelectedSala}
              />
            ) : <span />}

            <Select value={selectedOperator} onValueChange={setSelectedOperator}>
              <SelectTrigger id="operador-filtro" aria-label="Filtrar por operador" className="w-64">
                <SelectValue placeholder="Todos os operadores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os operadores</SelectItem>
                {operators.map((op) => (
                  <SelectItem key={op.id} value={op.nome}>{op.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(startDate || endDate) && (
            <p className="text-xs font-semibold text-texto-fraco">
              {startDate && endDate
                ? `Mostrando registros de ${formatarData(startDate, "dd/MM/yyyy")} até ${formatarData(endDate, "dd/MM/yyyy")}`
                : startDate
                  ? `Mostrando registros a partir de ${formatarData(startDate, "dd/MM/yyyy")}`
                  : `Mostrando registros até ${formatarData(endDate, "dd/MM/yyyy")}`}
            </p>
          )}
        </div>

        {/* Bloco de Recebimentos */}
        <BlocoRecebimento isAdmin={isAdmin} />

        {/* Bloco de Limpeza */}
        <BlocoLimpeza currentUser={currentUser} isAdmin={isAdmin} />

        {/* Stats e Analysis baseado no modo */}
        {viewMode === "envase" ? (
          <>
            <StatsGrid 
              records={filteredRecords}
              todayRecords={todayRecords}
              totalProduction={totalProduction}
              todayProduction={todayProduction}
              productsCount={products.length}
              operatorsCount={operators.length}
              isLoading={isLoading}
            />
            <CategoryStatsGrid records={filteredRecords} products={products} />
            <AnalysisGrid records={filteredRecords} isLoading={isLoading} />
          </>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-slate-200 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Total de Programações</p>
                      <p className="text-3xl font-bold text-slate-900 mt-2">
                        {filteredProgramacoes.length}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-marca-suave rounded-xl flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-marca" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Pedidos Críticos</p>
                      <p className="text-3xl font-bold text-red-600 mt-2">
                        {filteredCheckoutItems.filter(i => i.critico).length}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Concluídas</p>
                      <p className="text-3xl font-bold text-green-600 mt-2">
                        {filteredProgramacoes.filter(p => p.status === "Concluído").length}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <CheckoutAnalysisGrid 
              items={filteredCheckoutItems}
              programacoes={checkoutProgramacoes}
              isLoading={loadingCheckout}
            />
          </>
        )}
      </div>

      {/* Dialog de Exportação */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar Relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">
              Selecione o período para exportação (deixe em branco para exportar todos os registros):
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="exportStartDate" className="text-sm text-slate-600 mb-1 block">
                  Data Inicial
                </Label>
                <Input
                  id="exportStartDate"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  max={exportEndDate || undefined}
                />
              </div>
              <div>
                <Label htmlFor="exportEndDate" className="text-sm text-slate-600 mb-1 block">
                  Data Final
                </Label>
                <Input
                  id="exportEndDate"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  min={exportStartDate || undefined}
                />
              </div>
            </div>
            {(exportStartDate || exportEndDate) && (
              <p className="text-xs text-slate-500">
                {exportStartDate && exportEndDate ? (
                  <>Exportando registros de {formatarData(exportStartDate, "dd/MM/yyyy")} até {formatarData(exportEndDate, "dd/MM/yyyy")}</>
                ) : exportStartDate ? (
                  <>Exportando registros a partir de {formatarData(exportStartDate, "dd/MM/yyyy")}</>
                ) : (
                  <>Exportando registros até {formatarData(exportEndDate, "dd/MM/yyyy")}</>
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowExportDialog(false);
              setExportStartDate("");
              setExportEndDate("");
            }}>
              Cancelar
            </Button>
            <Button onClick={exportToExcel} className="bg-marca hover:bg-marca-forte">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}