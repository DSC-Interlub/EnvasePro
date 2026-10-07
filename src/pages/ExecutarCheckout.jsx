
import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Package, CheckCircle, AlertCircle, Edit, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import CheckoutItemCard from "../components/checkout/CheckoutItemCard";
import { formatarData } from '@/lib/datas';

export default function ExecutarCheckout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const programacaoId = urlParams.get('id');
  const [showAddPedidos, setShowAddPedidos] = useState(false);
  const [pedidosText, setPedidosText] = useState("");
  const [editingObservacoes, setEditingObservacoes] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const lastUpdateRef = useRef({ status: null, concluidos: null });

  const { data: programacao, isLoading: loadingProgramacao } = useQuery({
    queryKey: ['checkout-programacao', programacaoId],
    queryFn: async () => {
      console.log('🔍 Buscando programação:', programacaoId);
      const allProg = await base44.entities.CheckoutProgramacao.list();
      const found = allProg.find(p => p.id === programacaoId);
      console.log('📦 Programação encontrada:', found);
      return found;
    },
    enabled: !!programacaoId,
  });

  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['checkout-items', programacaoId],
    queryFn: async () => {
      console.log('🔍 Buscando items para programação:', programacaoId);
      const foundItems = await base44.entities.CheckoutItem.filter({ programacao_id: programacaoId });
      console.log('📦 Items encontrados:', foundItems.length, foundItems);
      return foundItems;
    },
    initialData: [],
    enabled: !!programacaoId,
  });

  const { data: operators } = useQuery({
    queryKey: ['operators'],
    queryFn: () => base44.entities.Operator.list(),
    initialData: [],
  });

  const updateProgramacaoMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CheckoutProgramacao.update(id, data),
    onSuccess: (updatedProg) => {
      // Update otimista do cache
      queryClient.setQueryData(['checkout-programacao', programacaoId], updatedProg);
    },
  });

  const addPedidosMutation = useMutation({
    mutationFn: async (itemsToAdd) => {
      const itemsWithProgramacaoId = itemsToAdd.map(item => ({
        ...item,
        programacao_id: programacaoId
      }));
      const newItems = await base44.entities.CheckoutItem.bulkCreate(itemsWithProgramacaoId);

      // The total_pedidos update will now be handled by the useEffect that observes items.length
      // const currentTotal = programacao.total_pedidos || 0;
      // await base44.entities.CheckoutProgramacao.update(programacaoId, {
      //   total_pedidos: currentTotal + itemsToAdd.length
      // });

      return newItems;
    },
    onSuccess: () => {
      // Invalidar queries para recarregar os dados
      queryClient.invalidateQueries({ queryKey: ['checkout-items', programacaoId] });
      queryClient.invalidateQueries({ queryKey: ['checkout-programacao', programacaoId] });
      setShowAddPedidos(false);
      setPedidosText("");
    },
  });

  const updateObservacoesMutation = useMutation({
    mutationFn: (obs) => base44.entities.CheckoutProgramacao.update(programacaoId, { observacoes: obs }),
    onSuccess: (updatedProg) => {
      queryClient.setQueryData(['checkout-programacao', programacaoId], updatedProg);
      setEditingObservacoes(false);
    },
  });

  useEffect(() => {
    if (programacao) {
      setObservacoes(programacao.observacoes || "");
    }
  }, [programacao?.id]);

  // Calcular status da programação localmente
  const calcularStatusProgramacao = () => {
    if (!items || items.length === 0) return { status: "Pendente", concluidos: 0 };
    
    const concluidos = items.filter(item => item.status === "Concluído").length;
    const emAndamento = items.some(item => item.status === "Em Andamento");

    let status = "Pendente";
    if (concluidos === items.length && items.length > 0) {
      status = "Concluído";
    } else if (emAndamento || concluidos > 0) {
      status = "Em Andamento";
    }

    return { status, concluidos };
  };

  const { status: statusCalculado, concluidos: concluidosCalculado } = calcularStatusProgramacao();

  // Atualizar programação APENAS quando status ou total_pedidos mudar de forma significativa
  useEffect(() => {
    if (!programacao || !items) return; // Removed items.length === 0 here to allow update for 0 items if needed

    const hasChanged = 
      lastUpdateRef.current.status !== statusCalculado || 
      lastUpdateRef.current.concluidos !== concluidosCalculado;

    // Check if current programacao status or concluidos differs from calculated,
    // OR if the total_pedidos count has changed
    if (hasChanged || programacao.total_pedidos !== items.length) {
      console.log('📊 Status ou contagem de pedidos mudou, atualizando após 2s...');

      lastUpdateRef.current = { status: statusCalculado, concluidos: concluidosCalculado };

      const timeoutId = setTimeout(() => {
        updateProgramacaoMutation.mutate({
          id: programacao.id,
          data: {
            status: statusCalculado,
            pedidos_concluidos: concluidosCalculado,
            total_pedidos: items.length // Ensure total_pedidos is updated
          }
        });
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [statusCalculado, concluidosCalculado, items.length, programacao?.id, programacao?.status, programacao?.pedidos_concluidos, programacao?.total_pedidos]);


  const handleAddPedidos = () => {
    const lines = pedidosText.trim().split('\n');
    const parsed = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split('\t');

      if (parts.length >= 3) {
        const [numeroPedido, dataEntregaStr, ...clienteParts] = parts;
        const cliente = clienteParts.join(' ').trim();

        const dataParts = dataEntregaStr.trim().split('/');
        if (dataParts.length === 3) {
          const [dia, mes, ano] = dataParts;
          const dataFormatted = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;

          parsed.push({
            numero_pedido: numeroPedido.trim(),
            data_entrega: dataFormatted,
            cliente: cliente,
            status: "Pendente",
            critico: true
          });
        }
      }
    }

    if (parsed.length > 0) {
      addPedidosMutation.mutate(parsed);
    }
  };

  if (!programacaoId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="border-red-200">
            <CardContent className="p-6">
              <p className="text-red-600">Programação não encontrada</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loadingProgramacao || loadingItems) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-slate-600">Carregando programação...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const pendentes = items.filter(item => item.status === "Pendente");
  const criticos = items.filter(item => item.critico);
  const concluidos = items.filter(item => item.status === "Concluído");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Checkout"))}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">
              Check-out - {programacao?.data_programada ? formatarData(programacao.data_programada, "dd/MM/yyyy") : ''}
            </h1>
            <p className="text-slate-600 mt-1">
              {programacao?.data_programada ? formatarData(programacao.data_programada, "EEEE, d 'de' MMMM 'de' yyyy") : ''}
            </p>
          </div>
          {programacao && (
            <Badge className={
              statusCalculado === "Pendente" ? "bg-yellow-100 text-yellow-800" :
              statusCalculado === "Em Andamento" ? "bg-blue-100 text-blue-800" :
              "bg-green-100 text-green-800"
            }>
              {statusCalculado}
            </Badge>
          )}
        </div>

        {/* Observações da Programação */}
        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-bold text-slate-900">
                Observações da Programação
              </CardTitle>
              {!editingObservacoes && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingObservacoes(true)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {editingObservacoes ? (
              <div className="space-y-4">
                <Textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder='Ex: "Check-out começou tarde pois estávamos sem rede"'
                  rows={3}
                />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingObservacoes(false);
                      setObservacoes(programacao?.observacoes || "");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => updateObservacoesMutation.mutate(observacoes)}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={updateObservacoesMutation.isPending}
                  >
                    {updateObservacoesMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-slate-700 whitespace-pre-wrap">
                {programacao?.observacoes || "Nenhuma observação adicionada"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Total</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {items.length}
                  </p>
                </div>
                <Package className="w-8 h-8 text-slate-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-1">
                    {pendentes.length}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Críticos</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {criticos.length}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">Concluídos</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">
                    {concluidos.length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Botão Adicionar Pedidos */}
        <div className="flex justify-end">
          <Button
            onClick={() => setShowAddPedidos(!showAddPedidos)}
            variant="outline"
            className="bg-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Pedidos Críticos
          </Button>
        </div>

        {/* Formulário para Adicionar Pedidos */}
        {showAddPedidos && (
          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-slate-900">
                Adicionar Pedidos à Programação
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Textarea
                value={pedidosText}
                onChange={(e) => setPedidosText(e.target.value)}
                placeholder="PV-20.235	22/10/2025	Cooperativa Pecuária Holambra Ltda
PV-20.236	22/10/2025	Alvoar Lácteos S/A"
                rows={6}
                className="font-mono text-sm"
              />
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddPedidos(false);
                    setPedidosText("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleAddPedidos}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={!pedidosText.trim() || addPedidosMutation.isPending}
                >
                  {addPedidosMutation.isPending ? "Adicionando..." : "Adicionar Pedidos"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de Pedidos */}
        <div className="space-y-4">
          {items.map((item) => (
            <CheckoutItemCard
              key={item.id}
              item={item}
              operators={operators}
            />
          ))}
        </div>

        {items.length === 0 && (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <Package className="w-16 h-16 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 mb-2">Nenhum pedido nesta programação</p>
              <p className="text-sm text-slate-400">
                Clique em "Adicionar Pedidos Críticos" para começar
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
