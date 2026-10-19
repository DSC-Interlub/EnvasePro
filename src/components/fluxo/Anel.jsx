import React from "react";

/**
 * Anel de progresso — a nota do checklist e a meta da TV.
 *
 * É SVG puro, de propósito: um gauge do Recharts para mostrar um número
 * carrega a biblioteca inteira de gráficos. O anel é um círculo com
 * `stroke-dasharray`, que custa nada e anima pelo `stroke-dashoffset` (a
 * classe `.anel`, que o `prefers-reduced-motion` desliga).
 *
 * `valor` e `maximo` são separados porque a nota do checklist vai de −90 a
 * +90, não de 0 a 100 — o componente não pode presumir percentual. A
 * conversão para a fração do anel acontece aqui, e o texto do meio mostra o
 * valor como ele é.
 */
export default function Anel({
  valor, maximo = 100, minimo = 0, texto, legenda,
  cor = "marca", tamanho = 104, espessura = 10, className = "",
}) {
  const r = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * r;

  const bruto = (Number(valor) - minimo) / (maximo - minimo);
  const fracao = Number.isFinite(bruto) ? Math.min(1, Math.max(0, bruto)) : 0;
  const recuo = circunferencia * (1 - fracao);

  const CORES = {
    marca: "rgb(var(--marca))",
    ok: "rgb(var(--ok))",
    atencao: "rgb(var(--atencao))",
    erro: "rgb(var(--erro))",
  };

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <svg
        role="img"
        aria-label={`${texto ?? valor}${legenda ? ` — ${legenda}` : ""}`}
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        className="flex-shrink-0"
      >
        <circle
          cx={tamanho / 2} cy={tamanho / 2} r={r}
          fill="none" stroke="rgb(var(--trilha))" strokeWidth={espessura}
        />
        <circle
          className="anel"
          cx={tamanho / 2} cy={tamanho / 2} r={r}
          fill="none"
          stroke={CORES[cor] || CORES.marca}
          strokeWidth={espessura}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={recuo}
          transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
        />
        <text
          x="50%" y="50%"
          textAnchor="middle" dominantBaseline="central"
          className="num"
          fontSize={tamanho * 0.27}
          fontWeight="800"
          fill="rgb(var(--tinta))"
        >
          {texto ?? valor}
        </text>
      </svg>

      {legenda && (
        <div className="min-w-0">
          <div className="text-sm font-bold text-texto-fraco">{legenda}</div>
        </div>
      )}
    </div>
  );
}
