import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, Square, Save, Edit, Calendar, User, Package, Clock, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";

export default function CheckoutItemCard({ item, operators }) {
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(item.status === "Pendente" || item.status === "Em Andamento");
  const [timing, setTiming] = useState(false);
  const [showAtrasoForm, setShowAtrasoForm] = useState(false);

  const [formData, setFormData] = useState({
    operador: item.operador || "",
    operator_id: item.operator_id || null,
    hora_inicio: item.hora_inicio || "",
    hora_termino: item.hora_termino || "",
    critico: item.critico || false,
    data_saida: item.data_saida || "",
    observacoes: item.observacoes || "",
    status: item.status || "Pendente",
    finalizado_fora_do_prazo: item.finalizado_fora_do_prazo || false,
    data_finalizacao_real: item.data_finalizacao_real || "",
    motivo_atraso: item.motivo_atraso || ""
  });

  useEffect(() => {
    if (formData.hora_inicio && formData.hora_termino) {
      const inicio = new Date(`1970-01-01T${formData.hora_inicio}`);
      const termino = new Date(`1970-01-01T${formData.hora_termino}`);
      const diffMs = termino - inicio;
      const diffMins = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;

      setFormData(prev => ({
        ...prev,
        tempo_total: `${hours}:${mins.toString().padStart(2, '0')}`
      }));
    }
  }, [formData.hora_inicio, formData.hora_termino]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.CheckoutItem.update(item.id, data),
    onSuccess: (updatedItem) => {
      console.log('✅ Check-out salvo:', updatedItem);
      
      // Invalidar TODAS as queries relacionadas para garantir que a TV atualize
      queryClient.invalidateQueries({ queryKey: ['checkout-items', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-programacao', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-live'] });
      queryClient.invalidateQueries({ queryKey: ['checkout-programacoes-tv'] });
      
      setIsEditing(false);
      setShowAtrasoForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.CheckoutItem.delete(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-items', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-programacao', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-live'] });
    },
  });

  const handleStartTimer = () => {
    const now = format(new Date(), "HH:mm");
    const newData = { 
      ...formData, 
      hora_inicio: now, 
      status: "Em Andamento" 
    };
    setFormData(newData);
    setTiming(true);
    
    // SALVAR IMEDIATAMENTE quando iniciar
    console.log('🚀 Iniciando check-out e salvando automaticamente');
    updateMutation.mutate(newData);
  };

  const handleStopTimer = () => {
    const now = format(new Date(), "HH:mm");
    const newData = { 
      ...formData, 
      hora_termino: now, 
      status: "Concluído" 
    };
    setFormData(newData);
    setTiming(false);
    
    // SALVAR IMEDIATAMENTE quando parar
    console.log('⏹️ Finalizando check-out e salvando automaticamente');
    updateMutation.mutate(newData);
  };

  const handleSave = () => {
    let dataToSave = { ...formData };

    if (showAtrasoForm && formData.data_finalizacao_real && formData.motivo_atraso) {
      dataToSave.finalizado_fora_do_prazo = true;
      dataToSave.status = "Concluído";
    } else if (formData.hora_termino) {
      dataToSave.status = "Concluído";
    } else if (formData.hora_inicio) {
      dataToSave.status = "Em Andamento";
    } else {
      dataToSave.status = "Pendente";
    }

    console.log('💾 Salvando check-out:', item.numero_pedido, dataToSave);
    updateMutation.mutate(dataToSave);
  };

  const handleDelete = () => {
    if (confirm(`Tem certeza que deseja excluir o pedido ${item.numero_pedido}?`)) {
      deleteMutation.mutate();
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Pendente": return "bg-yellow-100 text-yellow-800";
      case "Em Andamento": return "bg-blue-100 text-blue-800";
      case "Concluído": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <Card className={`border-slate-200 shadow-lg ${
      item.critico
        ? 'border-l-4 border-l-red-500 bg-red-50/30'
        : item.finalizado_fora_do_prazo
          ? 'border-l-4 border-l-orange-500'
          : ''
    }`}>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <Package className={`w-5 h-5 ${item.critico ? 'text-red-600' : 'text-blue-600'}`} />
                <h3 className="text-lg font-bold text-slate-900">{item.numero_pedido}</h3>
                <Badge className={getStatusColor(formData.status)}>
                  {formData.status}
                </Badge>
                {item.critico && (
                  <Badge className="bg-red-600 text-white flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Crítico
                  </Badge>
                )}
                {item.finalizado_fora_do_prazo && (
                  <Badge className="bg-orange-100 text-orange-800">
                    Finalizado com Atraso
                  </Badge>
                )}
              </div>
              <p className="text-slate-700 font-medium">{item.cliente}</p>
              <p className="text-sm text-slate-500">
                Entrega: {format(new Date(item.data_entrega + 'T00:00:00'), "dd/MM/yyyy")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isEditing && !showAtrasoForm && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              )}
              {!showAtrasoForm && !item.finalizado_fora_do_prazo && item.status !== "Concluído" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAtrasoForm(true)}
                  className="text-orange-600 border-orange-600 hover:bg-orange-50"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Marcar Atraso
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDelete}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Formulário de Execução */}
          {(isEditing || showAtrasoForm) && (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              {/* Operador */}
              <div className="space-y-2">
                <Label htmlFor={`operador-${item.id}`}>Operador *</Label>
                <Select
                  value={formData.operador}
                  onValueChange={(value) => {
                    const opObj = operators?.find(op => op.nome === value);
                    setFormData(prev => ({ 
                      ...prev, 
                      operador: value, 
                      operator_id: opObj ? opObj.id : prev.operator_id 
                    }));
                  }}
                >
                  <SelectTrigger id={`operador-${item.id}`}>
                    <SelectValue placeholder="Selecione o operador" />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem key={op.id} value={op.nome}>
                        {op.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Horários */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`inicio-${item.id}`}>Início</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`inicio-${item.id}`}
                      type="time"
                      value={formData.hora_inicio}
                      onChange={(e) => setFormData(prev => ({ ...prev, hora_inicio: e.target.value }))}
                    />
                    <Button
                      type="button"
                      onClick={handleStartTimer}
                      disabled={timing || formData.hora_inicio || updateMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`termino-${item.id}`}>Término</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`termino-${item.id}`}
                      type="time"
                      value={formData.hora_termino}
                      onChange={(e) => setFormData(prev => ({ ...prev, hora_termino: e.target.value }))}
                    />
                    <Button
                      type="button"
                      onClick={handleStopTimer}
                      disabled={!formData.hora_inicio || formData.hora_termino || updateMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <Square className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tempo Total</Label>
                  <Input
                    value={formData.tempo_total || "--:--"}
                    disabled
                    className="bg-slate-100"
                  />
                </div>
              </div>

              {/* Crítico e Data de Saída */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`critico-${item.id}`}
                    checked={formData.critico}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, critico: checked }))}
                  />
                  <Label htmlFor={`critico-${item.id}`} className="cursor-pointer">
                    Pedido Crítico
                  </Label>
                </div>

                {formData.critico && (
                  <div className="space-y-2">
                    <Label htmlFor={`data_saida-${item.id}`}>Data de Saída</Label>
                    <Input
                      id={`data_saida-${item.id}`}
                      type="date"
                      value={formData.data_saida}
                      onChange={(e) => setFormData(prev => ({ ...prev, data_saida: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Campos de Atraso */}
              {showAtrasoForm && (
                <div className="border-t border-orange-200 pt-4 space-y-4 bg-orange-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />
                    Registrar Finalização com Atraso
                  </h4>

                  <div className="space-y-2">
                    <Label htmlFor={`data_finalizacao-${item.id}`}>Data Real de Finalização *</Label>
                    <Input
                      id={`data_finalizacao-${item.id}`}
                      type="date"
                      value={formData.data_finalizacao_real}
                      onChange={(e) => setFormData(prev => ({ ...prev, data_finalizacao_real: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`motivo-${item.id}`}>Motivo do Atraso *</Label>
                    <Textarea
                      id={`motivo-${item.id}`}
                      value={formData.motivo_atraso}
                      onChange={(e) => setFormData(prev => ({ ...prev, motivo_atraso: e.target.value }))}
                      placeholder="Descreva o motivo do atraso..."
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Observações */}
              <div className="space-y-2">
                <Label htmlFor={`observacoes-${item.id}`}>Observações</Label>
                <Textarea
                  id={`observacoes-${item.id}`}
                  value={formData.observacoes}
                  onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                  placeholder="Observações sobre o check-out..."
                  rows={2}
                />
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false);
                    setShowAtrasoForm(false);
                    setFormData({
                      operador: item.operador || "",
                      hora_inicio: item.hora_inicio || "",
                      hora_termino: item.hora_termino || "",
                      critico: item.critico || false,
                      data_saida: item.data_saida || "",
                      observacoes: item.observacoes || "",
                      status: item.status || "Pendente",
                      finalizado_fora_do_prazo: item.finalizado_fora_do_prazo || false,
                      data_finalizacao_real: item.data_finalizacao_real || "",
                      motivo_atraso: item.motivo_atraso || ""
                    });
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={updateMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updateMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}

          {/* Detalhes (quando não está editando) */}
          {!isEditing && !showAtrasoForm && item.operador && (
            <div className="border-t border-slate-200 pt-4 grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-500 flex items-center gap-1 mb-1">
                  <User className="w-4 h-4" />
                  Operador
                </p>
                <p className="font-semibold">{item.operador}</p>
              </div>
              <div>
                <p className="text-slate-500 flex items-center gap-1 mb-1">
                  <Clock className="w-4 h-4" />
                  Horário
                </p>
                <p className="font-semibold">
                  {item.hora_inicio} - {item.hora_termino || "--:--"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 mb-1">Tempo Total</p>
                <p className="font-semibold text-blue-600">{item.tempo_total || "--:--"}</p>
              </div>
              {item.critico && item.data_saida && (
                <div>
                  <p className="text-slate-500 flex items-center gap-1 mb-1">
                    <Calendar className="w-4 h-4" />
                    Data de Saída
                  </p>
                  <p className="font-semibold">{format(new Date(item.data_saida + 'T00:00:00'), "dd/MM/yyyy")}</p>
                </div>
              )}
              {item.finalizado_fora_do_prazo && (
                <>
                  <div>
                    <p className="text-slate-500 mb-1">Data Real de Finalização</p>
                    <p className="font-semibold text-orange-600">
                      {item.data_finalizacao_real ? format(new Date(item.data_finalizacao_real + 'T00:00:00'), "dd/MM/yyyy") : "N/A"}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-slate-500 mb-1">Motivo do Atraso</p>
                    <p className="text-slate-700 bg-orange-50 p-2 rounded border border-orange-200">
                      {item.motivo_atraso}
                    </p>
                  </div>
                </>
              )}
              {item.observacoes && (
                <div className="md:col-span-3">
                  <p className="text-slate-500 mb-1">Observações</p>
                  <p className="text-slate-700 bg-slate-50 p-2 rounded">{item.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}