import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Truck, AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";

const hoje = () => format(new Date(), "yyyy-MM-dd");

export default function BlocoRecebimento({ isAdmin }) {
  const { data: recebimentos = [] } = useQuery({
    queryKey: ["recebimentos"],
    queryFn: () => base44.entities.Recebimento.list("-created_date"),
    initialData: [],
  });
  const { data: ocorrencias = [] } = useQuery({
    queryKey: ["recebimento-ocorrencias-all"],
    queryFn: () => base44.entities.RecebimentoOcorrencia.list(),
    initialData: [],
  });

  const hojeStr = hoje();
  const hoje_rec = recebimentos.filter(r => r.data_chegada === hojeStr || r.data_prevista === hojeStr);
  const emAndamento = recebimentos.filter(r => r.status === "Em andamento");
  const concluidosHoje = hoje_rec.filter(r => r.status === "Concluído");
  const comOcorrencia = recebimentos.filter(r => ocorrencias.some(o => o.recebimento_id === r.id && !o.resolvido));

  return (
    <Card className="border-slate-200 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Truck className="w-5 h-5 text-blue-600" />
            Recebimentos
          </CardTitle>
          <Link to="/Recebimento">
            <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Hoje", value: hoje_rec.length, cls: "text-slate-700" },
            { label: "Em andamento", value: emAndamento.length, cls: "text-blue-700" },
            { label: "Concluídos hoje", value: concluidosHoje.length, cls: "text-green-700" },
            { label: "Com ocorrência", value: comOcorrencia.length, cls: "text-red-700" },
          ].map(k => (
            <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {emAndamento.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {emAndamento.map(r => (
              <Link key={r.id} to={`/ExecutarRecebimento?id=${r.id}`}>
                <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm hover:bg-blue-100 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                    <span className="font-medium text-blue-900">{r.numero_documento}</span>
                    <Badge className="text-xs bg-blue-100 text-blue-700">{r.tipo}</Badge>
                  </div>
                  <span className="text-xs text-blue-600">{r.fornecedor_nome || "—"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {comOcorrencia.length > 0 && (
          <div className="mt-2 flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {comOcorrencia.length} recebimento{comOcorrencia.length > 1 ? "s" : ""} com ocorrências abertas
          </div>
        )}
      </CardContent>
    </Card>
  );
}