import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Package, CheckCircle, AlertCircle, Edit, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader, StatCard, SectionCard, StatusPill, EmptyState } from "@/components/fluxo";

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
      <div className="min-h-screen bg-fundo p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="cartao-fluxo">
            <EmptyState
              icone={AlertCircle}
              titulo="Programação não encontrada"
              legenda="O endereço não traz o identificador da programação."
              acao={
                <Link to={createPageUrl("Checkout")}>
                  <Button>Voltar para as programações</Button>
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  if (loadingProgramacao || loadingItems) {
    return (
      <div className="min-h-screen bg-fundo p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="cartao-fluxo"><EmptyState carregando /></div>
        </div>
      </div>
    );
  }

  const pendentes = items.filter(item => item.status === "Pendente");
  const criticos = items.filter(item => item.critico);
  const concluidos = items.filter(item => item.status === "Concluído");

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-7xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Check-out" }, { rotulo: "Execução" }]}
          titulo={`Check-out de ${programacao?.data_programada ? formatarData(programacao.data_programada, "dd/MM/yyyy") : ""}`}
          legenda={programacao?.data_programada
            ? formatarData(programacao.data_programada, "EEEE, d 'de' MMMM 'de' yyyy") : ""}
          acoes={
            <>
              {programacao && <StatusPill estado={statusCalculado} />}
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate(createPageUrl("Checkout"))}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar
              </Button>
            </>
          }
        />

        <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <StatCard rotulo="Total" valor={items.length} icone={Package} destaque atraso={0.05} />
          <StatCard
            rotulo="Pendentes" valor={pendentes.length} icone={AlertCircle}
            tom={pendentes.length > 0 ? "atencao" : "neutro"} atraso={0.1}
          />
          <StatCard
            rotulo="Críticos" valor={criticos.length} icone={AlertCircle}
            tom={criticos.length > 0 ? "erro" : "neutro"} atraso={0.15}
          />
          <StatCard
            rotulo="Concluídos" valor={concluidos.length} icone={CheckCircle}
            tom="ok" atraso={0.2}
          />
        </div>

        <SectionCard
          titulo="Observações da programação"
          icone={Edit}
          atraso={0.25}
          acoes={!editingObservacoes && (
            <Button variant="outline" size="lg" onClick={() => setEditingObservacoes(true)}>
              <Edit className="h-4 w-4" aria-hidden="true" />
              Editar
            </Button>
          )}
        >
          {editingObservacoes ? (
            <div className="flex min-w-0 flex-col gap-4">
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder='Ex: "Check-out começou tarde pois estávamos sem rede"'
                rows={3}
                aria-label="Observações da programação"
              />
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setEditingObservacoes(false);
                    setObservacoes(programacao?.observacoes || "");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  size="lg"
                  onClick={() => updateObservacoesMutation.mutate(observacoes)}
                  disabled={updateObservacoesMutation.isPending}
                >
                  {updateObservacoesMutation.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>
          ) : (
            <p className={`whitespace-pre-wrap font-semibold ${programacao?.observacoes ? "text-tinta" : "text-texto-apagado"}`}>
              {programacao?.observacoes || "Nenhuma observação adicionada"}
            </p>
          )}
        </SectionCard>

        {/* Adicionar pedidos. O botão abre e fecha o mesmo bloco; antes ele
            ficava solto à direita, sem nada que indicasse o que abriria. */}
        <SectionCard
          titulo="Adicionar pedidos"
          legenda="Cole as linhas copiadas do SAP: número, data e cliente, separados por tabulação"
          icone={Plus}
          atraso={0.3}
          acoes={
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowAddPedidos(!showAddPedidos)}
              aria-expanded={showAddPedidos}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {showAddPedidos ? "Fechar" : "Adicionar pedidos críticos"}
            </Button>
          }
        >
          {showAddPedidos ? (
            <div className="flex min-w-0 flex-col gap-4">
              <Textarea
                value={pedidosText}
                onChange={(e) => setPedidosText(e.target.value)}
                aria-label="Pedidos a adicionar"
                placeholder={"PV-20.235\t22/10/2025\tCooperativa Pecuária Holambra Ltda\nPV-20.236\t22/10/2025\tAlvoar Lácteos S/A"}
                rows={6}
                className="codigo text-sm"
              />
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => { setShowAddPedidos(false); setPedidosText(""); }}
                >
                  Cancelar
                </Button>
                <Button
                  size="lg"
                  onClick={handleAddPedidos}
                  disabled={!pedidosText.trim() || addPedidosMutation.isPending}
                >
                  {addPedidosMutation.isPending ? "Adicionando…" : "Adicionar pedidos"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold text-texto-apagado">
              {items.length} pedido(s) nesta programação.
            </p>
          )}
        </SectionCard>

        {items.length === 0 ? (
          <div className="cartao-fluxo">
            <EmptyState
              icone={Package}
              titulo="Nenhum pedido nesta programação"
              legenda="Use “Adicionar pedidos críticos” acima para colar a lista do SAP."
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            {items.map((item) => (
              <CheckoutItemCard key={item.id} item={item} operators={operators} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
