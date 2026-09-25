import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Pause, RotateCcw, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { format, differenceInMinutes } from "date-fns";
import ModalOcorrenciaRecebimento from "@/components/recebimento/ModalOcorrenciaRecebimento";
import ModalAssinaturaRecebimento from "@/components/recebimento/ModalAssinaturaRecebimento";

function useTimer(inicio, pausas) {
  const [, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(i); }, []);
  if (!inicio) return "00:00:00";
  const totalPausado = pausas || 0;
  const diffMin = Math.max(0, differenceInMinutes(new Date(), new Date(inicio)) - totalPausado);
  const h = Math.floor(diffMin / 60).toString().padStart(2, "0");
  const m = (diffMin % 60).toString().padStart(2, "0");
  return `${h}:${m}:00`;
}

export default function ExecutarRecebimento() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const recebimentoId = params.get("id");

  const [ocorrenciasOpen, setOcorrenciasOpen] = useState(true);
  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [modalAssinatura, setModalAssinatura] = useState(false);

  const { data: recebimento } = useQuery({
    queryKey: ["recebimento", recebimentoId],
    queryFn: () => base44.entities.Recebimento.filter({ id: recebimentoId }).then(r => r[0]),
    enabled: !!recebimentoId,
  });
  const { data: ocorrencias = [] } = useQuery({
    queryKey: ["recebimento-ocorrencias", recebimentoId],
    queryFn: () => base44.entities.RecebimentoOcorrencia.filter({ recebimento_id: recebimentoId }),
    enabled: !!recebimentoId,
  });
  const { data: participantes = [] } = useQuery({
    queryKey: ["recebimento-participantes", recebimentoId],
    queryFn: () => base44.entities.RecebimentoParticipante.filter({ recebimento_id: recebimentoId }),
    enabled: !!recebimentoId,
  });

  const mutRec = useMutation({
    mutationFn: (data) => base44.entities.Recebimento.update(recebimentoId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recebimento", recebimentoId] });
      queryClient.invalidateQueries({ queryKey: ["recebimentos"] });
    },
  });
  const mutOcorrencia = useMutation({
    mutationFn: ({ id, data }) => base44.entities.RecebimentoOcorrencia.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recebimento-ocorrencias", recebimentoId] }),
  });

  const timer = useTimer(recebimento?.datetime_inicio, recebimento?.tempo_pausado_minutos);

  const handlePausar = () => {
    mutRec.mutate({ status: "Pausado", datetime_pausa: new Date().toISOString() });
  };

  const handleRetomar = () => {
    const pausaMin = recebimento.datetime_pausa
      ? Math.max(0, differenceInMinutes(new Date(), new Date(recebimento.datetime_pausa)))
      : 0;
    mutRec.mutate({
      status: "Em andamento",
      datetime_retomada: new Date().toISOString(),
      tempo_pausado_minutos: (recebimento.tempo_pausado_minutos || 0) + pausaMin,
    });
  };

  const handleFinalizar = () => {
    const fim = new Date().toISOString();
    const inicio = recebimento.datetime_inicio ? new Date(recebimento.datetime_inicio) : new Date();
    const totalMin = differenceInMinutes(new Date(), inicio);
    const pausadoMin = recebimento.tempo_pausado_minutos || 0;
    const produtivo = Math.max(0, totalMin - pausadoMin);
    mutRec.mutate({
      status: "Concluído",
      datetime_fim: fim,
      tempo_produtivo_minutos: produtivo,
      tempo_pausado_minutos: pausadoMin,
    }, { onSuccess: () => setModalAssinatura(true) });
  };

  if (!recebimento) return (
    <div className="p-6 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const ocorrenciasAbertas = ocorrencias.filter(o => !o.resolvido).length;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/Recebimento")}><ChevronLeft className="w-4 h-4" /></Button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{recebimento.numero_documento}</h1>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge className="text-xs bg-blue-100 text-blue-700">{recebimento.tipo}</Badge>
                <Badge className={`text-xs ${recebimento.status === "Em andamento" ? "bg-blue-600 text-white" : recebimento.status === "Concluído" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700"}`}>
                  {recebimento.status}
                </Badge>
                {recebimento.prioridade !== "Normal" && (
                  <Badge className={`text-xs ${recebimento.prioridade === "Urgente" ? "bg-red-600 text-white" : "bg-orange-500 text-white"}`}>
                    {recebimento.prioridade}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {recebimento.fornecedor_nome && <>{recebimento.fornecedor_nome} · </>}
                {participantes.length > 0 && <>{participantes.map(p => p.operator_nome).join(", ")}</>}
              </p>
              {recebimento.descricao && (
                <p className="text-xs text-slate-600 mt-1 bg-slate-50 rounded p-2">{recebimento.descricao}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {recebimento.status === "Em andamento" && (
              <div className="text-2xl font-mono font-bold text-blue-600">{timer}</div>
            )}
            <div className="flex gap-2 flex-wrap">
              {recebimento.status === "Em andamento" && (
                <>
                  <Button size="sm" variant="outline" className="gap-1 border-yellow-400 text-yellow-700" onClick={handlePausar} disabled={mutRec.isPending}>
                    <Pause className="w-3 h-3" /> Pausar
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1" onClick={handleFinalizar} disabled={mutRec.isPending}>
                    <CheckCircle className="w-3 h-3" /> Finalizar
                  </Button>
                </>
              )}
              {recebimento.status === "Pausado" && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={handleRetomar} disabled={mutRec.isPending}>
                  <RotateCcw className="w-3 h-3" /> Retomar
                </Button>
              )}
              {recebimento.status === "Concluído" && !recebimento.assinatura_lider && isAdmin && (
                <Button size="sm" variant="outline" className="gap-1 border-orange-300 text-orange-700" onClick={() => setModalAssinatura(true)}>
                  <CheckCircle className="w-3 h-3" /> Assinaturas
                </Button>
              )}
              {recebimento.status !== "Concluído" && (
                <Button size="sm" variant="outline" className="gap-1 border-red-300 text-red-600" onClick={() => setModalOcorrencia(true)}>
                  <AlertTriangle className="w-3 h-3" /> Ocorrência
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ocorrências */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => setOcorrenciasOpen(o => !o)}>
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            Ocorrências
            {ocorrenciasAbertas > 0 && (
              <Badge className="bg-red-100 text-red-700 text-xs">{ocorrenciasAbertas} aberta{ocorrenciasAbertas > 1 ? "s" : ""}</Badge>
            )}
          </span>
          {ocorrenciasOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 rotate-180" />}
        </button>

        {ocorrenciasOpen && (
          <div className="p-4 border-t border-slate-100 space-y-2">
            {ocorrencias.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">Nenhuma ocorrência registrada</p>
            ) : (
              ocorrencias.map(o => (
                <div key={o.id} className={`p-3 rounded-lg border text-sm ${o.resolvido ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${o.resolvido ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {o.resolvido ? "Resolvida" : "Aberta"}
                        </Badge>
                        {o.tipo && <span className="text-xs font-medium text-slate-600">{o.tipo}</span>}
                      </div>
                      <p className="text-slate-700">{o.descricao}</p>
                      <p className="text-xs text-slate-400 mt-1">{o.registrado_por} · {o.datetime_registro ? format(new Date(o.datetime_registro), "dd/MM HH:mm") : ""}</p>
                      {o.resolucao && <p className="text-xs text-green-700 mt-1">✓ {o.resolucao}</p>}
                    </div>
                    {!o.resolvido && isAdmin && (
                      <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 shrink-0"
                        onClick={() => {
                          const resolucao = prompt("Descreva a resolução:");
                          if (resolucao) mutOcorrencia.mutate({ id: o.id, data: { resolvido: true, resolucao } });
                        }}>
                        Resolver
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
            {recebimento.status !== "Concluído" && (
              <Button size="sm" variant="outline" className="w-full text-xs gap-1 border-red-300 text-red-600" onClick={() => setModalOcorrencia(true)}>
                <AlertTriangle className="w-3 h-3" /> Registrar ocorrência
              </Button>
            )}
          </div>
        )}
      </div>

      <ModalOcorrenciaRecebimento
        open={modalOcorrencia}
        onClose={() => setModalOcorrencia(false)}
        recebimentoId={recebimentoId}
        itens={[]}
        currentUser={user}
      />
      <ModalAssinaturaRecebimento
        open={modalAssinatura}
        onClose={() => setModalAssinatura(false)}
        recebimento={recebimento}
        participantes={participantes}
        currentUser={user}
        isAdmin={isAdmin}
      />
    </div>
  );
}