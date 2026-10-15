import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Save, Upload, Trash2, AlertCircle, Calendar, Package } from "lucide-react";
import { format } from "date-fns";
import { formatarData } from '@/lib/datas';
import { PageHeader, SectionCard } from "@/components/fluxo";

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
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-5xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Check-out" }, { rotulo: "Nova programação" }]}
          titulo="Nova programação de check-out"
          legenda="Escolha a data e cole os pedidos"
          acoes={
            <Button variant="outline" size="lg" onClick={() => navigate(createPageUrl("Checkout"))}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar
            </Button>
          }
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <SectionCard titulo="Data da programação" icone={Calendar} atraso={0.05}>
            <div className="flex min-w-0 flex-col gap-5">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="data_programada">Data para o check-out *</Label>
                <Input
                  id="data_programada"
                  type="date"
                  value={dataProgramada}
                  onChange={(e) => setDataProgramada(e.target.value)}
                  required
                  className="max-w-xs"
                />
                <p className="text-sm font-semibold text-texto-fraco">
                  O dia em que os check-outs serão realizados
                </p>
              </div>

              <div className="min-w-0 space-y-2">
                <Label htmlFor="observacoes">Observações da programação</Label>
                <Textarea
                  id="observacoes"
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder='Ex: "Check-out começou tarde pois estávamos sem rede"'
                  rows={3}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            titulo="Importar pedidos"
            legenda="Formato: PV-XXXXX, data e cliente, separados por tabulação"
            icone={Upload}
            atraso={0.1}
          >
            <div className="flex min-w-0 flex-col gap-4">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="pedidos">Cole a lista de pedidos</Label>
                <Textarea
                  id="pedidos"
                  value={pedidosText}
                  onChange={(e) => setPedidosText(e.target.value)}
                  placeholder={"PV-20.235\t22/10/2025\tCooperativa Pecuária Holambra Ltda\nPV-20.236\t22/10/2025\tAlvoar Lácteos S/A\nPV-20.237\t22/10/2025\tTec Tor Indústria e Comércio de"}
                  rows={8}
                  className="codigo text-sm"
                />
              </div>

              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={parsePedidos}
                disabled={!pedidosText.trim()}
                className="w-full"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Processar pedidos
              </Button>
            </div>
          </SectionCard>

          {pedidosParsed.length > 0 && (
            <SectionCard
              titulo="Pedidos importados"
              legenda={`${pedidosParsed.length} pedido(s) prontos para gravar`}
              icone={Package}
              atraso={0.15}
            >
              <ul className="flex max-h-96 min-w-0 flex-col gap-2 overflow-y-auto">
                {pedidosParsed.map((pedido, index) => (
                  <li
                    key={`${pedido.numero_pedido}-${index}`}
                    className="flex min-h-[56px] items-center justify-between gap-3
                               rounded-token bg-fundo px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="codigo truncate font-extrabold text-tinta">{pedido.numero_pedido}</p>
                      <p className="truncate text-sm font-semibold text-texto-fraco">{pedido.cliente}</p>
                      <p className="num text-xs font-semibold text-texto-apagado">
                        Entrega: {formatarData(pedido.data_entrega, "dd/MM/yyyy")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePedido(index)}
                      aria-label={`Remover o pedido ${pedido.numero_pedido} da lista`}
                      className="flex-none text-texto-fraco hover:bg-erro-suave hover:text-erro"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {/* O botão fica desabilitado sem pedido processado, e isso não era
              explicado em lugar nenhum: quem colava a lista e clicava direto em
              "Criar" encontrava um botão morto sem saber por quê. */}
          <div className="flex min-w-0 flex-col gap-2">
            <Button aria-label="Salvar"
              type="submit"
              size="lg"
              className="h-16 w-full rounded-painel text-base"
              disabled={createProgramacaoMutation.isPending || pedidosParsed.length === 0}
            >
              <Save className="h-5 w-5" aria-hidden="true" />
              {createProgramacaoMutation.isPending ? "Salvando…" : "Criar programação"}
            </Button>
            {pedidosParsed.length === 0 && (
              <p className="text-center text-sm font-semibold text-texto-apagado">
                Cole a lista e toque em “Processar pedidos” antes de criar.
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
