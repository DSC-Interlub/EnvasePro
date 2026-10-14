import React from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Pílula de estado — o mesmo estado sempre com a mesma cara.
 *
 * POR QUE NÃO USAR O Badge DIRETO
 *
 * O sistema tem o mesmo conceito escrito de oito jeitos: "Concluído" aparecia
 * como `bg-green-600 text-white`, `bg-green-100 text-green-800` e
 * `text-green-700` em telas diferentes. Aqui o estado é a entrada, e a cor é
 * consequência.
 *
 * Os nomes são os que o banco usa (os enums), para a tela não precisar
 * traduzir. Um estado desconhecido cai em neutro e mostra o texto como veio —
 * é melhor do que não mostrar nada, e aparece na revisão.
 */
const MAPA = {
  // empilhadeira, limpeza, check-out
  'Pendente': 'atencao',
  'Em Andamento': 'info',
  'Em andamento': 'info',
  'Pausado': 'atencao',
  'Concluído': 'ok',
  'Atrasado': 'erro',
  'Cancelado': 'erro',
  // recebimento
  'Agendado': 'info',
  // assinatura
  'Completo': 'ok',
  'Parcial': 'atencao',
  // checklist
  'Aprovado': 'ok',
  'Atenção': 'atencao',
  'Reprovado': 'erro',
  // resposta de checklist
  'Sim': 'ok',
  'Não': 'erro',
  'N/A': 'secondary',
};

export default function StatusPill({ estado, texto, variante, className = "", ...props }) {
  const v = variante || MAPA[estado] || 'secondary';
  return (
    <Badge variant={v} className={className} {...props}>
      {texto || estado || '—'}
    </Badge>
  );
}

export { MAPA as ESTADOS_CONHECIDOS };
