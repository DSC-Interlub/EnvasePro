import React from "react";

/**
 * Cartão de vidro da TV.
 *
 * Fundo translúcido (6% de branco) sobre o fundo quase preto, com borda de
 * 12% — é o que o protótipo chama de vidro e o que separa um bloco do outro
 * sem usar uma caixa sólida, que sobre fundo escuro pareceria um buraco.
 *
 * `tom="erro"` troca a borda para vermelha, como no cartão de ocorrências do
 * protótipo: o estado grave se anuncia pela moldura, não por pintar o cartão
 * inteiro — a 4 metros um bloco vermelho inteiro cansa e some o número.
 */
const BORDA = {
  neutro: "rgb(255 255 255 / .12)",
  erro: "rgb(var(--erro) / .5)",
  ok: "rgb(var(--ok) / .45)",
  atencao: "rgb(var(--atencao) / .45)",
};

export default function CartaoVidro({
  tom = "neutro", atraso = 0, raio = 40, className = "", style, children, ...props
}) {
  return (
    <div
      className={`entra flex min-w-0 ${className}`}
      style={{
        background: "rgb(255 255 255 / .06)",
        border: `1px solid ${BORDA[tom] || BORDA.neutro}`,
        borderRadius: `clamp(20px, ${raio / 19.2}vw, ${raio}px)`,
        animationDelay: atraso ? `${atraso}s` : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
