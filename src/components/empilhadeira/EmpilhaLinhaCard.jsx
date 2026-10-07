import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Play, Pause, RotateCcw, CheckCircle, AlertCircle, AlertTriangle, MapPin, Package, User, PenLine, Clock } from "lucide-react";
import { format } from "date-fns";

function calcDiffMinutes(h1, h2) {
  if (!h1 || !h2) return 0;
  const [ah, am] = h1.split(":").map(Number);
  const [bh, bm] = h2.split(":").map(Number);
  return (bh * 60 + bm) - (ah * 60 + am);
}

function minsToHHMM(mins) {
  if (mins < 0) mins = 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

const TIPO_BADGES = {
  Crítico: "bg-red-600 text-white",
  Avulso: "bg-amber-500 text-white",
};

// Etapas do modal de assinatura
const ETAPA_OPERADOR = 1;
const ETAPA_AJUDANTE = 2;
const ETAPA_CONCLUIDO = 3;

export default function EmpilhaLinhaCard({ linha, operators, programacaoId, currentUser }) {
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === "admin";

  const { data: admins } = useQuery({
    queryKey: ["admins-lista"],
    queryFn: async () => {
      const res = await base44.functions.invoke("listarAdmins", {});
      return res.data.admins || [];
    },
    initialData: [],
    enabled: isAdmin,
  });

  const [showIniciarModal, setShowIniciarModal] = useState(false);
  const [showAssinaturaModal, setShowAssinaturaModal] = useState(false);
  const [showOcorrenciaModal, setShowOcorrenciaModal] = useState(false);
  const [etapaAssinatura, setEtapaAssinatura] = useState(ETAPA_OPERADOR);

  // Iniciar
  const [empilhador, setEmpilhador] = useState(linha.operador_empilhadeira || "");
  const [ajudante, setAjudante] = useState(linha.operador_ajudante || "");

  // Assinatura - Etapa 1 (operador)
  const [checkOperador, setCheckOperador] = useState(false);
  const [nomeOperador, setNomeOperador] = useState(linha.operador_empilhadeira || "");

  // Assinatura - Etapa 2 (ajudante)
  const [checkAjudante, setCheckAjudante] = useState(false);
  const [nomeAjudante, setNomeAjudante] = useState(linha.operador_ajudante || "");

  // Assinatura - Etapa 3 (líder — somente admin)
  const [checkLider, setCheckLider] = useState(false);
  const [nomeLider, setNomeLider] = useState(currentUser?.full_name || "");

  // Ocorrência
  const [ocorrenciaDesc, setOcorrenciaDesc] = useState("");
  const [ocorrenciaTipo, setOcorrenciaTipo] = useState("Problema");
  const [ocorrenciaFuncao, setOcorrenciaFuncao] = useState("Empilhador");
  const [ocorrenciaRegistradoPor, setOcorrenciaRegistradoPor] = useState("");
  const [notificarLider, setNotificarLider] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["empilha-linhas", programacaoId] });
    queryClient.invalidateQueries({ queryKey: ["empilha-programacao", programacaoId] });
    queryClient.invalidateQueries({ queryKey: ["empilha-linhas-all"] });
  };

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.EmpilhaLinha.update(linha.id, data),
    onSuccess: invalidate,
  });

  const ocorrenciaMutation = useMutation({
    mutationFn: (data) => base44.entities.EmpilhaOcorrencia.create(data),
    onSuccess: async (ocorrencia) => {
      setShowOcorrenciaModal(false);
      setOcorrenciaDesc("");
      queryClient.invalidateQueries({ queryKey: ["empilha-ocorrencias"] });
      // Notificar admin por email se marcado
      if (notificarLider && ocorrencia?.id) {
        base44.functions.invoke("notificarOcorrencia", { ocorrencia_id: ocorrencia.id }).catch(() => {});
      }
    },
  });

  const handleIniciar = () => {
    if (!empilhador) return;
    const now = format(new Date(), "HH:mm");
    const opObj = operators?.find(o => o.nome === empilhador);
    const ajudObj = ajudante && ajudante !== "nenhum" ? operators?.find(o => o.nome === ajudante) : null;
    updateMutation.mutate({
      status: "Em Andamento",
      hora_inicio: linha.hora_inicio || now,
      operador_empilhadeira: empilhador,
      operador_empilhadeira_id: opObj ? opObj.id : null,
      operador_ajudante: ajudante === "nenhum" ? null : (ajudante || null),
      operador_ajudante_id: ajudObj ? ajudObj.id : null,
    });
    setShowIniciarModal(false);
  };

  const handlePausar = () => updateMutation.mutate({ status: "Pausado", hora_pausa: format(new Date(), "HH:mm") });
  const handleRetomar = () => updateMutation.mutate({ status: "Em Andamento", hora_retomada: format(new Date(), "HH:mm") });

  const handleFinalizar = () => {
    const now = format(new Date(), "HH:mm");
    const pausadoMins = linha.hora_pausa && linha.hora_retomada
      ? calcDiffMinutes(linha.hora_pausa, linha.hora_retomada) : 0;
    const efetivo = calcDiffMinutes(linha.hora_inicio, now) - pausadoMins;
    updateMutation.mutate({
      status: "Concluído",
      hora_termino: now,
      tempo_total: minsToHHMM(efetivo),
      tempo_pausado: minsToHHMM(pausadoMins),
      status_assinatura: "Pendente",
    });
    // Preparar modal de assinatura
    setNomeOperador(linha.operador_empilhadeira || empilhador || "");
    setNomeAjudante(linha.operador_ajudante || ajudante || "");
    setCheckOperador(false);
    setCheckAjudante(false);
    setCheckLider(false);
    setEtapaAssinatura(ETAPA_OPERADOR);
    setShowAssinaturaModal(true);
  };

  const temAjudante = (linha.operador_ajudante || ajudante) && (linha.operador_ajudante || ajudante) !== "nenhum";

  const handleConfirmarEtapa1 = () => {
    if (!checkOperador) return;
    const now = format(new Date(), "HH:mm");
    updateMutation.mutate({
      assinatura_operador: true,
      assinatura_operador_nome: nomeOperador,
      assinatura_operador_hora: now,
    });
    if (temAjudante) {
      setEtapaAssinatura(ETAPA_AJUDANTE);
    } else {
      // Pular etapa do ajudante
      updateMutation.mutate({
        assinatura_ajudante: false,
        status_assinatura: "Parcial",
      });
      setEtapaAssinatura(ETAPA_CONCLUIDO);
    }
  };

  const handleConfirmarEtapa2 = () => {
    if (!checkAjudante) return;
    const now = format(new Date(), "HH:mm");
    updateMutation.mutate({
      assinatura_ajudante: true,
      assinatura_ajudante_nome: nomeAjudante,
      assinatura_ajudante_hora: now,
      status_assinatura: "Parcial",
    });
    setEtapaAssinatura(ETAPA_CONCLUIDO);
  };

  const handleAssinarLider = () => {
    if (!isAdmin) return;
    if (!checkLider || !nomeLider) return;
    const now = format(new Date(), "HH:mm");
    updateMutation.mutate({
      assinatura_lider: true,
      assinatura_lider_nome: nomeLider,
      assinatura_lider_hora: now,
      status_assinatura: "Completo",
    });
    setShowAssinaturaModal(false);
  };

  const handleRegistrarOcorrencia = () => {
    ocorrenciaMutation.mutate({
      programacao_id: programacaoId,
      linha_id: linha.id,
      tipo: ocorrenciaTipo,
      descricao: ocorrenciaDesc,
      registrado_por: ocorrenciaRegistradoPor,
      registrado_por_funcao: ocorrenciaFuncao,
      data: format(new Date(), "yyyy-MM-dd"),
      hora: format(new Date(), "HH:mm"),
      notificado_lider: notificarLider,
      resolvido: false,
    });
  };

  const statusColors = {
    Pendente: "bg-slate-100 text-slate-700",
    "Em Andamento": "bg-blue-100 text-blue-800",
    Pausado: "bg-yellow-100 text-yellow-800",
    Concluído: "bg-green-100 text-green-800",
  };

  const tipoCor = linha.tipo_linha === "Crítico" ? "border-l-red-500 bg-red-50"
    : linha.tipo_linha === "Avulso" ? "border-l-amber-400 bg-amber-50"
    : "border-l-slate-300";

  // Badge de assinatura para linhas concluídas
  const renderBadgeAssinatura = () => {
    if (linha.status !== "Concluído") return null;
    if (linha.status_assinatura === "Completo" || (linha.assinatura_operador && linha.assinatura_lider)) {
      return <Badge className="bg-emerald-100 text-emerald-700 text-xs">✓ Assinado</Badge>;
    }
    return <Badge className="bg-orange-100 text-orange-700 text-xs animate-pulse">⏳ Aguardando assinatura do líder</Badge>;
  };

  return (
    <>
      <Card className={`border-l-4 shadow-sm ${tipoCor} ${linha.status === "Concluído" ? "opacity-75" : ""}`}>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {linha.tipo_linha && linha.tipo_linha !== "Normal" && (
                  <Badge className={`${TIPO_BADGES[linha.tipo_linha]} text-xs font-bold flex items-center gap-1`}>
                    <AlertCircle className="w-3 h-3" /> {linha.tipo_linha.toUpperCase()}
                  </Badge>
                )}
                <Badge className={statusColors[linha.status]}>{linha.status}</Badge>
                {renderBadgeAssinatura()}
              </div>

              <p className="font-bold text-slate-900 text-base leading-tight">
                {linha.descricao_produto || "Sem descrição"}
              </p>

              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                {linha.numero_item && <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{linha.numero_item}</span>}
                {linha.deposito && <span className="flex items-center gap-1"><Package className="w-3 h-3" />{linha.deposito}</span>}
                {linha.rua_torre && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{linha.rua_torre}</span>}
                {linha.quantidade && <span className="font-semibold text-slate-800">{linha.quantidade} un.</span>}
              </div>

              {(linha.operador_empilhadeira || linha.operador_ajudante) && (
                <div className="flex gap-3 text-xs text-slate-500 mt-1">
                  {linha.operador_empilhadeira && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {linha.operador_empilhadeira}</span>}
                  {linha.operador_ajudante && linha.operador_ajudante !== "nenhum" && <span className="flex items-center gap-1 text-slate-400"><User className="w-3 h-3" /> {linha.operador_ajudante} (ajudante)</span>}
                </div>
              )}

              {linha.hora_inicio && (
                <div className="flex gap-4 text-xs text-slate-400 mt-1">
                  <span>Início: {linha.hora_inicio}</span>
                  {linha.hora_termino && <span>Fim: {linha.hora_termino}</span>}
                  {linha.tempo_total && <span className="font-medium text-slate-600">Total: {linha.tempo_total}</span>}
                  {linha.tempo_pausado && linha.tempo_pausado !== "0:00" && <span className="text-yellow-600">Pausa: {linha.tempo_pausado}</span>}
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              {linha.status === "Pendente" && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setShowIniciarModal(true)}>
                  <Play className="w-3 h-3 mr-1" /> Iniciar
                </Button>
              )}
              {linha.status === "Em Andamento" && (
                <>
                  <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700 hover:bg-yellow-50" onClick={handlePausar} disabled={updateMutation.isPending}>
                    <Pause className="w-3 h-3 mr-1" /> Pausar
                  </Button>
                  <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-50" onClick={() => setShowOcorrenciaModal(true)}>
                    <AlertTriangle className="w-3 h-3 mr-1" /> Ocorrência
                  </Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleFinalizar} disabled={updateMutation.isPending}>
                    <CheckCircle className="w-3 h-3 mr-1" /> Finalizar
                  </Button>
                </>
              )}
              {linha.status === "Pausado" && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleRetomar} disabled={updateMutation.isPending}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Retomar
                  </Button>
                  <Button size="sm" variant="outline" className="border-orange-400 text-orange-700 hover:bg-orange-50" onClick={() => setShowOcorrenciaModal(true)}>
                    <AlertTriangle className="w-3 h-3 mr-1" /> Ocorrência
                  </Button>
                </>
              )}
              {/* Botão assinar líder — visível para admin quando líder ainda não assinou */}
              {linha.status === "Concluído" && !linha.assinatura_lider && isAdmin && (
                <Button size="sm" variant="outline" className="border-blue-400 text-blue-700 hover:bg-blue-50" onClick={() => {
                  setNomeLider(currentUser?.full_name || "");
                  setCheckLider(false);
                  setEtapaAssinatura(ETAPA_CONCLUIDO);
                  setShowAssinaturaModal(true);
                }}>
                  <PenLine className="w-3 h-3 mr-1" /> Assinar (Líder)
                </Button>
              )}
              {/* Botão assinar operador — quando operador ainda não assinou */}
              {linha.status === "Concluído" && !linha.assinatura_operador && (
                <Button size="sm" variant="outline" onClick={() => {
                  setNomeOperador(linha.operador_empilhadeira || "");
                  setNomeAjudante(linha.operador_ajudante || "");
                  setCheckOperador(false);
                  setCheckAjudante(false);
                  setEtapaAssinatura(ETAPA_OPERADOR);
                  setShowAssinaturaModal(true);
                }}>
                  <PenLine className="w-3 h-3 mr-1" /> Assinar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal Iniciar */}
      <Dialog open={showIniciarModal} onOpenChange={setShowIniciarModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Iniciar Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Operador Empilhadeira *</Label>
              <Select value={empilhador} onValueChange={setEmpilhador}>
                <SelectTrigger><SelectValue placeholder="Selecione o operador" /></SelectTrigger>
                <SelectContent>
                  {operators.filter(o => o.ativo).map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Operador Ajudante</Label>
              <Select value={ajudante} onValueChange={setAjudante}>
                <SelectTrigger><SelectValue placeholder="Selecione o ajudante" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {operators.filter(o => o.ativo && o.nome !== empilhador).map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIniciarModal(false)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleIniciar} disabled={!empilhador}>
              <Play className="w-4 h-4 mr-1" /> Iniciar Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Assinaturas — 3 etapas */}
      <Dialog open={showAssinaturaModal} onOpenChange={setShowAssinaturaModal}>
        <DialogContent>
          {/* Etapa 1 — Operador */}
          {etapaAssinatura === ETAPA_OPERADOR && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-green-600" /> Etapa 1 de {temAjudante ? "3" : "2"} — Assinatura do Operador
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 space-y-1">
                  <p><strong>Produto:</strong> {linha.descricao_produto || "—"}</p>
                  <p><strong>Quantidade:</strong> {linha.quantidade || "—"} un.</p>
                  <p><strong>Local:</strong> {linha.rua_torre || "—"}</p>
                </div>
                <div className="space-y-2">
                  <Label>Operador *</Label>
                  <Select value={nomeOperador} onValueChange={setNomeOperador}>
                    <SelectTrigger><SelectValue placeholder="Selecione o operador" /></SelectTrigger>
                    <SelectContent>
                      {operators.filter(o => o.ativo).map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-green-50 transition-colors">
                  <input type="checkbox" checked={checkOperador} onChange={e => setCheckOperador(e.target.checked)} className="w-5 h-5 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">Confirmo que realizei esta movimentação</span>
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssinaturaModal(false)}>Fechar</Button>
                <Button className="bg-green-600 hover:bg-green-700" onClick={handleConfirmarEtapa1} disabled={!checkOperador || !nomeOperador || updateMutation.isPending}>
                  Confirmar e continuar →
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Etapa 2 — Ajudante */}
          {etapaAssinatura === ETAPA_AJUDANTE && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-600" /> Etapa 2 de 3 — Assinatura do Ajudante
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Ajudante *</Label>
                  <Select value={nomeAjudante} onValueChange={setNomeAjudante}>
                    <SelectTrigger><SelectValue placeholder="Selecione o ajudante" /></SelectTrigger>
                    <SelectContent>
                      {operators.filter(o => o.ativo).map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-blue-50 transition-colors">
                  <input type="checkbox" checked={checkAjudante} onChange={e => setCheckAjudante(e.target.checked)} className="w-5 h-5 mt-0.5" />
                  <span className="text-sm font-medium text-slate-700">Confirmo que participei desta movimentação</span>
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEtapaAssinatura(ETAPA_CONCLUIDO); updateMutation.mutate({ status_assinatura: "Parcial" }); }}>
                  Pular ajudante
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleConfirmarEtapa2} disabled={!checkAjudante || !nomeAjudante || updateMutation.isPending}>
                  Confirmar e continuar →
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Etapa 3 — Líder (assíncrona) / Conclusão */}
          {etapaAssinatura === ETAPA_CONCLUIDO && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" /> {isAdmin ? "Etapa Final — Assinatura do Líder" : "Aguardando Assinatura do Líder"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {isAdmin ? (
                  <>
                    <div className="space-y-2">
                      <Label>Nome do Líder *</Label>
                      <Select value={nomeLider} onValueChange={setNomeLider}>
                        <SelectTrigger><SelectValue placeholder="Selecione o líder" /></SelectTrigger>
                        <SelectContent>
                          {(admins || []).map(a => (
                            <SelectItem key={a.id} value={a.full_name}>{a.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-amber-50 transition-colors">
                      <input type="checkbox" checked={checkLider} onChange={e => setCheckLider(e.target.checked)} className="w-5 h-5 mt-0.5" />
                      <span className="text-sm font-medium text-slate-700">Confirmo e assino como líder esta linha</span>
                    </label>
                  </>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                    <Clock className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                    <p className="font-semibold text-orange-800">Linha concluída com sucesso!</p>
                    <p className="text-sm text-orange-700 mt-1">A assinatura do líder é feita posteriormente por um administrador.</p>
                    <p className="text-xs text-orange-500 mt-2">Esta assinatura requer login de administrador.</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssinaturaModal(false)}>Fechar</Button>
                {isAdmin && (
                  <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleAssinarLider} disabled={!checkLider || !nomeLider || updateMutation.isPending}>
                    <PenLine className="w-4 h-4 mr-1" /> Assinar como Líder
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Ocorrência */}
      <Dialog open={showOcorrenciaModal} onOpenChange={setShowOcorrenciaModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Ocorrência</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={ocorrenciaTipo} onValueChange={setOcorrenciaTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Problema", "Amassado", "Produto errado", "Equipamento", "Outro"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Registrado por</Label>
              <Select value={ocorrenciaRegistradoPor} onValueChange={setOcorrenciaRegistradoPor}>
                <SelectTrigger><SelectValue placeholder="Selecione quem registra" /></SelectTrigger>
                <SelectContent>
                  {operators.filter(o => o.ativo).map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={ocorrenciaFuncao} onValueChange={setOcorrenciaFuncao}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Empilhador", "Ajudante", "Líder"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Textarea value={ocorrenciaDesc} onChange={e => setOcorrenciaDesc(e.target.value)} placeholder="Descreva o problema..." rows={3} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={notificarLider} onChange={e => setNotificarLider(e.target.checked)} />
              <Label>Notificar líder por e-mail</Label>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOcorrenciaModal(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={handleRegistrarOcorrencia} disabled={!ocorrenciaDesc || !ocorrenciaRegistradoPor || ocorrenciaMutation.isPending}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}