import React from "react";
import { Factory, Package, TrendingUp, Users } from "lucide-react";
import { StatCard, EmptyState } from "@/components/fluxo";

/**
 * Indicadores de produção — padrão Painel.
 *
 * O que saiu: o círculo colorido de 128px girando atrás de cada cartão
 * (`translate-x-8 -translate-y-8 ... opacity-10`), que existia em cinco cores
 * diferentes — `green`, `emerald`, `marca`, `purple`, `orange` — das quais três
 * não eram token do sistema. O número tinha 30px; agora tem 60.
 *
 * O primeiro cartão vai em `destaque` porque é o total: era o mesmo cartão dos
 * outros quatro, e o olho não tinha onde pousar primeiro.
 *
 * As contas não mudaram.
 */
export default function StatsGrid({
  records,
  totalProduction,
  productsCount,
  operatorsCount,
  isLoading,
}) {
  const bio = records.filter((r) => r.sala === "Bio");
  const industrial = records.filter((r) => r.sala === "Industrial");
  const soma = (lista) => lista.reduce((s, r) => s + (r.quantidade_produzida || 0), 0);

  const stats = [
    {
      rotulo: "Produção total",
      valor: totalProduction.toLocaleString("pt-BR"),
      icone: TrendingUp,
      destaque: true,
      legenda: `${records.length} registros`,
    },
    {
      rotulo: "Produção Bio",
      valor: soma(bio).toLocaleString("pt-BR"),
      icone: Factory,
      legenda: `${bio.length} registros`,
    },
    {
      rotulo: "Produção Industrial",
      valor: soma(industrial).toLocaleString("pt-BR"),
      icone: Factory,
      legenda: `${industrial.length} registros`,
    },
    {
      rotulo: "Produtos cadastrados",
      valor: productsCount,
      icone: Package,
      legenda: "ativos",
    },
    {
      rotulo: "Operadores ativos",
      valor: operatorsCount,
      icone: Users,
      legenda: "cadastrados",
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
