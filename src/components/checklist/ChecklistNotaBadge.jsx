import React from "react";
import { corSelo, rotulo } from "@/lib/checklist";

// A regra de classificação vive em src/lib/checklist.js, num lugar só.
// Estas duas funções continuam exportadas porque outras telas já as importam;
// agora são apenas apelidos, para não haver duas verdades sobre o mesmo
// checklist.
export const notaColor = corSelo;
export const notaLabel = rotulo;

export default function ChecklistNotaBadge({ nota, showLabel = false }) {
  const temNota = nota !== null && nota !== undefined;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${corSelo(nota)}`}
    >
      {temNota ? nota : "—"}
      {showLabel && temNota && <span className="font-normal">· {rotulo(nota)}</span>}
    </span>
  );
}
