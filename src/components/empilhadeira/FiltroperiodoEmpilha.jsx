import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { SegmentoPeriodo } from "@/components/fluxo";

/**
 * Filtro de período dos módulos de empilhadeira.
 *
 * O ATALHO ATIVO ERA COR DE AVISO
 *
 * O botão "Hoje", quando selecionado, ficava âmbar — a mesma cor que o sistema
 * usa para "atenção". Selecionado não é um estado de alerta: agora o atalho
 * ativo usa o controle segmentado do padrão, com o azul da marca, e os três
 * atalhos deixam claro qual está valendo.
 *
 * Também passou a dizer QUAL é o período ativo mesmo quando o intervalo foi
 * digitado à mão (nenhum dos três atalhos marcado), em vez de deixar os três
 * iguais e o usuário adivinhando.
 */
export default function FiltroPeriodoEmpilha({ dataInicio, dataFim, onChange }) {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const semIni = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const semFim = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const mesIni = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const mesFim = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const ativo =
    dataInicio === hoje && dataFim === hoje ? "hoje"
    : dataInicio === semIni && dataFim === semFim ? "semana"
    : dataInicio === mesIni && dataFim === mesFim ? "mes"
    : "livre";

  const escolher = (valor) => {
    if (valor === "hoje") onChange(hoje, hoje);
    else if (valor === "semana") onChange(semIni, semFim);
    else if (valor === "mes") onChange(mesIni, mesFim);
  };

  return (
    <div className="cartao-fluxo flex min-w-0 flex-wrap items-center gap-4 p-4">
      <Calendar className="h-4 w-4 flex-none text-texto-fraco" aria-hidden="true" />

      <div className="flex min-w-0 items-center gap-2">
        <Label htmlFor="periodo-de" className="whitespace-nowrap">De</Label>
        <Input
          id="periodo-de"
          type="date"
          value={dataInicio}
          onChange={e => onChange(e.target.value, dataFim)}
          className="w-40"
        />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Label htmlFor="periodo-ate" className="whitespace-nowrap">Até</Label>
        <Input
          id="periodo-ate"
          type="date"
          value={dataFim}
          onChange={e => onChange(dataInicio, e.target.value)}
          className="w-40"
        />
      </div>

      <SegmentoPeriodo
        rotulo="Atalho de período"
        opcoes={[
          { valor: "hoje", rotulo: "Hoje" },
          { valor: "semana", rotulo: "Semana" },
          { valor: "mes", rotulo: "Mês" },
        ]}
        valor={ativo}
        aoEscolher={escolher}
        className="bg-fundo shadow-none"
      />
    </div>
  );
}
