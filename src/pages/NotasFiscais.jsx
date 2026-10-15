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
import { PageHeader } from "@/components/fluxo";

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
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Recebimento" }, { rotulo: "Notas fiscais" }]}
          titulo="Arquivo de notas fiscais"
          legenda="Retenção legal de cinco anos"
          acoes={
            <Button size="lg" onClick={() => navigate("/NovaNotaFiscal")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Arquivar NF
            </Button>
          }
        />

        {/* A contagem foi para junto da busca: era uma linha solta de texto
            cinza embaixo do campo, que ninguém relacionava ao filtro. */}
        <div className="cartao-fluxo flex min-w-0 flex-wrap items-center justify-between gap-3 p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-apagado"
              aria-hidden="true"
            />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por número da NF"
              aria-label="Buscar nota fiscal pelo número"
              className="pl-10"
            />
          </div>
          <span className="num text-sm font-bold text-texto-fraco">
            {filtered.length} nota(s)
          </span>
        </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-fundo rounded-painel animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-texto-apagado">Nenhuma nota fiscal arquivada</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(nf => (
            <Card
              key={nf.id}
              className="cursor-pointer hover:shadow-cartao transition-shadow"
              onClick={() => navigate(`/NotaFiscalDetalhe?id=${nf.id}`)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                {nf.arquivo_url ? (
                  <div className="w-12 h-12 bg-marca-suave text-marca rounded-token flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-fundo rounded-token flex items-center justify-center flex-shrink-0">
                    <Image className="w-5 h-5 text-texto-apagado" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-marca text-lg">{nf.numero_nf}</p>
                  <p className="text-xs text-texto-apagado">{fmtDate(nf.created_date)} · {nf.arquivado_por_nome || "—"}</p>
                </div>
                {!nf.arquivo_url && (
                  <span className="text-xs text-atencao bg-atencao-suave px-2 py-1 rounded-full flex-shrink-0">sem foto</span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
