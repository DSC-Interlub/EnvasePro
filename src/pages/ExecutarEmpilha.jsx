import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Plus, CheckCircle, AlertCircle, Clock, ListTodo, OctagonX } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import EmpilhaLinhaCard from "../components/empilhadeira/EmpilhaLinhaCard";
import ModalAdicionarLinha from "../components/empilhadeira/ModalAdicionarLinha";
import ModalParada from "../components/empilhadeira/ModalParada";

export default function ExecutarEmpilha() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const urlParams = new URLSearchParams(window.location.search);
  const programacaoId = urlParams.get("id");
  const [showAddLinha, setShowAddLinha] = useState(false);
  const [showParada, setShowParada] = useState(false);
  const lastUpdateRef = useRef({ status: null, concluidas: null });

  const { data: programacao, isLoading: loadingProg } = useQuery({
    queryKey: ["empilha-programacao", programacaoId],
    queryFn: async () => {
      const all = await base44.entities.EmpilhaProgramacao.list();
      return all.find(p => p.id === programacaoId);
    },
    enabled: !!programacaoId,
  });

  const { data: linhas, isLoading: loadingLinhas } = useQuery({
    queryKey: ["empilha-linhas", programacaoId],
    queryFn: () => base44.entities.EmpilhaLinha.filter({ programacao_id: programacaoId }),
    initialData: [],
    enabled: !!programacaoId,
  });

  const { data: operators } = useQuery({
    queryKey: ["operators"],
    queryFn: () => base44.entities.Operator.list(),
    initialData: [],
  });

  const { data: empilhadeiras } = useQuery({
    queryKey: ["empilhadeiras-config"],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    initialData: [],
  });

  const { data: paradas } = useQuery({
    queryKey: ["empilha-paradas-prog", programacaoId],
    queryFn: () => base44.entities.EmpilhadeiraParada.filter({ programacao_id: programacaoId }),
    initialData: [],
    enabled: !!programacaoId,
    refetchInterval: 15000,
  });

  const updateProgMutation = useMutation({
    mutationFn: (data) => base44.entities.EmpilhaProgramacao.update(programacaoId, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(["empilha-programacao", programacaoId], updated);
    },
  });

  const concluidas = linhas.filter(l => l.status === "Concluído").length;
  const emAndamento = linhas.filter(l => l.status === "Em Andamento").length;
  const pendentes = linhas.filter(l => l.status === "Pendente").length;
  const statusCalculado = linhas.length === 0 ? "Pendente"
    : concluidas === linhas.length ? "Concluído"
    : emAndamento > 0 || concluidas > 0 ? "Em Andamento"
    : "Pendente";

  useEffect(() => {
    if (!programacao || !linhas) return;
    const changed = lastUpdateRef.current.status !== statusCalculado || lastUpdateRef.current.concluidas !== concluidas;
    if (changed || programacao.total_linhas !== linhas.length) {
      lastUpdateRef.current = { status: statusCalculado, concluidas };
      const t = setTimeout(() => {
        updateProgMutation.mutate({ status: statusCalculado, linhas_concluidas: concluidas, total_linhas: linhas.length });
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [statusCalculado, concluidas, linhas.length, programacao?.id]);

  // Ordenação: Críticos → Avulsos → Normais por rua/torre
  const linhasOrdenadas = [
    ...linhas.filter(l => l.tipo_linha === "Crítico" && l.status !== "Concluído").sort((a, b) => (a.rua_torre || "").localeCompare(b.rua_torre || "")),
    ...linhas.filter(l => l.tipo_linha === "Avulso" && l.status !== "Concluído").sort((a, b) => (a.rua_torre || "").localeCompare(b.rua_torre || "")),
    ...linhas.filter(l => (l.tipo_linha === "Normal" || !l.tipo_linha) && l.status !== "Concluído").sort((a, b) => (a.rua_torre || "").localeCompare(b.rua_torre || "")),
    ...linhas.filter(l => l.status === "Concluído").sort((a, b) => (a.rua_torre || "").localeCompare(b.rua_torre || "")),
  ];

  const empilhadeira = empilhadeiras.find(e => e.id === programacao?.empilhadeira_id);
  const paradaAtiva = paradas.find(p => !p.hora_fim);

  const statusColor = statusCalculado === "Concluído" ? "bg-ok-suave text-ok"
    : statusCalculado === "Em Andamento" ? "bg-marca-suave text-marca"
    : "bg-atencao-suave text-atencao";

  if (!programacaoId) {
    return (
      <div className="min-h-screen bg-fundo p-8">
        <Card className="border-erro"><CardContent className="p-6"><p className="text-erro">Programação não encontrada</p></CardContent></Card>
      </div>
    );
  }

  if (loadingProg || loadingLinhas) {
    return (
      <div className="min-h-screen bg-fundo p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-texto-fraco">Carregando programação...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Banner parada ativa */}
        {paradaAtiva && (
          <Alert className="border-erro bg-erro-suave">
            <OctagonX className="h-4 w-4 text-erro" />
            <AlertDescription className="text-erro font-semibold">
              ⚠ Empilhadeira parada desde {paradaAtiva.hora_inicio} — {paradaAtiva.tipo}
              {paradaAtiva.descricao && ` — ${paradaAtiva.descricao}`}
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button aria-label="Voltar" variant="outline" size="icon" onClick={() => navigate(createPageUrl("Empilhadeira"))}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-tinta">
              {empilhadeira ? empilhadeira.nome : "Empilhadeira"} —{" "}
              {programacao?.data_programada
                ? format(new Date(programacao.data_programada + "T00:00:00"), "dd/MM/yyyy")
                : ""}
            </h1>
            <p className="text-texto-fraco text-sm">
              {programacao?.data_programada
                ? format(new Date(programacao.data_programada + "T00:00:00"), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
                : ""}
              {programacao?.criado_por && ` · Por: ${programacao.criado_por}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusColor}>{statusCalculado}</Badge>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-borda shadow-cartao">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-medium text-texto-fraco">Total</p><p className="text-2xl font-bold mt-1 text-texto-fraco">{linhas.length}</p></div>
                <ListTodo className="w-8 h-8 text-texto-apagado opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-borda shadow-cartao">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-medium text-texto-fraco">Pendentes</p><p className="text-2xl font-bold mt-1 text-atencao">{pendentes}</p></div>
                <Clock className="w-8 h-8 text-yellow-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-borda shadow-cartao">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-medium text-texto-fraco">Em Andamento</p><p className="text-2xl font-bold mt-1 text-marca">{emAndamento}</p></div>
                <AlertCircle className="w-8 h-8 text-marca-suave opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-borda shadow-cartao">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs font-medium text-texto-fraco">Concluídas</p><p className="text-2xl font-bold mt-1 text-ok">{concluidas}</p></div>
                <CheckCircle className="w-8 h-8 text-ok opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Botões de ação */}
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" className="border-atencao text-atencao hover:bg-atencao-suave" onClick={() => setShowParada(true)}>
            <OctagonX className="w-4 h-4 mr-2" /> Registrar Parada
          </Button>
          {isAdmin && (
            <Button variant="outline" className="border-amber-300 text-atencao hover:bg-atencao-suave" onClick={() => setShowAddLinha(true)}>
              <Plus className="w-4 h-4 mr-2" /> Adicionar Linha
            </Button>
          )}
        </div>

        {/* Lista de linhas */}
        <div className="space-y-3">
          {linhasOrdenadas.length === 0 ? (
            <Card className="border-borda">
              <CardContent className="p-12 text-center">
                <ListTodo className="w-14 h-14 mx-auto text-texto-apagado mb-4" />
                <p className="text-texto-fraco">Nenhuma linha nesta programação</p>
              </CardContent>
            </Card>
          ) : (
            linhasOrdenadas.map(linha => (
              <EmpilhaLinhaCard
                key={linha.id}
                linha={linha}
                operators={operators}
                programacaoId={programacaoId}
                currentUser={user}
              />
            ))
          )}
        </div>
      </div>

      <ModalAdicionarLinha
        open={showAddLinha}
        onClose={() => setShowAddLinha(false)}
        programacaoId={programacaoId}
      />

      <ModalParada
        open={showParada}
        onClose={() => setShowParada(false)}
        empilhadeiraId={programacao?.empilhadeira_id}
        programacaoId={programacaoId}
        operators={operators}
      />
    </div>
  );
}