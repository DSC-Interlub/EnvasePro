import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, PenLine, Play, Eye, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const TIPO_COLOR = {
  "Importação": "bg-purple-100 text-purple-700",
  "Nacional": "bg-blue-100 text-blue-700",
  "Devolução": "bg-orange-100 text-orange-700",
  "Material auxiliar": "bg-teal-100 text-teal-700",
  "Outro": "bg-slate-100 text-slate-700",
};

const STATUS_COLOR = {
  "Agendado": "bg-slate-100 text-slate-700",
  "Em andamento": "bg-blue-100 text-blue-700",
  "Pausado": "bg-yellow-100 text-yellow-700",
  "Concluído": "bg-green-100 text-green-700",
  "Cancelado": "bg-red-100 text-red-700",
};

export default function RecebimentoCard({ recebimento, itens, ocorrencias, participantes, isAdmin, checklist }) {
  const navigate = useNavigate();

  const totalItens = itens.length;
  const itensConcluidos = itens.filter(i => i.status_item !== "Pendente conferência").length;
  const progresso = totalItens > 0 ? Math.round((itensConcluidos / totalItens) * 100) : 0;
  const ocorrenciasAbertas = ocorrencias.filter(o => !o.resolvido).length;
  const aguardaLider = recebimento.status === "Concluído" && !recebimento.assinatura_lider;

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow
      ${recebimento.prioridade === "Urgente" ? "border-red-300 bg-red-50" : recebimento.prioridade === "Alta" ? "border-orange-200" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {recebimento.prioridade === "Urgente" && <Badge className="bg-red-600 text-white text-xs">🔴 Urgente</Badge>}
            {recebimento.prioridade === "Alta" && <Badge className="bg-orange-500 text-white text-xs">🟠 Alta</Badge>}
            <Badge className={`text-xs ${TIPO_COLOR[recebimento.tipo] || "bg-slate-100 text-slate-700"}`}>{recebimento.tipo}</Badge>
            <Badge className={`text-xs ${STATUS_COLOR[recebimento.status]}`}>{recebimento.status}</Badge>
            {aguardaLider && <Badge className="text-xs bg-orange-100 text-orange-700">Aguard. líder</Badge>}
            {ocorrenciasAbertas > 0 && (
              <Badge className="text-xs bg-red-100 text-red-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{ocorrenciasAbertas} ocorrência{ocorrenciasAbertas > 1 ? "s" : ""}
              </Badge>
            )}
            {recebimento.status_assinatura === "Completo" && <Badge className="text-xs bg-green-100 text-green-700">✓ Assinado</Badge>}
            {checklist ? (
              <button
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-opacity hover:opacity-80 flex items-center gap-1 ${
                  (checklist.nota_final ?? 0) >= 80 ? "bg-green-100 text-green-700 border-green-200"
                  : (checklist.nota_final ?? 0) >= 0 ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                  : "bg-red-100 text-red-700 border-red-200"
                }`}
                onClick={e => { e.stopPropagation(); navigate(`/ChecklistDetalhe?id=${checklist.id}`); }}>
                <ClipboardCheck className="w-3 h-3" />
                {(checklist.nota_final ?? 0) >= 80 ? `✓ Checklist (${checklist.nota_final})`
                  : (checklist.nota_final ?? 0) >= 0 ? `⚠ Checklist (${checklist.nota_final})`
                  : `✗ Checklist (${checklist.nota_final})`}
              </button>
            ) : (
              <span className="text-xs text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                <ClipboardCheck className="w-3 h-3" />Checklist pendente
              </span>
            )}
          </div>
          <h3 className="font-semibold text-slate-900 text-sm">
            {recebimento.numero_documento}
            {recebimento.numero_nf && <span className="text-slate-500 font-normal"> · NF {recebimento.numero_nf}</span>}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {recebimento.fornecedor_nome || "—"} ·{" "}
            {recebimento.data_chegada
              ? format(new Date(recebimento.data_chegada + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })
              : recebimento.data_prevista
              ? `Prev. ${format(new Date(recebimento.data_prevista + "T00:00:00"), "dd/MM", { locale: ptBR })}`
              : "Sem data"}
          </p>
          {recebimento.coordenador_nome && (
            <p className="text-xs text-slate-500">
              Coord.: {recebimento.coordenador_nome} · {participantes.length} participante{participantes.length !== 1 ? "s" : ""}
            </p>
          )}
          {totalItens > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{itensConcluidos} de {totalItens} itens conferidos</span>
                <span>{progresso}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progresso}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs px-2"
            onClick={() => navigate(`/ExecutarRecebimento?id=${recebimento.id}`)}>
            <Eye className="w-3 h-3 mr-1" />Ver
          </Button>
          {(recebimento.status === "Agendado" || recebimento.status === "Pausado" || recebimento.status === "Em andamento") && (
            <Button size="sm" className="h-7 text-xs px-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => navigate(`/ExecutarRecebimento?id=${recebimento.id}`)}>
              <Play className="w-3 h-3 mr-1" />Executar
            </Button>
          )}
          {aguardaLider && isAdmin && (
            <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-orange-300 text-orange-700"
              onClick={() => navigate(`/ExecutarRecebimento?id=${recebimento.id}`)}>
              <PenLine className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}