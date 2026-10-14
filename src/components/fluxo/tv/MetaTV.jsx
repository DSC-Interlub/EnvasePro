import React from "react";
import CartaoVidro from "./CartaoVidro";

/**
 * O cartão principal da TV: anel da meta + o número de 200px.
 *
 * O ANEL É SVG PURO, e isso importa aqui mais do que no resto do sistema: a
 * TV fica ligada o dia todo num aparelho fraco. Um gauge do Recharts
 * carregaria a biblioteca de gráficos inteira e redesenharia a cada
 * atualização; o anel é um círculo com `stroke-dashoffset`, que o navegador
 * anima sozinho.
 *
 * A animação `.anel-tv` desenha de 0 até a fração, uma vez, em 2s — é o que o
 * protótipo faz com `.arc`. Com `prefers-reduced-motion` ela não roda e o
 * anel aparece já no valor final.
 */
export default function MetaTV({
  rotulo, valor, meta, unidade, legenda, atraso = 0, className = "",
}) {
  const n = Number(valor) || 0;
  const alvo = Number(meta) || 0;
  const fracao = alvo > 0 ? Math.min(1, Math.max(0, n / alvo)) : 0;
  const pct = Math.round(fracao * 100);

  // r=120 e stroke=26 do protótipo; a circunferência vira o dasharray
  const R = 120;
  const circunferencia = 2 * Math.PI * R;
  const recuo = circunferencia * (1 - fracao);

  const cor = fracao >= 1 ? "rgb(var(--ok))"
    : fracao >= 0.7 ? "rgb(var(--marca))"
    : "rgb(var(--atencao))";

  return (
    <CartaoVidro
      atraso={atraso}
      className={`items-center ${className}`}
      style={{ padding: "clamp(18px, 2.5vw, 48px)", gap: "clamp(16px, 2.1vw, 40px)" }}
    >
      <svg
        role="img"
        aria-label={`${n} de ${alvo} ${unidade || ""}, ${pct} por cento da meta`}
        viewBox="0 0 300 300"
        className="flex-none"
        style={{ width: "clamp(110px, 15.6vw, 300px)", height: "clamp(110px, 15.6vw, 300px)" }}
      >
        <circle cx="150" cy="150" r={R} fill="none" stroke="rgb(255 255 255 / .1)" strokeWidth="26" />
        <circle
          className="anel-tv"
          cx="150" cy="150" r={R}
          fill="none" stroke={cor} strokeWidth="26" strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={recuo}
          transform="rotate(-90 150 150)"
          style={{ "--anel-fim": recuo, "--anel-volta": circunferencia }}
        />
        <text
          x="150" y="150"
          textAnchor="middle" dominantBaseline="central"
          className="num" fontSize="72" fontWeight="800" fill="rgb(var(--tinta))"
        >
          {pct}%
        </text>
      </svg>

      <div className="min-w-0">
        <div className="font-bold text-texto-fraco" style={{ fontSize: "clamp(15px, 1.56vw, 30px)" }}>
          {rotulo}
        </div>
        <div
          className="num font-extrabold leading-[.95] text-tinta"
          style={{ fontSize: "clamp(56px, 10.4vw, 200px)", letterSpacing: "-.05em" }}
        >
          {n.toLocaleString("pt-BR")}
        </div>
        {legenda && (
          <div className="font-semibold text-tinta-media" style={{ fontSize: "clamp(14px, 1.56vw, 30px)" }}>
            {legenda}
          </div>
        )}
      </div>
    </CartaoVidro>
  );
}
