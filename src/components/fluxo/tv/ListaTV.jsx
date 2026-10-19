import React from "react";
import CartaoVidro from "./CartaoVidro";
import { u } from "./unidade";

/**
 * Lista curta da TV — hoje usada só pelas Importações.
 *
 * NÃO ROLA E NÃO CORTA. Ninguém rola uma TV, então `maximo` limita quantas
 * linhas entram, e o resto vira "+N" no fim, em vez de sumir sem aviso. E os
 * textos quebram linha em vez de terminar em "…".
 *
 * As operações em andamento NÃO passam mais por aqui: elas ganharam cartão
 * próprio (`CartaoOperacao`), porque são a informação que a fábrica lê.
 */
const PONTO = { ok: "bg-ok", atencao: "bg-atencao", erro: "bg-erro", neutro: "bg-texto-fraco" };

export default function ListaTV({ titulo, contagem, itens = [], vazio, carregando = false, maximo = 3 }) {
  const visiveis = itens.slice(0, maximo);
  const resto = itens.length - visiveis.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.7) }}>
      {titulo && (
        <div className="flex flex-none items-baseline" style={{ gap: u(0.8) }}>
          <h2 className="font-extrabold uppercase tracking-[0.04em] text-tinta" style={{ fontSize: u(1.25) }}>
            {titulo}
          </h2>
          {contagem != null && (
            <span className="num font-bold text-texto-fraco" style={{ fontSize: u(1.05) }}>
              {contagem}
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col" style={{ gap: u(0.6) }}>
        {carregando ? (
          <p className="font-bold text-texto-fraco" style={{ fontSize: u(1.2) }}>Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="font-bold text-texto-fraco" style={{ fontSize: u(1.2) }}>
            {vazio || "Nada em andamento agora"}
          </p>
        ) : (
          <>
            {visiveis.map((it) => (
              <CartaoVidro
                key={it.id}
                tom={it.tom === "erro" ? "erro" : "neutro"}
                raio={1.2}
                className="flex-none items-center"
                style={{ padding: `${u(0.7)} ${u(1.1)}`, gap: u(0.9) }}
              >
                <span
                  aria-hidden="true"
                  className={`flex-none rounded-full ${PONTO[it.tom] || PONTO.neutro}`}
                  style={{ width: u(0.75), height: u(0.75) }}
                />
                <div className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>
                  <div className="font-extrabold leading-[1.15] text-tinta" style={{ fontSize: u(1.3) }}>
                    {it.principal}
                  </div>
                  {it.secundario && (
                    <div className="font-semibold leading-[1.2] text-texto-fraco" style={{ fontSize: u(0.95) }}>
                      {it.secundario}
                    </div>
                  )}
                </div>
                {it.direita && (
                  <div className="flex-none text-right">
                    <div className="num font-extrabold leading-none text-tinta" style={{ fontSize: u(1.5) }}>
                      {it.direita}
                    </div>
                    {it.direitaLegenda && (
                      <div className="font-semibold text-texto-fraco" style={{ fontSize: u(0.85) }}>
                        {it.direitaLegenda}
                      </div>
                    )}
                  </div>
                )}
              </CartaoVidro>
            ))}
            {resto > 0 && (
              <p className="num font-bold text-texto-fraco" style={{ fontSize: u(1) }}>
                + {resto} {resto === 1 ? "outra" : "outras"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
