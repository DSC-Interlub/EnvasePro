import React from "react";
import CartaoVidro from "./CartaoVidro";

/**
 * O número gigante da TV, com rótulo em cima e pílula embaixo.
 *
 * O tamanho do protótipo é **240px**. Aqui ele é `clamp`, porque a mesma tela
 * roda em 1920 e em 1366: um `font-size` fixo em 240 num monitor de 1366
 * estoura o cartão. O `clamp` mantém a proporção — o número continua sendo o
 * assunto da tela em qualquer largura.
 *
 * `tabular-nums` via `.num`: na TV, que atualiza sozinha, um número que muda
 * de largura a cada atualização "dança" e aparece de longe.
 */
const COR = {
  neutro: "text-tinta",
  ok: "text-ok",
  atencao: "text-atencao",
  erro: "text-erro",
};

export default function NumeroTV({
  rotulo, valor, pilula, pilulaTom = "atencao", tom = "neutro",
  tomCartao, atraso = 0, className = "",
}) {
  return (
    <CartaoVidro
      tom={tomCartao || (tom === "erro" ? "erro" : "neutro")}
      atraso={atraso}
      className={`flex-col justify-between ${className}`}
      style={{ padding: "clamp(18px, 2.3vw, 44px)" }}
    >
      <div
        className="font-bold text-texto-fraco"
        style={{ fontSize: "clamp(15px, 1.56vw, 30px)" }}
      >
        {rotulo}
      </div>

      <div
        className={`num font-extrabold leading-[.95] ${COR[tom] || COR.neutro}`}
        style={{ fontSize: "clamp(56px, 12.5vw, 240px)", letterSpacing: "-.05em" }}
      >
        {valor}
      </div>

      {pilula ? (
        <span
          className="inline-flex self-start items-center gap-2 rounded-full font-extrabold"
          style={{
            background: pilulaTom === "erro" ? "rgb(var(--erro) / .18)" : "rgb(var(--atencao) / .16)",
            color: pilulaTom === "erro" ? "rgb(var(--erro))" : "rgb(var(--atencao))",
            padding: "clamp(6px, .62vw, 12px) clamp(12px, 1.35vw, 26px)",
            fontSize: "clamp(14px, 1.45vw, 28px)",
          }}
        >
          {pilula}
        </span>
      ) : <span />}
    </CartaoVidro>
  );
}
