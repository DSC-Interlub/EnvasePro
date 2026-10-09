import React from "react";
import { Button } from "@/components/ui/button";

/**
 * "Mostrando X de Y" e o botão de carregar mais 50.
 *
 * O número total fica visível de propósito: sem ele, uma lista cortada em 50
 * parece uma lista de 50 itens, e quem busca um produto que não apareceu não
 * tem como saber se ele não existe ou se só não foi carregado ainda.
 */
export default function RodapeDaLista({ mostrando, total, temMais, carregarMais, substantivo = "itens" }) {
  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 px-4 py-4">
      <p className="text-sm text-slate-600" role="status" aria-live="polite">
        Mostrando <strong>{mostrando}</strong> de <strong>{total}</strong> {substantivo}
      </p>
      {temMais && (
        <Button variant="outline" onClick={carregarMais} className="h-12 w-full sm:w-auto px-6">
          Carregar mais 50
        </Button>
      )}
    </div>
  );
}
