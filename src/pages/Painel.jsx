import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, Clock, Package, ShoppingCart, Warehouse, Truck,
  ClipboardCheck, FileText, AlertTriangle, CheckCircle2,
  Activity, Calendar, User, Factory, OctagonX, Sparkles, XCircle
} from "lucide-react";

/* ── helpers ── */
function useNow() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

function calcElapsed(startTime) {
  if (!startTime) return "—";
  const now = new Date();
  const clean = startTime.length > 5 ? startTime.split("T")[1]?.slice(0, 5) : startTime;
  if (!clean) return "—";
  const [h, m] = clean.split(":");
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
  const diff = now - start;
  if (diff < 0) return "0h 00m";
  return `${Math.floor(diff / 3600000)}h ${String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0")}m`;
}

function Avatar({ nome, foto, color = "blue", size = "md" }) {
  const sz = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const colors = { blue: "bg-blue-200 text-blue-600 border-blue-300", amber: "bg-amber-200 text-amber-600 border-amber-300", purple: "bg-purple-200 text-purple-600 border-purple-300", teal: "bg-teal-200 text-teal-600 border-teal-300", red: "bg-red-200 text-red-600 border-red-300" };
  if (foto) return <img src={foto} alt={nome} className={`${sz} rounded-full object-cover border-2 ${colors[color]} flex-shrink-0`} onError={e => { e.target.style.display = "none"; }} />;
  return <div className={`${sz} rounded-full flex items-center justify-center flex-shrink-0 border-2 ${colors[color]}`}><User className="w-3.5 h-3.5" /></div>;
}

function SkeletonCard({ h = "h-24" }) {
  return <div className={`rounded-xl border bg-white ${h} animate-pulse`} />;
}

function KpiCard({ label, value, sub, color = "blue", icon: Icon, link }) {
  const colors = { blue: "text-blue-600", green: "text-green-600", red: "text-red-600", yellow: "text-yellow-600", slate: "text-slate-600", orange: "text-orange-600", teal: "text-teal-600", purple: "text-purple-600" };
  const content = (
    <Card className="hover:shadow-md transition-shadow h-full">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 mb-1 truncate">{label}</p>
            <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          </div>
          {Icon && <Icon className={`w-5 h-5 mt-1 flex-shrink-0 ${colors[color]}`} />}
        </div>
      </CardContent>
    </Card>
  );
  return link ? <Link to={link} className="block">{content}</Link> : content;
}

/* ── Cards ao vivo ── */

function EnvaseAoVivo({ envases, hoje, getPhoto }) {
  const ativos = envases.filter(r => {
    if (!r.inicio || r.data !== hoje) return false;
    return r.sala === "Bio" ? !r.material_retirado : !r.termino;
  }).slice(0, 4);

  return (
    <Link to="/NovoRegistro" className="block h-full">
      <Card className="border-l-4 border-blue-500 hover:shadow-lg transition-shadow h-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Factory className="w-4 h-4 text-blue-500" />
            <span className="font-bold text-slate-800 text-sm">ENVASE EM ANDAMENTO</span>
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full ml-auto">{ativos.length} ativo(s)</span>
          </div>
          {ativos.length === 0 ? (
            <p className="text-slate-400 text-sm italic">Nenhuma operação em andamento</p>
          ) : (
            <div className="space-y-2">
              {ativos.map(r => (
                <div key={r.id} className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2">
                  <Avatar nome={r.operador} foto={getPhoto(r.operador)} color="blue" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{r.descricao_produto || "Produto não especificado"}</p>
                    <p className="text-xs text-slate-500">{r.operador} · Sala {r.sala}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-bold text-blue-600 text-sm">{calcElapsed(r.inicio)}</p>
                    {r.quantidade_produzida > 0 && <p className="text-xs text-green-600">{r.quantidade_produzida} un.</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function CheckoutAoVivo({ checkoutItems, checkoutProgs, hoje, getPhoto }) {
  const todayIds = checkoutProgs.filter(p => p.data_programada === hoje).map(p => p.id);
  const emAndamento = checkoutItems
    .filter(i => i.hora_inicio && !i.hora_termino && i.status === "Em Andamento" && todayIds.includes(i.programacao_id))
    .slice(0, 4);
  const criticos = checkoutItems.filter(i => i.critico && i.status !== "Concluído" && todayIds.includes(i.programacao_id));

  return (
    <Link to="/Checkout" className="block h-full">
      <Card className="border-l-4 border-purple-500 hover:shadow-lg transition-shadow h-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-4 h-4 text-purple-500" />
            <span className="font-bold text-slate-800 text-sm">CHECK-OUT EM ANDAMENTO</span>
            {criticos.length > 0
              ? <Badge className="bg-red-500 text-white text-xs ml-auto animate-pulse">{criticos.length} crítico(s)</Badge>
              : <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full ml-auto">{emAndamento.length} ativo(s)</span>}
          </div>
          {emAndamento.length === 0 ? (
            <p className="text-slate-400 text-sm italic">Nenhum check-out em andamento</p>
          ) : (
            <div className="space-y-2">
              {emAndamento.map(item => (
                <div key={item.id} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${item.critico ? "bg-red-50" : "bg-purple-50"}`}>
                  <Avatar nome={item.operador} foto={getPhoto(item.operador)} color={item.critico ? "red" : "purple"} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-slate-800 text-sm">{item.numero_pedido}</p>
                      {item.critico && <Badge className="bg-red-500 text-white text-[10px] px-1 py-0">CRÍTICO</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{item.cliente} · {item.operador}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-mono font-bold text-sm ${item.critico ? "text-red-600" : "text-purple-600"}`}>{calcElapsed(item.hora_inicio)}</p>
                    {item.data_entrega && <p className="text-[10px] text-slate-400">Entrega: {format(new Date(item.data_entrega + "T00:00:00"), "dd/MM")}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function EmpilhadeiraAoVivo({ empilhaLinhas, empilhaProgs, empilhaParadas, hoje, getPhoto }) {
  const todayIds = empilhaProgs.filter(p => p.data_programada === hoje).map(p => p.id);
  const linhasAtivas = [
    ...empilhaLinhas.filter(l => todayIds.includes(l.programacao_id) && l.tipo_linha === "Crítico" && l.status === "Em Andamento"),
    ...empilhaLinhas.filter(l => todayIds.includes(l.programacao_id) && l.tipo_linha !== "Crítico" && l.status === "Em Andamento"),
  ].slice(0, 4);
  const paradaAberta = empilhaParadas.find(p => p.data === hoje && !p.hora_fim);

  return (
    <Link to="/Empilhadeira" className="block h-full">
      <Card className="border-l-4 border-amber-500 hover:shadow-lg transition-shadow h-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Warehouse className="w-4 h-4 text-amber-500" />
            <span className="font-bold text-slate-800 text-sm">EMPILHADEIRA EM ANDAMENTO</span>
            {paradaAberta
              ? <Badge className="bg-red-500 text-white text-xs ml-auto animate-pulse">⚠ Parada</Badge>
              : <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full ml-auto">{linhasAtivas.length} ativo(s)</span>}
          </div>
          {paradaAberta && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2 flex items-center gap-2">
              <OctagonX className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-red-700 text-xs font-semibold">{paradaAberta.tipo} desde {paradaAberta.hora_inicio}</p>
            </div>
          )}
          {linhasAtivas.length === 0 && !paradaAberta ? (
            <p className="text-slate-400 text-sm italic">Empilhadeira disponível</p>
          ) : (
            <div className="space-y-2">
              {linhasAtivas.map(l => {
                const isCrit = l.tipo_linha === "Crítico";
                return (
                  <div key={l.id} className={`rounded-lg px-3 py-2 ${isCrit ? "bg-red-50" : "bg-amber-50"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {isCrit && <Badge className="bg-red-500 text-white text-[10px] px-1 py-0">CRÍTICO</Badge>}
                      <p className="font-bold text-slate-800 text-sm truncate flex-1">{l.descricao_produto || "Sem descrição"}</p>
                      {l.hora_inicio && <p className={`font-mono font-bold text-sm flex-shrink-0 ${isCrit ? "text-red-600" : "text-amber-600"}`}>{calcElapsed(l.hora_inicio)}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Empilhador */}
                      <div className="flex items-center gap-1.5">
                        <Avatar nome={l.operador_empilhadeira} foto={getPhoto(l.operador_empilhadeira)} color={isCrit ? "red" : "amber"} size="sm" />
                        <span className="text-xs text-slate-600 font-medium">{l.operador_empilhadeira || "—"}</span>
                      </div>
                      {/* Ajudante */}
                      {l.operador_ajudante && l.operador_ajudante !== "nenhum" && (
                        <div className="flex items-center gap-1.5">
                          <Avatar nome={l.operador_ajudante} foto={getPhoto(l.operador_ajudante)} color="amber" size="sm" />
                          <span className="text-xs text-slate-500">{l.operador_ajudante}</span>
                        </div>
                      )}
                      {/* Local */}
                      <div className="flex items-center gap-1 ml-auto">
                        {l.rua_torre && <Badge className="bg-amber-100 text-amber-700 text-[10px]">{l.rua_torre}</Badge>}
                        {l.deposito && <Badge className="bg-slate-100 text-slate-600 text-[10px]">{l.deposito}</Badge>}
                      </div>
                    </div>
                    {l.quantidade && (
                      <p className="text-xs text-slate-500 mt-1">{l.quantidade} un.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function RecebimentoAoVivo({ recebimentos, recebimentoParticipantes, getPhoto }) {
  const emAndamento = recebimentos.filter(r => r.status === "Em andamento").slice(0, 4);

  // monta mapa de participantes por recebimento_id
  const partMap = {};
  recebimentoParticipantes.forEach(p => {
    if (!partMap[p.recebimento_id]) partMap[p.recebimento_id] = [];
    partMap[p.recebimento_id].push(p);
  });

  return (
    <Link to="/Recebimento" className="block h-full">
      <Card className="border-l-4 border-teal-500 hover:shadow-lg transition-shadow h-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-4 h-4 text-teal-500" />
            <span className="font-bold text-slate-800 text-sm">RECEBIMENTO EM ANDAMENTO</span>
            <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full ml-auto">{emAndamento.length} ativo(s)</span>
          </div>
          {emAndamento.length === 0 ? (
            <p className="text-slate-400 text-sm italic">Sem recebimento em andamento</p>
          ) : (
            <div className="space-y-2">
              {emAndamento.map(r => {
                const parts = partMap[r.id] || [];
                return (
                  <div key={r.id} className="bg-teal-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-slate-800 text-sm flex-1">{r.numero_documento}</p>
                      <p className="font-mono font-bold text-teal-600 text-sm flex-shrink-0">{calcElapsed(r.datetime_inicio?.split("T")[1]?.slice(0, 5))}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className="bg-teal-100 text-teal-700 text-[10px]">{r.tipo}</Badge>
                      {r.prioridade === "Urgente" && <Badge className="bg-red-100 text-red-700 text-[10px] animate-pulse">URGENTE</Badge>}
                      {r.prioridade === "Alta" && <Badge className="bg-orange-100 text-orange-700 text-[10px]">ALTA</Badge>}
                    </div>
                    {/* Participantes com fotos */}
                    {parts.length > 0 ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {parts.slice(0, 4).map(p => (
                          <div key={p.id} className="flex items-center gap-1">
                            <Avatar nome={p.operator_nome} foto={getPhoto(p.operator_nome)} color="teal" size="sm" />
                            <span className="text-xs text-slate-600">{p.operator_nome}</span>
                          </div>
                        ))}
                      </div>
                    ) : r.coordenador_nome ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar nome={r.coordenador_nome} foto={getPhoto(r.coordenador_nome)} color="teal" size="sm" />
                        <span className="text-xs text-slate-600">{r.coordenador_nome}</span>
                      </div>
                    ) : null}
                    {r.fornecedor_nome && <p className="text-xs text-slate-400 mt-1 truncate">{r.fornecedor_nome}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function OcorrenciasCard({ empilhaOcorrencias, recOcorrencias, getPhoto }) {
  const ocEmpilha = empilhaOcorrencias.filter(o => !o.resolvido).slice(0, 3);
  const ocRec = recOcorrencias.filter(o => !o.resolvido).slice(0, 3);
  const todas = [
    ...ocEmpilha.map(o => ({ ...o, modulo: "Empilhadeira" })),
    ...ocRec.map(o => ({ ...o, modulo: "Recebimento" })),
  ].slice(0, 5);

  if (todas.length === 0) return null;

  return (
    <Card className="border-l-4 border-orange-500">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <span className="font-bold text-slate-800 text-sm">OCORRÊNCIAS EM ABERTO</span>
          <Badge className="bg-orange-500 text-white text-xs ml-auto">{todas.length}</Badge>
        </div>
        <div className="space-y-2">
          {todas.map(o => (
            <div key={o.id} className="flex items-start gap-3 bg-orange-50 rounded-lg px-3 py-2.5">
              <Avatar nome={o.registrado_por} foto={getPhoto(o.registrado_por)} color="red" size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <Badge className="bg-orange-200 text-orange-800 text-[10px]">{o.tipo || "Outro"}</Badge>
                  <Badge className="bg-slate-100 text-slate-600 text-[10px]">{o.modulo}</Badge>
                  <span className="text-[10px] text-slate-400 ml-auto">{o.data} {o.hora || ""}</span>
                </div>
                <p className="text-xs text-slate-700 line-clamp-2">{o.descricao}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Registrado por <span className="font-medium">{o.registrado_por}</span></p>
              </div>
              <div className="flex-shrink-0">
                <XCircle className="w-4 h-4 text-orange-400" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertaItem({ label, count, link, cor = "red" }) {
  if (!count) return null;
  const corMap = { red: "text-red-600 bg-red-50", orange: "text-orange-600 bg-orange-50", yellow: "text-yellow-700 bg-yellow-50", blue: "text-blue-600 bg-blue-50" };
  return (
    <Link to={link} className={`flex items-center justify-between px-3 py-2 rounded-lg ${corMap[cor]} hover:opacity-80 transition-opacity`}>
      <span className="text-sm font-medium">{label}</span>
      <Badge className={`ml-2 ${cor === "red" ? "bg-red-600" : cor === "orange" ? "bg-orange-500" : cor === "yellow" ? "bg-yellow-500" : "bg-blue-600"} text-white`}>{count}</Badge>
    </Link>
  );
}

/* ── PAINEL PRINCIPAL ── */
export default function Painel() {
  const { user } = useAuth();
  const role = user?.role === "user" ? "operator" : (user?.role || "operator");
  const isAdmin = role === "admin";
  const now = useNow();

  const hoje = format(now, "yyyy-MM-dd");
  const semanaInicio = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

  /* ── Queries — fetch imediato ao montar, polling escalonado para evitar 429 ── */
  const { data: envases = [], isLoading: l1 } = useQuery({ queryKey: ["painel-envases"], queryFn: () => base44.entities.EnvaseRecord.list("-data", 100), refetchInterval: 30000 });
  const { data: checkoutItems = [] } = useQuery({ queryKey: ["painel-checkout-items"], queryFn: () => base44.entities.CheckoutItem.list("-created_date", 100), refetchInterval: 35000 });
  const { data: checkoutProgs = [] } = useQuery({ queryKey: ["painel-checkout-progs"], queryFn: () => base44.entities.CheckoutProgramacao.list("-data_programada", 10), refetchInterval: 60000 });
  const { data: empilhaLinhas = [] } = useQuery({ queryKey: ["painel-empilha-linhas"], queryFn: () => base44.entities.EmpilhaLinha.list("-created_date", 100), refetchInterval: 40000 });
  const { data: empilhaParadas = [] } = useQuery({ queryKey: ["painel-empilha-paradas"], queryFn: () => base44.entities.EmpilhadeiraParada.list("-created_date", 30), refetchInterval: 45000 });
  const { data: empilhaProgs = [] } = useQuery({ queryKey: ["painel-empilha-progs"], queryFn: () => base44.entities.EmpilhaProgramacao.list("-data_programada", 10), refetchInterval: 60000 });
  const { data: recebimentos = [] } = useQuery({ queryKey: ["painel-recebimentos"], queryFn: () => base44.entities.Recebimento.list("-created_date", 50), refetchInterval: 35000 });
  const { data: empilhaOcorrencias = [] } = useQuery({ queryKey: ["painel-empilha-ocorr"], queryFn: () => base44.entities.EmpilhaOcorrencia.list("-created_date", 50), refetchInterval: 50000 });
  const { data: operators = [] } = useQuery({ queryKey: ["painel-operators"], queryFn: () => base44.entities.Operator.list(), refetchInterval: 120000 });

  /* ── Queries de KPI (polling lento) ── */
  const { data: recOcorrencias = [] } = useQuery({ queryKey: ["painel-rec-ocorr"], queryFn: () => base44.entities.RecebimentoOcorrencia.list("-created_date", 50), refetchInterval: 60000 });
  const { data: checklists = [] } = useQuery({ queryKey: ["painel-checklists"], queryFn: () => base44.entities.ChecklistRecebimento.list("-created_date", 100), refetchInterval: 120000 });
  const { data: limpezas = [] } = useQuery({ queryKey: ["painel-limpezas"], queryFn: () => base44.entities.LimpezaProgramacao.list("-data_prevista", 100), refetchInterval: 120000 });
  const { data: nfs = [] } = useQuery({ queryKey: ["painel-nfs"], queryFn: () => base44.entities.NotaFiscalArquivo.list("-created_date", 50), refetchInterval: 120000 });
  const { data: empilhaConfig = [] } = useQuery({ queryKey: ["painel-empilha-config"], queryFn: () => base44.entities.EmpilhadeiraConfig.list(), refetchInterval: 300000 });
  const { data: recebimentoParticipantes = [] } = useQuery({ queryKey: ["painel-rec-participantes"], queryFn: () => base44.entities.RecebimentoParticipante.list("-created_date", 100), refetchInterval: 60000 });

  const loading = l1;

  const getPhoto = (nome) => operators.find(op => op.nome === nome)?.foto_url || null;

  /* ── KPIs ── */
  const checklistsHoje = checklists.filter(c => c.created_date?.startsWith(hoje));
  const notaMedia = checklistsHoje.length > 0 ? Math.round(checklistsHoje.reduce((s, c) => s + (c.nota_final || 0), 0) / checklistsHoje.length) : null;
  const limpezasHoje = limpezas.filter(l => l.data_prevista === hoje);
  const limpezasConclHoje = limpezasHoje.filter(l => l.status === "Concluído");
  const limpezasAtrasadas = limpezas.filter(l => l.data_prevista < hoje && l.status !== "Concluído");
  const nfsHoje = nfs.filter(n => n.created_date?.startsWith(hoje));

  const envasesSemana = envases.filter(e => e.data >= semanaInicio);
  const checkoutSemana = checkoutItems.filter(e => e.status === "Concluído" && e.updated_date >= semanaInicio);
  const empilhaSemana = empilhaLinhas.filter(e => e.status === "Concluído" && e.updated_date >= semanaInicio);
  const recSemana = recebimentos.filter(r => r.created_date >= semanaInicio);
  const checklistsSemana = checklists.filter(c => c.created_date >= semanaInicio);
  const notaMediaSemana = checklistsSemana.length > 0 ? Math.round(checklistsSemana.reduce((s, c) => s + (c.nota_final || 0), 0) / checklistsSemana.length) : null;
  const limpezasSemana = limpezas.filter(l => l.data_prevista >= semanaInicio);
  const limpezasConclSemana = limpezasSemana.filter(l => l.status === "Concluído");
  const nfsSemana = nfs.filter(n => n.created_date >= semanaInicio);

  const assEmpilha = empilhaLinhas.filter(l => l.status === "Concluído" && !l.assinatura_lider).length;
  const assLimpeza = limpezas.filter(l => l.status === "Concluído" && l.assinatura_responsavel && !l.assinatura_lider).length;
  const assRecebimento = recebimentos.filter(r => r.status === "Concluído" && !r.assinatura_lider).length;
  const totalAssinaturas = assEmpilha + assLimpeza + assRecebimento;
  const ocAbertasEmpilha = empilhaOcorrencias.filter(o => !o.resolvido).length;
  const ocAbertasRec = recOcorrencias.filter(o => !o.resolvido).length;
  const totalOcorrencias = ocAbertasEmpilha + ocAbertasRec;
  const alertasManut = empilhaConfig.filter(e => e.data_proxima_manutencao && Math.ceil((new Date(e.data_proxima_manutencao) - now) / (1000 * 60 * 60 * 24)) <= 7).length;
  const checklistsReprovHoje = checklistsHoje.filter(c => (c.nota_final || 0) < 0).length;
  const nfsPendentes3dias = nfs.filter(n => !n.arquivo_url && (now - new Date(n.created_date)) > 3 * 24 * 60 * 60 * 1000).length;
  const temPendencias = totalAssinaturas + alertasManut + limpezasAtrasadas.length + nfsPendentes3dias + checklistsReprovHoje > 0;

  const diaSemanaCapit = (() => { const s = format(now, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }); return s.charAt(0).toUpperCase() + s.slice(1); })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-6 space-y-6">

      {/* CABEÇALHO */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Painel Geral — Interlub</h1>
              <p className="text-sm text-slate-500">{diaSemanaCapit}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
              <p className="text-3xl font-mono font-bold text-blue-700">{format(now, "HH:mm:ss")}</p>
            </div>
            <p className="text-xs text-slate-500 font-medium">{user?.full_name} · {isAdmin ? "Admin" : "Operador"}</p>
          </div>
        </div>
      </div>

      {/* ACONTECENDO AGORA */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" /> Acontecendo agora
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <SkeletonCard key={i} h="h-36" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EnvaseAoVivo envases={envases} hoje={hoje} getPhoto={getPhoto} />
            <CheckoutAoVivo checkoutItems={checkoutItems} checkoutProgs={checkoutProgs} hoje={hoje} getPhoto={getPhoto} />
            <EmpilhadeiraAoVivo empilhaLinhas={empilhaLinhas} empilhaProgs={empilhaProgs} empilhaParadas={empilhaParadas} hoje={hoje} getPhoto={getPhoto} />
            <RecebimentoAoVivo recebimentos={recebimentos} recebimentoParticipantes={recebimentoParticipantes} getPhoto={getPhoto} />
          </div>
        )}
      </div>

      {/* OCORRÊNCIAS EM ABERTO */}
      {totalOcorrencias > 0 && (
        <OcorrenciasCard empilhaOcorrencias={empilhaOcorrencias} recOcorrencias={recOcorrencias} getPhoto={getPhoto} />
      )}

      {/* KPIs DO DIA */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Hoje — {format(now, "dd/MM/yyyy")}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Envases hoje"
            value={envases.filter(e => e.data === hoje).length}
            sub={`${envases.filter(e => e.data === hoje && e.termino).length} concluídos`}
            color="blue"
            icon={Factory}
            link="/NovoRegistro"
          />
          <KpiCard
            label="Produção hoje (un.)"
            value={envases.filter(e => e.data === hoje).reduce((s, e) => s + (e.quantidade_produzida || 0), 0).toLocaleString("pt-BR")}
            sub="unidades produzidas"
            color="green"
            icon={Package}
            link="/Registros"
          />
          <KpiCard
            label="Checklists realizados"
            value={checklistsHoje.length}
            sub={notaMedia !== null ? `Nota média: ${notaMedia}` : "Nenhum hoje"}
            color={notaMedia === null ? "slate" : notaMedia >= 80 ? "green" : notaMedia >= 0 ? "yellow" : "red"}
            icon={ClipboardCheck}
            link="/ChecklistRecebimento"
          />
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 mb-1">Limpeza hoje</p>
              <p className="text-3xl font-bold text-green-600">{limpezasConclHoje.length}/{limpezasHoje.length}</p>
              {limpezasAtrasadas.length > 0 && <p className="text-xs text-red-500 mt-1">{limpezasAtrasadas.length} atrasada(s)</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* PENDÊNCIAS (admin only) */}
      {isAdmin && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Requer atenção
          </h2>
          {temPendencias ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <AlertaItem label="Assinaturas do líder pendentes" count={totalAssinaturas} link="/Empilhadeira" cor="orange" />
              <AlertaItem label="Manutenção de empilhadeira próxima" count={alertasManut} link="/Empilhadeira" cor="yellow" />
              <AlertaItem label="Limpezas atrasadas" count={limpezasAtrasadas.length} link="/Dashboard" cor="red" />
              <AlertaItem label="NFs sem foto (+3 dias)" count={nfsPendentes3dias} link="/NotasFiscais" cor="orange" />
              <AlertaItem label="Checklists reprovados hoje" count={checklistsReprovHoje} link="/ChecklistRecebimento" cor="red" />
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-4 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Tudo em dia — nenhuma pendência no momento!</span>
            </div>
          )}
        </div>
      )}

      {/* RESUMO DA SEMANA */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Esta semana
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Envases na semana" value={envasesSemana.length} sub={`${envasesSemana.reduce((s, e) => s + (e.quantidade_produzida || 0), 0).toLocaleString("pt-BR")} un.`} color="blue" icon={Factory} />
          <KpiCard label="Checkouts concluídos" value={checkoutSemana.length} color="purple" icon={ShoppingCart} />
          <KpiCard label="Linhas movimentadas" value={empilhaSemana.length} color="orange" icon={Warehouse} />
          <KpiCard label="Recebimentos na semana" value={recSemana.length} color="teal" icon={Truck} />
          <KpiCard
            label="Checklists · nota média"
            value={checklistsSemana.length}
            sub={notaMediaSemana !== null ? `Média: ${notaMediaSemana}` : "—"}
            color={notaMediaSemana === null ? "slate" : notaMediaSemana >= 80 ? "green" : "yellow"}
            icon={ClipboardCheck}
          />
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 mb-1">Limpezas realizadas</p>
              <p className="text-3xl font-bold text-green-600">{limpezasConclSemana.length}/{limpezasSemana.length}</p>
              {limpezasSemana.length > 0 && (
                <div className="mt-2">
                  <Progress value={(limpezasConclSemana.length / limpezasSemana.length) * 100} className="h-1.5" />
                  <p className="text-xs text-slate-400 mt-1">{Math.round((limpezasConclSemana.length / limpezasSemana.length) * 100)}% concluído</p>
                </div>
              )}
            </CardContent>
          </Card>
          <KpiCard label="NFs arquivadas na semana" value={nfsSemana.length} color="blue" icon={FileText} />
        </div>
      </div>
    </div>
  );
}