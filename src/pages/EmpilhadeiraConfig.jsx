import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Wrench, Plus, CheckCircle, AlertCircle, Settings } from "lucide-react";
import { format, differenceInDays, parseISO, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function EmpilhadeiraConfigPage() {
  const queryClient = useQueryClient();
  const [showManutencaoModal, setShowManutencaoModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [manutencaoForm, setManutencaoForm] = useState({ tipo: "Preventiva", descricao: "", responsavel: "", data_manutencao: format(new Date(), "yyyy-MM-dd") });
  const [configForm, setConfigForm] = useState(null);

  const { data: empilhadeiras } = useQuery({
    queryKey: ["empilhadeiras-config"],
    queryFn: () => base44.entities.EmpilhadeiraConfig.list(),
    initialData: [],
  });

  const { data: manutencoes } = useQuery({
    queryKey: ["empilhadeira-manutencoes"],
    queryFn: () => base44.entities.EmpilhadeiraManutencao.list("-data_manutencao"),
    initialData: [],
  });

  const empilhadeira = empilhadeiras[0];

  const salvarConfigMutation = useMutation({
    mutationFn: async (data) => {
      if (empilhadeira) {
        return base44.entities.EmpilhadeiraConfig.update(empilhadeira.id, data);
      } else {
        return base44.entities.EmpilhadeiraConfig.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empilhadeiras-config"] });
      setEditMode(false);
    },
  });

  const registrarManutencaoMutation = useMutation({
    mutationFn: async (data) => {
      const manut = await base44.entities.EmpilhadeiraManutencao.create({
        ...data,
        empilhadeira_id: empilhadeira?.id || "default",
      });
      // Atualizar config com datas
      if (empilhadeira) {
        const proxima = format(addDays(new Date(data.data_manutencao), empilhadeira.intervalo_manutencao_dias || 90), "yyyy-MM-dd");
        await base44.entities.EmpilhadeiraConfig.update(empilhadeira.id, {
          data_ultima_manutencao: data.data_manutencao,
          data_proxima_manutencao: proxima,
        });
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

  const diasParaManutencao = empilhadeira?.data_proxima_manutencao
    ? differenceInDays(parseISO(empilhadeira.data_proxima_manutencao), new Date())
    : null;

  const handleEditInit = () => {
    setConfigForm(empilhadeira || {
      nome: "", marca: "", modelo: "", numero_serie: "", ativa: true,
      intervalo_manutencao_dias: 90, observacoes: ""
    });
    setEditMode(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Settings className="w-7 h-7 text-amber-600" /> Configuração da Empilhadeira
            </h1>
            <p className="text-slate-500 text-sm mt-1">Cadastro, manutenções e alertas</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleEditInit}>
              {empilhadeira ? "Editar" : "Cadastrar Empilhadeira"}
            </Button>
            {empilhadeira && (
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => setShowManutencaoModal(true)}>
                <Wrench className="w-4 h-4 mr-2" /> Registrar Manutenção
              </Button>
            )}
          </div>
        </div>

        {/* Status da manutenção */}
        {empilhadeira && diasParaManutencao !== null && (
          <Card className={`border-2 shadow-lg ${diasParaManutencao < 0 ? "border-red-400 bg-red-50" : diasParaManutencao <= 7 ? "border-orange-400 bg-orange-50" : "border-green-300 bg-green-50"}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                {diasParaManutencao < 0
                  ? <AlertCircle className="w-10 h-10 text-red-600 flex-shrink-0" />
                  : diasParaManutencao <= 7
                  ? <AlertCircle className="w-10 h-10 text-orange-600 flex-shrink-0" />
                  : <CheckCircle className="w-10 h-10 text-green-600 flex-shrink-0" />}
                <div>
                  <p className="font-bold text-lg text-slate-900">
                    {diasParaManutencao < 0
                      ? `Manutenção atrasada há ${Math.abs(diasParaManutencao)} dias`
                      : diasParaManutencao === 0
                      ? "Manutenção prevista para HOJE"
                      : `Próxima manutenção em ${diasParaManutencao} dias`}
                  </p>
                  <p className="text-sm text-slate-600">
                    Prevista para: {empilhadeira.data_proxima_manutencao
                      ? format(parseISO(empilhadeira.data_proxima_manutencao), "dd/MM/yyyy")
                      : "Não definida"}
                    {empilhadeira.data_ultima_manutencao && ` · Última: ${format(parseISO(empilhadeira.data_ultima_manutencao), "dd/MM/yyyy")}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dados da empilhadeira */}
        {empilhadeira && !editMode && (
          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-600" /> {empilhadeira.nome}
                <Badge className={empilhadeira.ativa ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                  {empilhadeira.ativa ? "Ativa" : "Inativa"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                {empilhadeira.marca && <div><p className="text-slate-500">Marca</p><p className="font-medium">{empilhadeira.marca}</p></div>}
                {empilhadeira.modelo && <div><p className="text-slate-500">Modelo</p><p className="font-medium">{empilhadeira.modelo}</p></div>}
                {empilhadeira.numero_serie && <div><p className="text-slate-500">Nº Série</p><p className="font-medium font-mono">{empilhadeira.numero_serie}</p></div>}
                <div><p className="text-slate-500">Intervalo de Manutenção</p><p className="font-medium">{empilhadeira.intervalo_manutencao_dias} dias</p></div>
              </div>
              {empilhadeira.observacoes && <p className="text-sm text-slate-500 mt-3 italic">"{empilhadeira.observacoes}"</p>}
            </CardContent>
          </Card>
        )}

        {/* Formulário de edição */}
        {editMode && configForm && (
          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle>Dados da Empilhadeira</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={configForm.nome} onChange={e => setConfigForm(p => ({ ...p, nome: e.target.value }))} placeholder="Empilhadeira 01" />
                </div>
                <div className="space-y-2">
                  <Label>Intervalo de Manutenção (dias) *</Label>
                  <Input type="number" value={configForm.intervalo_manutencao_dias} onChange={e => setConfigForm(p => ({ ...p, intervalo_manutencao_dias: parseInt(e.target.value) || 90 }))} />
                </div>
                <div className="space-y-2">
                  <Label>Marca</Label>
                  <Input value={configForm.marca || ""} onChange={e => setConfigForm(p => ({ ...p, marca: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Modelo</Label>
                  <Input value={configForm.modelo || ""} onChange={e => setConfigForm(p => ({ ...p, modelo: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Número de Série</Label>
                  <Input value={configForm.numero_serie || ""} onChange={e => setConfigForm(p => ({ ...p, numero_serie: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={configForm.ativa ? "ativa" : "inativa"} onValueChange={v => setConfigForm(p => ({ ...p, ativa: v === "ativa" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="inativa">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data da Última Manutenção</Label>
                  <Input type="date" value={configForm.data_ultima_manutencao || ""} onChange={e => setConfigForm(p => ({ ...p, data_ultima_manutencao: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Data da Próxima Manutenção</Label>
                  <Input type="date" value={configForm.data_proxima_manutencao || ""} onChange={e => setConfigForm(p => ({ ...p, data_proxima_manutencao: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={configForm.observacoes || ""} onChange={e => setConfigForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => salvarConfigMutation.mutate(configForm)} disabled={!configForm.nome || salvarConfigMutation.isPending}>
                  {salvarConfigMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de manutenções */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg">Histórico de Manutenções ({manutencoes.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {manutencoes.length === 0 ? (
              <p className="text-slate-400 text-center py-6">Nenhuma manutenção registrada</p>
            ) : (
              <div className="space-y-3">
                {manutencoes.map(m => (
                  <div key={m.id} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Wrench className="w-5 h-5 text-amber-700" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-amber-100 text-amber-800 text-xs">{m.tipo}</Badge>
                        <span className="text-sm font-medium text-slate-700">
                          {format(parseISO(m.data_manutencao), "dd/MM/yyyy")}
                        </span>
                        {m.responsavel && <span className="text-xs text-slate-400">por {m.responsavel}</span>}
                      </div>
                      {m.descricao && <p className="text-sm text-slate-600">{m.descricao}</p>}
                      {m.proxima_prevista && (
                        <p className="text-xs text-slate-400 mt-1">
                          Próxima prevista: {format(parseISO(m.proxima_prevista), "dd/MM/yyyy")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Manutenção */}
      <Dialog open={showManutencaoModal} onOpenChange={setShowManutencaoModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Manutenção</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Data da Manutenção *</Label>
              <Input type="date" value={manutencaoForm.data_manutencao} onChange={e => setManutencaoForm(p => ({ ...p, data_manutencao: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={manutencaoForm.tipo} onValueChange={v => setManutencaoForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Preventiva", "Corretiva", "Revisão Geral"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Input value={manutencaoForm.responsavel} onChange={e => setManutencaoForm(p => ({ ...p, responsavel: e.target.value }))} placeholder="Nome do responsável" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={manutencaoForm.descricao} onChange={e => setManutencaoForm(p => ({ ...p, descricao: e.target.value }))} placeholder="O que foi feito..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManutencaoModal(false)}>Cancelar</Button>
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => registrarManutencaoMutation.mutate(manutencaoForm)} disabled={registrarManutencaoMutation.isPending}>
              {registrarManutencaoMutation.isPending ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}