import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Factory, Package, TrendingUp, Clock, Users, Box } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function StatsGrid({ 
  records, 
  todayRecords, 
  totalProduction, 
  todayProduction,
  productsCount,
  operatorsCount,
  isLoading 
}) {
  const totalBio = records.filter(r => r.sala === "Bio").reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0);
  const totalIndustrial = records.filter(r => r.sala === "Industrial").reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0);

  const stats = [
    {
      title: "Produção Total",
      value: totalProduction.toLocaleString('pt-BR'),
      icon: TrendingUp,
      color: "bg-green-500",
      trend: `${records.length} registros`
    },
    {
      title: "Produção Bio",
      value: totalBio.toLocaleString('pt-BR'),
      icon: Factory,
      color: "bg-emerald-500",
      trend: `${records.filter(r => r.sala === "Bio").length} registros`
    },
    {
      title: "Produção Industrial",
      value: totalIndustrial.toLocaleString('pt-BR'),
      icon: Factory,
      color: "bg-blue-500",
      trend: `${records.filter(r => r.sala === "Industrial").length} registros`
    },
    {
      title: "Produtos Cadastrados",
      value: productsCount,
      icon: Package,
      color: "bg-purple-500",
      trend: "ativos"
    },
    {
      title: "Operadores Ativos",
      value: operatorsCount,
      icon: Users,
      color: "bg-orange-500",
      trend: "cadastrados"
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