import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Package } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecentRecords({ records, isLoading }) {
  if (isLoading) {
    return (
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-bold text-slate-900">Registros Recentes</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 h-full">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-lg font-bold text-slate-900">Registros Recentes</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {records.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum registro ainda</p>
            </div>
          ) : (
            records.map((record) => (
              <div 
                key={record.id}
                className="p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{record.descricao_produto}</p>
                    <p className="text-sm text-slate-500">OP: {record.op}</p>
                  </div>
                  <Badge variant={record.sala === "Bio" ? "default" : "secondary"}>
                    {record.sala}
                  </Badge>
                </div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(record.data), "dd/MM/yyyy")}
                  </div>
                  <span className="font-medium">{record.quantidade_produzida} un.</span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}