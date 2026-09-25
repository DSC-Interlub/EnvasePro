import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, CheckCircle, Clock, AlertCircle, AlertTriangle, Warehouse, ListTodo, Wrench,
  BarChart2, OctagonX, ShieldAlert, CheckCheck, Settings, TrendingUp, User
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { format, differenceInDays, parseISO, addDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/lib/AuthContext";
import FiltroPeriodoEmpilha from "../components/empilhadeira/FiltroperiodoEmpilha";
import PainelPendenciasAdmin from "../components/empilhadeira/PainelPendenciasAdmin";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

function minsFromHHMM(str) {
  if (!str) return 0;
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

export default function Empilhadeira() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const acessoRestrito = new URLSearchParams(location.search).get("acesso") === "restrito";
  const queryClient = useQueryClient();

  const hoje = format(new Date(), "yyyy-MM-dd");
  const [dataInicio, setDataInicio] = useState(hoje);
  const [dataFim, setDataFim] = useState(hoje);
  const [abaAtiva, setAbaAtiva] = useState("operacoes");

  // Config state
  const [showManutencaoModal, setShowManutencaoModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [manutencaoForm, setManutencaoForm] = useState({ tipo: "Preventiva", descricao: "", responsavel: "", data_manutencao: format(new Date(), "yyyy-MM-dd") });
  const [configForm, setConfigForm] = useState(null);

  const handlePeriodo = (ini, fim) => { setDataInicio(ini); setDataFim(fim); };

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

  const { data: paradas } = useQuery({
    queryKey: ["empilha-paradas"],
    queryFn: () => base44.entities.EmpilhadeiraParada.list("-data"),
    initialData: [],
    refetchInterval: 30000,
  });

  const { data: manutencoes } = useQuery({
    queryKey: ["empilhadeira-manutencoes"],
    queryFn: () => base44.entities.EmpilhadeiraManutencao.list("-data_manutencao"),
    initialData: [],
  });

  const empilhadeira = empilhadeiras[0];

  // ── Config mutations ──────────────────────────────────────────────────────
  const salvarConfigMutation = useMutation({
    mutationFn: async (data) => {
      if (empilhadeira) return base44.entities.EmpilhadeiraConfig.update(empilhadeira.id, data);
      return base44.entities.EmpilhadeiraConfig.create(data);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["empilhadeiras-config"] }); setEditMode(false); },
  });

  const registrarManutencaoMutation = useMutation({
    mutationFn: async (data) => {
      const manut = await base44.entities.EmpilhadeiraManutencao.create({ ...data, empilhadeira_id: empilhadeira?.id || "default" });
      if (empilhadeira) {
        const proxima = format(addDays(new Date(data.data_manutencao), empilhadeira.intervalo_manutencao_dias || 90), "yyyy-MM-dd");
        await base44.entities.EmpilhadeiraConfig.update(empilhadeira.id, { data_ultima_manutencao: data.data_manutencao, data_proxima_manutencao: proxima });
      }
      return manut;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilhadeira-manutencoes"] });
      queryClient.invalidateQueries({ queryKey: ["empilhadeiras-config"] });
      setShowManutencaoModal(false);
      setManutencaoForm({ tipo: "Preventiva", descricao: "", responsavel: "", data_manutencao: format(new Date(), "yyyy-MM-dd") });
    },
  });

  // ── Filtro de período ──────────────────────────────────────────────────────
  const emPeriodo = (data) => {
    if (!data) return false;
    return data >= dataInicio && data <= dataFim;
  };

  const progNoPeriodo = programacoes.filter(p => emPeriodo(p.data_programada));
  const ocorrenciasNaoResolvidas = ocorrencias.filter(o => !o.resolvido && emPeriodo(o.data));
  const paradasNoPeriodo = paradas.filter(p => emPeriodo(p.data));

  // KPIs do período
  const linhasProgIds = progNoPeriodo.map(p => p.id);
  const linhasNoPeriodo = linhas.filter(l => linhasProgIds.includes(l.programacao_id));
  const totalLinhas = linhasNoPeriodo.length;
  const concluidas = linhasNoPeriodo.filter(l => l.status === "Concluído").length;
  const emAndamento = linhasNoPeriodo.filter(l => l.status === "Em Andamento").length;
  const criticos = linhasNoPeriodo.filter(l => l.tipo_linha === "Crítico" && l.status !== "Concluído").length;

  const tempoTotalParado = paradasNoPeriodo.reduce((acc, p) => {
    if (p.tempo_total) { const mins = parseInt(p.tempo_total.replace(" min", "")) || 0; return acc + mins; }
    return acc;
  }, 0);
  const empilhadeiraAtiva = empilhadeiras.find(e => e.ativa);
  const duracaoTurno = (empilhadeiraAtiva?.duracao_turno_horas || 8) * 60;
  const pctParado = totalLinhas > 0 ? Math.round((tempoTotalParado / duracaoTurno) * 100) : 0;

  const diasParaManutencao = empilhadeiraAtiva?.data_proxima_manutencao
    ? differenceInDays(parseISO(empilhadeiraAtiva.data_proxima_manutencao), new Date())
    : null;
  const alertaManutencao = diasParaManutencao !== null && diasParaManutencao <= 7;

  const getStatusColor = (status) => {
    if (status === "Concluído") return "bg-green-100 text-green-800";
    if (status === "Em Andamento") return "bg-blue-100 text-blue-800";
    return "bg-yellow-100 text-yellow-800";
  };

  // ── Indicadores ────────────────────────────────────────────────────────────
  const duracaoTurnoMins = (empilhadeiraAtiva?.duracao_turno_horas || 8) * 60;

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

  const totalNormal = linhasFiltradas.filter(l => l.tipo_linha === "Normal" || !l.tipo_linha).length;
  const totalCritico = linhasFiltradas.filter(l => l.tipo_linha === "Crítico").length;
  const totalAvulso = linhasFiltradas.filter(l => l.tipo_linha === "Avulso").length;
  const totalConcluidas = linhasFiltradas.filter(l => l.status === "Concluído").length;

  const temposMins = linhasFiltradas.filter(l => l.tempo_total && l.status === "Concluído").map(l => minsFromHHMM(l.tempo_total));
  const tempoMedioGeral = temposMins.length > 0 ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0;

  const tempoMedioTipo = ["Normal", "Crítico", "Avulso"].map(tipo => {
    const ts = linhasFiltradas.filter(l => (l.tipo_linha === tipo || (!l.tipo_linha && tipo === "Normal")) && l.status === "Concluído" && l.tempo_total).map(l => minsFromHHMM(l.tempo_total));
    return { tipo, media: ts.length > 0 ? Math.round(ts.reduce((a, b) => a + b, 0) / ts.length) : 0, count: ts.length };
  });

  const dias = dataInicio && dataFim ? eachDayOfInterval({ start: parseISO(dataInicio), end: parseISO(dataFim) }) : [];
  const linhasPorDia = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = programacoes.filter(p => p.data_programada === dia).map(p => p.id);
    const ls = linhas.filter(l => ps.includes(l.programacao_id));
    return { dia: format(d, "dd/MM", { locale: ptBR }), Normal: ls.filter(l => l.tipo_linha === "Normal" || !l.tipo_linha).length, Crítico: ls.filter(l => l.tipo_linha === "Crítico").length, Avulso: ls.filter(l => l.tipo_linha === "Avulso").length };
  });

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
    nome, total: d.total, media: d.mins.length > 0 ? Math.round(d.mins.reduce((a, b) => a + b, 0) / d.mins.length) : 0,
  })).sort((a, b) => b.total - a.total);

  const totalTempoParadoInd = paradasFiltradas.reduce((acc, p) => acc + (parseInt(p.tempo_total) || 0), 0);
  const paradaPorTipo = Object.entries(paradasFiltradas.reduce((acc, p) => { acc[p.tipo] = (acc[p.tipo] || 0) + (parseInt(p.tempo_total) || 0); return acc; }, {})).map(([name, value]) => ({ name, value }));
  const paradasPorDia = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = paradasFiltradas.filter(p => p.data === dia);
    return { dia: format(d, "dd/MM", { locale: ptBR }), paradas: ps.length, tempo: ps.reduce((a, p) => a + (parseInt(p.tempo_total) || 0), 0) };
  });

  const ocorrPorTipo = Object.entries(ocorrenciasFiltradas.reduce((acc, o) => { acc[o.tipo || "Outro"] = (acc[o.tipo || "Outro"] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
  const rankOcorrencias = Object.entries(ocorrenciasFiltradas.reduce((acc, o) => { if (o.registrado_por) { acc[o.registrado_por] = (acc[o.registrado_por] || 0) + 1; } return acc; }, {})).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);

  const oeeDias = dias.map(d => {
    const dia = format(d, "yyyy-MM-dd");
    const ps = programacoes.filter(p => p.data_programada === dia).map(p => p.id);
    const ls = linhas.filter(l => ps.includes(l.programacao_id) && l.status === "Concluído" && l.tempo_total);
    const produtivo = ls.reduce((a, l) => a + minsFromHHMM(l.tempo_total), 0);
    const aproveitamento = duracaoTurnoMins > 0 ? Math.min(100, Math.round((produtivo / duracaoTurnoMins) * 100)) : 0;
    return { dia: format(d, "dd/MM", { locale: ptBR }), aproveitamento };
  });
  const oeeMedio = oeeDias.length > 0 ? Math.round(oeeDias.reduce((a, d) => a + d.aproveitamento, 0) / oeeDias.length) : 0;

  const diasParaManutConfig = empilhadeira?.data_proxima_manutencao ? differenceInDays(parseISO(empilhadeira.data_proxima_manutencao), new Date()) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {acessoRestrito && (
          <Alert className="border-red-300 bg-red-50">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 font-medium">Acesso restrito a administradores.</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-3">
            <Warehouse className="w-9 h-9 text-amber-600" /> Controle da Empilhadeira
          </h1>
          {isAdmin && abaAtiva === "operacoes" && (
            <Link to={createPageUrl("NovaEmpilhaProgramacao")}>
              <Button className="bg-amber-600 hover:bg-amber-700">
                <Plus className="w-4 h-4 mr-2" /> Nova Programação
              </Button>
            </Link>
          )}
          {isAdmin && abaAtiva === "configuracoes" && empilhadeira && (
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setShowManutencaoModal(true)}>
              <Wrench className="w-4 h-4 mr-2" /> Registrar Manutenção
            </Button>
          )}
        </div>

        {isAdmin && (
          <PainelPendenciasAdmin
            linhas={linhas}
            ocorrencias={ocorrencias}
            paradas={paradas}
            empilhadeiras={empilhadeiras}
            programacoes={programacoes}
            currentUser={user}
          />
        )}

        {alertaManutencao && (
          <Alert className="border-orange-300 bg-orange-50">
            <Wrench className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800 font-medium">
              {diasParaManutencao < 0
                ? `⚠️ Manutenção ATRASADA há ${Math.abs(diasParaManutencao)} dias!`
                : `⚠️ Manutenção prevista em ${diasParaManutencao} dia(s).`}
              {" "}<button onClick={() => setAbaAtiva("configuracoes")} className="underline font-bold">Ver detalhes</button>
            </AlertDescription>
          </Alert>
        )}

        {/* Abas principais */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <TabsList className="mb-2">
            <TabsTrigger value="operacoes" className="flex items-center gap-2">
              <ListTodo className="w-4 h-4" /> Operações
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="indicadores" className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4" /> Indicadores
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="configuracoes" className="flex items-center gap-2">
                <Settings className="w-4 h-4" /> Configurações
              </TabsTrigger>
            )}
          </TabsList>

          {/* ── ABA: OPERAÇÕES ─────────────────────────────────────────── */}
          <TabsContent value="operacoes" className="space-y-6">
            <FiltroPeriodoEmpilha dataInicio={dataInicio} dataFim={dataFim} onChange={handlePeriodo} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">Total Linhas</p><p className="text-3xl font-bold text-slate-900 mt-1">{totalLinhas}</p></div><ListTodo className="w-8 h-8 text-slate-400" /></div></CardContent></Card>
              <Card className="border-green-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">Concluídas</p><p className="text-3xl font-bold text-green-700 mt-1">{concluidas}</p></div><CheckCircle className="w-8 h-8 text-green-500" /></div></CardContent></Card>
              <Card className="border-blue-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">Em Andamento</p><p className="text-3xl font-bold text-blue-700 mt-1">{emAndamento}</p></div><Clock className="w-8 h-8 text-blue-500" /></div></CardContent></Card>
              <Card className="border-red-200 shadow-sm"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">Críticos Pend.</p><p className="text-3xl font-bold text-red-700 mt-1">{criticos}</p></div><AlertCircle className="w-8 h-8 text-red-500" /></div></CardContent></Card>
            </div>

            {paradasNoPeriodo.length > 0 && (
              <Card className="border-orange-200 bg-orange-50 shadow-sm">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <OctagonX className="w-6 h-6 text-orange-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-bold text-orange-800">Paradas no período</p>
                      <p className="text-sm text-orange-700">{paradasNoPeriodo.length} parada(s) · {tempoTotalParado} min parado{pctParado > 0 && ` · ${pctParado}% do turno`}</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-orange-300 text-orange-700" onClick={() => setAbaAtiva("indicadores")}>Ver detalhes</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200 shadow-lg">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-xl font-bold text-slate-900">Programações ({progNoPeriodo.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {progNoPeriodo.length === 0 ? (
                  <div className="text-center py-10">
                    <Warehouse className="w-14 h-14 mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 mb-4">Nenhuma programação neste período</p>
                    <Link to={createPageUrl("NovaEmpilhaProgramacao")}>
                      <Button className="bg-amber-600 hover:bg-amber-700"><Plus className="w-4 h-4 mr-2" /> Criar Programação</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {progNoPeriodo.map(prog => {
                      const progLinhas = linhas.filter(l => l.programacao_id === prog.id);
                      const progConcluidas = progLinhas.filter(l => l.status === "Concluído").length;
                      const emp = empilhadeiras.find(e => e.id === prog.empilhadeira_id);
                      return (
                        <Link key={prog.id} to={createPageUrl(`ExecutarEmpilha?id=${prog.id}`)}>
                          <Card className="border-slate-200 hover:shadow-md transition-shadow cursor-pointer">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Warehouse className="w-4 h-4 text-amber-600" />
                                    <span className="font-bold text-slate-900">{format(new Date(prog.data_programada + "T00:00:00"), "dd/MM/yyyy")}</span>
                                    {emp && <Badge className="bg-amber-100 text-amber-800 text-xs">{emp.nome}</Badge>}
                                    {prog.criado_por && <span className="text-xs text-slate-400">por {prog.criado_por}</span>}
                                  </div>
                                  <p className="text-sm text-slate-600">{progConcluidas}/{progLinhas.length} linhas concluídas</p>
                                  {prog.observacoes && <p className="text-xs text-slate-400 italic mt-1">"{prog.observacoes}"</p>}
                                </div>
                                <Badge className={getStatusColor(prog.status)}>{prog.status}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-lg">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" /> Histórico de Ocorrências
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <Tabs defaultValue="pendentes">
                  <TabsList className="mb-4">
                    <TabsTrigger value="pendentes">
                      Pendentes
                      {ocorrenciasNaoResolvidas.length > 0 && <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{ocorrenciasNaoResolvidas.length}</span>}
                    </TabsTrigger>
                    <TabsTrigger value="todas">Todas ({ocorrencias.length})</TabsTrigger>
                  </TabsList>
                  {["pendentes", "todas"].map(tab => {
                    const lista = tab === "pendentes" ? ocorrenciasNaoResolvidas : ocorrencias;
                    return (
                      <TabsContent key={tab} value={tab}>
                        {lista.length === 0 ? (
                          <div className="text-center py-8 text-slate-400">
                            <CheckCheck className="w-10 h-10 mx-auto mb-2 text-green-400" />
                            <p>{tab === "pendentes" ? "Nenhuma ocorrência pendente" : "Nenhuma ocorrência registrada"}</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {lista.map(o => (
                              <div key={o.id} className={`flex items-start gap-3 p-3 rounded-lg border ${o.resolvido ? "bg-green-50 border-green-200" : "bg-orange-50 border-orange-200"}`}>
                                {o.resolvido ? <CheckCheck className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={o.resolvido ? "bg-green-100 text-green-700 text-xs" : "bg-orange-100 text-orange-700 text-xs"}>{o.tipo}</Badge>
                                    <span className="text-xs text-slate-500">{o.data} {o.hora} — {o.registrado_por}</span>
                                    {o.notificado_lider && <Badge className="bg-blue-100 text-blue-700 text-xs">Líder notificado</Badge>}
                                  </div>
                                  <p className="text-sm text-slate-700 mt-1">{o.descricao}</p>
                                  {o.resolvido && o.resolucao && <p className="text-xs text-green-700 mt-1 italic">↳ {o.resolucao}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TabsContent>
                    );
                  })}
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── ABA: INDICADORES ───────────────────────────────────────── */}
          <TabsContent value="indicadores" className="space-y-6">
            <FiltroPeriodoEmpilha dataInicio={dataInicio} dataFim={dataFim} onChange={handlePeriodo} />

            {/* Produção */}
            <Card className="border-slate-200 shadow-md">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-amber-600" /> Produção</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {linhasFiltradas.length === 0 ? <EmptyState /> : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500 mb-1">Normal</p><p className="text-2xl font-bold text-slate-800">{totalNormal}</p></div>
                      <div className="bg-red-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500 mb-1">Crítico</p><p className="text-2xl font-bold text-red-700">{totalCritico}</p></div>
                      <div className="bg-amber-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500 mb-1">Avulso</p><p className="text-2xl font-bold text-amber-700">{totalAvulso}</p></div>
                      <div className="bg-green-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500 mb-1">Concluídas</p><p className="text-2xl font-bold text-green-700">{totalConcluidas}/{linhasFiltradas.length}</p></div>
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

            {/* Operadores */}
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

            {/* Paradas */}
            <Card className="border-slate-200 shadow-md">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2"><OctagonX className="w-5 h-5 text-orange-600" /> Paradas</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {paradasFiltradas.length === 0 ? <EmptyState label="Nenhuma parada registrada no período" /> : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-orange-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Total paradas</p><p className="text-2xl font-bold text-orange-700">{paradasFiltradas.length}</p></div>
                      <div className="bg-red-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">Tempo parado</p><p className="text-2xl font-bold text-red-700">{totalTempoParadoInd} min</p></div>
                      <div className="bg-slate-50 rounded-lg p-4 text-center"><p className="text-xs text-slate-500">% turno perdido</p><p className="text-2xl font-bold text-slate-700">{duracaoTurnoMins > 0 ? Math.round((totalTempoParadoInd / duracaoTurnoMins) * 100) : 0}%</p></div>
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

            {/* Ocorrências */}
            <Card className="border-slate-200 shadow-md">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" /> Ocorrências</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {ocorrenciasFiltradas.length === 0 ? <EmptyState label="Nenhuma ocorrência no período" /> : (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-orange-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500">Total</p><p className="text-xl font-bold text-orange-700">{ocorrenciasFiltradas.length}</p></div>
                        <div className="bg-green-50 rounded-lg p-3 text-center"><p className="text-xs text-slate-500">Resolvidas</p><p className="text-xl font-bold text-green-700">{ocorrenciasFiltradas.filter(o => o.resolvido).length}</p></div>
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

            {/* OEE */}
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
          </TabsContent>

          {/* ── ABA: CONFIGURAÇÕES ─────────────────────────────────────── */}
          <TabsContent value="configuracoes" className="space-y-6">

            {/* Status manutenção */}
            {empilhadeira && diasParaManutConfig !== null && (
              <Card className={`border-2 shadow-lg ${diasParaManutConfig < 0 ? "border-red-400 bg-red-50" : diasParaManutConfig <= 7 ? "border-orange-400 bg-orange-50" : "border-green-300 bg-green-50"}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    {diasParaManutConfig < 0
                      ? <AlertCircle className="w-10 h-10 text-red-600 flex-shrink-0" />
                      : diasParaManutConfig <= 7
                      ? <AlertCircle className="w-10 h-10 text-orange-600 flex-shrink-0" />
                      : <CheckCircle className="w-10 h-10 text-green-600 flex-shrink-0" />}
                    <div>
                      <p className="font-bold text-lg text-slate-900">
                        {diasParaManutConfig < 0
                          ? `Manutenção atrasada há ${Math.abs(diasParaManutConfig)} dias`
                          : diasParaManutConfig === 0
                          ? "Manutenção prevista para HOJE"
                          : `Próxima manutenção em ${diasParaManutConfig} dias`}
                      </p>
                      <p className="text-sm text-slate-600">
                        Prevista para: {empilhadeira.data_proxima_manutencao ? format(parseISO(empilhadeira.data_proxima_manutencao), "dd/MM/yyyy") : "Não definida"}
                        {empilhadeira.data_ultima_manutencao && ` · Última: ${format(parseISO(empilhadeira.data_ultima_manutencao), "dd/MM/yyyy")}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setConfigForm(empilhadeira || { nome: "", marca: "", modelo: "", numero_serie: "", ativa: true, intervalo_manutencao_dias: 90, observacoes: "" }); setEditMode(true); }}>
                {empilhadeira ? "Editar" : "Cadastrar Empilhadeira"}
              </Button>
              {empilhadeira && (
                <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setShowManutencaoModal(true)}>
                  <Wrench className="w-4 h-4 mr-2" /> Registrar Manutenção
                </Button>
              )}
            </div>

            {empilhadeira && !editMode && (
              <Card className="border-slate-200 shadow-lg">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wrench className="w-5 h-5 text-amber-600" /> {empilhadeira.nome}
                    <Badge className={empilhadeira.ativa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>{empilhadeira.ativa ? "Ativa" : "Inativa"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-3 gap-4 text-sm">
                    {empilhadeira.marca && <div><p className="text-slate-500">Marca</p><p className="font-medium">{empilhadeira.marca}</p></div>}
                    {empilhadeira.modelo && <div><p className="text-slate-500">Modelo</p><p className="font-medium">{empilhadeira.modelo}</p></div>}
                    {empilhadeira.numero_serie && <div><p className="text-slate-500">Nº Série</p><p className="font-medium font-mono">{empilhadeira.numero_serie}</p></div>}
                    <div><p className="text-slate-500">Intervalo de Manutenção</p><p className="font-medium">{empilhadeira.intervalo_manutencao_dias} dias</p></div>
                  </div>
                  {empilhadeira.observacoes && <p className="text-sm text-slate-500 mt-3 italic">"{empilhadeira.observacoes}"</p>}
                </CardContent>
              </Card>
            )}

            {editMode && configForm && (
              <Card className="border-slate-200 shadow-lg">
                <CardHeader className="border-b border-slate-100"><CardTitle>Dados da Empilhadeira</CardTitle></CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Nome *</Label><Input value={configForm.nome} onChange={e => setConfigForm(p => ({ ...p, nome: e.target.value }))} placeholder="Empilhadeira 01" /></div>
                    <div className="space-y-2"><Label>Intervalo de Manutenção (dias) *</Label><Input type="number" value={configForm.intervalo_manutencao_dias} onChange={e => setConfigForm(p => ({ ...p, intervalo_manutencao_dias: parseInt(e.target.value) || 90 }))} /></div>
                    <div className="space-y-2"><Label>Marca</Label><Input value={configForm.marca || ""} onChange={e => setConfigForm(p => ({ ...p, marca: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Modelo</Label><Input value={configForm.modelo || ""} onChange={e => setConfigForm(p => ({ ...p, modelo: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Número de Série</Label><Input value={configForm.numero_serie || ""} onChange={e => setConfigForm(p => ({ ...p, numero_serie: e.target.value }))} /></div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={configForm.ativa ? "ativa" : "inativa"} onValueChange={v => setConfigForm(p => ({ ...p, ativa: v === "ativa" }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="ativa">Ativa</SelectItem><SelectItem value="inativa">Inativa</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Data da Última Manutenção</Label><Input type="date" value={configForm.data_ultima_manutencao || ""} onChange={e => setConfigForm(p => ({ ...p, data_ultima_manutencao: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>Data da Próxima Manutenção</Label><Input type="date" value={configForm.data_proxima_manutencao || ""} onChange={e => setConfigForm(p => ({ ...p, data_proxima_manutencao: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-2"><Label>Observações</Label><Textarea value={configForm.observacoes || ""} onChange={e => setConfigForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} /></div>
                  <div className="flex gap-3 justify-end">
                    <Button variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                    <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => salvarConfigMutation.mutate(configForm)} disabled={!configForm.nome || salvarConfigMutation.isPending}>
                      {salvarConfigMutation.isPending ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200 shadow-lg">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-lg">Histórico de Manutenções ({manutencoes.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {manutencoes.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">Nenhuma manutenção registrada</p>
                ) : (
                  <div className="space-y-3">
                    {manutencoes.map(m => (
                      <div key={m.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Wrench className="w-5 h-5 text-amber-700" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-amber-100 text-amber-800 text-xs">{m.tipo}</Badge>
                            <span className="text-sm font-medium text-slate-700">{format(parseISO(m.data_manutencao), "dd/MM/yyyy")}</span>
                            {m.responsavel && <span className="text-xs text-slate-400">por {m.responsavel}</span>}
                          </div>
                          {m.descricao && <p className="text-sm text-slate-600">{m.descricao}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal Manutenção */}
      <Dialog open={showManutencaoModal} onOpenChange={setShowManutencaoModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Manutenção</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Data da Manutenção *</Label><Input type="date" value={manutencaoForm.data_manutencao} onChange={e => setManutencaoForm(p => ({ ...p, data_manutencao: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={manutencaoForm.tipo} onValueChange={v => setManutencaoForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Preventiva", "Corretiva", "Revisão Geral"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Responsável</Label><Input value={manutencaoForm.responsavel} onChange={e => setManutencaoForm(p => ({ ...p, responsavel: e.target.value }))} placeholder="Nome do responsável" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea value={manutencaoForm.descricao} onChange={e => setManutencaoForm(p => ({ ...p, descricao: e.target.value }))} placeholder="O que foi feito..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManutencaoModal(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => registrarManutencaoMutation.mutate(manutencaoForm)} disabled={registrarManutencaoMutation.isPending}>
              {registrarManutencaoMutation.isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}