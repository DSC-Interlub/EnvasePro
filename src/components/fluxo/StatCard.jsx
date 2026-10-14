import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * Cartão de número — o KPI do protótipo do painel.
 *
 * O número é o assunto: 48px no celular, 60px acima. Com `tabular-nums`, para
 * não "dançar" quando o valor troca — na TV, que atualiza sozinha, isso
 * aparece de longe.
 *
 * `destaque` pinta o cartão inteiro de marca, como o primeiro KPI do
 * protótipo. Um por tela, no máximo: se tudo é destaque, nada é.
 *
 * `tom` colore só o número (ok / atencao / erro), para o cartão de ocorrência
 * aberta ficar vermelho sem o fundo gritar.
 */
const TOM_DO_NUMERO = {
  neutro: "text-tinta",
  ok: "text-ok",
  atencao: "text-atencao-tinta",
  erro: "text-erro",
  marca: "text-marca",
};

export default function StatCard({
  rotulo, valor, legenda, icone: Icone, tom = "neutro", destaque = false,
  variacao, atraso = 0, aoClicar, className = "",
}) {
  const Elemento = aoClicar ? "button" : "div";

  const base = destaque
    ? "bg-marca text-white shadow-marca"
    : "bg-cartao shadow-cartao";
  const corRotulo = destaque ? "text-white/80" : "text-texto-fraco";
  const corNumero = destaque ? "text-white" : TOM_DO_NUMERO[tom] || TOM_DO_NUMERO.neutro;
  const corLegenda = destaque ? "text-white/80" : "text-texto-fraco";

  return (
    <Elemento
      type={aoClicar ? "button" : undefined}
      onClick={aoClicar}
      style={atraso ? { animationDelay: `${atraso}s` } : undefined}
      className={`entra ${base} rounded-cartao p-5 text-left w-full
                  ${aoClicar ? "cartao-toca foco-fluxo" : ""} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`text-sm font-bold ${corRotulo}`}>{rotulo}</span>
        {Icone && (
          <span
            aria-hidden="true"
            className={`w-10 h-10 rounded-token flex items-center justify-center flex-shrink-0
                        ${destaque ? "bg-white/20 text-white" : "bg-marca-suave text-marca"}`}
          >
            <Icone className="w-5 h-5" />
          </span>
        )}
      </div>

      <div className={`num mt-1.5 text-[48px] lg:text-[60px] font-extrabold leading-[1.05] ${corNumero}`}>
        {valor}
      </div>

      {(legenda || variacao != null) && (
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {variacao != null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-bold
                          ${destaque ? "bg-white/20 text-white"
                            : variacao >= 0 ? "bg-ok-suave text-ok" : "bg-erro-suave text-erro"}`}
            >
              {variacao >= 0
                ? <ArrowUp className="w-3 h-3" aria-hidden="true" />
                : <ArrowDown className="w-3 h-3" aria-hidden="true" />}
              <span className="num">{Math.abs(variacao)}%</span>
            </span>
          )}
          {legenda && <span className={`text-sm font-semibold ${corLegenda}`}>{legenda}</span>}
        </div>
      )}
    </Elemento>
  );
}
