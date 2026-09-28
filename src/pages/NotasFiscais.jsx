import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Image } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function NotasFiscais() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const { data: nfs = [], isLoading } = useQuery({
    queryKey: ["notas-fiscais"],
    queryFn: () => base44.entities.NotaFiscalArquivo.list("-created_date", 2000),
  });

  const filtered = nfs.filter(n =>
    !buscaDebounced ||
    n.numero_nf?.toLowerCase().includes(buscaDebounced.toLowerCase())
  );

  const fmtDate = (d) => d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-7 h-7 text-blue-600" /> Arquivo de NFs
        </h1>
        <Button onClick={() => navigate("/NovaNotaFiscal")} className="gap-1 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Arquivar NF
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por número da NF..."
          className="pl-9"
        />
      </div>

      <div className="text-sm text-slate-500">{filtered.length} nota(s) encontrada(s)</div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-slate-400">Nenhuma nota fiscal arquivada</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(nf => (
            <Card
              key={nf.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/NotaFiscalDetalhe?id=${nf.id}`)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                {nf.arquivo_url ? (
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Image className="w-5 h-5 text-slate-300" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-blue-700 text-lg">{nf.numero_nf}</p>
                  <p className="text-xs text-slate-400">{fmtDate(nf.created_date)} · {nf.arquivado_por_nome || "—"}</p>
                </div>
                {!nf.arquivo_url && (
                  <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded-full flex-shrink-0">sem foto</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}