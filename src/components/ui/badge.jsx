import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

/**
 * Selo da direção "Fluxo": pílula suave com **ponto de cor e sempre texto**.
 *
 * POR QUE O PONTO, E POR QUE O TEXTO
 *
 * Cor sozinha não comunica. Daltonismo é comum em população de fábrica, e a
 * TV pode estar com a cor desregulada. Então o estado aparece três vezes: na
 * cor do fundo, no ponto, e na palavra.
 *
 * O ponto existe porque numa lista densa o olho acha um ponto colorido mais
 * rápido do que lê a palavra — mas a palavra fica, para quem não distingue a
 * cor.
 *
 * `ponto={false}` desliga, para selo que é só rótulo (uma categoria, uma
 * sala) e não um estado.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold " +
  "transition-colors whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-marca-suave text-marca",
        secondary: "bg-fundo text-tinta-media",
        outline: "bg-cartao text-tinta-media shadow-leve",
        ok: "bg-ok-suave text-ok",
        atencao: "bg-atencao-suave text-atencao-tinta",
        erro: "bg-erro-suave text-erro",
        destructive: "bg-erro-suave text-erro",
        info: "bg-marca-suave text-marca",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

/** As variantes que SÃO estado ganham ponto; rótulo puro não. */
const COM_PONTO = new Set(["ok", "atencao", "erro", "destructive", "info"]);

const COR_DO_PONTO = {
  ok: "bg-ok",
  atencao: "bg-atencao",
  erro: "bg-erro",
  destructive: "bg-erro",
  info: "bg-marca",
};

function Badge({ className, variant = "default", ponto, children, ...props }) {
  const mostraPonto = ponto ?? COM_PONTO.has(variant);
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {mostraPonto && (
        <span
          aria-hidden="true"
          className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", COR_DO_PONTO[variant] || "bg-marca")}
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants }
