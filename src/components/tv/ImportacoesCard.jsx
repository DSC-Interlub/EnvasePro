import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ship, Calendar, Package, X, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Card de Importações para a TV.
 * Mostra importações com data de chegada no mês atual (ou a mais próxima).
 * Ao clicar, abre overlay com todos os itens e quantidades.
 *
 * Props:
 * - importacoes: array de registros SapPedido
 */
export default function ImportacoesCard({ importacoes }) {
  const [selectedDoc, setSelectedDoc] = useState(null);

  // Agrupar por numero_documento
  const grouped = {};
  importacoes.forEach(r => {
    if (!r.numero_documento) return;
    if (!grouped[r.numero_documento]) {
      grouped[r.numero_documento] = {
        numero_documento: r.numero_documento,
        codigo_fornecedor: r.codigo_fornecedor || "",
        nome_fornecedor: r.nome_fornecedor || "",
        data_chegada: r.data_chegada || r.data_vencimento || null,
        itens: [],
      };
    }
    const g = grouped[r.numero_documento];
    // Atualizar data se não tiver
    if (!g.data_chegada && (r.data_chegada || r.data_vencimento)) {
      g.data_chegada = r.data_chegada || r.data_vencimento;
    }
    // Adicionar item se tiver detalhes
    if (r.codigo_item || r.produto) {
      g.itens.push({
        codigo_item: r.codigo_item || "",
        produto: r.produto || "",
        quantidade: r.quantidade || 0,
        item_para_recebimento: r.item_para_recebimento || "",
      });
    }
  });

  const allDocs = Object.values(grouped).filter(d => d.codigo_fornecedor === "FOR000002");

  // Filtrar: apenas com data_chegada
  const withDates = allDocs.filter(d => d.data_chegada);

  // Mês atual
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Importações do mês atual
  const monthDocs = withDates.filter(d => {
    const dt = new Date(d.data_chegada + "T00:00:00");
    return dt.getMonth() === currentMonth && dt.getFullYear() === currentYear;
  });

  // Se não há no mês atual, buscar a mais próxima (próxima data futura)
  let displayDocs = monthDocs;
  if (monthDocs.length === 0) {
    const future = withDates
      .filter(d => new Date(d.data_chegada + "T00:00:00") >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .sort((a, b) => new Date(a.data_chegada) - new Date(b.data_chegada));
    displayDocs = future.slice(0, 3);
  }

  // Mostrar todos os documentos do mês (sem limite de 3)
  displayDocs.sort((a, b) => new Date(a.data_chegada + "T00:00:00") - new Date(b.data_chegada + "T00:00:00"));

  if (displayDocs.length === 0) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700">
        <CardContent className="p-3 flex items-center gap-3">
          <Ship className="w-6 h-6 text-slate-600" />
          <div>
            <p className="text-slate-400 text-sm font-bold">Importações</p>
            <p className="text-slate-500 text-xs">Nenhuma importação programada</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasMonthDocs = monthDocs.length > 0;

  return (
    <>
      <div className={`grid gap-2 ${displayDocs.length === 1 ? "grid-cols-1" : "grid-cols-" + Math.min(displayDocs.length, 3)}`} style={{ gridTemplateColumns: `repeat(${displayDocs.length}, minmax(0, 1fr))` }}>
        {displayDocs.map((doc) => {
          const dataObj = doc.data_chegada ? new Date(doc.data_chegada + "T00:00:00") : null;
          const temItens = doc.itens.length > 0;
          return (
            <Card
              key={doc.numero_documento}
              className="bg-gradient-to-r from-indigo-900/80 to-blue-900/80 backdrop-blur-xl border-l-4 border-indigo-400 shadow-xl cursor-pointer hover:from-indigo-800/90 hover:to-blue-800/90 transition-all"
              onClick={() => setSelectedDoc(doc)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Ship className="w-5 h-5 text-indigo-300 flex-shrink-0" />
                  <span className="text-indigo-200 text-xs font-bold uppercase tracking-wide">Importação</span>
                  {temItens && (
                    <Badge className="bg-indigo-500/40 text-indigo-100 text-sm font-bold px-2 py-0.5 ml-auto">
                      {doc.itens.length} {doc.itens.length === 1 ? "item" : "itens"} · {doc.itens.reduce((s, i) => s + (i.quantidade || 0), 0).toLocaleString('pt-BR')} qtd
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-white font-black text-2xl font-mono leading-tight">#{doc.numero_documento}</p>
                    <p className="text-indigo-200 text-sm truncate max-w-[160px]">{doc.nome_fornecedor}</p>
                  </div>
                  <div className="ml-auto text-right">
                    {dataObj && (
                      <>
                        <div className="flex items-center gap-1 justify-end">
                          <Calendar className="w-4 h-4 text-indigo-300" />
                          <p className="text-indigo-100 text-xs font-bold uppercase">{format(dataObj, "dd/MM", { locale: ptBR })}</p>
                        </div>
                        <p className="text-indigo-300 text-[10px]">{format(dataObj, "MMM", { locale: ptBR })}</p>
                      </>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-indigo-400 ml-1" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!hasMonthDocs && (
        <p className="text-slate-400 text-[10px] text-center">
          Sem importações neste mês — mostrando próximas programadas
        </p>
      )}

      {/* Modal de detalhes — overlay in-page */}
      {selectedDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedDoc(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-700 to-blue-700 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Ship className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-black text-xl">Importação #{selectedDoc.numero_documento}</h3>
                  <p className="text-indigo-200 text-sm">{selectedDoc.nome_fornecedor}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-white/60 hover:text-white hover:bg-white/10 rounded-lg p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info bar */}
            <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-2 flex items-center gap-4">
              {selectedDoc.data_chegada && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span className="text-slate-300 text-xs font-medium">
                    Chegada: {format(new Date(selectedDoc.data_chegada + "T00:00:00"), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                </div>
              )}
              {selectedDoc.codigo_fornecedor && (
                <div className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-400" />
                  <span className="text-slate-300 text-xs font-mono">{selectedDoc.codigo_fornecedor}</span>
                </div>
              )}
            </div>

            {/* Itens */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedDoc.itens.length > 0 ? (
                <>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">
                    {selectedDoc.itens.length} {selectedDoc.itens.length === 1 ? "Item" : "Itens"}
                  </p>
                  <div className="space-y-1.5">
                    {selectedDoc.itens.map((item, idx) => (
                      <div key={idx} className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-white font-bold text-sm leading-tight">{item.produto}</p>
                          <p className="text-slate-500 font-mono text-[10px]">{item.codigo_item}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-black text-lg tabular-nums">{item.quantidade.toLocaleString('pt-BR')}</p>
                          <p className="text-slate-500 text-[9px] uppercase">Quantidade</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 mx-auto text-slate-700 mb-2" />
                  <p className="text-slate-500 text-sm">Sem detalhamento de itens para esta importação</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}