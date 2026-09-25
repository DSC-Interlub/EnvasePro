import React from "react";

export function notaColor(nota) {
  if (nota === null || nota === undefined) return "bg-slate-100 text-slate-600";
  if (nota >= 80) return "bg-green-100 text-green-700 border-green-200";
  if (nota >= 0) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-red-100 text-red-700 border-red-200";
}

export function notaLabel(nota) {
  if (nota === null || nota === undefined) return "—";
  if (nota >= 80) return "Aprovado";
  if (nota >= 0) return "Atenção";
  return "Reprovado";
}

export default function ChecklistNotaBadge({ nota, showLabel = false }) {
  const color = notaColor(nota);
  const label = notaLabel(nota);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>
      {nota !== null && nota !== undefined ? nota : "—"}
      {showLabel && nota !== null && nota !== undefined && <span className="font-normal">· {label}</span>}
    </span>
  );
}