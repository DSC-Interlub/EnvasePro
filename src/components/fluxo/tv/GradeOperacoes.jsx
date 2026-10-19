import React, { useEffect, useState } from "react";
import CartaoOperacao from "./CartaoOperacao";
import { u } from "./unidade";

/**
 * As operações em andamento, em páginas de até quatro cartões.
 *
 * POR QUE PÁGINAS E NÃO ROLAGEM
 *
 * Ninguém rola uma TV. A versão anterior tinha `overflow-y-auto` na lista: com
 * mais operações do que cabiam, as de baixo simplesmente nunca apareciam. E a
 * consulta ainda cortava em 4 envases e 2 check-outs (`slice`), então a
 * contagem "em andamento" mentia acima disso.
 *
 * Agora todas aparecem: até quatro por página, e as páginas trocam sozinhas
 * dentro dos 30s que o painel fica na tela. Os pontinhos dizem quantas páginas
 * há, e também trocam a página quando tocados.
 *
 * Com um ou dois cartões a grade vira uma coluna; com um só, o cartão cresce
 * (`escala`), porque sobra a altura toda.
 */
const POR_PAGINA = 4;
const TEMPO_DO_PAINEL = 30000;

export default function GradeOperacoes({ titulo, contagem, itens = [], atraso = 0.2 }) {
  const paginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
  const [pagina, setPagina] = useState(0);
  const atual = Math.min(pagina, paginas - 1);

  useEffect(() => {
    if (paginas <= 1) return undefined;
    const t = setInterval(
      () => setPagina((p) => (p + 1) % paginas),
      Math.max(6000, Math.floor(TEMPO_DO_PAINEL / paginas)),
    );
    return () => clearInterval(t);
  }, [paginas]);

  const daPagina = itens.slice(atual * POR_PAGINA, atual * POR_PAGINA + POR_PAGINA);
  const colunas = daPagina.length <= 2 ? 1 : 2;
  const linhas = Math.ceil(daPagina.length / colunas);
  const escala = daPagina.length === 1 ? 1.45 : 1;

  return (
    <section className="flex min-h-0 min-w-0 flex-col" style={{ gap: u(0.8) }} aria-label={titulo}>
      <div className="flex flex-none items-center justify-between" style={{ gap: u(1) }}>
        <div className="flex min-w-0 items-baseline" style={{ gap: u(0.8) }}>
          <h2 className="font-extrabold uppercase tracking-[0.04em] text-tinta" style={{ fontSize: u(1.25) }}>
            {titulo}
          </h2>
          {contagem && (
            <span className="num font-bold text-texto-fraco" style={{ fontSize: u(1.05) }}>
              {contagem}
            </span>
          )}
        </div>

        {paginas > 1 && (
          <div className="flex flex-none items-center" style={{ gap: u(0.5) }}>
            {Array.from({ length: paginas }, (_, i) => (
              <button
                key={i}
                type="button"
                data-tv-pagina=""
                aria-label={`Página ${i + 1} de ${paginas}`}
                aria-current={i === atual ? "page" : undefined}
                onClick={() => setPagina(i)}
                className="press rounded-full transition-all"
                style={{
                  height: u(0.75),
                  width: i === atual ? u(2.2) : u(0.75),
                  background: i === atual ? "rgb(var(--marca))" : "rgb(255 255 255 / .25)",
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div
        key={atual}
        className="grid min-h-0 flex-1"
        style={{
          gap: u(1),
          gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${linhas}, minmax(0, 1fr))`,
        }}
      >
        {daPagina.map((it, i) => (
          <CartaoOperacao key={it.id} {...it} escala={escala} atraso={atraso + i * 0.06} />
        ))}
      </div>
    </section>
  );
}
