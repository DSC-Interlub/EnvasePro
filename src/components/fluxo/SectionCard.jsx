import React from "react";

/**
 * Seção de conteúdo: a caixa branca com título que compõe o corpo das telas.
 *
 * Substitui o `<Card><CardHeader><CardTitle>` repetido com variações de
 * padding e de borda em dezenas de lugares. Aqui o título é sempre 20px/800,
 * a legenda sempre 13px cinza, e o padding é um só.
 *
 * `semPadding` existe para o caso de o conteúdo ser uma tabela, que precisa
 * encostar nas bordas para as linhas usarem a largura toda.
 */
export default function SectionCard({
  titulo, legenda, acoes, icone: Icone, children, rodape,
  semPadding = false, atraso = 0, className = "",
}) {
  return (
    <section
      style={atraso ? { animationDelay: `${atraso}s` } : undefined}
      className={`entra cartao-fluxo flex flex-col min-w-0 ${className}`}
    >
      {(titulo || acoes) && (
        // Quebra a linha em vez de espremer: com ações largas (Limpeza, no
        // tablet) o título encolhia até virar uma letra.
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-6 pt-5 pb-4">
          <div className="flex min-w-[12rem] flex-1 items-center gap-2.5">
            {Icone && (
              <span aria-hidden="true"
                    className="w-9 h-9 rounded-token bg-marca-suave text-marca
                               flex items-center justify-center flex-shrink-0">
                <Icone className="w-[18px] h-[18px]" />
              </span>
            )}
            <div className="min-w-0">
              {titulo && (
                <h2 className="text-xl font-extrabold tracking-[-0.02em] text-tinta truncate">
                  {titulo}
                </h2>
              )}
              {legenda && (
                <p className="text-[13px] font-semibold text-texto-fraco">{legenda}</p>
              )}
            </div>
          </div>
          {acoes && <div className="flex min-w-0 flex-wrap items-center gap-2">{acoes}</div>}
        </div>
      )}

      <div className={semPadding ? "min-w-0" : "px-6 pb-6 min-w-0"}>{children}</div>

      {rodape && (
        <div className="border-t border-borda px-6 py-4">{rodape}</div>
      )}
    </section>
  );
}
