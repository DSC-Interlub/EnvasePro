import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function CheckoutAnalysisGrid({ items, programacoes, isLoading }) {
  // Operador - Tempo médio
  const getOperadorTempoMedio = () => {
    const groups = {};
    items.filter(i => i.operador && i.tempo_total).forEach(item => {
      if (!groups[item.operador]) {
        groups[item.operador] = { total: 0, count: 0 };
      }
      const [hours, mins] = item.tempo_total.split(':').map(Number);
      const totalMins = (hours || 0) * 60 + (mins || 0);
      groups[item.operador].total += totalMins;
      groups[item.operador].count += 1;
    });

    return Object.entries(groups).map(([operador, data]) => ({
      operador,
      media: (data.total / data.count).toFixed(1)
    })).sort((a, b) => parseFloat(a.media) - parseFloat(b.media));
  };

  // Pedidos críticos
  const getPedidosCriticos = () => {
    return items
      .filter(i => i.critico)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 10);
  };

  // Pedidos atrasados
  const getPedidosAtrasados = () => {
    return items
      .filter(i => i.finalizado_fora_do_prazo)
      .sort((a, b) => new Date(b.data_finalizacao_real) - new Date(a.data_finalizacao_real))
      .slice(0, 10);
  };

  // Operador - Quantidade de pedidos
  const getOperadorQuantidade = () => {
    const groups = {};
    items.filter(i => i.operador).forEach(item => {
      if (!groups[item.operador]) groups[item.operador] = 0;
      groups[item.operador] += 1;
    });

    return Object.entries(groups).map(([operador, quantidade]) => ({
      operador,
      quantidade
    })).sort((a, b) => b.quantidade - a.quantidade);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900">Análises de Check-out</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-slate-200">
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const operadorTempo = getOperadorTempoMedio();
  const pedidosCriticos = getPedidosCriticos();
  const pedidosAtrasados = getPedidosAtrasados();
  const operadorQuantidade = getOperadorQuantidade();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Análises de Check-out</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operador - Tempo Médio */}
        <Card className="border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-lg font-bold text-slate-900">
              Operador - Tempo Médio por Pedido (minutos)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={operadorTempo}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="operador" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="media" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Operador - Quantidade de Pedidos */}
        <Card className="border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-lg font-bold text-slate-900">
              Operador - Quantidade de Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={operadorQuantidade}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="operador" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="quantidade" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pedidos Críticos */}
        <Card className="border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Pedidos Críticos ({pedidosCriticos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="max-h-64 overflow-y-auto">
              {pedidosCriticos.length === 0 ? (
                <p className="text-slate-500 text-center py-4">Nenhum pedido crítico</p>
              ) : (
                <div className="space-y-2">
                  {pedidosCriticos.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{item.numero_pedido}</p>
                        <p className="text-sm text-slate-600">{item.cliente}</p>
                      </div>
                      {item.data_saida && (
                        <Badge variant="outline" className="text-xs">
                          Saída: {format(new Date(item.data_saida), "dd/MM")}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pedidos Finalizados com Atraso */}
        <Card className="border-slate-200">
          <CardHeader className="bg-slate-50 border-b border-slate-200">
            <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-500" />
              Finalizados com Atraso ({pedidosAtrasados.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="max-h-64 overflow-y-auto">
              {pedidosAtrasados.length === 0 ? (
                <p className="text-slate-500 text-center py-4">Nenhum pedido com atraso</p>
              ) : (
                <div className="space-y-2">
                  {pedidosAtrasados.map((item) => {
                    const programacao = programacoes.find(p => p.id === item.programacao_id);
                    return (
                      <div key={item.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{item.numero_pedido}</p>
                            <p className="text-sm text-slate-600">{item.cliente}</p>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                          {programacao && (
                            <p>Programado: {format(new Date(programacao.data_programada), "dd/MM/yyyy")}</p>
                          )}
                          {item.data_finalizacao_real && (
                            <p>Finalizado: {format(new Date(item.data_finalizacao_real), "dd/MM/yyyy")}</p>
                          )}
                          {item.motivo_atraso && (
                            <p className="text-red-600 font-medium mt-1">Motivo: {item.motivo_atraso}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}