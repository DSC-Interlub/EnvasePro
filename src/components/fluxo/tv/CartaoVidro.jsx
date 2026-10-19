import React from "react";
import { u } from "./unidade";

/**
 * A superfície da TV: vidro escuro, borda de 1px, raio grande.
 *
 * `tom="erro"` muda só a borda — o fundo continua o mesmo vidro, para o
 * vermelho apontar sem gritar.
 *
 * `data-tv-cartao` marca o cartão para o portão `test-tv-layout`: todo texto
 * de dentro tem de caber dentro dele. Foi o que faltou na primeira versão,
 * quando o número da meta vazava por baixo e cobria a lista.
 *
 * `conteiner` liga `container-type: size`: o tamanho do cartão passa a vir SÓ
 * da grade em que ele está, nunca do conteúdo, e o conteúdo pode se medir por
 * ele (`cqw`/`cqh`). É o que impede um número grande de empurrar o layout.
 */
const BORDA = {
  neutro: "rgb(255 255 255 / .12)",
  erro: "rgb(var(--erro) / .55)",
  atencao: "rgb(var(--atencao) / .5)",
};

export default function CartaoVidro({
  tom = "neutro", atraso = 0, raio = 2, conteiner = false,
  className = "", style, children, ...props
}) {
  return (
    <div
      data-tv-cartao=""
      className={`entra flex min-h-0 min-w-0 overflow-hidden ${className}`}
      style={{
        background: "rgb(255 255 255 / .06)",
        border: `1px solid ${BORDA[tom] || BORDA.neutro}`,
        borderRadius: u(raio),
        containerType: conteiner ? "size" : undefined,
        animationDelay: atraso ? `${atraso}s` : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
