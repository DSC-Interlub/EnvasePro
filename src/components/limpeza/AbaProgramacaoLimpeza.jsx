import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Play, CheckCircle, PenLine, Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import ModalLimpezaProgramacao from "./ModalLimpezaProgramacao";
import ModalAssinaturaLimpeza from "./ModalAssinaturaLimpeza";
import AbaLocaisLimpeza from "./AbaLocaisLimpeza";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin } from "lucide-react";

const hoje = () => format(new Date(), "yyyy-MM-dd");
const agora = () => format(new Date(), "HH:mm");

const STATUS_COLOR = {
  "Pendente": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Em Andamento": "bg-blue-100 text-blue-700 border-blue-200",
  "Concluído": "bg-green-100 text-green-700 border-green-200",
  "Atrasado": "bg-red-100 text-red-700 border-red-200",
};

function calcStatus(p) {
  if (p.status === "Concluído" || p.status === "Em Andamento") return p.status;
  if (p.data_prevista < hoje() && p.status === "Pendente") return "Atrasado";
  return p.status;
}

export default function AbaProgramacaoLimpeza({ currentUser, isAdmin }) {
  const queryClient = useQueryClient();
  const semIni = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const semFim = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const [dataInicio, setDataInicio] = useState(semIni);
  const [dataFim, setDataFim] = useState(semFim);
  const [modalProg, setModalProg] = useState(false);
  const [editando, setEditando] = useState(null);
  const [modalAssinatura, setModalAssinatura] = useState(null);

  const { data: programacoes } = useQuery({
    queryKey: ["limpeza-programacoes"],
    queryFn: () => base44.entities.LimpezaProgramacao.list("-data_prevista"),
    initialData: [],
  });

  const { data: locais } = useQuery({
    queryKey: ["limpeza-locais"],
    queryFn: () => base44.entities.LimpezaLocal.list("nome"),
    initialData: [],
  });

  const { data: operadores } = useQuery({
    queryKey: ["operators"],
    queryFn: () => base44.entities.Operator.list("nome"),
    initialData: [],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LimpezaProgramacao.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LimpezaProgramacao.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["limpeza-programacoes"] }),
  });

  const setAtalho = (tipo) => {
    const hoje_ = new Date();
    if (tipo === "semana") { setDataInicio(semIni); setDataFim(semFim); }
    else if (tipo === "mes") {
      setDataInicio(format(new Date(hoje_.getFullYear(), hoje_.getMonth(), 1), "yyyy-MM-dd"));
      setDataFim(format(new Date(hoje_.getFullYear(), hoje_.getMonth() + 1, 0), "yyyy-MM-dd"));
    } else if (tipo === "proximos7") {
      setDataInicio(format(hoje_, "yyyy-MM-dd"));
      setDataFim(format(addDays(hoje_, 7), "yyyy-MM-dd"));
    }
  };

  const handleIniciar = (p) => {
    updateMutation.mutate({ id: p.id, data: { status: "Em Andamento", hora_inicio: agora() } });
  };

  const handleConcluir = (p) => {
    const now = agora();
    const dataHoje = hoje();
    updateMutation.mutate({
      id: p.id,
      data: {
        status: "Concluído",
        hora_fim: now,
        data_realizada: dataHoje,
        ...(!p.hora_inicio ? { hora_inicio: now } : {}),
      }
    }, {
      onSuccess: () => setModalAssinatura(p.id),
    });
  };

  const filtradas = programacoes.filter(p => p.data_prevista >= dataInicio && p.data_prevista <= dataFim);

  // Agrupar por data
  const porData = filtradas.reduce((acc, p) => {
    const d = p.data_prevista;
    if (!acc[d]) acc[d] = [];
    acc[d].push(p);
    return acc;
  }, {});
  const datas = Object.keys(porData).sort();

  const getProgramacaoById = (id) => programacoes.find(p => p.id === id);

  return (
    <Tabs defaultValue="programacao">
      <TabsList className="bg-white border border-slate-200 mb-4">
        <TabsTrigger value="programacao" className="flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Programações
        </TabsTrigger>
        <TabsTrigger value="locais" className="flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Locais
        </TabsTrigger>
      </TabsList>

      <TabsContent value="locais">
        <AbaLocaisLimpeza />
      </TabsContent>

      <TabsContent value="programacao">
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-36" />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-36" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[["semana", "Esta semana"], ["mes", "Este mês"], ["proximos7", "Próx. 7 dias"]].map(([k, l]) => (
            <Button key={k} size="sm" variant="outline" onClick={() => setAtalho(k)} className="text-xs">{l}</Button>
          ))}
        </div>
        {isAdmin && (
          <div className="ml-auto">
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => { setEditando(null); setModalProg(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Nova Programação
            </Button>
          </div>
        )}
      </div>

      {/* Lista agrupada por dia */}
      {datas.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Calendar className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p>Nenhuma programação no período selecionado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {datas.map(data => (
            <div key={data}>
              <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                {format(new Date(data + "T00:00:00"), "EEEE, dd/MM/yyyy", { locale: ptBR })}
                {data === hoje() && <Badge className="bg-blue-100 text-blue-700 text-xs">Hoje</Badge>}
              </h3>
              <div className="space-y-2">
                {porData[data].map(p => {
                  const status = calcStatus(p);
                  const aguardandoLider = p.status === "Concluído" && p.assinatura_responsavel && !p.assinatura_lider;
                  const bgClass = status === "Atrasado" ? "bg-red-50 border-red-200" : data === hoje() ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200";

                  return (
                    <div key={p.id} className={`p-3 rounded-lg border flex items-start gap-3 ${bgClass}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-900 text-sm">{p.local_nome}</span>
                          <Badge className={`text-xs border ${STATUS_COLOR[status]}`}>{status}</Badge>
                          {aguardandoLider && <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">Aguard. líder</Badge>}
                          {p.status_assinatura === "Completo" && <Badge className="text-xs bg-green-100 text-green-700">✓ Assinado</Badge>}
                        </div>
                        <p className="text-xs text-slate-500">
                          {p.responsavel_nome} · {p.tipo_limpeza}
                          {p.hora_prevista && ` · ${p.hora_prevista}`}
                        </p>
                        {p.observacoes && <p className="text-xs text-slate-400 italic mt-0.5">"{p.observacoes}"</p>}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {status !== "Concluído" && (
                            <>
                              {status !== "Em Andamento" && (
                                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleIniciar(p)}>
                                  <Play className="w-3 h-3 mr-1" /> Iniciar
                                </Button>
                              )}
                              <Button size="sm" className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700" onClick={() => handleConcluir(p)}>
                                <CheckCircle className="w-3 h-3 mr-1" /> Concluir
                              </Button>
                            </>
                          )}
                          {(status === "Concluído" && !p.assinatura_lider) && (
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-orange-300 text-orange-700" onClick={() => setModalAssinatura(p.id)}>
                              <PenLine className="w-3 h-3 mr-1" /> Assinar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditando(p); setModalProg(true); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {p.status === "Pendente" && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate(p.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
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
      )}

      <ModalLimpezaProgramacao
        open={modalProg}
        onClose={() => { setModalProg(false); setEditando(null); }}
        programacao={editando}
        locais={locais}
        operadores={operadores}
        programacoes={programacoes}
        currentUser={currentUser}
      />

      {modalAssinatura && (
        <ModalAssinaturaLimpeza
          open={!!modalAssinatura}
          onClose={() => setModalAssinatura(null)}
          programacao={getProgramacaoById(modalAssinatura) || programacoes.find(p => p.id === modalAssinatura)}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />
      )}
    </div>
      </TabsContent>
    </Tabs>
  );
}