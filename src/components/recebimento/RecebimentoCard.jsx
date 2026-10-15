import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, PenLine, Play, Eye, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { corSelo, classificar } from "@/lib/checklist";

const TIPO_COLOR = {
  "Importação": "bg-purple-100 text-purple-700",
  "Nacional": "bg-marca-suave text-marca",
  "Devolução": "bg-atencao-suave text-atencao",
  "Material auxiliar": "bg-teal-100 text-teal-700",
  "Outro": "bg-fundo text-tinta-media",
};

const STATUS_COLOR = {
  "Agendado": "bg-fundo text-tinta-media",
  "Em andamento": "bg-marca-suave text-marca",
  "Pausado": "bg-atencao-suave text-atencao",
  "Concluído": "bg-ok-suave text-ok",
  "Cancelado": "bg-erro-suave text-erro",
};

export default function RecebimentoCard({ recebimento, itens, ocorrencias, participantes, isAdmin, checklist }) {
  const navigate = useNavigate();

  const totalItens = itens.length;
  const itensConcluidos = itens.filter(i => i.status_item !== "Pendente conferência").length;
  const progresso = totalItens > 0 ? Math.round((itensConcluidos / totalItens) * 100) : 0;
  const ocorrenciasAbertas = ocorrencias.filter(o => !o.resolvido).length;
  const aguardaLider = recebimento.status === "Concluído" && !recebimento.assinatura_lider;

  return (
    <div className={`bg-cartao border rounded-painel p-4 shadow-cartao hover:shadow-cartao transition-shadow
      ${recebimento.prioridade === "Urgente" ? "border-erro bg-erro-suave" : recebimento.prioridade === "Alta" ? "border-atencao" : "border-borda"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {recebimento.prioridade === "Urgente" && <Badge className="bg-erro text-white text-xs">🔴 Urgente</Badge>}
            {recebimento.prioridade === "Alta" && <Badge className="bg-atencao text-white text-xs">🟠 Alta</Badge>}
            <Badge className={`text-xs ${TIPO_COLOR[recebimento.tipo] || "bg-fundo text-tinta-media"}`}>{recebimento.tipo}</Badge>
            <Badge className={`text-xs ${STATUS_COLOR[recebimento.status]}`}>{recebimento.status}</Badge>
            {aguardaLider && <Badge className="text-xs bg-atencao-suave text-atencao">Aguard. líder</Badge>}
            {ocorrenciasAbertas > 0 && (
              <Badge className="text-xs bg-erro-suave text-erro flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{ocorrenciasAbertas} ocorrência{ocorrenciasAbertas > 1 ? "s" : ""}
              </Badge>
            )}
            {recebimento.status_assinatura === "Completo" && <Badge className="text-xs bg-ok-suave text-ok">✓ Assinado</Badge>}
            {checklist ? (
              <button
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-opacity hover:opacity-80 flex items-center gap-1 ${
                  corSelo(checklist.nota_final ?? 0)
                }`}
                onClick={e => { e.stopPropagation(); navigate(`/ChecklistDetalhe?id=${checklist.id}`); }}>
                <ClipboardCheck className="w-3 h-3" />
                {{ APROVADO: "✓", ATENCAO: "⚠", REPROVADO: "✗", SEM_NOTA: "–" }[
                  classificar(checklist.nota_final ?? 0)
                ]} Checklist ({checklist.nota_final})
              </button>
            ) : (
              <span className="text-xs text-texto-apagado border border-borda px-2 py-0.5 rounded-full flex items-center gap-1">
                <ClipboardCheck className="w-3 h-3" />Checklist pendente
              </span>
            )}
          </div>
          <h3 className="font-semibold text-tinta text-sm">
            {recebimento.numero_documento}
            {recebimento.numero_nf && <span className="text-texto-fraco font-normal"> · NF {recebimento.numero_nf}</span>}
          </h3>
          <p className="text-xs text-texto-fraco mt-0.5">
            {recebimento.fornecedor_nome || "—"} ·{" "}
            {recebimento.data_chegada
              ? format(new Date(recebimento.data_chegada + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })
              : recebimento.data_prevista
              ? `Prev. ${format(new Date(recebimento.data_prevista + "T00:00:00"), "dd/MM", { locale: ptBR })}`
              : "Sem data"}
          </p>
          {recebimento.coordenador_nome && (
            <p className="text-xs text-texto-fraco">
              Coord.: {recebimento.coordenador_nome} · {participantes.length} participante{participantes.length !== 1 ? "s" : ""}
            </p>
          )}
          {totalItens > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-texto-fraco mb-1">
                <span>{itensConcluidos} de {totalItens} itens conferidos</span>
                <span>{progresso}%</span>
              </div>
              <div className="w-full bg-fundo rounded-full h-1.5">
                <div className="bg-marca h-1.5 rounded-full transition-all" style={{ width: `${progresso}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button size="sm" variant="outline" className="h-12 text-xs px-2"
            onClick={() => navigate(`/ExecutarRecebimento?id=${recebimento.id}`)}>
            <Eye className="w-3 h-3 mr-1" />Ver
          </Button>
          {(recebimento.status === "Agendado" || recebimento.status === "Pausado" || recebimento.status === "Em andamento") && (
            <Button size="sm" className="h-12 text-xs px-2 bg-marca hover:bg-marca-forte"
              onClick={() => navigate(`/ExecutarRecebimento?id=${recebimento.id}`)}>
              <Play className="w-3 h-3 mr-1" />Executar
            </Button>
          )}
          {aguardaLider && isAdmin && (
            <Button aria-label="Assinar" size="sm" variant="outline" className="h-12 text-xs px-2 border-atencao text-atencao"
              onClick={() => navigate(`/ExecutarRecebimento?id=${recebimento.id}`)}>
              <PenLine className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}