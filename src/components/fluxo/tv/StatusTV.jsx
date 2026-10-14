import React from "react";
import CartaoVidro from "./CartaoVidro";

/**
 * Cartão de status do rodapé da TV: ponto de cor + nome + situação.
 *
 * O ponto é 18px no protótipo — grande o bastante para ser lido a 4 metros, e
 * acompanhado do TEXTO da situação, porque cor sozinha não comunica (a TV da
 * fábrica pode estar com a cor desregulada, e daltonismo é comum).
 */
const PONTO = { ok: "bg-ok", atencao: "bg-atencao", erro: "bg-erro", neutro: "bg-texto-fraco" };

export default function StatusTV({ nome, situacao, tom = "neutro", atraso = 0 }) {
  return (
    <CartaoVidro
      tom={tom === "erro" ? "erro" : "neutro"}
      atraso={atraso}
      raio={28}
      className="items-center"
      style={{ padding: "clamp(14px, 1.6vw, 30px)", gap: "clamp(10px, 1vw, 20px)" }}
    >
      <span
        aria-hidden="true"
        className={`flex-none rounded-full ${PONTO[tom] || PONTO.neutro}`}
        style={{ width: "clamp(12px, .94vw, 18px)", height: "clamp(12px, .94vw, 18px)" }}
      />
      <div className="min-w-0">
        <div className="truncate font-extrabold text-tinta" style={{ fontSize: "clamp(18px, 2vw, 38px)" }}>
          {nome}
        </div>
        <div className="truncate font-semibold text-texto-fraco" style={{ fontSize: "clamp(12px, 1.25vw, 24px)" }}>
          {situacao}
        </div>
      </div>
    </CartaoVidro>
  );
}
