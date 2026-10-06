import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Factory, Package, Clock, User, TrendingUp, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Warehouse, AlertTriangle, OctagonX, BarChart2, Droplets, Layers, Circle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ImportacoesCard from "@/components/tv/ImportacoesCard";

/* ===================== UTILITÁRIOS ===================== */
function calcElapsed(startTime) {
  if (!startTime) return "—";
  const now = new Date();
  const [h, m] = startTime.split(':');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
  const diff = now - start;
  if (diff < 0) return "0h 00m";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

/* ===================== SLIDE 1: ENVASE ===================== */
function SlideEnvase({ envaseRecords, loadingEnvase, getProductCertifications, getOperatorPhoto, markMaterialAsRetirado, monthlyKpis, monthlyKpisByCategory, importacoes }) {
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-2">
          <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"></div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Factory className="w-5 h-5 text-blue-400" />
            ENVASE EM ANDAMENTO
          </h2>
          <p className="text-blue-300 text-xs font-medium ml-2">
            {envaseRecords.length} {envaseRecords.length === 1 ? 'operação ativa' : 'operações ativas'}
          </p>
        </div>

        {/* KPIs do Mês — fileira única */}
        <div className="grid grid-cols-6 gap-2">
          <Card className="bg-gradient-to-br from-emerald-700/80 to-emerald-800/80 border-emerald-600/40 shadow-lg">
            <CardContent className="p-2">
              <p className="text-emerald-200 text-[9px] font-semibold uppercase tracking-wide">Produção Total</p>
              <p className="text-2xl font-black text-white tabular-nums leading-tight">{monthlyKpis.total.toLocaleString('pt-BR')}</p>
              <p className="text-emerald-300 text-[9px]">{monthlyKpis.totalRegistros} reg.</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-700/80 to-green-800/80 border-green-600/40 shadow-lg">
            <CardContent className="p-2">
              <p className="text-green-200 text-[9px] font-semibold uppercase tracking-wide">Produção Bio</p>
              <p className="text-2xl font-black text-white tabular-nums leading-tight">{monthlyKpis.bio.toLocaleString('pt-BR')}</p>
              <p className="text-green-300 text-[9px]">{monthlyKpis.bioRegistros} reg.</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-700/80 to-blue-800/80 border-blue-600/40 shadow-lg">
            <CardContent className="p-2">
              <p className="text-blue-200 text-[9px] font-semibold uppercase tracking-wide">Produção Industrial</p>
              <p className="text-2xl font-black text-white tabular-nums leading-tight">{monthlyKpis.industrial.toLocaleString('pt-BR')}</p>
              <p className="text-blue-300 text-[9px]">{monthlyKpis.industrialRegistros} reg.</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-700/80 to-blue-800/80 border-blue-600/40 shadow-lg">
            <CardContent className="p-2">
              <p className="text-blue-200 text-[9px] font-semibold uppercase tracking-wide">Óleo do Mês</p>
              <p className="text-2xl font-black text-white tabular-nums leading-tight">{monthlyKpisByCategory.oleo.toLocaleString('pt-BR')}</p>
              <Droplets className="w-5 h-5 text-blue-300/80 mt-0.5" />
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-700/80 to-amber-800/80 border-amber-600/40 shadow-lg">
            <CardContent className="p-2">
              <p className="text-amber-200 text-[9px] font-semibold uppercase tracking-wide">Graxa do Mês</p>
              <p className="text-2xl font-black text-white tabular-nums leading-tight">{monthlyKpisByCategory.graxa.toLocaleString('pt-BR')}</p>
              <Layers className="w-5 h-5 text-amber-300/80 mt-0.5" />
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-700/80 to-green-800/80 border-green-600/40 shadow-lg">
            <CardContent className="p-2">
              <p className="text-green-200 text-[9px] font-semibold uppercase tracking-wide">Pasta do Mês</p>
              <p className="text-2xl font-black text-white tabular-nums leading-tight">{monthlyKpisByCategory.pasta.toLocaleString('pt-BR')}</p>
              <Circle className="w-5 h-5 text-green-300/80 mt-0.5" />
            </CardContent>
          </Card>
        </div>

        {/* Importações */}
        <ImportacoesCard importacoes={importacoes} />

      {loadingEnvase ? (
          <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700"><CardContent className="p-4 text-center"><Factory className="w-8 h-8 mx-auto text-slate-600 mb-2 animate-pulse" /><p className="text-slate-400 text-sm font-semibold">Carregando...</p></CardContent></Card>
        ) : envaseRecords.length === 0 ? (
          <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700"><CardContent className="p-8 text-center"><Factory className="w-16 h-16 mx-auto text-slate-700 mb-3" /><p className="text-slate-400 text-lg font-bold">Nenhuma operação em andamento</p></CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {envaseRecords.map((record, index) => {
              const certifications = getProductCertifications(record.codigo_produto);
              const operatorPhoto = getOperatorPhoto(record.operador);
              return (
                <Card key={record.id} className="bg-gradient-to-r from-slate-900/90 to-slate-800/90 backdrop-blur-xl border-l-4 border-blue-500 shadow-xl animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-8 gap-3 items-center">
                      <div>
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Sala</p>
                        <Badge className={`text-base px-3 py-1 font-black ${record.sala === "Bio" ? "bg-gradient-to-r from-green-600 to-green-700 text-white" : "bg-gradient-to-r from-blue-600 to-blue-700 text-white"}`}>{record.sala}</Badge>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Operador</p>
                        <div className="flex items-center gap-2">
                          {operatorPhoto ? (
                            <img src={operatorPhoto} alt={record.operador} className="w-10 h-10 rounded-full object-cover border-2 border-blue-400" onError={(e) => { e.target.style.display = 'none'; }} />
                          ) : (
                            <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-blue-400" /></div>
                          )}
                          <p className="text-2xl font-black text-white leading-tight">{record.operador}</p>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Produto</p>
                        <p className="text-2xl font-bold text-white leading-tight mb-1">{record.descricao_produto || "Produto não especificado"}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-400 font-mono text-[10px]">OP: {record.op || "N/A"}</span>
                          {record.quantidade_produzida > 0 && <span className="text-emerald-400 font-semibold text-[10px]">{record.quantidade_produzida.toLocaleString('pt-BR')} un.</span>}
                        </div>
                      </div>
                      <div className="flex items-center justify-center">
                        {certifications.length > 0 ? (
                          <div className="flex gap-2 flex-shrink-0">
                            {certifications.map((cert, idx) => (
                              <div key={idx} className={`flex flex-col items-center justify-center gap-1 ${cert.color} rounded-lg p-2 border-2 border-white/30 shadow-lg min-w-[70px] min-h-[70px]`}>
                                <img src={cert.logo} alt={cert.name} className="w-10 h-10 object-contain bg-white rounded p-1" onError={(e) => { e.target.style.display = 'none'; }} />
                                <span className="text-white text-[9px] font-black uppercase tracking-wider">{cert.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-slate-500 text-xs">-</p>}
                      </div>
                      <div className="flex items-center justify-center">
                        {record.sala === "Bio" && record.termino && !record.material_retirado && (
                          <Badge className="bg-yellow-500 text-white text-base font-bold animate-pulse px-4 py-2">PRONTO</Badge>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Tempo Decorrido</p>
                        <div className="flex items-center justify-end gap-2">
                          <Clock className="w-7 h-7 text-blue-400 animate-pulse" />
                          <div>
                            <p className="text-5xl font-black text-blue-400 font-mono tabular-nums leading-tight">{calcElapsed(record.inicio)}</p>
                            <p className="text-slate-400 text-[10px] font-semibold mt-1">desde {record.inicio}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== SLIDE 2: CHECK-OUT ===================== */
function SlideCheckout({ checkoutItems, loadingCheckout, getOperatorPhoto, importacoes }) {
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-2">
          <div className="w-1 h-6 bg-gradient-to-b from-purple-500 to-purple-600 rounded-full"></div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            CHECK-OUT EM ANDAMENTO
          </h2>
          <p className="text-purple-300 text-xs font-medium ml-2">
            {checkoutItems.length} {checkoutItems.length === 1 ? 'pedido em processamento' : 'pedidos em processamento'}
          </p>
        </div>

        {/* Importações */}
        <ImportacoesCard importacoes={importacoes} />

        {loadingCheckout ? (
          <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700"><CardContent className="p-4 text-center"><Package className="w-8 h-8 mx-auto text-slate-600 mb-2 animate-pulse" /><p className="text-slate-400 text-sm font-semibold">Carregando...</p></CardContent></Card>
        ) : checkoutItems.length === 0 ? (
          <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700"><CardContent className="p-8 text-center"><Package className="w-16 h-16 mx-auto text-slate-700 mb-3" /><p className="text-slate-400 text-lg font-bold">Nenhum check-out em andamento</p></CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {checkoutItems.map((item, index) => {
              const operatorPhoto = getOperatorPhoto(item.operador);
              return (
                <Card key={item.id} className={`bg-gradient-to-r ${item.critico ? 'from-red-900/90 to-red-800/90 border-l-4 border-red-500' : 'from-slate-900/90 to-slate-800/90 border-l-4 border-purple-500'} backdrop-blur-xl shadow-xl`}>
                  <CardContent className="p-3">
                    <div className="grid grid-cols-8 gap-3 items-center">
                      <div>
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Pedido</p>
                        <p className="text-base font-black text-white font-mono">{item.numero_pedido}</p>
                        {item.critico && <Badge className="mt-1 bg-red-600 text-white text-[10px] font-bold animate-pulse flex items-center gap-1 w-fit"><AlertCircle className="w-3 h-3" /> CRÍTICO</Badge>}
                      </div>
                      <div>
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Operador</p>
                        <div className="flex items-center gap-2">
                          {operatorPhoto ? (
                            <img src={operatorPhoto} alt={item.operador} className="w-10 h-10 rounded-full object-cover border-2 border-purple-400" onError={(e) => { e.target.style.display = 'none'; }} />
                          ) : (
                            <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center"><User className="w-5 h-5 text-purple-400" /></div>
                          )}
                          <p className="text-2xl font-black text-white leading-tight">{item.operador}</p>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Cliente</p>
                        <p className="text-2xl font-bold text-white leading-tight mb-1">{item.cliente}</p>
                        <p className="text-slate-400 text-[10px]">Entrega: {format(new Date(item.data_entrega + 'T00:00:00'), "dd/MM/yyyy")}</p>
                      </div>
                      <div></div><div></div>
                      <div className="col-span-2 text-right">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Tempo Decorrido</p>
                        <div className="flex items-center justify-end gap-2">
                          <Clock className={`w-6 h-6 ${item.critico ? 'text-red-400' : 'text-purple-400'} animate-pulse`} />
                          <div>
                            <p className={`text-4xl font-black ${item.critico ? 'text-red-400' : 'text-purple-400'} font-mono tabular-nums leading-tight`}>{calcElapsed(item.hora_inicio)}</p>
                            <p className="text-slate-400 text-[10px] font-semibold mt-1">desde {item.hora_inicio}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== SLIDE 2: EMPILHADEIRA ===================== */
function SlideEmpilha({ empilhadeiraData, getOperatorPhoto, importacoes }) {
  const { linhasAtivas, empilhadeira, paradaAtiva, ocorrencias, kpis } = empilhadeiraData;
  return (
    <div className="flex flex-col h-full gap-3">
      {paradaAtiva && (
        <div className="bg-red-900/80 border border-red-500 rounded-xl px-4 py-2 flex items-center gap-3">
          <OctagonX className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-200 font-bold text-sm">
            ⚠ Empilhadeira parada desde {paradaAtiva.hora_inicio} — {paradaAtiva.tipo}
            {paradaAtiva.descricao && ` — ${paradaAtiva.descricao}`}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 px-2">
        <div className="w-1 h-6 bg-gradient-to-b from-amber-500 to-amber-600 rounded-full"></div>
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Warehouse className="w-5 h-5 text-amber-400" />
          EMPILHADEIRA — LINHAS EM ANDAMENTO
        </h2>
        {empilhadeira && <Badge className="bg-amber-900/60 text-amber-300 text-xs ml-2">{empilhadeira.nome}</Badge>}
      </div>

      {/* Importações */}
      <ImportacoesCard importacoes={importacoes} />

      {linhasAtivas.length === 0 ? (
        <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700">
          <CardContent className="p-4 text-center">
            <Warehouse className="w-8 h-8 mx-auto text-slate-700 mb-2" />
            <p className="text-slate-400 text-sm font-bold">Nenhuma linha em andamento</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {linhasAtivas.slice(0, 6).map((linha) => (
            <Card key={linha.id} className={`bg-gradient-to-r ${linha.tipo_linha === "Crítico" ? 'from-red-900/90 to-red-800/90 border-l-4 border-red-500' : linha.tipo_linha === "Avulso" ? 'from-amber-900/90 to-amber-800/90 border-l-4 border-amber-500' : 'from-slate-900/90 to-slate-800/90 border-l-4 border-amber-500'} backdrop-blur-xl shadow-xl`}>
              <CardContent className="p-2">
                <div className="grid grid-cols-6 gap-3 items-center">
                  <div className="col-span-2">
                    <div className="flex items-center gap-2 mb-1">
                      {linha.tipo_linha === "Crítico" && <Badge className="bg-red-600 text-white text-[10px] font-bold animate-pulse flex items-center gap-1"><AlertCircle className="w-3 h-3" /> CRÍTICO</Badge>}
                      {linha.tipo_linha === "Avulso" && <Badge className="bg-amber-500 text-white text-[10px] font-bold">AVULSO</Badge>}
                    </div>
                    <p className="text-lg font-black text-white leading-tight">{linha.descricao_produto || "Sem descrição"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Local</p>
                    <p className="text-base font-bold text-amber-300">{linha.rua_torre || "—"}</p>
                    <p className="text-slate-400 text-[10px]">{linha.deposito}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Qtd</p>
                    <p className="text-lg font-black text-white">{linha.quantidade || "—"} un.</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Empilhador</p>
                    <div className="flex items-center gap-2">
                      {getOperatorPhoto(linha.operador_empilhadeira) ? (
                        <img src={getOperatorPhoto(linha.operador_empilhadeira)} alt={linha.operador_empilhadeira} className="w-8 h-8 rounded-full object-cover border-2 border-amber-400" onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center"><User className="w-4 h-4 text-amber-400" /></div>
                      )}
                      <p className="text-sm font-bold text-white">{linha.operador_empilhadeira || "—"}</p>
                    </div>
                    {linha.operador_ajudante && linha.operador_ajudante !== "nenhum" && (
                      <div className="flex items-center gap-2 mt-1">
                        {getOperatorPhoto(linha.operador_ajudante) ? (
                          <img src={getOperatorPhoto(linha.operador_ajudante)} alt={linha.operador_ajudante} className="w-6 h-6 rounded-full object-cover border border-slate-500" onError={e => { e.target.style.display = 'none'; }} />
                        ) : (
                          <div className="w-6 h-6 bg-slate-600 rounded-full flex items-center justify-center"><User className="w-3 h-3 text-slate-400" /></div>
                        )}
                        <p className="text-slate-400 text-[10px]">{linha.operador_ajudante}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    {linha.hora_inicio && <>
                      <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Decorrido</p>
                      <p className="text-xl font-black text-amber-400 font-mono">{calcElapsed(linha.hora_inicio)}</p>
                    </>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {ocorrencias.length > 0 && (
        <div className="mt-auto">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <p className="text-orange-300 text-xs font-bold">OCORRÊNCIAS NÃO RESOLVIDAS ({ocorrencias.length})</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {ocorrencias.slice(0, 3).map(o => (
              <div key={o.id} className="bg-orange-900/50 border border-orange-700 rounded-lg px-3 py-1.5 text-xs text-orange-200">
                <span className="font-bold">{o.tipo}</span> — {o.descricao?.slice(0, 40)}{o.descricao?.length > 40 ? "..." : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== COMPONENTE PRINCIPAL ===================== */
export default function Televisao() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [slideIndex, setSlideIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const autoPlayRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const NUM_SLIDES = 3;

  useEffect(() => {
    if (autoPlay) {
      autoPlayRef.current = setInterval(() => setSlideIndex(i => (i + 1) % NUM_SLIDES), 30000);
    }
    return () => clearInterval(autoPlayRef.current);
  }, [autoPlay, slideIndex]);

  const resetAutoPlay = (idx) => {
    setSlideIndex(idx);
    clearInterval(autoPlayRef.current);
    if (autoPlay) {
      autoPlayRef.current = setInterval(() => setSlideIndex(i => (i + 1) % NUM_SLIDES), 30000);
    }
  };

  const { data: allEnvaseRecords = [], isLoading: loadingEnvase } = useQuery({
    queryKey: ['envase-live'],
    queryFn: () => base44.entities.EnvaseRecord.list("-updated_date", 100),
    refetchInterval: 30000,
  });

  const { data: allCheckoutItems = [], isLoading: loadingCheckout } = useQuery({
    queryKey: ['checkout-live'],
    queryFn: () => base44.entities.CheckoutItem.list("-updated_date", 100),
    refetchInterval: 35000,
  });

  const { data: checkoutProgramacoes = [] } = useQuery({
    queryKey: ['checkout-programacoes-tv'],
    queryFn: () => base44.entities.CheckoutProgramacao.list(),
    refetchInterval: 60000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-tv'],
    queryFn: () => base44.entities.Product.list(),
    refetchInterval: 300000,
  });

  const { data: operators = [] } = useQuery({
    queryKey: ['operators-tv'],
    queryFn: () => base44.entities.Operator.list(),
    refetchInterval: 120000,
  });

  const { data: monthlyKpis = { total: 0, bio: 0, industrial: 0, totalRegistros: 0, bioRegistros: 0, industrialRegistros: 0 } } = useQuery({
    queryKey: ['monthly-kpis-tv'],
    queryFn: async () => {
      const currentMonth = format(new Date(), "yyyy-MM");
      const all = await base44.entities.EnvaseRecord.list("-data", 2000);
      const monthRecords = all.filter(r => {
        if (!r.data) return false;
        return r.data.startsWith(currentMonth);
      });
      const bioRecs = monthRecords.filter(r => r.sala === "Bio");
      const indRecs = monthRecords.filter(r => r.sala === "Industrial");
      return {
        total: monthRecords.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        bio: bioRecs.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        industrial: indRecs.reduce((s, r) => s + (r.quantidade_produzida || 0), 0),
        totalRegistros: monthRecords.length,
        bioRegistros: bioRecs.length,
        industrialRegistros: indRecs.length,
      };
    },
    refetchInterval: 120000,
  });

  const { data: monthlyKpisByCategory = { oleo: 0, graxa: 0, pasta: 0 } } = useQuery({
    queryKey: ['monthly-kpis-category-tv'],
    queryFn: async () => {
      const currentMonth = format(new Date(), "yyyy-MM");
      const [envaseRecs, products] = await Promise.all([
        base44.entities.EnvaseRecord.list("-data", 2000),
        base44.entities.Product.list(),
      ]);
      const monthRecords = envaseRecs.filter(r => r.data && r.data.startsWith(currentMonth));
      const prodMap = {};
      products.forEach(p => {
        if (p.codigo && p.categoria) {
          prodMap[p.codigo] = p.categoria;
        }
      });
      const result = { oleo: 0, graxa: 0, pasta: 0 };
      monthRecords.forEach(r => {
        const cat = prodMap[r.codigo_produto];
        if (cat === "Óleo") result.oleo += r.quantidade_produzida || 0;
        else if (cat === "Graxa") result.graxa += r.quantidade_produzida || 0;
        else if (cat === "Pasta") result.pasta += r.quantidade_produzida || 0;
      });
      return result;
    },
    refetchInterval: 120000,
  });

  const { data: todayStats = { envaseTotal: 0, envaseConcluidos: 0, checkoutConcluidos: 0, checkoutPendentes: 0 } } = useQuery({
    queryKey: ['today-stats'],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const allRecords = await base44.entities.EnvaseRecord.list();
      const todayRecords = allRecords.filter(r => r.data === today);
      const allProgramacoes = await base44.entities.CheckoutProgramacao.list();
      const todayProgramacoes = allProgramacoes.filter(p => p.data_programada === today);
      const todayProgramacaoIds = todayProgramacoes.map(p => p.id);
      const allCheckouts = await base44.entities.CheckoutItem.list();
      const todayCheckouts = allCheckouts.filter(item => todayProgramacaoIds.includes(item.programacao_id));
      return {
        envaseTotal: todayRecords.reduce((sum, r) => sum + (r.quantidade_produzida || 0), 0),
        envaseConcluidos: todayRecords.filter(r => r.termino).length,
        checkoutConcluidos: todayCheckouts.filter(item => item.status === "Concluído").length,
        checkoutPendentes: todayCheckouts.length,
      };
    },
    refetchInterval: 60000,
  });

  /* ---- Dados Empilhadeira ---- */
  const { data: empilhaProgramacoes = [] } = useQuery({
    queryKey: ['empilha-prog-tv'],
    queryFn: () => base44.entities.EmpilhaProgramacao.list("-data_programada"),
    refetchInterval: 60000,
  });

  const { data: empilhaLinhas = [] } = useQuery({
    queryKey: ['empilha-linhas-tv'],
    queryFn: () => base44.entities.EmpilhaLinha.list(),
    refetchInterval: 40000,
  });

  const { data: empilhaParadas = [] } = useQuery({
    queryKey: ['empilha-paradas-tv'],
    queryFn: () => base44.entities.EmpilhadeiraParada.list("-data"),
    refetchInterval: 45000,
  });

  const { data: empilhaOcorrencias = [] } = useQuery({
    queryKey: ['empilha-ocorr-tv'],
    queryFn: () => base44.entities.EmpilhaOcorrencia.list("-data"),
    refetchInterval: 50000,
  });

  const { data: empilhadeiras = [] } = useQuery({
    queryKey: ['empilhadeiras-tv'],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    refetchInterval: 300000,
  });

  const { data: importacoes = [] } = useQuery({
    queryKey: ['importacoes-tv'],
    queryFn: () => base44.entities.SapPedido.list(),
    refetchInterval: 120000,
  });

  const markMaterialAsRetirado = useMutation({
    mutationFn: async (recordId) => base44.entities.EnvaseRecord.update(recordId, { material_retirado: true }),
    onSuccess: () => queryClient.invalidateQueries(['envase-live']),
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const envaseRecords = allEnvaseRecords.filter(r => {
    if (!r.inicio) return false;
    if (r.sala === "Bio") { if (r.material_retirado) return false; }
    else { if (r.termino) return false; }
    return r.data === today;
  }).slice(0, 4);

  const todayProgramacoes = checkoutProgramacoes.filter(p => p.data_programada === today);
  const todayProgramacaoIds = todayProgramacoes.map(p => p.id);
  const checkoutItems = allCheckoutItems
    .filter(item => item.hora_inicio && !item.hora_termino && item.status === "Em Andamento" && todayProgramacaoIds.includes(item.programacao_id))
    .sort((a, b) => (b.hora_inicio || "").localeCompare(a.hora_inicio || ""))
    .slice(0, 2);

  const getProductCertifications = (codigoProduto) => {
    if (!products || !codigoProduto) return [];
    const product = products.find(p => p.codigo === codigoProduto);
    if (!product) return [];
    const certs = [];
    if (product.halal) certs.push({ name: 'HALAL', color: 'bg-purple-500', logo: '/certificacoes/halal.png' });
    if (product.kosher) certs.push({ name: 'KOSHER', color: 'bg-slate-700', logo: '/certificacoes/kosher.png' });
    if (product.nsf_3h) certs.push({ name: 'NSF 3H', color: 'bg-blue-500', logo: '/certificacoes/nsf.png' });
    if (product.nsf_h1) certs.push({ name: 'NSF H1', color: 'bg-green-500', logo: '/certificacoes/nsf.png' });
    return certs;
  };
  const getOperatorPhoto = (nome) => operators.find(op => op.nome === nome)?.foto_url || null;

  const todayProgIds = empilhaProgramacoes.filter(p => p.data_programada === today).map(p => p.id);
  const todayLinhas = empilhaLinhas.filter(l => todayProgIds.includes(l.programacao_id));
  const linhasAtivas = [
    ...todayLinhas.filter(l => l.tipo_linha === "Crítico" && l.status === "Em Andamento"),
    ...todayLinhas.filter(l => l.tipo_linha === "Avulso" && l.status === "Em Andamento"),
    ...todayLinhas.filter(l => (l.tipo_linha === "Normal" || !l.tipo_linha) && l.status === "Em Andamento"),
  ];
  const paradaAtiva = empilhaParadas.find(p => p.data === today && !p.hora_fim);
  const ocorrenciasAtivas = empilhaOcorrencias.filter(o => o.data === today && !o.resolvido);
  const temposMins = todayLinhas.filter(l => l.status === "Concluído" && l.tempo_total)
    .map(l => { const [h, m] = (l.tempo_total || "0:0").split(":").map(Number); return h * 60 + (m || 0); });
  const tempoMedio = temposMins.length > 0 ? Math.round(temposMins.reduce((a, b) => a + b, 0) / temposMins.length) : 0;
  const empilhadeiraAtiva = empilhadeiras.find(e => e.ativa);

  const empilhadeiraData = {
    linhasAtivas,
    empilhadeira: empilhadeiraAtiva,
    paradaAtiva,
    ocorrencias: ocorrenciasAtivas,
    kpis: {
      total: todayLinhas.length,
      concluidas: todayLinhas.filter(l => l.status === "Concluído").length,
      criticos: todayLinhas.filter(l => l.tipo_linha === "Crítico" && l.status !== "Concluído").length,
      tempoMedio,
    },
  };

  const SLIDES = [
    { label: "Envase", color: "bg-blue-500" },
    { label: "Check-out", color: "bg-purple-500" },
    { label: "Empilhadeira", color: "bg-amber-500" },
  ];

  const prevSlide = () => resetAutoPlay((slideIndex - 1 + NUM_SLIDES) % NUM_SLIDES);
  const nextSlide = () => resetAutoPlay((slideIndex + 1) % NUM_SLIDES);

  return (
    <div
      className="min-h-screen h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 p-3 overflow-hidden flex flex-col"
      onTouchStart={(e) => { e.currentTarget._touchX = e.touches[0].clientX; }}
      onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - (e.currentTarget._touchX || 0); if (Math.abs(dx) > 50) nextSlide(); }}
    >
      <style>{`
        @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.5s ease-out; }
      `}</style>

      <div className="max-w-[1920px] mx-auto w-full flex flex-col h-full gap-2">

        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 rounded-2xl p-3 shadow-xl flex-shrink-0">
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]"></div>
          <div className="relative flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Factory className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight">Operações Interlub</h1>
                <p className="text-blue-100 text-sm font-medium">{format(currentTime, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-black text-white font-mono tabular-nums">{format(currentTime, "HH:mm:ss")}</div>
              <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 text-xs" onClick={() => setAutoPlay(a => !a)}>
                {autoPlay ? "⏸ Auto" : "▶ Auto"}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats KPIs — dinâmicos por slide */}
        <div className="grid grid-cols-4 gap-2 flex-shrink-0">
          {slideIndex === 0 && (<>
            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-emerald-100 text-[10px] font-semibold">Produção Hoje</p><p className="text-2xl font-black text-white tabular-nums">{todayStats.envaseTotal.toLocaleString('pt-BR')}</p></div><TrendingUp className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-blue-100 text-[10px] font-semibold">Envases OK</p><p className="text-2xl font-black text-white tabular-nums">{todayStats.envaseConcluidos}</p></div><CheckCircle className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-blue-400 to-blue-500 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-blue-100 text-[10px] font-semibold">Em andamento</p><p className="text-2xl font-black text-white tabular-nums">{envaseRecords.length}</p></div><Factory className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-slate-600 to-slate-700 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-slate-300 text-[10px] font-semibold">Operações hoje</p><p className="text-2xl font-black text-white tabular-nums">{todayStats.envaseConcluidos + envaseRecords.length}</p></div><TrendingUp className="w-6 h-6 text-white/90" /></div></CardContent></Card>
          </>)}
          {slideIndex === 1 && (<>
            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-purple-100 text-[10px] font-semibold">Check-outs OK</p><p className="text-2xl font-black text-white tabular-nums">{todayStats.checkoutConcluidos}</p></div><CheckCircle className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-orange-100 text-[10px] font-semibold">Check-outs Pend.</p><p className="text-2xl font-black text-white tabular-nums">{todayStats.checkoutPendentes}</p></div><Package className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-red-100 text-[10px] font-semibold">Em andamento</p><p className="text-2xl font-black text-white tabular-nums">{checkoutItems.length}</p></div><Package className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-purple-400 to-purple-500 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-purple-100 text-[10px] font-semibold">Críticos</p><p className="text-2xl font-black text-white tabular-nums">{checkoutItems.filter(i => i.critico).length}</p></div><AlertCircle className="w-6 h-6 text-white/90" /></div></CardContent></Card>
          </>)}
          {slideIndex === 2 && (<>
            <Card className="bg-gradient-to-br from-slate-600 to-slate-700 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-slate-300 text-[10px] font-semibold">Total Linhas</p><p className="text-2xl font-black text-white tabular-nums">{empilhadeiraData.kpis.total}</p></div><Warehouse className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-emerald-100 text-[10px] font-semibold">Concluídas</p><p className="text-2xl font-black text-white tabular-nums">{empilhadeiraData.kpis.concluidas}</p></div><CheckCircle className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-red-500 to-red-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-red-100 text-[10px] font-semibold">Críticos Pend.</p><p className="text-2xl font-black text-white tabular-nums">{empilhadeiraData.kpis.criticos}</p></div><AlertCircle className="w-6 h-6 text-white/90" /></div></CardContent></Card>
            <Card className="bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg"><CardContent className="p-2"><div className="flex items-center justify-between"><div><p className="text-amber-100 text-[10px] font-semibold">Tempo Médio</p><p className="text-2xl font-black text-white tabular-nums">{empilhadeiraData.kpis.tempoMedio > 0 ? `${empilhadeiraData.kpis.tempoMedio}m` : "—"}</p></div><Clock className="w-6 h-6 text-white/90" /></div></CardContent></Card>
          </>)}
        </div>

        {/* Carrossel */}
        <div className="flex-1 min-h-0 relative">
          <button onClick={prevSlide} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 rounded-r-xl p-2 text-white transition-all">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={nextSlide} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/10 hover:bg-white/20 rounded-l-xl p-2 text-white transition-all">
            <ChevronRight className="w-6 h-6" />
          </button>

          <div className="h-full px-10 overflow-y-auto">
            {slideIndex === 0 && (
              <SlideEnvase
                envaseRecords={envaseRecords}
                loadingEnvase={loadingEnvase}
                getProductCertifications={getProductCertifications}
                getOperatorPhoto={getOperatorPhoto}
                markMaterialAsRetirado={markMaterialAsRetirado}
                monthlyKpis={monthlyKpis}
                monthlyKpisByCategory={monthlyKpisByCategory}
                importacoes={importacoes}
              />
            )}
            {slideIndex === 1 && (
              <SlideCheckout
                checkoutItems={checkoutItems}
                loadingCheckout={loadingCheckout}
                getOperatorPhoto={getOperatorPhoto}
                importacoes={importacoes}
              />
            )}
            {slideIndex === 2 && <SlideEmpilha empilhadeiraData={empilhadeiraData} getOperatorPhoto={getOperatorPhoto} importacoes={importacoes} />}
          </div>
        </div>

        {/* Indicadores */}
        <div className="flex items-center justify-center gap-3 pb-1 flex-shrink-0">
          {SLIDES.map((s, i) => (
            <button key={i} onClick={() => resetAutoPlay(i)} className="flex items-center gap-1.5 group">
              <div className={`rounded-full transition-all duration-300 ${i === slideIndex ? `w-6 h-3 ${s.color}` : "w-3 h-3 bg-white/30 group-hover:bg-white/50"}`} />
              {i === slideIndex && <span className="text-white/70 text-xs font-medium">{s.label}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}