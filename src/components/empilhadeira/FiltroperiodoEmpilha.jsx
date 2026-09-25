import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

export default function FiltroPeriodoEmpilha({ dataInicio, dataFim, onChange }) {
  const hoje = format(new Date(), "yyyy-MM-dd");

  const setHoje = () => onChange(hoje, hoje);
  const setSemana = () => {
    const ini = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const fim = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
    onChange(ini, fim);
  };
  const setMes = () => {
    const ini = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const fim = format(endOfMonth(new Date()), "yyyy-MM-dd");
    onChange(ini, fim);
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <Calendar className="w-4 h-4 text-slate-500" />
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium whitespace-nowrap">De:</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={e => onChange(e.target.value, dataFim)}
              className="bg-white w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium whitespace-nowrap">Até:</Label>
            <Input
              type="date"
              value={dataFim}
              onChange={e => onChange(dataInicio, e.target.value)}
              className="bg-white w-40"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={setHoje}
              className={dataInicio === hoje && dataFim === hoje ? "bg-amber-100 border-amber-400 text-amber-700" : ""}>
              Hoje
            </Button>
            <Button size="sm" variant="outline" onClick={setSemana}>Esta semana</Button>
            <Button size="sm" variant="outline" onClick={setMes}>Este mês</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}