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
import BlocosIndicadores from "../components/empilhadeira/BlocosIndicadores";
import PainelPendenciasAdmin from "../components/empilhadeira/PainelPendenciasAdmin";
import { PageHeader, StatCard, SectionCard, StatusPill, SegmentoPeriodo, ChipsFiltro, MiniKPI, EmptyState as VazioFluxo, CORES_GRAFICO, EIXO, GRADE, TOOLTIP, LEGENDA, RAIO_BARRA } from "@/components/fluxo";

const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"];

function minsFromHHMM(str) {
  if (!str) return 0;
  if (str.includes("min")) return parseInt(str) || 0;
  const [h, m] = str.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function EmptyState({ label }) {
  return (
    <div className="text-center py-10 text-texto-apagado">
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
  const [faixaOcorrencias, setFaixaOcorrencias] = useState("pendentes");
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
    if (status === "Concluído") return "bg-ok-suave text-ok";
    if (status === "Em Andamento") return "bg-marca-suave text-marca";
    return "bg-atencao-suave text-atencao";
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
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {acessoRestrito && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>Acesso restrito a administradores.</AlertDescription>
          </Alert>
        )}

        <PageHeader
          aoVivo
          migalha={[{ rotulo: "Operação" }, { rotulo: "Empilhadeira" }]}
          titulo="Empilhadeira"
          legenda="Linhas, paradas e manutenção"
          acoes={
            <>
              {isAdmin && abaAtiva === "operacoes" && (
                <Link to={createPageUrl("NovaEmpilhaProgramacao")}>
                  <Button size="lg">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nova programação
                  </Button>
                </Link>
              )}
              {isAdmin && abaAtiva === "configuracoes" && empilhadeira && (
                <Button size="lg" onClick={() => setShowManutencaoModal(true)}>
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  Registrar manutenção
                </Button>
              )}
            </>
          }
        />

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
          <Alert className="border-atencao bg-atencao-suave">
            <Wrench className="h-4 w-4 text-atencao" />
            <AlertDescription className="text-atencao font-medium">
              {diasParaManutencao < 0
                ? `⚠️ Manutenção ATRASADA há ${Math.abs(diasParaManutencao)} dias!`
                : `⚠️ Manutenção prevista em ${diasParaManutencao} dia(s).`}
              {" "}<button onClick={() => setAbaAtiva("configuracoes")} className="underline font-bold">Ver detalhes</button>
            </AlertDescription>
          </Alert>
        )}

        {/* As três áreas do módulo. Eram TabsTrigger de 36px de altura;
            agora são alvos de 48px, como o resto do sistema. */}
        <SegmentoPeriodo
          rotulo="Área do módulo"
          opcoes={[
            { valor: "operacoes", rotulo: "Operações" },
            ...(isAdmin ? [{ valor: "indicadores", rotulo: "Indicadores" }] : []),
            ...(isAdmin ? [{ valor: "configuracoes", rotulo: "Configurações" }] : []),
          ]}
          valor={abaAtiva}
          aoEscolher={setAbaAtiva}
          className="self-start"
        />

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>

          {/* ── ABA: OPERAÇÕES ─────────────────────────────────────────── */}
          <TabsContent value="operacoes" className="space-y-6">
            <FiltroPeriodoEmpilha dataInicio={dataInicio} dataFim={dataFim} onChange={handlePeriodo} />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Eram quatro cartões escritos numa linha só cada, de 380
                  caracteres, com uma cor de borda diferente por cartão. */}
              <StatCard rotulo="Total de linhas" valor={totalLinhas} icone={ListTodo} destaque atraso={0.05} />
              <StatCard rotulo="Concluídas" valor={concluidas} icone={CheckCircle} tom="ok" atraso={0.1} />
              <StatCard rotulo="Em andamento" valor={emAndamento} icone={Clock} tom="info" atraso={0.15} />
              <StatCard
                rotulo="Críticos pendentes" valor={criticos} icone={AlertCircle}
                tom={criticos > 0 ? "erro" : "neutro"} atraso={0.2}
              />
            </div>

            {paradasNoPeriodo.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-painel bg-atencao-suave px-5 py-4">
                <OctagonX className="h-6 w-6 flex-none text-atencao" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-atencao">Paradas no período</p>
                  <p className="text-sm font-semibold text-atencao">
                    {paradasNoPeriodo.length} parada(s) · <span className="num">{tempoTotalParado}</span> min parado
                    {pctParado > 0 && ` · ${pctParado}% do turno`}
                  </p>
                </div>
                <Button
                  variant="outline" size="lg" className="flex-none"
                  onClick={() => setAbaAtiva("indicadores")}
                >
                  Ver detalhes
                </Button>
              </div>
            )}

            <SectionCard
              titulo="Programações"
              legenda={`${progNoPeriodo.length} no período`}
              icone={Warehouse}
              atraso={0.25}
            >
              {progNoPeriodo.length === 0 ? (
                <VazioFluxo
                  icone={Warehouse}
                  titulo="Nenhuma programação neste período"
                  legenda="Ajuste o período acima ou crie uma programação."
                  acao={
                    <Link to={createPageUrl("NovaEmpilhaProgramacao")}>
                      <Button><Plus className="h-4 w-4" aria-hidden="true" />Criar programação</Button>
                    </Link>
                  }
                />
              ) : (
                <ul className="flex min-w-0 flex-col gap-2.5">
                  {progNoPeriodo.map(prog => {
                    const progLinhas = linhas.filter(l => l.programacao_id === prog.id);
                    const progConcluidas = progLinhas.filter(l => l.status === "Concluído").length;
                    const emp = empilhadeiras.find(e => e.id === prog.empilhadeira_id);
                    const pct = progLinhas.length > 0
                      ? Math.round((progConcluidas / progLinhas.length) * 100) : 0;

                    return (
                      <li key={prog.id}>
                        <Link
                          to={createPageUrl(`ExecutarEmpilha?id=${prog.id}`)}
                          className="press foco-fluxo flex min-w-0 items-center justify-between gap-3
                                     rounded-painel bg-fundo p-4 hover:bg-marca-suave"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="num text-lg font-extrabold text-tinta">
                                {format(new Date(prog.data_programada + "T00:00:00"), "dd/MM/yyyy")}
                              </span>
                              {emp && (
                                <span className="rounded-full bg-cartao px-2.5 py-0.5 text-[11px] font-extrabold text-texto-fraco">
                                  {emp.nome}
                                </span>
                              )}
                              {prog.criado_por && (
                                <span className="text-xs font-semibold text-texto-apagado">
                                  por {prog.criado_por}
                                </span>
                              )}
                            </span>

                            <span className="mt-1 block text-sm font-semibold text-texto-fraco">
                              <span className="num font-bold text-tinta">{progConcluidas}</span>
                              /{progLinhas.length} linhas concluídas
                            </span>

                            {/* A barra mostra o andamento sem exigir a conta
                                mental de "7 de 12". */}
                            {progLinhas.length > 0 && (
                              <span
                                className="mt-2 block h-1.5 max-w-sm overflow-hidden rounded-full bg-cartao"
                                role="img"
                                aria-label={`${pct}% concluído`}
                              >
                                <span
                                  className={`block h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-marca"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                            )}

                            {prog.observacoes && (
                              <span className="mt-1.5 block text-xs font-semibold italic text-texto-apagado">
                                “{prog.observacoes}”
                              </span>
                            )}
                          </span>

                          <StatusPill estado={prog.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              titulo="Histórico de ocorrências"
              legenda={`${ocorrenciasNaoResolvidas.length} pendente(s) de ${ocorrencias.length}`}
              icone={AlertTriangle}
              atraso={0.3}
            >
              {/* Eram duas abas renderizando a MESMA lista com arrays
                  diferentes. Viraram chips com contagem, e a lista é uma só.
                  O contador de pendentes era uma bolinha laranja sem rótulo
                  acessível ao lado do texto da aba. */}
              <div className="mb-4">
                <ChipsFiltro
                  rotulo="Filtrar ocorrências"
                  opcoes={[
                    { valor: "pendentes", rotulo: "Pendentes", contagem: ocorrenciasNaoResolvidas.length },
                    { valor: "todas", rotulo: "Todas", contagem: ocorrencias.length },
                  ]}
                  valor={faixaOcorrencias}
                  aoEscolher={setFaixaOcorrencias}
                />
              </div>

              {(() => {
                const lista = faixaOcorrencias === "pendentes" ? ocorrenciasNaoResolvidas : ocorrencias;
                if (lista.length === 0) {
                  return (
                    <VazioFluxo
                      icone={CheckCheck}
                      titulo={faixaOcorrencias === "pendentes"
                        ? "Nenhuma ocorrência pendente"
                        : "Nenhuma ocorrência registrada"}
                      legenda="Nada a relatar é um bom resultado."
                    />
                  );
                }
                return (
                  <ul className="flex min-w-0 flex-col gap-2">
                    {lista.map(o => (
                      <li
                        key={o.id}
                        className={`flex min-w-0 items-start gap-3 rounded-token px-4 py-3
                                    ${o.resolvido ? "bg-ok-suave" : "bg-atencao-suave"}`}
                      >
                        {o.resolvido
                          ? <CheckCheck className="mt-0.5 h-4 w-4 flex-none text-ok" aria-hidden="true" />
                          : <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-atencao" aria-hidden="true" />}

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className={`rounded-full bg-cartao px-2.5 py-0.5 text-[11px] font-extrabold
                                              ${o.resolvido ? "text-ok" : "text-atencao"}`}>
                              {o.tipo}
                            </span>
                            <span className="text-xs font-semibold text-texto-fraco">
                              <span className="num">{o.data} {o.hora}</span> — {o.registrado_por}
                            </span>
                            {o.notificado_lider && (
                              <span className="rounded-full bg-marca-suave px-2.5 py-0.5 text-[11px] font-extrabold text-marca">
                                líder notificado
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-semibold text-tinta">{o.descricao}</p>
                          {o.resolvido && o.resolucao && (
                            <p className="mt-1 text-xs font-semibold italic text-ok">↳ {o.resolucao}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </SectionCard>
          </TabsContent>

          {/* ── ABA: INDICADORES ───────────────────────────────────────── */}
          <TabsContent value="indicadores" className="space-y-4">
            <FiltroPeriodoEmpilha dataInicio={dataInicio} dataFim={dataFim} onChange={handlePeriodo} />

            {/* Os mesmos cinco blocos da pagina IndicadoresEmpilha, agora de um
                componente so: eram ~210 linhas copiadas nos dois arquivos, e as
                duas copias ja divergiam numa variavel. */}
            <BlocosIndicadores
              linhasFiltradas={linhasFiltradas}
              paradasFiltradas={paradasFiltradas}
              ocorrenciasFiltradas={ocorrenciasFiltradas}
              programacoes={programacoes}
              linhas={linhas}
              empilhadeiraAtiva={empilhadeira}
              dataInicio={dataInicio}
              dataFim={dataFim}
            />
          </TabsContent>
          <TabsContent value="configuracoes" className="space-y-4">

            {/* Situação da manutenção.
                A borda de 2px em três cores diferentes saiu: a cor do fundo e o
                ícone já dizem o estado, e `border-erro bg-erro-suave` repetia a
                mesma informação num terceiro lugar. */}
            {empilhadeira && diasParaManutConfig !== null && (
              <div
                className={`flex min-w-0 items-center gap-4 rounded-painel px-5 py-5
                            ${diasParaManutConfig < 0 ? "bg-erro-suave"
                              : diasParaManutConfig <= 7 ? "bg-atencao-suave"
                              : "bg-ok-suave"}`}
              >
                {diasParaManutConfig < 0 ? (
                  <AlertCircle className="h-10 w-10 flex-none text-erro" aria-hidden="true" />
                ) : diasParaManutConfig <= 7 ? (
                  <AlertCircle className="h-10 w-10 flex-none text-atencao" aria-hidden="true" />
                ) : (
                  <CheckCircle className="h-10 w-10 flex-none text-ok" aria-hidden="true" />
                )}

                <div className="min-w-0">
                  <p className={`text-lg font-extrabold
                                 ${diasParaManutConfig < 0 ? "text-erro"
                                   : diasParaManutConfig <= 7 ? "text-atencao" : "text-ok"}`}>
                    {diasParaManutConfig < 0
                      ? `Manutenção atrasada há ${Math.abs(diasParaManutConfig)} dia(s)`
                      : diasParaManutConfig === 0
                        ? "Manutenção prevista para hoje"
                        : `Próxima manutenção em ${diasParaManutConfig} dia(s)`}
                  </p>
                  <p className="text-sm font-semibold text-tinta-media">
                    Prevista para{" "}
                    <span className="num">
                      {empilhadeira.data_proxima_manutencao
                        ? format(parseISO(empilhadeira.data_proxima_manutencao), "dd/MM/yyyy")
                        : "não definida"}
                    </span>
                    {empilhadeira.data_ultima_manutencao && (
                      <> · última em <span className="num">
                        {format(parseISO(empilhadeira.data_ultima_manutencao), "dd/MM/yyyy")}
                      </span></>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2.5">
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setConfigForm(empilhadeira || {
                    nome: "", marca: "", modelo: "", numero_serie: "",
                    ativa: true, intervalo_manutencao_dias: 90, observacoes: "",
                  });
                  setEditMode(true);
                }}
              >
                {empilhadeira ? "Editar" : "Cadastrar empilhadeira"}
              </Button>
              {empilhadeira && (
                <Button size="lg" onClick={() => setShowManutencaoModal(true)}>
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  Registrar manutenção
                </Button>
              )}
            </div>

            {empilhadeira && !editMode && (
              <SectionCard
                titulo={empilhadeira.nome}
                icone={Wrench}
                atraso={0.05}
                acoes={
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold
                                    ${empilhadeira.ativa ? "bg-ok-suave text-ok" : "bg-erro-suave text-erro"}`}>
                    {empilhadeira.ativa ? "Ativa" : "Inativa"}
                  </span>
                }
              >
                <dl className="grid min-w-0 gap-4 text-sm md:grid-cols-3">
                  {empilhadeira.marca && (
                    <div className="min-w-0">
                      <dt className="font-bold text-texto-fraco">Marca</dt>
                      <dd className="font-extrabold text-tinta">{empilhadeira.marca}</dd>
                    </div>
                  )}
                  {empilhadeira.modelo && (
                    <div className="min-w-0">
                      <dt className="font-bold text-texto-fraco">Modelo</dt>
                      <dd className="font-extrabold text-tinta">{empilhadeira.modelo}</dd>
                    </div>
                  )}
                  {empilhadeira.numero_serie && (
                    <div className="min-w-0">
                      <dt className="font-bold text-texto-fraco">Nº de série</dt>
                      <dd className="codigo font-extrabold text-tinta">{empilhadeira.numero_serie}</dd>
                    </div>
                  )}
                  <div className="min-w-0">
                    <dt className="font-bold text-texto-fraco">Intervalo de manutenção</dt>
                    <dd className="num font-extrabold text-tinta">
                      {empilhadeira.intervalo_manutencao_dias} dias
                    </dd>
                  </div>
                </dl>
                {empilhadeira.observacoes && (
                  <p className="mt-3 text-sm font-semibold italic text-texto-fraco">
                    “{empilhadeira.observacoes}”
                  </p>
                )}
              </SectionCard>
            )}

            {editMode && configForm && (
              <SectionCard titulo="Dados da empilhadeira" icone={Wrench} atraso={0.05}>
                <div className="flex min-w-0 flex-col gap-5">
                  <div className="grid min-w-0 gap-4 md:grid-cols-2">
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-nome">Nome *</Label>
                      <Input
                        id="emp-nome"
                        value={configForm.nome}
                        onChange={e => setConfigForm(p => ({ ...p, nome: e.target.value }))}
                        placeholder="Empilhadeira 01"
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-intervalo">Intervalo de manutenção (dias) *</Label>
                      <Input
                        id="emp-intervalo"
                        type="number"
                        value={configForm.intervalo_manutencao_dias}
                        onChange={e => setConfigForm(p => ({ ...p, intervalo_manutencao_dias: parseInt(e.target.value) || 90 }))}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-marca">Marca</Label>
                      <Input
                        id="emp-marca"
                        value={configForm.marca || ""}
                        onChange={e => setConfigForm(p => ({ ...p, marca: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-modelo">Modelo</Label>
                      <Input
                        id="emp-modelo"
                        value={configForm.modelo || ""}
                        onChange={e => setConfigForm(p => ({ ...p, modelo: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-serie">Número de série</Label>
                      <Input
                        id="emp-serie"
                        value={configForm.numero_serie || ""}
                        onChange={e => setConfigForm(p => ({ ...p, numero_serie: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-status">Situação</Label>
                      <Select
                        value={configForm.ativa ? "ativa" : "inativa"}
                        onValueChange={v => setConfigForm(p => ({ ...p, ativa: v === "ativa" }))}
                      >
                        <SelectTrigger id="emp-status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativa">Ativa</SelectItem>
                          <SelectItem value="inativa">Inativa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-ultima">Data da última manutenção</Label>
                      <Input
                        id="emp-ultima"
                        type="date"
                        value={configForm.data_ultima_manutencao || ""}
                        onChange={e => setConfigForm(p => ({ ...p, data_ultima_manutencao: e.target.value }))}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Label htmlFor="emp-proxima">Data da próxima manutenção</Label>
                      <Input
                        id="emp-proxima"
                        type="date"
                        value={configForm.data_proxima_manutencao || ""}
                        onChange={e => setConfigForm(p => ({ ...p, data_proxima_manutencao: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="emp-obs">Observações</Label>
                    <Textarea
                      id="emp-obs"
                      value={configForm.observacoes || ""}
                      onChange={e => setConfigForm(p => ({ ...p, observacoes: e.target.value }))}
                      rows={2}
                    />
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button variant="outline" size="lg" onClick={() => setEditMode(false)}>
                      Cancelar
                    </Button>
                    <Button
                      size="lg"
                      onClick={() => salvarConfigMutation.mutate(configForm)}
                      disabled={!configForm.nome || salvarConfigMutation.isPending}
                    >
                      {salvarConfigMutation.isPending ? "Salvando…" : "Salvar"}
                    </Button>
                  </div>
                </div>
              </SectionCard>
            )}

            <SectionCard
              titulo="Histórico de manutenções"
              legenda={`${manutencoes.length} registro(s)`}
              icone={Wrench}
              atraso={0.1}
            >
              {manutencoes.length === 0 ? (
                <VazioFluxo icone={Wrench} titulo="Nenhuma manutenção registrada" />
              ) : (
                <ul className="flex min-w-0 flex-col gap-2.5">
                  {manutencoes.map(m => (
                    <li key={m.id} className="flex min-w-0 items-start gap-4 rounded-token bg-fundo p-4">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 flex-none items-center justify-center
                                   rounded-token bg-marca-suave text-marca"
                      >
                        <Wrench className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="rounded-full bg-cartao px-2.5 py-0.5 text-[11px] font-extrabold text-texto-fraco">
                            {m.tipo}
                          </span>
                          <span className="num text-sm font-extrabold text-tinta">
                            {format(parseISO(m.data_manutencao), "dd/MM/yyyy")}
                          </span>
                          {m.responsavel && (
                            <span className="text-xs font-semibold text-texto-apagado">
                              por {m.responsavel}
                            </span>
                          )}
                        </div>
                        {m.descricao && (
                          <p className="mt-1 text-sm font-semibold text-tinta-media">{m.descricao}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
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
            <Button className="bg-atencao hover:bg-atencao" onClick={() => registrarManutencaoMutation.mutate(manutencaoForm)} disabled={registrarManutencaoMutation.isPending}>
              {registrarManutencaoMutation.isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}