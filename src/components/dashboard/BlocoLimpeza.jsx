import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { Sparkles, Calendar, Play, CheckCircle, PenLine, Settings } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import ModalAssinaturaLimpeza from "../limpeza/ModalAssinaturaLimpeza";

const hoje = () => format(new Date(), "yyyy-MM-dd");
const agora = () => format(new Date(), "HH:mm");

function calcStatus(p) {
  if (p.status === "Concluído" || p.status === "Em Andamento") return p.status;
  if (p.data_prevista < hoje() && p.status === "Pendente") return "Atrasado";
  return p.status;
}

const STATUS_COLOR = {
  "Pendente": "bg-yellow-100 text-yellow-700",
  "Em Andamento": "bg-blue-100 text-blue-700",
  "Concluído": "bg-green-100 text-green-700",
  "Atrasado": "bg-red-100 text-red-700",
};

function ListaLimpeza({ itens, isAdmin, handleIniciar, handleConcluir, setModalAssinatura }) {
  const porData = itens.reduce((acc, p) => {
    const d = p.data_prevista;
    if (!acc[d]) acc[d] = [];
    acc[d].push(p);
    return acc;
  }, {});
  const datas = Object.keys(porData).sort();

  if (itens.length === 0) {
    return (
      <div className="text-center py-6 text-slate-400">
        <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm">Nenhuma limpeza nesta categoria no período</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {datas.map(data => (
        <div key={data}>
          <p className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {format(new Date(data + "T00:00:00"), "EEEE, dd/MM", { locale: ptBR })}
            {data === hoje() && <Badge className="bg-blue-100 text-blue-700 text-xs ml-1">Hoje</Badge>}
          </p>
          <div className="space-y-1.5">
            {porData[data].map(p => {
              const status = calcStatus(p);
              const atrasado = status === "Atrasado";
              const ehHoje = data === hoje();
              const aguardaLider = p.status === "Concluído" && p.assinatura_responsavel && !p.assinatura_lider;
              return (
                <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm
                  ${atrasado ? "bg-red-50 border-red-200" : ehHoje ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-900">{p.local_nome}</span>
                      <Badge className={`text-xs ${STATUS_COLOR[status]}`}>{status}</Badge>
                      {aguardaLider && <Badge className="text-xs bg-orange-100 text-orange-700">Aguard. líder</Badge>}
                      {p.status_assinatura === "Completo" && <Badge className="text-xs bg-green-100 text-green-700">✓ Assinado</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">{p.responsavel_nome} · {p.tipo_limpeza}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 flex-shrink-0">
                      {status !== "Concluído" && status !== "Em Andamento" && (
                        <Button size="sm" variant="outline" className="h-6 text-xs px-1.5" onClick={() => handleIniciar(p)}>
                          <Play className="w-3 h-3" />
                        </Button>
                      )}
                      {status !== "Concluído" && (
                        <Button size="sm" className="h-6 text-xs px-1.5 bg-green-600 hover:bg-green-700" onClick={() => handleConcluir(p)}>
                          <CheckCircle className="w-3 h-3" />
                        </Button>
                      )}
                      {aguardaLider && (
                        <Button size="sm" variant="outline" className="h-6 text-xs px-1.5 border-orange-300 text-orange-700" onClick={() => setModalAssinatura(p.id)}>
                          <PenLine className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BlocoLimpeza({ currentUser, isAdmin }) {
  const queryClient = useQueryClient();
  const semIni = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const semFim = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const [dataInicio, setDataInicio] = useState(semIni);
  const [dataFim, setDataFim] = useState(semFim);
  const [modalAssinatura, setModalAssinatura] = useState(null);

  const { data: programacoes } = useQuery({
    queryKey: ["limpeza-programacoes"],
    queryFn: () => base44.entities.LimpezaProgramacao.list("data_prevista"),
    initialData: [],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LimpezaProgramacao.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] }),
  });

  const filtradas = programacoes.filter(p => p.data_prevista >= dataInicio && p.data_prevista <= dataFim);

  const pendentes = filtradas.filter(p => calcStatus(p) === "Pendente");
  const emAndamento = filtradas.filter(p => calcStatus(p) === "Em Andamento");
  const atrasadas = filtradas.filter(p => calcStatus(p) === "Atrasado");
  const concluidas = filtradas.filter(p => calcStatus(p) === "Concluído");
  const aguardandoLider = filtradas.filter(p => p.status === "Concluído" && p.assinatura_responsavel && !p.assinatura_lider);

  const handleIniciar = (p) => {
    updateMutation.mutate({ id: p.id, data: { status: "Em Andamento", hora_inicio: agora() } });
  };

  const handleConcluir = (p) => {
    const now = agora();
    updateMutation.mutate({
      id: p.id,
      data: {
        status: "Concluído",
        hora_fim: now,
        data_realizada: hoje(),
        ...(!p.hora_inicio ? { hora_inicio: now } : {}),
      }
    }, {
      onSuccess: () => setModalAssinatura(p.id),
    });
  };

  const getProg = (id) => programacoes.find(p => p.id === id);

  return (
    <Card className="border-slate-200 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Sparkles className="w-5 h-5 text-teal-500" />
            Limpeza
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {[
                ["hoje", "Hoje"],
                ["semana", "Esta semana"],
                ["mes", "Este mês"],
              ].map(([k, l]) => (
                <Button key={k} size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => {
                  const d = new Date();
                  if (k === "hoje") { setDataInicio(hoje()); setDataFim(hoje()); }
                  else if (k === "semana") { setDataInicio(semIni); setDataFim(semFim); }
                  else { setDataInicio(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd")); setDataFim(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd")); }
                }}>{l}</Button>
              ))}
            </div>
            {isAdmin && (
              <Link to="/GerenciarUsuarios?aba=limpeza">
                <Button size="sm" variant="outline" className="text-xs h-7 px-2 border-teal-300 text-teal-700">
                  <Settings className="w-3 h-3 mr-1" /> Gerenciar
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: "Total", value: filtradas.length, cls: "text-slate-700" },
            { label: "Concluídas", value: concluidas.length, cls: "text-green-700" },
            { label: "Pendentes", value: pendentes.length, cls: "text-yellow-700" },
            { label: "Atrasadas", value: atrasadas.length, cls: "text-red-700" },
            { label: "Aguard. líder", value: aguardandoLider.length, cls: "text-orange-700" },
          ].map(k => (
            <div key={k.label} className="text-center bg-slate-50 rounded-lg p-2">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Abas por categoria */}
        <Tabs defaultValue="todas">
          <TabsList className="w-full grid grid-cols-5 h-8">
            <TabsTrigger value="todas" className="text-xs">Todas ({filtradas.length})</TabsTrigger>
            <TabsTrigger value="pendentes" className="text-xs">Pendentes ({pendentes.length})</TabsTrigger>
            <TabsTrigger value="andamento" className="text-xs">Andamento ({emAndamento.length})</TabsTrigger>
            <TabsTrigger value="atrasadas" className="text-xs">Atrasadas ({atrasadas.length})</TabsTrigger>
            <TabsTrigger value="concluidas" className="text-xs">Concluídas ({concluidas.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="todas" className="mt-3">
            <ListaLimpeza itens={filtradas} isAdmin={isAdmin} handleIniciar={handleIniciar} handleConcluir={handleConcluir} setModalAssinatura={setModalAssinatura} />
          </TabsContent>
          <TabsContent value="pendentes" className="mt-3">
            <ListaLimpeza itens={pendentes} isAdmin={isAdmin} handleIniciar={handleIniciar} handleConcluir={handleConcluir} setModalAssinatura={setModalAssinatura} />
          </TabsContent>
          <TabsContent value="andamento" className="mt-3">
            <ListaLimpeza itens={emAndamento} isAdmin={isAdmin} handleIniciar={handleIniciar} handleConcluir={handleConcluir} setModalAssinatura={setModalAssinatura} />
          </TabsContent>
          <TabsContent value="atrasadas" className="mt-3">
            <ListaLimpeza itens={atrasadas} isAdmin={isAdmin} handleIniciar={handleIniciar} handleConcluir={handleConcluir} setModalAssinatura={setModalAssinatura} />
          </TabsContent>
          <TabsContent value="concluidas" className="mt-3">
            <ListaLimpeza itens={concluidas} isAdmin={isAdmin} handleIniciar={handleIniciar} handleConcluir={handleConcluir} setModalAssinatura={setModalAssinatura} />
          </TabsContent>
        </Tabs>
      </CardContent>

      {modalAssinatura && (
        <ModalAssinaturaLimpeza
          open={!!modalAssinatura}
          onClose={() => setModalAssinatura(null)}
          programacao={getProg(modalAssinatura)}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}
    </Card>
  );
}