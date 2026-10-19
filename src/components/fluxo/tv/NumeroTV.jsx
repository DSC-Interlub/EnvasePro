import React from "react";
import CartaoVidro from "./CartaoVidro";
import { u, fonteQueCabe } from "./unidade";

/**
 * Número grande da TV — rótulo em cima, número no meio, pílula embaixo.
 *
 * O número era `clamp(56px, 12.5vw, 240px)`: crescia pela largura da janela,
 * não pelo cartão. Numa tela baixa ele passava da altura e cobria o que
 * estivesse embaixo — foi a primeira coisa que o dono viu na foto.
 *
 * Agora o cartão é um contêiner de tamanho e o número se mede por ele: cabe na
 * largura (calculado pelo comprimento do texto, "7" e "12.345" não têm o
 * mesmo corpo) e na altura (`cqh`). `compacto` é a forma da coluna lateral,
 * quando a lista de operações ocupa o centro do painel.
 */
const COR = {
  neutro: "text-tinta",
  ok: "text-ok",
  atencao: "text-atencao",
  erro: "text-erro",
};

export default function NumeroTV({
  rotulo, valor, pilula, pilulaTom = "atencao", tom = "neutro",
  tomCartao, compacto = false, atraso = 0, className = "",
}) {
  const texto = String(valor ?? "");

  return (
    <CartaoVidro
      conteiner
      tom={tomCartao || (tom === "erro" && Number(valor) > 0 ? "erro" : "neutro")}
      atraso={atraso}
      className={`flex-col justify-between ${className}`}
      style={{ padding: compacto ? u(1.3) : u(2.2) }}
    >
      <div
        className="flex-none font-bold leading-[1.15] text-texto-fraco"
        style={{ fontSize: compacto ? u(1.1) : u(1.5) }}
      >
        {rotulo}
      </div>

      <div
        className={`num min-h-0 flex-none font-extrabold leading-[1] ${COR[tom] || COR.neutro}`}
        style={{
          fontSize: fonteQueCabe(texto, { teto: compacto ? 6 : 12, alturaMax: compacto ? 40 : 50 }),
          letterSpacing: "-.04em",
        }}
      >
        {texto}
      </div>

      {pilula ? (
        <span
          className="inline-flex flex-none self-start items-center rounded-full font-extrabold leading-[1.15]"
          style={{
            background: pilulaTom === "erro" ? "rgb(var(--erro) / .18)" : "rgb(var(--atencao) / .16)",
            color: pilulaTom === "erro" ? "rgb(var(--erro))" : "rgb(var(--atencao))",
            padding: compacto ? `${u(0.3)} ${u(0.8)}` : `${u(0.45)} ${u(1.2)}`,
            fontSize: compacto ? u(0.95) : u(1.3),
          }}
        >
          {pilula}
        </span>
      ) : <span />}
    </CartaoVidro>
  );
}
