import React from "react";
import CartaoVidro from "./CartaoVidro";
import { u, fonteQueCabe } from "./unidade";

/**
 * O anel da meta — o protótipo TV-fabrica.html.
 *
 * DUAS FORMAS
 *
 *  - `grande`: quando não há operação em andamento, o anel é o centro do
 *    painel, como no protótipo.
 *  - `compacto`: quando HÁ operações, elas viram o centro (é o que a fábrica
 *    lê) e o anel vai para a coluna lateral, menor.
 *
 * O QUE QUEBRAVA
 *
 * O número tinha `clamp(56px, 10.4vw, 200px)`: crescia pela LARGURA da tela,
 * e numa tela baixa passava da altura do cartão e cobria a lista. A legenda
 * ("1 em andamento · 1 lançados") também escapava por baixo.
 *
 * Agora o cartão é um contêiner de tamanho (`conteiner`), o anel se mede pela
 * altura do cartão (`cqh`) e o número pela largura que sobra, calculada a
 * partir do comprimento do texto (`fonteQueCabe`). Nada aqui depende do
 * tamanho da janela.
 */
export default function MetaTV({
  rotulo, valor, meta, unidade, legenda, compacto = false, atraso = 0, className = "",
}) {
  const n = Number(valor) || 0;
  const alvo = Number(meta) || 0;
  const fracao = alvo > 0 ? Math.min(1, Math.max(0, n / alvo)) : 0;
  const pct = Math.round(fracao * 100);
  const texto = n.toLocaleString("pt-BR");

  // r=120 e stroke=26 do protótipo; a circunferência vira o dasharray
  const R = 120;
  const circunferencia = 2 * Math.PI * R;
  const recuo = circunferencia * (1 - fracao);

  const cor = fracao >= 1 ? "rgb(var(--ok))"
    : fracao >= 0.7 ? "rgb(var(--marca))"
    : "rgb(var(--atencao))";

  // Compacto: o anel ocupa a altura do cartão menos a linha da legenda.
  // Grande: até 15u, que é o 300px do protótipo em 1080p.
  const ladoAnel = compacto ? `min(62cqh, 40cqw)` : `min(${u(15)}, 70cqh, 46cqw)`;

  return (
    <CartaoVidro
      conteiner
      atraso={atraso}
      className={`flex-col justify-center ${className}`}
      style={{ padding: compacto ? u(1.4) : u(2.4), gap: compacto ? u(0.7) : u(1.2) }}
    >
      <div className="flex min-h-0 min-w-0 items-center" style={{ gap: compacto ? u(1.1) : u(2) }}>
        <svg
          role="img"
          aria-label={`${n} de ${alvo} ${unidade || ""}, ${pct} por cento`}
          viewBox="0 0 300 300"
          className="flex-none"
          style={{ width: ladoAnel, height: ladoAnel }}
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

        {/* O número mede a largura do que sobrou ao lado do anel: o bloco é
            outro contêiner, para `cqw` ser a largura DELE e não a do cartão. */}
        <div className="min-w-0 flex-1 self-stretch" style={{ containerType: "size" }}>
          <div className="flex h-full flex-col justify-center">
            <div className="font-bold text-texto-fraco" style={{ fontSize: compacto ? u(1.15) : u(1.5) }}>
              {rotulo}
            </div>
            <div
              className="num font-extrabold leading-[1] text-tinta"
              style={{
                fontSize: fonteQueCabe(texto, { teto: compacto ? 5.2 : 10, alturaMax: compacto ? 62 : 58 }),
                letterSpacing: "-.04em",
              }}
            >
              {texto}
            </div>
          </div>
        </div>
      </div>

      {legenda && (
        // Embaixo, na largura toda e quebrando linha: antes ela ficava ao lado
        // do número, sem espaço, e escapava do cartão.
        <div
          className="flex-none font-semibold text-tinta-media"
          style={{ fontSize: compacto ? u(1.05) : u(1.4), lineHeight: 1.2 }}
        >
          {legenda}
        </div>
      )}
    </CartaoVidro>
  );
}
