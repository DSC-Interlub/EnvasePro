import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";
import { Package, ClipboardCheck, Clock, AlertTriangle, Users } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  PageHeader, SectionCard, ChipsFiltro, EmptyState, MiniKPI,
  CORES_GRAFICO, EIXO, GRADE, TOOLTIP, LEGENDA, RAIO_BARRA,
} from "@/components/fluxo";
import IndicadoresChecklist from "@/components/checklist/IndicadoresChecklist";

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
  const cores = CORES_GRAFICO();
  const eixo = EIXO();
  const grade = GRADE();
  const tooltip = TOOLTIP();
  const legendaGrafico = LEGENDA();

  // As abas Recebimento/Checklist viraram chips, como no padrão Lista. Eram
  // `<TabsTrigger>` sem contagem: não dava para saber se havia checklist no
  // período sem trocar de aba.
  const [aba, setAba] = useState("recebimento");

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-[1200px] flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Recebimento" }, { rotulo: "Indicadores" }]}
          titulo="Indicadores de recebimento"
          legenda="Volume, tempo, ocorrências e equipe"
          acoes={
            <div className="flex flex-wrap items-center gap-2">
              {[["hoje", "Hoje"], ["semana", "Semana"], ["mes", "Mês"]].map(([k, l]) => (
                <Button key={k} size="lg" variant="outline" onClick={() => setFiltro(k)}>{l}</Button>
              ))}
              <Input
                type="date" aria-label="Data inicial" value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)} className="w-40"
              />
              <span className="text-sm font-bold text-texto-apagado">até</span>
              <Input
                type="date" aria-label="Data final" value={dataFim}
                onChange={(e) => setDataFim(e.target.value)} className="w-40"
              />
            </div>
          }
        />

        <ChipsFiltro
          rotulo="Escolher indicadores"
          opcoes={[
            { valor: "recebimento", rotulo: "Recebimento", contagem: filtrados.length },
            { valor: "checklist", rotulo: "Checklist", contagem: checklistsFiltrados.length },
          ]}
          valor={aba}
          aoEscolher={setAba}
        />

        {aba === "checklist" ? (
          <IndicadoresChecklist checklists={checklistsFiltrados} />
        ) : (
          <>
            {/* ── VOLUME ───────────────────────────────────────────────── */}
            <SectionCard titulo="Volume" legenda="Recebimentos no período" icone={Package} atraso={0.05}>
              {filtrados.length === 0 ? (
                <EmptyState icone={Package} titulo="Nenhum recebimento no período" />
              ) : (
                <div className="flex min-w-0 flex-col gap-5">
                  <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4">
                    <MiniKPI rotulo="Total" valor={filtrados.length} />
                    <MiniKPI rotulo="Concluídos" tom="ok"
                      valor={filtrados.filter((r) => r.status === "Concluído").length} />
                    <MiniKPI rotulo="Em andamento" tom="marca"
                      valor={filtrados.filter((r) => r.status === "Em andamento").length} />
                    <MiniKPI rotulo="Cancelados" tom="erro"
                      valor={filtrados.filter((r) => r.status === "Cancelado").length} />
                  </div>

                  <div className="grid min-w-0 gap-5 md:grid-cols-2">
                    <div className="min-w-0">
                      <p className="mb-2 text-[13px] font-bold text-texto-fraco">Por tipo</p>
                      <div style={{ height: 190 }} className="min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={porTipo} dataKey="value" nameKey="name"
                              cx="50%" cy="50%" outerRadius={64} paddingAngle={2}
                            >
                              {porTipo.map((_, i) => <Cell key={i} fill={cores[i % cores.length]} />)}
                            </Pie>
                            <Tooltip {...tooltip} />
                            <Legend {...legendaGrafico} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-2 text-[13px] font-bold text-texto-fraco">Recebimentos por dia</p>
                      <div style={{ height: 190 }} className="min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={porDia} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                            <CartesianGrid {...grade} />
                            <XAxis dataKey="dia" {...eixo} />
                            <YAxis {...eixo} />
                            <Tooltip {...tooltip} />
                            <Bar dataKey="total" fill={cores[0]} radius={RAIO_BARRA} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ── TEMPO ────────────────────────────────────────────────── */}
            <SectionCard titulo="Tempo" legenda="Produtivo e pausado" icone={Clock} atraso={0.1}>
              <div className="flex min-w-0 flex-col gap-5">
                <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4">
                  <MiniKPI rotulo="Tempo médio geral" valor={minToHM(tempoMedioGeral)} />
                  <MiniKPI rotulo="Total produtivo" valor={minToHM(tempoTotalProdutivo)} tom="ok" />
                  <MiniKPI rotulo="Total pausado" valor={minToHM(tempoPausadoTotal)} tom="atencao" />
                  <MiniKPI rotulo="Baseado em" valor={`${concluidos.length} concluídos`} />
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-[13px] font-bold text-texto-fraco">Tempo médio por tipo</p>
                  <div style={{ height: 170 }} className="min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tempoMedioPorTipo} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                        <CartesianGrid {...grade} />
                        <XAxis dataKey="tipo" {...eixo} />
                        <YAxis {...eixo} />
                        <Tooltip {...tooltip} formatter={(v) => [minToHM(v), "Média"]} />
                        <Bar dataKey="media" fill={cores[4]} radius={RAIO_BARRA} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-painel bg-atencao-suave px-5 py-4">
                  <p className="text-[13px] font-bold text-atencao">
                    Tempo improdutivo (pausas) no período
                  </p>
                  <p className="num text-[38px] font-extrabold leading-none text-atencao">
                    {minToHM(tempoPausadoTotal)}
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* ── OCORRÊNCIAS ──────────────────────────────────────────── */}
            <SectionCard titulo="Ocorrências" legenda="Abertas e resolvidas" icone={AlertTriangle} atraso={0.15}>
              <div className="flex min-w-0 flex-col gap-4">
                <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-3">
                  <MiniKPI rotulo="Total" valor={ocFiltradas.length} />
                  <MiniKPI rotulo="Abertas" tom="erro"
                    valor={ocFiltradas.filter((o) => !o.resolvido).length} />
                  <MiniKPI rotulo="Resolvidas" tom="ok"
                    valor={ocFiltradas.filter((o) => o.resolvido).length} />
                </div>

                {ocPorTipo.length === 0 ? (
                  <p className="text-sm font-semibold text-texto-apagado">
                    Sem ocorrências no período
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2.5">
                    {ocPorTipo.map((o) => (
                      <li key={o.name} className="min-w-[120px] rounded-token bg-erro-suave px-4 py-3">
                        <p className="text-xs font-bold text-erro">{o.name}</p>
                        <p className="num text-2xl font-extrabold text-erro">{o.value}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </SectionCard>

            {/* ── EQUIPE ───────────────────────────────────────────────── */}
            <SectionCard titulo="Equipe" legenda="Participações por operador" icone={Users} atraso={0.2}>
              {rankingOp.length === 0 ? (
                <EmptyState icone={Users} titulo="Sem participações no período" />
              ) : (
                <div style={{ height: 220 }} className="min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rankingOp} layout="vertical"
                      margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                    >
                      <CartesianGrid {...grade} horizontal={false} vertical />
                      <XAxis type="number" {...eixo} />
                      <YAxis dataKey="nome" type="category" width={130} {...eixo} />
                      <Tooltip {...tooltip} />
                      <Bar dataKey="total" fill={cores[1]} radius={[0, 10, 10, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}
