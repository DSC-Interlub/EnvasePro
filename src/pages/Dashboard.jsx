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

  const filteredRecords = records.filter(record => {
    const salaMatch = selectedSala === "all" || record.sala === selectedSala;
    const operatorMatch = selectedOperator === "all" || record.operador === selectedOperator;
    
    let dateMatch = true;
    if (selectedMonth) {
      const recordDate = new Date(record.data + 'T00:00:00');
      const recordMonth = format(recordDate, "yyyy-MM");
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
    
    return salaMatch && operatorMatch && dateMatch;
  });

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
      const itemMonth = format(new Date(itemDateStr + 'T00:00:00'), "yyyy-MM");
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
      const programacaoMonth = format(new Date(programacaoDateStr + 'T00:00:00'), "yyyy-MM");
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
          format(new Date(record.data + 'T00:00:00'), "dd/MM/yyyy"),
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
        const dataProgramada = programacao ? format(new Date(programacao.data_programada + 'T00:00:00'), "dd/MM/yyyy") : '';
        
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
          item.data_entrega ? format(new Date(item.data_entrega + 'T00:00:00'), "dd/MM/yyyy") : "",
          item.operador || "",
          item.status || "",
          item.critico ? "Sim" : "Não",
          item.data_saida ? format(new Date(item.data_saida + 'T00:00:00'), "dd/MM/yyyy") : "",
          programacao?.previsao_inicio || "",
          item.hora_inicio || "",
          atrasoInicio,
          programacao?.previsao_termino || "",
          item.hora_termino || "",
          atrasoTermino,
          duracaoPrevista,
          duracaoReal,
          item.finalizado_fora_do_prazo ? "Sim" : "Não",
          item.data_finalizacao_real ? format(new Date(item.data_finalizacao_real + 'T00:00:00'), "dd/MM/yyyy") : "",
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
    const recordDate = new Date(r.data + 'T00:00:00');
    const today = new Date();
    return recordDate.toDateString() === today.toDateString();
  });

  const totalProduction = filteredRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0);
  const todayProduction = todayRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
              Dashboard de Operações Interlub
            </h1>
            <p className="text-slate-600 mt-1">
              {format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Button
              variant="outline"
              className="flex-1 md:flex-none"
              onClick={() => setShowExportDialog(true)}
              disabled={viewMode === "envase" ? records.length === 0 : checkoutItems.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Link to={createPageUrl("NovoRegistro")} className="flex-1 md:flex-none">
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Novo Registro
              </Button>
            </Link>
          </div>
        </div>

        {/* Modo de Visualização */}
        <Card className="border-slate-200 shadow-lg">
          <CardContent className="p-6">
            <Label className="text-sm font-medium text-slate-700 mb-3 block">
              Visualizar Dados de:
            </Label>
            <Tabs value={viewMode} onValueChange={setViewMode}>
              <TabsList className="bg-white border border-slate-200 w-full max-w-md">
                <TabsTrigger value="envase" className="flex-1">Envase</TabsTrigger>
                <TabsTrigger value="checkout" className="flex-1">Check-out</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Filtros */}
        <Card className="border-slate-200 shadow-lg">
          <CardContent className="p-6 space-y-4">
            {viewMode === "envase" && (
              <div>
                <Label className="text-sm font-medium text-slate-700 mb-2 block">
                  Filtrar por Sala
                </Label>
                <Tabs value={selectedSala} onValueChange={setSelectedSala}>
                  <TabsList className="bg-white border border-slate-200 w-full">
                    <TabsTrigger value="all" className="flex-1">Todas</TabsTrigger>
                    <TabsTrigger value="Bio" className="flex-1">Sala Bio</TabsTrigger>
                    <TabsTrigger value="Industrial" className="flex-1">Sala Industrial</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium text-slate-700 mb-2 block">
                Filtrar por Operador
              </Label>
              <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Todos os operadores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Operadores</SelectItem>
                  {operators.map((op) => (
                    <SelectItem key={op.id} value={op.nome}>
                      {op.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-slate-600" />
                <Label className="text-sm font-medium text-slate-700">
                  Filtrar por Período
                </Label>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="month" className="text-sm text-slate-600 mb-1 block">
                    Mês
                  </Label>
                  <Input
                    id="month"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="bg-white"
                  />
                </div>

                <div>
                  <Label htmlFor="startDate" className="text-sm text-slate-600 mb-1 block">
                    Data Inicial
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-white"
                    max={endDate || undefined}
                  />
                </div>

                <div>
                  <Label htmlFor="endDate" className="text-sm text-slate-600 mb-1 block">
                    Data Final
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-white"
                    min={startDate || undefined}
                  />
                </div>
              </div>
              {(startDate || endDate) && (
                <p className="text-xs text-slate-500 mt-2">
                  {startDate && endDate ? (
                    <>Mostrando registros de {format(new Date(startDate + 'T00:00:00'), "dd/MM/yyyy")} até {format(new Date(endDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                  ) : startDate ? (
                    <>Mostrando registros a partir de {format(new Date(startDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                  ) : (
                    <>Mostrando registros até {format(new Date(endDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                  )}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

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
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-blue-600" />
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
                  <>Exportando registros de {format(new Date(exportStartDate + 'T00:00:00'), "dd/MM/yyyy")} até {format(new Date(exportEndDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                ) : exportStartDate ? (
                  <>Exportando registros a partir de {format(new Date(exportStartDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                ) : (
                  <>Exportando registros até {format(new Date(exportEndDate + 'T00:00:00'), "dd/MM/yyyy")}</>
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
            <Button onClick={exportToExcel} className="bg-blue-600 hover:bg-blue-700">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}