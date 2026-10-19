import React from "react";
import CartaoVidro from "./CartaoVidro";
import { u } from "./unidade";

/**
 * Situação no rodapé da TV: ponto de cor + nome + situação.
 *
 * NUNCA CORTA. A versão anterior tinha `truncate` no nome, e na foto do dono
 * o rodapé mostrava "Empilhadeira El…" — o nome da máquina, justamente a
 * informação que identifica qual é. Agora o nome quebra em até duas linhas
 * (o rodapé tem altura para isso) e a situação também quebra.
 */
const PONTO = { ok: "bg-ok", atencao: "bg-atencao", erro: "bg-erro", neutro: "bg-texto-fraco" };

export default function StatusTV({ nome, situacao, tom = "neutro", atraso = 0 }) {
  return (
    <CartaoVidro
      tom={tom === "erro" ? "erro" : "neutro"}
      atraso={atraso}
      raio={1.4}
      className="items-center"
      style={{ padding: `${u(1)} ${u(1.3)}`, gap: u(0.9) }}
    >
      <span
        aria-hidden="true"
        className={`flex-none rounded-full ${PONTO[tom] || PONTO.neutro}`}
        style={{ width: u(0.85), height: u(0.85) }}
      />
      <div className="min-w-0" style={{ overflowWrap: "anywhere" }}>
        <div className="font-extrabold leading-[1.12] text-tinta" style={{ fontSize: u(1.45) }}>
          {nome}
        </div>
        <div className="font-semibold leading-[1.2] text-texto-fraco" style={{ fontSize: u(1) }}>
          {situacao}
        </div>
      </div>
    </CartaoVidro>
  );
}
