import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { diaLocal } from "@/lib/datas";

export default function ProductionChart({ records, isLoading }) {
  const getLast7DaysData = () => {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      // O rótulo da barra (toLocaleDateString, abaixo) é local. O dado tem de
      // ser do MESMO dia: com toISOString(), que é UTC, depois das 21h os dois
      // apontavam para dias diferentes e a produção caía na barra errada.
      const dateStr = diaLocal(date);

      const dayRecords = records.filter(r => r.data === dateStr);
      const total = dayRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0);
      
      last7Days.push({
        day: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
        producao: total
      });
    }
    return last7Days;
  };

  if (isLoading) {
    return (
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Produção dos Últimos 7 Dias</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  const data = getLast7DaysData();

  return (
    <Card className="border-slate-200">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-lg font-bold text-slate-900">
          Produção dos Últimos 7 Dias
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="day" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e2e8f0',
                borderRadius: '8px'
              }}
            />
            <Bar dataKey="producao" fill="#3b82f6" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}