import React from "react";
import { Package, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { StatCard, EmptyState } from "@/components/fluxo";

/**
 * Indicadores de check-out — padrão Painel.
 *
 * Os tons agora significam alguma coisa: crítico em `atencao`, atraso em `erro`,
 * concluído em `ok`. Antes eram `bg-orange-500` e `bg-red-500` escolhidos à mão,
 * e "Pedidos Críticos" (laranja) parecia mais grave que "Finalizados com
 * Atraso" (vermelho) ou menos, dependendo de quem olhasse.
 *
 * As contas não mudaram.
 */
export default function CheckoutStatsGrid({ items, programacoes, isLoading }) {
  const concluidos = items.filter((i) => i.status === "Concluído");
  const criticos = items.filter((i) => i.critico);
  const atrasados = items.filter((i) => i.finalizado_fora_do_prazo);

  const stats = [
    {
      rotulo: "Total de pedidos",
      valor: items.length,
      icone: Package,
      destaque: true,
      legenda: `${programacoes.length} programações`,
    },
    {
      rotulo: "Pedidos concluídos",
      valor: concluidos.length,
      icone: CheckCircle,
      tom: "ok",
      legenda: `${((concluidos.length / items.length) * 100 || 0).toFixed(0)}% do total`,
    },
    {
      rotulo: "Pedidos críticos",
      valor: criticos.length,
      icone: AlertTriangle,
      tom: criticos.length > 0 ? "atencao" : "neutro",
      legenda: "necessitam atenção",
    },
    {
      rotulo: "Finalizados com atraso",
      valor: atrasados.length,
      icone: Clock,
      tom: atrasados.length > 0 ? "erro" : "neutro",
      legenda: "fora do prazo",
    },
  ];

  if (isLoading) {
    return (
      <div className="cartao-fluxo">
        <EmptyState carregando />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
      {stats.map((s, i) => (
        <StatCard key={s.rotulo} {...s} atraso={0.05 + i * 0.05} />
      ))}
    </div>
  );
}
