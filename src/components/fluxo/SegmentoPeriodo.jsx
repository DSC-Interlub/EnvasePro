import React from "react";

/**
 * Controle segmentado de período — o "Hoje / Semana / Mês" do padrão Painel.
 *
 * POR QUE ISTO EXISTE
 *
 * O Painel mostrava os indicadores do dia E os da semana, um bloco embaixo do
 * outro, cada um com seu título em maiúsculas. Quem olhava via quatorze números
 * de uma vez e tinha de ler o cabeçalho de cada seção para saber a qual período
 * cada número pertencia. Aqui é um período de cada vez, e o controle diz qual.
 *
 * Só aparecem os períodos que QUEM CHAMA passar. Não existe "Mês" quando não há
 * como calcular o mês: oferecer um botão que devolve número errado é pior que
 * não oferecer botão.
 */
export default function SegmentoPeriodo({
  opcoes, valor, aoEscolher, rotulo = "Período", className = "",
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={`inline-flex gap-1 rounded-painel bg-cartao p-1.5 shadow-cartao ${className}`}
    >
      {opcoes.map((op) => {
        const ativo = op.valor === valor;
        return (
          <button
            key={op.valor}
            type="button"
            onClick={() => aoEscolher(op.valor)}
            aria-pressed={ativo}
            className={`press foco-fluxo min-h-[48px] rounded-token px-5 text-[15px] font-bold
                        transition-colors
                        ${ativo
                          ? "bg-marca text-white shadow-marca"
                          : "bg-transparent text-tinta-media hover:bg-fundo"}`}
          >
            {op.rotulo}
          </button>
        );
      })}
    </div>
  );
}
