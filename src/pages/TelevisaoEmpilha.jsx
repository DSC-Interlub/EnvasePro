import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Warehouse, User, MapPin, Package, Clock, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { ensureTvSession } from "@/api/tvSessionClient";

export default function TelevisaoEmpilha() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const queryClient = useQueryClient();

  useEffect(() => {
    ensureTvSession().then((res) => {
      if (res?.authenticated) {
        queryClient.invalidateQueries();
      }
    });
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [queryClient]);

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: programacoes } = useQuery({
    queryKey: ["empilha-prog-tv"],
    queryFn: () => base44.entities.EmpilhaProgramacao.list(),
    refetchInterval: 10000,
    initialData: [],
  });

  const { data: allLinhas } = useQuery({
    queryKey: ["empilha-linhas-tv"],
    queryFn: () => base44.entities.EmpilhaLinha.list("-updated_date", 200),
    refetchInterval: 10000,
    initialData: [],
  });

  const { data: operators } = useQuery({
    queryKey: ["operators-tv"],
    queryFn: () => base44.entities.Operator.list(),
    refetchInterval: 60000,
    initialData: [],
  });

  const { data: ocorrencias } = useQuery({
    queryKey: ["empilha-ocorrencias-tv"],
    queryFn: () => base44.entities.EmpilhaOcorrencia.list("-data"),
    refetchInterval: 15000,
    initialData: [],
  });

  const progHoje = programacoes.filter(p => p.data_programada === today);
  const progHojeIds = progHoje.map(p => p.id);
  const linhasHoje = allLinhas.filter(l => progHojeIds.includes(l.programacao_id));

  const linhasEmAndamento = linhasHoje
    .filter(l => l.status === "Em Andamento")
    .sort((a, b) => (b.critico ? 1 : 0) - (a.critico ? 1 : 0));

  const ocorrenciasHoje = ocorrencias.filter(o => o.data === today && !o.resolvido);

  // KPIs
  const totalLinhas = linhasHoje.length;
  const concluidas = linhasHoje.filter(l => l.status === "Concluído").length;
  const emAndamento = linhasHoje.filter(l => l.status === "Em Andamento").length;
  const criticosPendentes = linhasHoje.filter(l => l.critico && l.status !== "Concluído").length;

  // Tempo médio
  const linhasComTempo = linhasHoje.filter(l => l.tempo_total && l.status === "Concluído");
  let tempoMedioMin = 0;
  if (linhasComTempo.length > 0) {
    const totalMins = linhasComTempo.reduce((sum, l) => {
      const [h, m] = l.tempo_total.split(":").map(Number);
      return sum + h * 60 + m;
    }, 0);
    tempoMedioMin = Math.round(totalMins / linhasComTempo.length);
  }
  const tempoMedio = tempoMedioMin > 0 ? `${Math.floor(tempoMedioMin / 60)}h${(tempoMedioMin % 60).toString().padStart(2, "0")}m` : "—";

  const getOperatorPhoto = (nome) => operators.find(o => o.nome === nome)?.foto_url || null;

  const calculateElapsed = (startTime) => {
    if (!startTime) return "—";
    const now = new Date();
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const diff = now - start;
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}h ${mins.toString().padStart(2, "0")}m`;
  };

  return (
    <div className="min-h-screen h-screen bg-gradient-to-br from-slate-950 via-amber-950 to-slate-950 p-3 overflow-hidden flex flex-col">
      <style>{`
        @keyframes pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
        .animate-pulse-slow { animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.5s ease-out; }
      `}</style>

      <div className="max-w-[1920px] mx-auto w-full flex flex-col h-full gap-2">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-600 via-amber-700 to-orange-700 rounded-2xl p-3 shadow-xl flex-shrink-0">
          <div className="relative flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Warehouse className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Empilhadeira — Interlub</h1>
                <p className="text-amber-100 text-sm font-medium">
                  {format(currentTime, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
            <div className="text-4xl font-black text-white font-mono tabular-nums">
              {format(currentTime, "HH:mm:ss")}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-5 gap-2 flex-shrink-0">
          {[
            { label: "Total Linhas", value: totalLinhas, color: "from-slate-600 to-slate-700" },
            { label: "Concluídas", value: concluidas, color: "from-emerald-500 to-emerald-600" },
            { label: "Em Andamento", value: emAndamento, color: "from-blue-500 to-blue-600" },
            { label: "Críticos Pend.", value: criticosPendentes, color: "from-red-500 to-red-600" },
            { label: "Tempo Médio", value: tempoMedio, color: "from-purple-500 to-purple-600" },
          ].map(({ label, value, color }) => (
            <Card key={label} className={`bg-gradient-to-br ${color} border-0 shadow-lg`}>
              <CardContent className="p-2">
                <p className="text-white/80 text-[10px] font-semibold">{label}</p>
                <p className="text-2xl font-black text-white tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Linhas em andamento */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1 h-6 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full"></div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-amber-400" />
              EM ANDAMENTO ({linhasEmAndamento.length})
            </h2>
          </div>

          {linhasEmAndamento.length === 0 ? (
            <Card className="bg-slate-900/50 border-slate-700">
              <CardContent className="p-6 text-center">
                <Warehouse className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                <p className="text-slate-400 font-semibold">Nenhuma linha em andamento</p>
              </CardContent>
            </Card>
          ) : (
            linhasEmAndamento.map((linha, index) => {
              const foto1 = getOperatorPhoto(linha.operador_empilhadeira);
              const foto2 = getOperatorPhoto(linha.operador_ajudante);
              return (
                <Card
                  key={linha.id}
                  className={`backdrop-blur-xl shadow-xl animate-slide-up ${
                    linha.critico
                      ? "bg-gradient-to-r from-red-900/90 to-red-800/90 border-l-4 border-red-500"
                      : "bg-gradient-to-r from-slate-900/90 to-slate-800/90 border-l-4 border-amber-500"
                  }`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <CardContent className="p-3">
                    <div className="grid grid-cols-7 gap-3 items-center">
                      {/* Status crítico */}
                      <div>
                        {linha.critico && (
                          <Badge className="bg-red-600 text-white text-xs font-black flex items-center gap-1 animate-pulse-slow w-fit">
                            <AlertCircle className="w-3 h-3" /> CRÍTICO
                          </Badge>
                        )}
                        <p className="text-slate-400 text-[10px] font-bold uppercase mt-1">Depósito</p>
                        <p className="text-lg font-black text-white">{linha.deposito || "—"}</p>
                        <p className="text-slate-300 text-sm flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {linha.rua_torre || "—"}
                        </p>
                      </div>

                      {/* Produto */}
                      <div className="col-span-2">
                        <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Produto</p>
                        <p className="text-xl font-bold text-white leading-tight">{linha.descricao_produto || "Sem descrição"}</p>
                        {linha.numero_item && (
                          <p className="text-slate-400 font-mono text-xs mt-1">{linha.numero_item}</p>
                        )}
                        {linha.quantidade && (
                          <p className="text-amber-400 font-semibold text-sm">{linha.quantidade} un.</p>
                        )}
                      </div>

                      {/* Empilhador */}
                      <div>
                        <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Empilhador</p>
                        <div className="flex items-center gap-2">
                          {foto1 ? (
                            <img src={foto1} alt={linha.operador_empilhadeira} className="w-10 h-10 rounded-full object-cover border-2 border-amber-400" />
                          ) : (
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                              <User className="w-5 h-5 text-amber-400" />
                            </div>
                          )}
                          <p className="text-base font-black text-white leading-tight">{linha.operador_empilhadeira || "—"}</p>
                        </div>
                      </div>

                      {/* Ajudante */}
                      <div>
                        <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Ajudante</p>
                        {linha.operador_ajudante && linha.operador_ajudante !== "nenhum" ? (
                          <div className="flex items-center gap-2">
                            {foto2 ? (
                              <img src={foto2} alt={linha.operador_ajudante} className="w-9 h-9 rounded-full object-cover border-2 border-slate-400" />
                            ) : (
                              <div className="w-9 h-9 bg-slate-500/20 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                            <p className="text-base font-bold text-slate-300 leading-tight">{linha.operador_ajudante}</p>
                          </div>
                        ) : (
                          <p className="text-slate-500 text-sm">—</p>
                        )}
                      </div>

                      {/* Tempo */}
                      <div className="col-span-2 text-right">
                        <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Tempo Decorrido</p>
                        <div className="flex items-center justify-end gap-2">
                          <Clock className={`w-7 h-7 ${linha.critico ? "text-red-400" : "text-amber-400"} animate-pulse-slow`} />
                          <div>
                            <p className={`text-5xl font-black ${linha.critico ? "text-red-400" : "text-amber-400"} font-mono tabular-nums leading-tight`}>
                              {calculateElapsed(linha.hora_inicio)}
                            </p>
                            {linha.hora_inicio && (
                              <p className="text-slate-400 text-[10px] font-semibold mt-1">desde {linha.hora_inicio}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Ocorrências não resolvidas */}
          {ocorrenciasHoje.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2 px-1 mb-2">
                <div className="w-1 h-5 bg-orange-500 rounded-full"></div>
                <h2 className="text-base font-black text-orange-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> OCORRÊNCIAS NÃO RESOLVIDAS ({ocorrenciasHoje.length})
                </h2>
              </div>
              <div className="grid gap-2">
                {ocorrenciasHoje.slice(0, 3).map(o => (
                  <Card key={o.id} className="bg-orange-900/40 border-l-4 border-orange-500 backdrop-blur-xl">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-orange-700 text-white text-xs">{o.tipo}</Badge>
                            <span className="text-orange-300 text-xs">{o.hora} — {o.registrado_por}</span>
                          </div>
                          <p className="text-white text-sm font-medium mt-0.5">{o.descricao}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}