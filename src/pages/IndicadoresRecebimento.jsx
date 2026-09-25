import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { BarChart2, Package, ClipboardCheck } from "lucide-react";
import { format, startOfWeek, endOfWeek, differenceInMinutes, parseISO } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import IndicadoresChecklist from "@/components/checklist/IndicadoresChecklist";
import { ptBR } from "date-fns/locale";

const TIPO_COLORS = { "Importação": "#7c3aed", "Nacional": "#2563eb", "Devolução": "#ea580c", "Material auxiliar": "#0d9488", "Outro": "#64748b" };
const PIE_COLORS = ["#7c3aed", "#2563eb", "#ea580c", "#0d9488", "#64748b"];

const hoje = () => format(new Date(), "yyyy-MM-dd");

function minToHM(min) {
  if (!min && min !== 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function IndicadoresRecebimento() {
  const d = new Date();
  const [dataInicio, setDataInicio] = useState(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd"));

  const { data: recebimentos = [] } = useQuery({ queryKey: ["recebimentos"], queryFn: () => base44.entities.Recebimento.list() });
  const { data: ocorrencias = [] } = useQuery({ queryKey: ["recebimento-ocorrencias-all"], queryFn: () => base44.entities.RecebimentoOcorrencia.list() });
  const { data: participantes = [] } = useQuery({ queryKey: ["recebimento-participantes-all"], queryFn: () => base44.entities.RecebimentoParticipante.list() });
  const { data: checklists = [] } = useQuery({ queryKey: ["checklists"], queryFn: () => base44.entities.ChecklistRecebimento.list("-data_entrega", 500) });

  const setFiltro = (tipo) => {
    const d = new Date();
    if (tipo === "hoje") { setDataInicio(hoje()); setDataFim(hoje()); }
    else if (tipo === "semana") { setDataInicio(format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")); setDataFim(format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")); }
    else { setDataInicio(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd")); setDataFim(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd")); }
  };

  const filtrados = recebimentos.filter(r => {
    const data = r.data_chegada || r.data_prevista || "";
    return data >= dataInicio && data <= dataFim;
  });

  const concluidos = filtrados.filter(r => r.status === "Concluído" && r.tempo_produtivo_minutos != null);

  // Volume por tipo
  const porTipo = Object.entries(filtrados.reduce((acc, r) => {
    acc[r.tipo] = (acc[r.tipo] || 0) + 1; return acc;
  }, {})).map(([name, value]) => ({ name, value }));

  // Volume por status
  const porStatus = Object.entries(filtrados.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1; return acc;
  }, {})).map(([name, value]) => ({ name, value }));

  // Por dia
  const porDia = Object.entries(filtrados.reduce((acc, r) => {
    const d = r.data_chegada || r.data_prevista || ""; if (!d) return acc;
    acc[d] = (acc[d] || 0) + 1; return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({
    dia: format(new Date(date + "T00:00:00"), "dd/MM", { locale: ptBR }), total
  }));

  // Tempo médio
  const tempoMedioGeral = concluidos.length > 0
    ? Math.round(concluidos.reduce((s, r) => s + r.tempo_produtivo_minutos, 0) / concluidos.length) : 0;
  const tempoPausadoTotal = filtrados.reduce((s, r) => s + (r.tempo_pausado_minutos || 0), 0);
  const tempoTotalProdutivo = filtrados.reduce((s, r) => s + (r.tempo_produtivo_minutos || 0), 0);

  const tempoMedioPorTipo = ["Importação", "Devolução", "Material auxiliar", "Outro"].map(tipo => {
    const deste = concluidos.filter(r => r.tipo === tipo);
    return { tipo, media: deste.length > 0 ? Math.round(deste.reduce((s, r) => s + r.tempo_produtivo_minutos, 0) / deste.length) : 0, total: deste.length };
  });

  // Ranking operadores
  const rankingOp = Object.entries(
    participantes.filter(p => filtrados.some(r => r.id === p.recebimento_id)).reduce((acc, p) => {
      acc[p.operator_nome] = (acc[p.operator_nome] || 0) + 1; return acc;
    }, {})
  ).sort(([, a], [, b]) => b - a).slice(0, 8).map(([nome, total]) => ({ nome, total }));

  // Ocorrências por tipo
  const ocFiltradas = ocorrencias.filter(o => filtrados.some(r => r.id === o.recebimento_id));
  const ocPorTipo = Object.entries(ocFiltradas.reduce((acc, o) => {
    acc[o.tipo] = (acc[o.tipo] || 0) + 1; return acc;
  }, {})).map(([name, value]) => ({ name, value }));

  const checklistsFiltrados = checklists.filter(c => {
    const d = c.data_entrega || "";
    return d >= dataInicio && d <= dataFim;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-blue-600" /> Indicadores de Recebimento
        </h1>
        <div className="flex flex-wrap gap-2 items-center">
          {[["hoje", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"]].map(([k, l]) => (
            <Button key={k} size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setFiltro(k)}>{l}</Button>
          ))}
          <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-7 text-xs w-36" />
          <span className="text-slate-400 text-xs">até</span>
          <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-7 text-xs w-36" />
        </div>
      </div>

      <Tabs defaultValue="recebimento">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="recebimento" className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Recebimento
          </TabsTrigger>
          <TabsTrigger value="checklist" className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> Checklist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-4">
          <IndicadoresChecklist checklists={checklistsFiltrados} />
        </TabsContent>

        <TabsContent value="recebimento" className="mt-4 space-y-6">

      {/* Bloco 1 — Volume */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4 text-blue-600" />Volume</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total", value: filtrados.length, cls: "text-slate-700" },
              { label: "Concluídos", value: filtrados.filter(r => r.status === "Concluído").length, cls: "text-green-700" },
              { label: "Em andamento", value: filtrados.filter(r => r.status === "Em andamento").length, cls: "text-blue-700" },
              { label: "Cancelados", value: filtrados.filter(r => r.status === "Cancelado").length, cls: "text-red-700" },
            ].map(k => (
              <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Por tipo</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={porTipo} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {porTipo.map((entry, i) => <Cell key={i} fill={TIPO_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Recebimentos por dia</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={porDia}>
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bloco 2 — Tempo */}
      <Card>
        <CardHeader><CardTitle className="text-base">⏱ Tempo</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Tempo médio geral", value: minToHM(tempoMedioGeral) },
              { label: "Tempo total produtivo", value: minToHM(tempoTotalProdutivo) },
              { label: "Tempo total pausado", value: minToHM(tempoPausadoTotal) },
              { label: "Baseado em", value: `${concluidos.length} concluídos` },
            ].map(k => (
              <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className="text-lg font-bold text-slate-700">{k.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Tempo médio por tipo (minutos)</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={tempoMedioPorTipo}>
                <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => minToHM(v)} />
                <Bar dataKey="media" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-center">
            <p className="text-xs text-orange-600">Tempo improdutivo (pausas) no período</p>
            <p className="text-3xl font-bold text-orange-700">{minToHM(tempoPausadoTotal)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Bloco 3 — Ocorrências */}
      <Card>
        <CardHeader><CardTitle className="text-base">⚠️ Ocorrências</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Total", value: ocFiltradas.length, cls: "text-slate-700" },
              { label: "Abertas", value: ocFiltradas.filter(o => !o.resolvido).length, cls: "text-red-700" },
              { label: "Resolvidas", value: ocFiltradas.filter(o => o.resolvido).length, cls: "text-green-700" },
            ].map(k => (
              <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {ocPorTipo.map(o => (
              <div key={o.name} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-center">
                <p className="text-red-600 font-medium">{o.name}</p>
                <p className="text-xl font-bold text-red-700">{o.value}</p>
              </div>
            ))}
            {ocPorTipo.length === 0 && <p className="text-xs text-slate-400">Sem ocorrências no período</p>}
          </div>
        </CardContent>
      </Card>

      {/* Bloco 4 — Equipe */}
      <Card>
        <CardHeader><CardTitle className="text-base">👥 Equipe</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs font-semibold text-slate-500 mb-2">Participações por operador</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rankingOp} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="nome" type="category" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="total" fill="#0d9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}