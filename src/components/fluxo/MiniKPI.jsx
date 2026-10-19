import React from "react";

/**
 * Caixinha de número — o indicador pequeno que acompanha um bloco maior.
 *
 * Não confundir com o `StatCard`, que é o cartão de 60px do topo do painel.
 * Este é o número de apoio: aparece dentro de um `SectionCard`, em fileiras de
 * três a cinco, e serve para dar contexto ao gráfico ao lado.
 *
 * Existia escrito à mão em sete arquivos, com `bg-slate-50`, `bg-orange-50`,
 * `bg-red-50` ou `bg-green-50` conforme o dia, e `text-center` em alguns e não
 * em outros.
 */
export default function MiniKPI({ rotulo, valor, tom = "neutro", className = "" }) {
  const cor = tom === "erro" ? "text-erro"
    : tom === "atencao" ? "text-atencao"
    : tom === "ok" ? "text-ok"
    : tom === "marca" ? "text-marca"
    : "text-tinta";

  return (
    <div className={`min-w-0 rounded-token bg-fundo px-4 py-3 ${className}`}>
      <p className="truncate text-xs font-bold text-texto-fraco">{rotulo}</p>
      <p className={`num text-2xl font-extrabold ${cor}`}>{valor}</p>
    </div>
  );
}
