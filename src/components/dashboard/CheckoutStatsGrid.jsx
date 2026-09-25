import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutStatsGrid({ items, programacoes, isLoading }) {
  const concluidos = items.filter(i => i.status === "Concluído");
  const criticos = items.filter(i => i.critico);
  const atrasados = items.filter(i => i.finalizado_fora_do_prazo);
  const emAndamento = items.filter(i => i.status === "Em Andamento");

  const stats = [
    {
      title: "Total de Pedidos",
      value: items.length,
      icon: Package,
      color: "bg-blue-500",
      trend: `${programacoes.length} programações`
    },
    {
      title: "Pedidos Concluídos",
      value: concluidos.length,
      icon: CheckCircle,
      color: "bg-green-500",
      trend: `${((concluidos.length / items.length) * 100 || 0).toFixed(0)}% do total`
    },
    {
      title: "Pedidos Críticos",
      value: criticos.length,
      icon: AlertTriangle,
      color: "bg-orange-500",
      trend: "necessitam atenção"
    },
    {
      title: "Finalizados com Atraso",
      value: atrasados.length,
      icon: Clock,
      color: "bg-red-500",
      trend: "fora do prazo"
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="p-6">
              <Skeleton className="h-20 w-full" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card 
          key={index}
          className="relative overflow-hidden hover:shadow-lg transition-shadow duration-300 border-slate-200"
        >
          <div className={`absolute top-0 right-0 w-32 h-32 transform translate-x-8 -translate-y-8 ${stat.color} rounded-full opacity-10`} />
          <CardHeader className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                <CardTitle className="text-3xl font-bold mt-2 text-slate-900">
                  {stat.value}
                </CardTitle>
                <p className="text-xs text-slate-400 mt-2">{stat.trend}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color} bg-opacity-20`}>
                <stat.icon className={`w-6 h-6 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}