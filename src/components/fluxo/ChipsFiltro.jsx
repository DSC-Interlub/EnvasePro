import React from "react";

/**
 * Chips de filtro com contagem — o padrão Lista do protótipo.
 *
 * POR QUE A CONTAGEM IMPORTA
 *
 * As telas filtravam com abas ou com `<Select>`, e em nenhuma delas dava para
 * saber **quanto** tem em cada faixa sem trocar de filtro. O chip com o número
 * ao lado responde "tem alguma coisa reprovada?" sem clicar.
 *
 * O número vem de fora, calculado sobre a lista COMPLETA — não sobre a página
 * visível. Contar a página daria "3 críticos" quando há 40.
 *
 * Cada chip é um alvo de toque de 48px, como todo o resto.
 */
export default function ChipsFiltro({
  opcoes, valor, aoEscolher, rotulo = "Filtrar", className = "",
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {opcoes.map((op) => {
        const ativo = op.valor === valor;
        return (
          <button
            key={op.valor}
            type="button"
            onClick={() => aoEscolher(op.valor)}
            aria-pressed={ativo}
            className={`press foco-fluxo inline-flex min-h-[48px] items-center gap-2 rounded-full
                        px-4 text-sm font-bold
                        ${ativo
                          ? "bg-marca text-white shadow-marca"
                          : "bg-fundo text-tinta-media hover:bg-marca-suave hover:text-marca"}`}
          >
            {op.rotulo}
            {op.contagem != null && (
              <span
                className={`num rounded-full px-2 py-0.5 text-xs font-extrabold
                            ${ativo ? "bg-white/25 text-white" : "bg-cartao text-texto-fraco"}`}
              >
                {op.contagem}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
