import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Calendar, Package, CheckCircle, Clock, Filter, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Checkout() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const queryClient = useQueryClient();
  
  const { data: programacoes, isLoading: isLoadingProgramacoes } = useQuery({
    queryKey: ['checkout-programacoes'],
    queryFn: () => base44.entities.CheckoutProgramacao.list("-data_programada"),
    initialData: [],
  });

  const { data: checkoutItems, isLoading: isLoadingCheckoutItems } = useQuery({
    queryKey: ['checkout-items'],
    queryFn: () => base44.entities.CheckoutItem.list(),
    initialData: [],
  });

  const deleteProgramacaoMutation = useMutation({
    mutationFn: async (programacaoId) => {
      // Primeiro, excluir todos os itens da programação
      const items = checkoutItems.filter(item => item.programacao_id === programacaoId);
      await Promise.all(items.map(item => base44.entities.CheckoutItem.delete(item.id)));
      
      // Depois, excluir a programação
      await base44.entities.CheckoutProgramacao.delete(programacaoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-programacoes'] });
      queryClient.invalidateQueries({ queryKey: ['checkout-items'] });
    },
  });

  const handleDeleteProgramacao = (programacao) => {
    const itemsCount = checkoutItems.filter(item => item.programacao_id === programacao.id).length;
    const message = itemsCount > 0 
      ? `Tem certeza que deseja excluir esta programação?\n\n${itemsCount} pedido(s) também serão excluídos.`
      : 'Tem certeza que deseja excluir esta programação?';
    
    if (confirm(message)) {
      deleteProgramacaoMutation.mutate(programacao.id);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Pendente": return "bg-yellow-100 text-yellow-800";
      case "Em Andamento": return "bg-blue-100 text-blue-800";
      case "Concluído": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Pendente": return <Clock className="w-4 h-4" />;
      case "Em Andamento": return <Package className="w-4 h-4" />;
      case "Concluído": return <CheckCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const filteredProgramacoes = programacoes.filter(prog => {
    if (!prog.data_programada) return false;
    
    const progDate = prog.data_programada;
    const progMonth = format(new Date(progDate + 'T00:00:00'), "yyyy-MM");
    
    let dateMatch = true;
    
    if (selectedMonth) {
      dateMatch = progMonth === selectedMonth;
      
      if (startDate || endDate) {
        if (startDate && endDate) {
          dateMatch = progDate >= startDate && progDate <= endDate;
        } else if (startDate) {
          dateMatch = progDate >= startDate;
        } else if (endDate) {
          dateMatch = progDate <= endDate;
        }
      }
    }
    
    return dateMatch;
  });

  const isLoading = isLoadingProgramacoes || isLoadingCheckoutItems;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
              Check-out de Pedidos
            </h1>
            <p className="text-slate-600 mt-1">
              Gerencie as programações e execução de check-out
            </p>
          </div>
          <Link to={createPageUrl("NovaProgramacaoCheckout")}>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nova Programação
            </Button>
          </Link>
        </div>

        {/* Filtros */}
        <Card className="border-slate-200 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-slate-600" />
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
                  <>Mostrando programações de {format(new Date(startDate + 'T00:00:00'), "dd/MM/yyyy")} até {format(new Date(endDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                ) : startDate ? (
                  <>Mostrando programações a partir de {format(new Date(startDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                ) : (
                  <>Mostrando programações até {format(new Date(endDate + 'T00:00:00'), "dd/MM/yyyy")}</>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
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
                    {filteredProgramacoes.reduce((total, prog) => {
                      const itemsDaProg = checkoutItems.filter(item => item.programacao_id === prog.id);
                      return total + itemsDaProg.filter(item => item.critico).length;
                    }, 0)}
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

        {/* Lista de Programações */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-xl font-bold text-slate-900">
              Programações de Check-out
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="text-center py-8 text-slate-500">
                Carregando programações...
              </div>
            ) : filteredProgramacoes.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">Nenhuma programação encontrada</p>
                <Link to={createPageUrl("NovaProgramacaoCheckout")}>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Primeira Programação
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredProgramacoes.map((prog) => (
                  <Card key={prog.id} className="border-slate-200 hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <Link 
                          to={createPageUrl(`ExecutarCheckout?id=${prog.id}`)}
                          className="flex-1 cursor-pointer"
                        >
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <Calendar className="w-5 h-5 text-blue-600" />
                              <h3 className="text-lg font-bold text-slate-900">
                                {format(new Date(prog.data_programada + 'T00:00:00'), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                              </h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                              <div className="flex items-center gap-1">
                                <Package className="w-4 h-4" />
                                <span>{prog.total_pedidos} pedidos</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <CheckCircle className="w-4 h-4" />
                                <span>{prog.pedidos_concluidos} concluídos</span>
                              </div>
                            </div>
                            {prog.observacoes && (
                              <p className="text-sm text-slate-500 mt-2 italic">
                                "{prog.observacoes}"
                              </p>
                            )}
                          </div>
                        </Link>
                        <div className="flex items-center gap-3">
                          <Badge className={`${getStatusColor(prog.status)} flex items-center gap-1`}>
                            {getStatusIcon(prog.status)}
                            {prog.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteProgramacao(prog)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={deleteProgramacaoMutation.isPending}
                          >
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}