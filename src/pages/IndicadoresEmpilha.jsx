import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart2, Clock, User, OctagonX, AlertTriangle, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import FiltroPeriodoEmpilha from "../components/empilhadeira/FiltroperiodoEmpilha";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

function minsFromHHMM(str) {
  if (!str) return 0;
  // Formato "X:MM" ou "X min"
  if (str.includes("min")) return parseInt(str) || 0;
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function EmptyState({ label }) {
  return (
    <div className="text-center py-10 text-slate-400">
      <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{label || "Sem dados no período selecionado"}</p>
    </div>
  );
}

export default function IndicadoresEmpilha() {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);

  const { data: programacoes } = useQuery({
    queryKey: ["empilha-programacoes"],
    queryFn: () => base44.entities.EmpilhaProgramacao.list("-data_programada"),
    initialData: [],
  });

  const { data: linhas } = useQuery({
    queryKey: ["empilha-linhas-all"],
    queryFn: () => base44.entities.EmpilhaLinha.list(),
    initialData: [],
  });

  const { data: paradas } = useQuery({
    queryKey: ["empilha-paradas"],
    queryFn: () => base44.entities.EmpilhadeiraParada.list("-data"),
    initialData: [],
  });

  const { data: ocorrencias } = useQuery({
    queryKey: ["empilha-ocorrencias"],
    queryFn: () => base44.entities.EmpilhaOcorrencia.list("-data"),
    initialData: [],
  });

  const { data: empilhadeiras } = useQuery({
    queryKey: ["empilhadeiras-config"],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    initialData: [],
  });

  const emPeriodo = (data) => data && data >= dataInicio && data <= dataFim;

  const progIds = useMemo(() =>
    programacoes.filter(p => emPeriodo(p.data_programada)).map(p => p.id),
    [programacoes, dataInicio, dataFim]
  );

  const linhasFiltradas = useMemo(() =>
    linhas.filter(l => progIds.includes(l.programacao_id)),
    [linhas, progIds]
  );

  const paradasFiltradas = useMemo(() =>
    paradas.filter(p => emPeriodo(p.data)),
    [paradas, dataInicio, dataFim]
  );

  const ocorrenciasFiltradas = useMemo(() =>
    ocorrencias.filter(o => emPeriodo(o.data)),
    [ocorrencias, dataInicio, dataFim]
  );

  const empilhadeiraAtiva = empilhadeiras.find(e => e.ativa);
  const duracaoTurnoMins = (empilhadeiraAtiva?.duracao_turno_horas || 8) * 60;

  // ---------- Bloco 1: Produção ----------
  const totalNormal = linhasFiltradas.filter(l => l.tipo_linha === "Normal" || !l.tipo_linha).length;
  const totalCritico = linhasFiltradas.filter(l => l.tipo_linha === "Crítico").length;
  const totalAvulso = linhasFiltradas.filter(l => l.tipo_linha === "Avulso").length;
  const totalConcluidas = linhasFiltradas.filter(l => l.status === "Concluído").length;
  const totalPendentes = linhasFiltradas.length - totalConcluidas;

  const temposMins = linhasFiltradas
    .filter(l => l.tempo_total && l.status === "Concluído")
    .map(l => minsFromHHMM(l.tempo_total));
  const tempoMedioGeral = temposMins.length > 0 ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0;

  const tempoMedioTipo = ["Normal", "Crítico", "Avulso"].map(tipo => {
    const ts = linhasFiltradas
      .filter(l => (l.tipo_linha === tipo || (!l.tipo_linha && tipo === "Normal")) && l.status === "Concluído" && l.tempo_total)
      .map(l => minsFromHHMM(l.tempo_total));
    return { tipo, media: ts.length > 0 ? Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) : 0, count: ts.length };
  });

  // Linhas por dia
  const dias = dataInicio && dataFim
    ? eachDayOfInterval({ start: parseISO(dataInicio), end: parseISO(dataFim) })
    : [];

  const linhasPorDia = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = programacoes.filter(p => p.data_programada === dia).map(p => p.id);
    const ls = linhas.filter(l => ps.includes(l.programacao_id));
    return {
      dia: format(d, "dd/MM", { locale: ptBR }),
      Normal: ls.filter(l => l.tipo_linha === "Normal" || !l.tipo_linha).length,
      Crítico: ls.filter(l => l.tipo_linha === "Crítico").length,
      Avulso: ls.filter(l => l.tipo_linha === "Avulso").length,
    };
  });

  // ---------- Bloco 2: Operadores ----------
  const rankingEmpilhador = {};
  const rankingAjudante = {};
  linhasFiltradas.filter(l => l.status === "Concluído").forEach(l => {
    if (l.operador_empilhadeira) {
      if (!rankingEmpilhador[l.operador_empilhadeira]) rankingEmpilhador[l.operador_empilhadeira] = { total: 0, mins: [] };
      rankingEmpilhador[l.operador_empilhadeira].total++;
      if (l.tempo_total) rankingEmpilhador[l.operador_empilhadeira].mins.push(minsFromHHMM(l.tempo_total));
    }
    if (l.operador_ajudante && l.operador_ajudante !== "nenhum") {
      if (!rankingAjudante[l.operador_ajudante]) rankingAjudante[l.operador_ajudante] = { total: 0, mins: [] };
      rankingAjudante[l.operador_ajudante].total++;
      if (l.tempo_total) rankingAjudante[l.operador_ajudante].mins.push(minsFromHHMM(l.tempo_total));
    }
  });
  const toRanking = (obj) => Object.entries(obj).map(([nome, d]) => ({
    nome,
    total: d.total,
    media: d.mins.length > 0 ? Math.round(d.mins.reduce((a, b) => a + b, 0) / d.mins.length) : 0,
  })).sort((a, b) => b.total - a.total);

  // ---------- Bloco 3: Paradas ----------
  const totalTempoParado = paradasFiltradas.reduce((acc, p) => acc + (parseInt(p.tempo_total) || 0), 0);
  const paradaPorTipo = Object.entries(
    paradasFiltradas.reduce((acc, p) => { acc[p.tipo] = (acc[p.tipo] || 0) + (parseInt(p.tempo_total) || 0); return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const paradasPorDia = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = paradasFiltradas.filter(p => p.data === dia);
    return { dia: format(d, "dd/MM", { locale: ptBR }), paradas: ps.length, tempo: ps.reduce((a, p) => a + (parseInt(p.tempo_total) || 0), 0) };
  });

  // ---------- Bloco 4: Ocorrências ----------
  const ocorrPorTipo = Object.entries(
    ocorrenciasFiltradas.reduce((acc, o) => { acc[o.tipo || "Outro"] = (acc[o.tipo || "Outro"] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const rankOcorrencias = Object.entries(
    ocorrenciasFiltradas.reduce((acc, o) => { if (o.registrado_por) { acc[o.registrado_por] = (acc[o.registrado_por] || 0) + 1; } return acc; }, {})
  ).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);

  // ---------- Bloco 5: OEE simplificado ----------
  const oeeDias = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = programacoes.filter(p => p.data_programada === dia).map(p => p.id);
    const ls = linhas.filter(l => ps.includes(l.programacao_id) && l.status === "Concluído" && l.tempo_total);
    const produtivo = ls.reduce((a, l) => a + minsFromHHMM(l.tempo_total), 0);
    const parado = paradasFiltradas.filter(p => p.data === dia).reduce((a, p) => a + (parseInt(p.tempo_total) || 0), 0);
    const aproveitamento = duracaoTurnoMins > 0 ? Math.min(100, Math.round((produtivo / duracaoTurnoMins) * 100)) : 0;
    return { dia: format(d, "dd/MM", { locale: ptBR }), aproveitamento, produtivo, parado };
  });
  const oeeMedio = oeeDias.length > 0 ? Math.round(oeeDias.reduce((a, d) => a + d.aproveitamento, 0) / oeeDias.length) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to={createPageUrl("Empilhadeira")}>
            <Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <BarChart2 className="w-8 h-8 text-amber-600" />
              Indicadores — Empilhadeira
            </h1>
          </div>
        </div>

        {/* Filtro período */}
        <FiltroPeriodoEmpilha dataInicio={dataInicio} dataFim={dataFim} onChange={(i, f) => { setDataInicio(i); setDataFim(f); }} />

        {/* Bloco 1 — Produção */}
        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-amber-600" /> Produção</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {linhasFiltradas.length === 0 ? <EmptyState /> : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 mb-1">Normal</p>
                    <p className="text-2xl font-bold text-slate-800">{totalNormal}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 mb-1">Crítico</p>
                    <p className="text-2xl font-bold text-red-700">{totalCritico}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 mb-1">Avulso</p>
                    <p className="text-2xl font-bold text-amber-700">{totalAvulso}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 mb-1">Concluídas</p>
                    <p className="text-2xl font-bold text-green-700">{totalConcluidas}/{linhasFiltradas.length}</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-1">Tempo médio por linha</p>
                    <p className="text-3xl font-bold text-amber-600">{tempoMedioGeral} min</p>
                    <div className="mt-2 space-y-1">
                      {tempoMedioTipo.map(t => (
                        <div key={t.tipo} className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="w-16">{t.tipo}:</span>
                          <span className="font-semibold">{t.media} min</span>
                          <span className="text-slate-400">({t.count} linhas)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Linhas por dia</p>
                    {linhasPorDia.length > 1 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={linhasPorDia}>
                          <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="Normal" stackId="a" fill="#64748b" />
                          <Bar dataKey="Crítico" stackId="a" fill="#ef4444" />
                          <Bar dataKey="Avulso" stackId="a" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-slate-400 text-sm">Selecione um período maior para ver o gráfico</p>}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Bloco 2 — Operadores */}
        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-blue-600" /> Operadores</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {linhasFiltradas.length === 0 ? <EmptyState /> : (
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-3">Empilhadores</p>
                  {toRanking(rankingEmpilhador).length === 0 ? <p className="text-slate-400 text-sm">Sem dados</p> :
                    toRanking(rankingEmpilhador).map((op, i) => (
                      <div key={op.nome} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                        <span className="text-slate-400 text-sm w-5">{i + 1}.</span>
                        <span className="font-medium text-slate-800 flex-1">{op.nome}</span>
                        <Badge className="bg-slate-100 text-slate-700">{op.total} linhas</Badge>
                        <span className="text-xs text-slate-500">{op.media} min/linha</span>
                      </div>
                    ))
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-3">Ajudantes</p>
                  {toRanking(rankingAjudante).length === 0 ? <p className="text-slate-400 text-sm">Sem dados</p> :
                    toRanking(rankingAjudante).map((op, i) => (
                      <div key={op.nome} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                        <span className="text-slate-400 text-sm w-5">{i + 1}.</span>
                        <span className="font-medium text-slate-800 flex-1">{op.nome}</span>
                        <Badge className="bg-slate-100 text-slate-700">{op.total} linhas</Badge>
                        <span className="text-xs text-slate-500">{op.media} min/linha</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bloco 3 — Paradas */}
        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2"><OctagonX className="w-5 h-5 text-orange-600" /> Paradas</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {paradasFiltradas.length === 0 ? <EmptyState label="Nenhuma parada registrada no período" /> : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-orange-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500">Total paradas</p>
                    <p className="text-2xl font-bold text-orange-700">{paradasFiltradas.length}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500">Tempo parado</p>
                    <p className="text-2xl font-bold text-red-700">{totalTempoParado} min</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500">% turno perdido</p>
                    <p className="text-2xl font-bold text-slate-700">{duracaoTurnoMins > 0 ? Math.round((totalTempoParado / duracaoTurnoMins) * 100) : 0}%</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Tempo parado por tipo (min)</p>
                    {paradaPorTipo.length > 0 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={paradaPorTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, value }) => `${name}: ${value}min`}>
                            {paradaPorTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600 mb-2">Paradas por dia</p>
                    {paradasPorDia.length > 1 ? (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={paradasPorDia}>
                          <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="paradas" fill="#f97316" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-slate-400 text-sm">Selecione um período maior para ver o gráfico</p>}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Bloco 4 — Ocorrências */}
        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" /> Ocorrências</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {ocorrenciasFiltradas.length === 0 ? <EmptyState label="Nenhuma ocorrência no período" /> : (
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500">Total</p>
                      <p className="text-xl font-bold text-orange-700">{ocorrenciasFiltradas.length}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-500">Resolvidas</p>
                      <p className="text-xl font-bold text-green-700">{ocorrenciasFiltradas.filter(o => o.resolvido).length}</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-slate-600 mb-2">Quem mais registrou</p>
                  {rankOcorrencias.slice(0, 5).map((op, i) => (
                    <div key={op.nome} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0 text-sm">
                      <span className="text-slate-400 w-5">{i + 1}.</span>
                      <span className="flex-1 text-slate-800">{op.nome}</span>
                      <Badge className="bg-slate-100 text-slate-600">{op.total}</Badge>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600 mb-2">Por tipo</p>
                  {ocorrPorTipo.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={ocorrPorTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, value }) => `${name}: ${value}`}>
                          {ocorrPorTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bloco 5 — OEE Simplificado */}
        <Card className="border-slate-200 shadow-md">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" /> OEE Simplificado
              <Badge className="ml-2 bg-blue-100 text-blue-800">Turno: {empilhadeiraAtiva?.duracao_turno_horas || 8}h</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {oeeDias.every(d => d.aproveitamento === 0) ? <EmptyState label="Sem dados de tempo concluído no período" /> : (
              <>
                <div className="bg-blue-50 rounded-lg p-4 text-center inline-block">
                  <p className="text-xs text-slate-500 mb-1">Aproveitamento médio do período</p>
                  <p className="text-4xl font-black text-blue-700">{oeeMedio}%</p>
                </div>
                {oeeDias.length > 1 && (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={oeeDias}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip formatter={(v) => `${v}%`} />
                      <Line type="monotone" dataKey="aproveitamento" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="Aproveitamento %" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}