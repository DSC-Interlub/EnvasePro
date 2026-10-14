import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Barra de filtros.
 *
 * Cada tela montava a sua: um `<Card>` com `<div className="flex gap-4">`,
 * busca com largura fixa `w-64` (que estourava no celular), e os selects
 * soltos. Aqui a busca ocupa o que sobra, os filtros quebram linha, e no
 * celular tudo empilha.
 *
 * A busca é um `<Input>`, então herda o estilo de campo da direção — fundo
 * suave, sem borda, halo no foco.
 */
export default function FilterBar({
  busca, aoBuscar, placeholderBusca = "Buscar...", rotuloBusca,
  children, acoes, className = "",
}) {
  return (
    <div className={`cartao-fluxo flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${className}`}>
      {aoBuscar && (
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2
                       w-4 h-4 text-texto-apagado"
            aria-hidden="true"
          />
          <Input
            value={busca ?? ""}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder={placeholderBusca}
            aria-label={rotuloBusca || placeholderBusca}
            className="pl-10"
          />
        </div>
      )}

      {children && (
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">{children}</div>
      )}

      {acoes && (
        <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto flex-shrink-0">{acoes}</div>
      )}
    </div>
  );
}
