
import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Upload, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { formatarData } from '@/lib/datas';

export default function NovaProgramacaoCheckout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dataProgramada, setDataProgramada] = useState(format(new Date(), "yyyy-MM-dd"));
  const [observacoes, setObservacoes] = useState("");
  const [pedidosText, setPedidosText] = useState("");
  const [pedidosParsed, setPedidosParsed] = useState([]);
  const [error, setError] = useState(null);

  const createProgramacaoMutation = useMutation({
    mutationFn: async (data) => {
      const programacao = await base44.entities.CheckoutProgramacao.create({
        data_programada: data.data_programada,
        total_pedidos: data.items.length,
        pedidos_concluidos: 0,
        status: "Pendente",
        observacoes: data.observacoes
      });

      const itemsWithProgramacaoId = data.items.map(item => ({
        ...item,
        programacao_id: programacao.id
      }));

      await base44.entities.CheckoutItem.bulkCreate(itemsWithProgramacaoId);
      
      return programacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-programacoes'] });
      navigate(createPageUrl("Checkout"));
    },
    onError: (error) => {
      setError("Erro ao criar programação. Verifique os dados e tente novamente.");
    }
  });

  const parsePedidos = () => {
    setError(null);
    const lines = pedidosText.trim().split('\n');
    const parsed = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Formato esperado: PV-20.235	22/10/2025	Cliente Nome
      const parts = line.split('\t');
      
      if (parts.length >= 3) {
        const [numeroPedido, dataEntrega, ...clienteParts] = parts;
        const cliente = clienteParts.join(' ').trim();
        
        // Converter data de dd/MM/yyyy para yyyy-MM-dd
        const dataParts = dataEntrega.trim().split('/');
        if (dataParts.length === 3) {
          const [dia, mes, ano] = dataParts;
          const dataFormatted = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
          
          parsed.push({
            numero_pedido: numeroPedido.trim(),
            data_entrega: dataFormatted,
            cliente: cliente,
            status: "Pendente"
          });
        }
      }
    }
    
    if (parsed.length === 0) {
      setError("Nenhum pedido válido encontrado. Verifique o formato dos dados colados.");
      return;
    }
    
    setPedidosParsed(parsed);
  };

  const removePedido = (index) => {
    setPedidosParsed(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (pedidosParsed.length === 0) {
      setError("Adicione pelo menos um pedido à programação.");
      return;
    }
    
    createProgramacaoMutation.mutate({
      data_programada: dataProgramada,
      observacoes: observacoes,
      items: pedidosParsed
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(createPageUrl("Checkout"))}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Nova Programação de Check-out</h1>
            <p className="text-slate-600 mt-1">Crie a programação e importe os pedidos</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Data da Programação */}
          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-xl font-bold text-slate-900">
                Data da Programação
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="data_programada">Data para o Check-out *</Label>
                <Input
                  id="data_programada"
                  type="date"
                  value={dataProgramada}
                  onChange={(e) => setDataProgramada(e.target.value)}
                  required
                  className="max-w-md"
                />
                <p className="text-sm text-slate-500">
                  Selecione o dia em que os check-outs serão realizados
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações da Programação</Label>
                <Textarea
                  id="observacoes"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder='Ex: "Check-out começou tarde pois estávamos sem rede"'
                  rows={3}
                />
                <p className="text-sm text-slate-500">
                  Adicione observações gerais sobre esta programação
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Importar Pedidos */}
          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-xl font-bold text-slate-900">
                Importar Pedidos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pedidos">Cole a lista de pedidos</Label>
                <Textarea
                  id="pedidos"
                  value={pedidosText}
                  onChange={(e) => setPedidosText(e.target.value)}
                  placeholder="PV-20.235	22/10/2025	Cooperativa Pecuária Holambra Ltda
PV-20.236	22/10/2025	Alvoar Lácteos S/A
PV-20.237	22/10/2025	Tec Tor Indústria e Comércio de"
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-sm text-slate-500">
                  Cole os dados no formato: PV-XXXXX [TAB] Data [TAB] Cliente
                </p>
              </div>

              <Button
                type="button"
                onClick={parsePedidos}
                variant="outline"
                className="w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                Processar Pedidos
              </Button>
            </CardContent>
          </Card>

          {/* Lista de Pedidos Processados */}
          {pedidosParsed.length > 0 && (
            <Card className="border-slate-200 shadow-lg">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-xl font-bold text-slate-900">
                  Pedidos Importados ({pedidosParsed.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {pedidosParsed.map((pedido, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{pedido.numero_pedido}</p>
                        <p className="text-sm text-slate-600">{pedido.cliente}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Entrega: {formatarData(pedido.data_entrega, "dd/MM/yyyy")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePedido(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botão Salvar */}
          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={createProgramacaoMutation.isPending || pedidosParsed.length === 0}
          >
            <Save className="w-4 h-4 mr-2" />
            {createProgramacaoMutation.isPending ? "Salvando..." : "Criar Programação"}
          </Button>
        </form>
      </div>
    </div>
  );
}
