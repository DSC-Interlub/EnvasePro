import React from "react";
import { Search } from "lucide-react";

/**
 * O cartão de lista do padrão: barra de chips + busca em cima, conteúdo no
 * meio, rodapé de paginação embaixo.
 *
 * Substitui o `<Card><CardHeader>` com `flex justify-between` que cada tela de
 * lista montava do seu jeito — a busca tinha `w-64` fixo numa, `w-48` noutra, e
 * estourava no celular em todas.
 *
 * A busca é um `<input>` cru de propósito, e não o `<Input>`: aqui ela mora
 * dentro de uma caixa que já tem o fundo, a borda e o halo do foco (via
 * `foco-fluxo` no contêiner), então um segundo campo com fundo próprio
 * desenharia caixa dentro de caixa.
 */
export default function ListaCard({
  chips, busca, aoBuscar, placeholderBusca = "Buscar", rotuloBusca,
  acoesTopo, children, rodape, atraso = 0.08, className = "",
}) {
  const temTopo = chips || aoBuscar || acoesTopo;

  return (
    <section
      style={atraso ? { animationDelay: `${atraso}s` } : undefined}
      className={`entra cartao-fluxo flex min-w-0 flex-col overflow-hidden ${className}`}
    >
      {temTopo && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          {chips}

          <div className="flex flex-wrap items-center gap-2.5">
            {aoBuscar && (
              <div
                className="foco-fluxo flex h-12 items-center gap-2.5 rounded-token border-2
                           border-transparent bg-fundo px-4 transition-[border-color,box-shadow]"
              >
                <Search className="h-4 w-4 flex-none text-texto-apagado" aria-hidden="true" />
                <input
                  type="search"
                  value={busca ?? ""}
                  onChange={(e) => aoBuscar(e.target.value)}
                  placeholder={placeholderBusca}
                  aria-label={rotuloBusca || placeholderBusca}
                  className="h-12 w-40 flex-1 border-0 bg-transparent text-[15px] font-semibold
                             text-tinta outline-none placeholder:font-medium
                             placeholder:text-texto-apagado sm:w-56"
                />
              </div>
            )}
            {acoesTopo}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">{children}</div>

      {rodape && <div className="border-t border-borda px-5 py-4">{rodape}</div>}
    </section>
  );
}
