import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { notaColor, notaLabel } from "@/components/checklist/ChecklistNotaBadge";
import { corTexto, corCaixa } from "@/lib/checklist";

const CHECKLIST_CAMPOS = [
  { key: "pedido_disponivel_etapa5", label: "O Pedido de Compras Está Disponível na Etapa 5?" },
  { key: "entrega_conforme_prevista", label: "A Data de Entrega Está Conforme Com a Data Prevista?" },
  { key: "quantidade_conforme_nf", label: "A Quantidade Recebida Está Conforme Com a Nota Fiscal?" },
  { key: "amostragem_inspecionada", label: "Amostragem Inspecionada (10%)?" },
  { key: "condicoes_gerais_conformes", label: "As Condições Gerais do Item Estão de Acordo Com os Padrões de Qualidade Interlub?" },
  { key: "spray_conforme_feps", label: "O Spray Está de Acordo Com a FEPS Atual?" },
  { key: "acompanha_certificado_analise", label: "O Material Está Acompanhado de Certificado de Análise?" },
  { key: "acompanha_ficha_emergencia", label: "O Material Está Acompanhado da Ficha de Emergência?" },
  { key: "acompanha_fispq", label: "O Material Está Acompanhado da FISPQ?" },
];

function RespostaBadge({ valor }) {
  if (!valor) return <span className="text-slate-400 text-xs">—</span>;
  if (valor === "Sim") return <Badge className="bg-green-100 text-green-700 text-xs">Sim</Badge>;
  if (valor === "Não") return <Badge className="bg-red-100 text-red-700 text-xs">Não</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 text-xs">N/A</Badge>;
}

export default function ChecklistDetalhe() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: checklist, isLoading } = useQuery({
    queryKey: ["checklist", id],
    queryFn: () => base44.entities.ChecklistRecebimento.filter({ id }),
    select: data => data[0],
    enabled: !!id,
  });

  const hoje = format(new Date(), "yyyy-MM-dd");
  const criadoHoje = checklist?.created_date?.startsWith(hoje);
  const podeEditar = isAdmin && criadoHoje;

  if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!checklist) return <div className="p-8 text-center text-slate-400">Checklist não encontrado.</div>;

  const nota = checklist.nota_final ?? 0;
  const cor = notaColor(nota);
  const label = notaLabel(nota);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ChecklistRecebimento")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">Checklist — {checklist.numero_pedido_compras}</h1>
          <p className="text-xs text-slate-500">
            {checklist.data_entrega ? format(new Date(checklist.data_entrega + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"} ·
            Criado por {checklist.criado_por_nome || "—"}
          </p>
        </div>
        {podeEditar && (
          <Button variant="outline" size="sm" onClick={() => navigate(`/NovoChecklist?edit=${id}`)}>
            <Edit className="w-4 h-4 mr-1" />Editar
          </Button>
        )}
      </div>

      {/* Card de nota final */}
      <div className={`p-6 rounded-xl border-2 text-center ${corCaixa(nota)}`}>
        <p className="text-sm text-slate-500 mb-1">Nota Final</p>
        <p className={`text-5xl font-bold ${corTexto(nota)}`}>{nota}</p>
        <p className={`text-lg font-semibold mt-1 ${corTexto(nota)}`}>{label}</p>
        <p className="text-xs text-slate-500 mt-2">
          {checklist.total_sim} Sim (+{checklist.soma_sim}) · {checklist.total_nao} Não ({checklist.soma_nao})
        </p>
      </div>

      {/* Seção 1 — Identificação */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">1. Identificação do Pedido</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            ["Pedido disponível Etapa 5", <RespostaBadge valor={checklist.pedido_disponivel_etapa5} />],
            ["Nº Pedido de Compras", checklist.numero_pedido_compras],
            ["Fornecedor", checklist.nome_fornecedor],
            ["Código do Fornecedor", checklist.codigo_fornecedor || "—"],
            ["Descrição do Material", checklist.descricao_material],
            ["Data Prevista", checklist.data_prevista_material ? format(new Date(checklist.data_prevista_material + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"],
            ["Data de Entrega", checklist.data_entrega ? format(new Date(checklist.data_entrega + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"],
            ["Entrega conforme prevista?", <RespostaBadge valor={checklist.entrega_conforme_prevista} />],
            ["Inspecionado por", (checklist.inspecionado_por || []).join(", ") || "—"],
            ["Nº Nota Fiscal", checklist.numero_nota_fiscal],
            ["Material", checklist.material_recebimento],
            ["Quantidade recebida", `${checklist.quantidade_recebida} ${checklist.unidade_medida}`],
            ["Nº Lote", checklist.numero_lote],
          ].map(([label, valor], i) => (
            <div key={i} className="flex justify-between items-start py-1 border-b border-slate-100 last:border-0 gap-4">
              <span className="text-slate-500 flex-shrink-0">{label}</span>
              <span className="font-medium text-slate-900 text-right">{valor}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Seção 2 — Checklist */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">2. Checklist de Conformidade</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST_CAMPOS.map(campo => {
            const valor = checklist[campo.key];
            return (
              <div key={campo.key} className={`flex items-center justify-between p-2.5 rounded-lg ${valor === "Não" ? "bg-red-50" : valor === "N/A" ? "bg-slate-50" : "bg-green-50/40"}`}>
                <span className="text-sm text-slate-700 flex-1">{campo.label}</span>
                <RespostaBadge valor={valor} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Seção 3 — Observações */}
      {checklist.observacoes && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">3. Observações</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{checklist.observacoes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}