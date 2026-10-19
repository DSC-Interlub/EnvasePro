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

  // Os indicadores vêm prontos do banco — public.indicadores_recebimento
  // (Etapa 2). Antes a página baixava TODO o histórico de recebimentos,
  // ocorrências e participantes, e cruzava os três no navegador.
  const { data: ind } = useQuery({
    queryKey: ["indicadores-recebimento", dataInicio, dataFim],
    queryFn: () => base44.functions.indicadoresRecebimento(dataInicio, dataFim),
  });
  // O checklist fica no navegador (as faixas moram em src/lib/checklist.js),
  // buscando só o período em vez dos 500 mais recentes.
  const { data: checklistsFiltrados = [] } = useQuery({
    queryKey: ["checklists-periodo", dataInicio, dataFim],
    queryFn: () => base44.functions.checklistsDoPeriodo(dataInicio, dataFim),
  });

  const setFiltro = (tipo) => {
    const d = new Date();
    if (tipo === "hoje") { setDataInicio(hoje()); setDataFim(hoje()); }
    else if (tipo === "semana") { setDataInicio(format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")); setDataFim(format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd")); }
    else { setDataInicio(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd")); setDataFim(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd")); }
  };

  const I = ind ?? {
    total: 0, concluidos: 0, em_andamento: 0, cancelados: 0, por_tipo: [], por_dia: [],
    tempo: { medio: 0, produtivo_total: 0, pausado_total: 0, base: 0, por_tipo: [] },
    ocorrencias: { total: 0, abertas: 0, resolvidas: 0, por_tipo: [] }, equipe: [],
  };
  const porTipo = I.por_tipo;
  const porDia = I.por_dia.map((d) => ({
    dia: format(new Date(d.dia + "T00:00:00"), "dd/MM", { locale: ptBR }), total: d.total,
  }));
  const tempoMedioGeral = I.tempo.medio;
  const tempoTotalProdutivo = Number(I.tempo.produtivo_total);
  const tempoPausadoTotal = Number(I.tempo.pausado_total);
  // Correção da migration: "Nacional" entra (a lista antiga o omitia).
  const tempoMedioPorTipo = I.tempo.por_tipo;
  const rankingOp = I.equipe;
  const ocPorTipo = I.ocorrencias.por_tipo;

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
            { valor: "recebimento", rotulo: "Recebimento", contagem: I.total },
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
              {I.total === 0 ? (
                <EmptyState icone={Package} titulo="Nenhum recebimento no período" />
              ) : (
                <div className="flex min-w-0 flex-col gap-5">
                  <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-4">
                    <MiniKPI rotulo="Total" valor={I.total} />
                    <MiniKPI rotulo="Concluídos" tom="ok"
                      valor={I.concluidos} />
                    <MiniKPI rotulo="Em andamento" tom="marca"
                      valor={I.em_andamento} />
                    <MiniKPI rotulo="Cancelados" tom="erro"
                      valor={I.cancelados} />
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
                  <MiniKPI rotulo="Baseado em" valor={`${I.tempo.base} concluídos`} />
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
                  <MiniKPI rotulo="Total" valor={I.ocorrencias.total} />
                  <MiniKPI rotulo="Abertas" tom="erro"
                    valor={I.ocorrencias.abertas} />
                  <MiniKPI rotulo="Resolvidas" tom="ok"
                    valor={I.ocorrencias.resolvidas} />
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
