import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, PenLine, CheckCircle, Clock, AlertTriangle, OctagonX, Wrench, Sparkles } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import ModalAssinaturaLimpeza from "../limpeza/ModalAssinaturaLimpeza";

export default function PainelPendenciasAdmin({ linhas, ocorrencias, paradas, empilhadeiras, programacoes, currentUser }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState("assinaturas");
  const [modalAssinaturaLimpeza, setModalAssinaturaLimpeza] = useState(null);

  const { data: limpezasProg } = useQuery({
    queryKey: ["limpeza-programacoes"],
    queryFn: () => base44.entities.LimpezaProgramacao.list("data_prevista"),
    initialData: [],
  });

  const hoje = format(new Date(), "yyyy-MM-dd");
  const limpezasAtrasadas = limpezasProg.filter(p => p.data_prevista < hoje && p.status !== "Concluído");
  const limpezasAguardandoLider = limpezasProg.filter(p => p.status === "Concluído" && p.assinatura_responsavel && !p.assinatura_lider);

  const updateLimpezaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LimpezaProgramacao.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] }),
  });

  // Assinaturas pendentes
  const linhasPendentesAssinatura = linhas.filter(l => l.status === "Concluído" && !l.assinatura_lider);

  // Ocorrências abertas do dia
  const ocorrenciasAbertas = ocorrencias.filter(o => !o.resolvido);

  // Paradas em aberto
  const paradasEmAberto = paradas.filter(p => !p.hora_fim);

  // Alertas de manutenção (próximos 7 dias ou vencidos)
  const alertasManutencao = empilhadeiras.filter(e => {
    if (!e.data_proxima_manutencao) return false;
    const dias = differenceInDays(parseISO(e.data_proxima_manutencao), new Date());
    return dias <= 7;
  });

  const totalPendencias = linhasPendentesAssinatura.length + ocorrenciasAbertas.length + paradasEmAberto.length + alertasManutencao.length + limpezasAtrasadas.length + limpezasAguardandoLider.length;

  const [resolvendo, setResolvendo] = useState(null);
  const [resolucaoTexto, setResolucaoTexto] = useState("");
  const [horaFimParada, setHoraFimParada] = useState(format(new Date(), "HH:mm"));
  const [nomeLider, setNomeLider] = useState(currentUser?.full_name || "");

  const updateLinhaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmpilhaLinha.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilha-linhas-all"] });
      queryClient.invalidateQueries({ queryKey: ["empilha-linhas"] });
    },
  });

  const updateOcorrenciaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmpilhaOcorrencia.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["empilha-ocorrencias"] }),
  });

  const updateParadaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmpilhadeiraParada.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilha-paradas"] });
      queryClient.invalidateQueries({ queryKey: ["empilha-paradas-prog"] });
    },
  });

  const handleAssinarLider = (linha) => {
    const now = format(new Date(), "HH:mm");
    updateLinhaMutation.mutate({
      id: linha.id,
      data: {
        assinatura_lider: true,
        assinatura_lider_nome: nomeLider,
        assinatura_lider_hora: now,
        status_assinatura: "Completo",
      },
    });
  };

  const handleResolverOcorrencia = (id) => {
    if (!resolucaoTexto) return;
    updateOcorrenciaMutation.mutate({ id, data: { resolvido: true, resolucao: resolucaoTexto } });
    setResolvendo(null);
    setResolucaoTexto("");
  };

  const handleFecharParada = (parada) => {
    const inicio = parada.hora_inicio;
    const [h1, m1] = inicio.split(":").map(Number);
    const [h2, m2] = horaFimParada.split(":").map(Number);
    const tempo = (h2 * 60 + m2) - (h1 * 60 + m1);
    updateParadaMutation.mutate({
      id: parada.id,
      data: { hora_fim: horaFimParada, tempo_total: tempo > 0 ? `${tempo} min` : "0 min" },
    });
  };

  const getProgramacaoData = (id) => {
    const prog = programacoes.find(p => p.id === id);
    return prog?.data_programada || "";
  };

  const ABAS = [
    { key: "assinaturas", label: "Assinaturas", count: linhasPendentesAssinatura.length, cor: "bg-blue-100 text-blue-700" },
    { key: "ocorrencias", label: "Ocorrências", count: ocorrenciasAbertas.length, cor: "bg-orange-100 text-orange-700" },
    { key: "paradas", label: "Paradas", count: paradasEmAberto.length, cor: "bg-red-100 text-red-700" },
    { key: "manutencao", label: "Manutenção", count: alertasManutencao.length, cor: "bg-amber-100 text-amber-700" },
    { key: "limpeza", label: "Limpeza", count: limpezasAtrasadas.length + limpezasAguardandoLider.length, cor: "bg-teal-100 text-teal-700" },
  ];

  if (totalPendencias === 0) return null;

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader
        className="border-b border-slate-100 cursor-pointer select-none"
        onClick={() => setAberto(!aberto)}
      >
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-slate-800">Pendências (Admin)</span>
            <Badge className="bg-red-600 text-white text-xs">{totalPendencias}</Badge>
          </div>
          {aberto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </CardTitle>
      </CardHeader>

      {aberto && (
        <CardContent className="p-4 space-y-4">
          {/* Abas */}
          <div className="flex gap-2 flex-wrap">
            {ABAS.map(aba => (
              <button
                key={aba.key}
                onClick={() => setAbaAtiva(aba.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${abaAtiva === aba.key ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {aba.label}
                {aba.count > 0 && <Badge className={`ml-2 text-xs ${aba.cor}`}>{aba.count}</Badge>}
              </button>
            ))}
          </div>

          {/* Conteúdo — Assinaturas */}
          {abaAtiva === "assinaturas" && (
            <div className="space-y-2">
              <div className="space-y-2 mb-3">
                <label className="text-xs text-slate-500">Seu nome (líder):</label>
                <Input value={nomeLider} onChange={e => setNomeLider(e.target.value)} className="max-w-xs" placeholder="Nome do líder" />
              </div>
              {linhasPendentesAssinatura.length === 0 ? (
                <p className="text-slate-400 text-sm">Nenhuma assinatura pendente.</p>
              ) : linhasPendentesAssinatura.map(l => (
                <div key={l.id} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <PenLine className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{l.descricao_produto || "Sem descrição"}</p>
                    <p className="text-xs text-slate-500">
                      {getProgramacaoData(l.programacao_id) && `${format(new Date(getProgramacaoData(l.programacao_id) + "T00:00:00"), "dd/MM")} · `}
                      {l.operador_empilhadeira} · Fim: {l.hora_termino}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                    onClick={() => handleAssinarLider(l)}
                    disabled={!nomeLider || updateLinhaMutation.isPending}
                  >
                    <PenLine className="w-3 h-3 mr-1" /> Assinar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Conteúdo — Ocorrências */}
          {abaAtiva === "ocorrencias" && (
            <div className="space-y-2">
              {ocorrenciasAbertas.length === 0 ? (
                <p className="text-slate-400 text-sm">Nenhuma ocorrência aberta.</p>
              ) : ocorrenciasAbertas.map(o => (
                <div key={o.id} className="p-3 bg-orange-50 rounded-lg border border-orange-200 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-orange-100 text-orange-700 text-xs">{o.tipo}</Badge>
                        <span className="text-xs text-slate-500">{o.data} {o.hora} — {o.registrado_por}</span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">{o.descricao}</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 flex-shrink-0" onClick={() => setResolvendo(o.id)}>
                      Resolver
                    </Button>
                  </div>
                  {resolvendo === o.id && (
                    <div className="space-y-2 pt-2 border-t border-orange-200">
                      <Textarea value={resolucaoTexto} onChange={e => setResolucaoTexto(e.target.value)} placeholder="Descreva a resolução..." rows={2} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setResolvendo(null)}>Cancelar</Button>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleResolverOcorrencia(o.id)} disabled={!resolucaoTexto}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Marcar como Resolvido
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Conteúdo — Paradas */}
          {abaAtiva === "paradas" && (
            <div className="space-y-2">
              {paradasEmAberto.length === 0 ? (
                <p className="text-slate-400 text-sm">Nenhuma parada em aberto.</p>
              ) : paradasEmAberto.map(p => (
                <div key={p.id} className="p-3 bg-red-50 rounded-lg border border-red-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <OctagonX className="w-4 h-4 text-red-600" />
                    <div>
                      <p className="font-medium text-red-800 text-sm">{p.tipo} — desde {p.hora_inicio}</p>
                      <p className="text-xs text-slate-500">{p.data} · {p.descricao}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600">Hora de fim:</label>
                    <input type="time" value={horaFimParada} onChange={e => setHoraFimParada(e.target.value)} className="text-sm border rounded px-2 py-1" />
                    <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => handleFecharParada(p)} disabled={updateParadaMutation.isPending}>
                      Registrar fim
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Conteúdo — Manutenção */}
          {abaAtiva === "manutencao" && (
            <div className="space-y-2">
              {alertasManutencao.length === 0 ? (
                <p className="text-slate-400 text-sm">Nenhum alerta de manutenção.</p>
              ) : alertasManutencao.map(e => {
                const dias = differenceInDays(parseISO(e.data_proxima_manutencao), new Date());
                return (
                  <div key={e.id} className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <Wrench className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-800 text-sm">{e.nome}</p>
                      <p className="text-xs text-slate-500">
                        {dias < 0 ? `⚠️ Manutenção ATRASADA há ${Math.abs(dias)} dias!` : `Manutenção em ${dias} dia(s) — ${e.data_proxima_manutencao}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Conteúdo — Limpeza */}
          {abaAtiva === "limpeza" && (
            <div className="space-y-3">
              {limpezasAtrasadas.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-1.5">Limpezas atrasadas ({limpezasAtrasadas.length})</p>
                  <div className="space-y-1.5">
                    {limpezasAtrasadas.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 bg-red-50 rounded-lg border border-red-200">
                        <Sparkles className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-red-800 text-sm">{p.local_nome}</p>
                          <p className="text-xs text-slate-500">{p.data_prevista} · {p.responsavel_nome} · {p.tipo_limpeza}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {limpezasAguardandoLider.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-600 mb-1.5">Aguardando assinatura do líder ({limpezasAguardandoLider.length})</p>
                  <div className="space-y-1.5">
                    {limpezasAguardandoLider.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2.5 bg-orange-50 rounded-lg border border-orange-200">
                        <PenLine className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-orange-800 text-sm">{p.local_nome}</p>
                          <p className="text-xs text-slate-500">{p.data_realizada || p.data_prevista} · {p.responsavel_nome}</p>
                        </div>
                        <Button size="sm" className="bg-orange-500 hover:bg-orange-600 flex-shrink-0 h-7 text-xs"
                          onClick={() => setModalAssinaturaLimpeza(p.id)}>
                          <PenLine className="w-3 h-3 mr-1" /> Assinar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {limpezasAtrasadas.length === 0 && limpezasAguardandoLider.length === 0 && (
                <p className="text-slate-400 text-sm">Nenhuma pendência de limpeza.</p>
              )}
            </div>
          )}
        </CardContent>
      )}

      {modalAssinaturaLimpeza && (
        <ModalAssinaturaLimpeza
          open={!!modalAssinaturaLimpeza}
          onClose={() => setModalAssinaturaLimpeza(null)}
          programacao={limpezasProg.find(p => p.id === modalAssinaturaLimpeza)}
          currentUser={currentUser}
          isAdmin={true}
        />
      )}
    </Card>
  );
}