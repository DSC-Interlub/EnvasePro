import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ClipboardCheck, TrendingUp, Database } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import ChecklistNotaBadge from "@/components/checklist/ChecklistNotaBadge";
import AbaBaseSAP from "@/components/checklist/AbaBaseSAP";
import IndicadoresChecklist from "@/components/checklist/IndicadoresChecklist";
import { corTexto } from "@/lib/checklist";
import { PageHeader } from "@/components/fluxo";

export default function ChecklistRecebimento() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const d = new Date();
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(d), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(d), "yyyy-MM-dd"));
  const [filterFornecedor, setFilterFornecedor] = useState("");
  const [filterMaterial, setFilterMaterial] = useState("_all");
  const [filterInspetor, setFilterInspetor] = useState("_all");

  const { data: checklists = [] } = useQuery({
    queryKey: ["checklists"],
    queryFn: () => base44.entities.ChecklistRecebimento.list("-data_entrega", 500),
  });

  const setFiltro = (tipo) => {
    const d = new Date();
    if (tipo === "semana") {
      setDataInicio(format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setDataFim(format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else if (tipo === "mes") {
      setDataInicio(format(startOfMonth(d), "yyyy-MM-dd"));
      setDataFim(format(endOfMonth(d), "yyyy-MM-dd"));
    } else {
      setDataInicio(format(startOfYear(d), "yyyy-MM-dd"));
      setDataFim(format(endOfYear(d), "yyyy-MM-dd"));
    }
  };

  const filtrados = checklists.filter(c => {
    const data = c.data_entrega || "";
    if (data < dataInicio || data > dataFim) return false;
    if (filterFornecedor && !c.nome_fornecedor?.toLowerCase().includes(filterFornecedor.toLowerCase())) return false;
    if (filterMaterial !== "_all" && c.material_recebimento !== filterMaterial) return false;
    if (filterInspetor !== "_all" && !(c.inspecionado_por || []).includes(filterInspetor)) return false;
    return true;
  });

  // KPIs
  const totalChecklists = filtrados.length;
  const notaMedia = totalChecklists > 0 ? Math.round(filtrados.reduce((s, c) => s + (c.nota_final ?? 0), 0) / totalChecklists) : 0;
  const totalSim = filtrados.reduce((s, c) => s + (c.total_sim ?? 0), 0);
  const totalNao = filtrados.reduce((s, c) => s + (c.total_nao ?? 0), 0);
  const totalRespostas = totalSim + totalNao;
  const percConformidade = totalRespostas > 0 ? Math.round((totalSim / totalRespostas) * 100) : 0;
  const negativas = filtrados.filter(c => (c.nota_final ?? 0) < 0).length;

  const inspetores = [...new Set(checklists.flatMap(c => c.inspecionado_por || []))].sort();

  return (
    <div className="min-h-screen bg-fundo p-4 md:p-8">
      <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-4">
        <PageHeader
          migalha={[{ rotulo: "Recebimento" }, { rotulo: "Checklist" }]}
          titulo="Checklist de recebimento"
          legenda="Controle de qualidade na entrada de materiais"
          acoes={
            <Button size="lg" onClick={() => navigate("/NovoChecklist")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo checklist
            </Button>
          }
        />

      <Tabs defaultValue="checklists">
        <TabsList className="bg-cartao border border-borda">
          <TabsTrigger value="checklists" className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> Checklists
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="indicadores" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Indicadores
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="base-sap" className="flex items-center gap-2">
              <Database className="w-4 h-4" /> Base SAP
            </TabsTrigger>
          )}
        </TabsList>

        {/* ABA: CHECKLISTS */}
        <TabsContent value="checklists" className="mt-4 space-y-4">
          {/* Filtros de período */}
          <div className="flex flex-wrap gap-2 items-center">
            {[["semana", "Esta semana"], ["mes", "Este mês"], ["ano", "Este ano"]].map(([k, l]) => (
              <Button key={k} size="sm" variant="outline" className="text-xs h-12 px-2" onClick={() => setFiltro(k)}>{l}</Button>
            ))}
            <Input aria-label="Data inicial" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-12 text-xs w-36" />
            <span className="text-texto-apagado text-xs">até</span>
            <Input aria-label="Data final" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-12 text-xs w-36" />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-cartao rounded-painel border border-borda p-4 text-center shadow-cartao">
              <p className="text-xs text-texto-fraco">Total de Checklists</p>
              <p className="text-3xl font-bold text-tinta-media">{totalChecklists}</p>
            </div>
            <div className="bg-cartao rounded-painel border border-borda p-4 text-center shadow-cartao">
              <p className="text-xs text-texto-fraco">Nota Média</p>
              <p className={`text-3xl font-bold ${corTexto(notaMedia)}`}>{notaMedia}</p>
            </div>
            <div className="bg-cartao rounded-painel border border-borda p-4 text-center shadow-cartao">
              <p className="text-xs text-texto-fraco">% Conformidade</p>
              <p className={`text-3xl font-bold ${percConformidade >= 80 ? "text-ok" : percConformidade >= 60 ? "text-atencao" : "text-erro"}`}>{percConformidade}%</p>
            </div>
            <div className="bg-cartao rounded-painel border border-erro bg-erro-suave p-4 text-center shadow-cartao">
              <p className="text-xs text-erro">Nota Negativa</p>
              <p className="text-3xl font-bold text-erro">{negativas}</p>
            </div>
          </div>

          {/* Filtros adicionais */}
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Filtrar por fornecedor..." value={filterFornecedor}
              onChange={e => setFilterFornecedor(e.target.value)} className="h-12 text-xs w-48" />
            <Select value={filterMaterial} onValueChange={setFilterMaterial}>
              <SelectTrigger className="h-12 text-xs w-44"><SelectValue placeholder="Material" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os materiais</SelectItem>
                {["Spray", "Rótulo", "Embalagem", "Produto Interlub", "Matéria Prima (Terceiros)"].map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterInspetor} onValueChange={setFilterInspetor}>
              <SelectTrigger className="h-12 text-xs w-44"><SelectValue placeholder="Inspetor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos os inspetores</SelectItem>
                {inspetores.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Lista */}
          <Card className="shadow-cartao">
            <CardHeader className="border-b border-borda pb-3">
              <CardTitle className="text-base">Registros ({filtrados.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-fundo">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-texto-fraco">Data Entrega</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-texto-fraco">Nº Pedido</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-texto-fraco">Fornecedor</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-texto-fraco">Material</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-texto-fraco">Inspetor(es)</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-texto-fraco">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(c => (
                      <tr key={c.id} className="border-t border-borda hover:bg-fundo cursor-pointer transition-colors"
                        onClick={() => navigate(`/ChecklistDetalhe?id=${c.id}`)}>
                        <td className="px-4 py-3 text-xs text-texto-fraco">
                          {c.data_entrega ? format(new Date(c.data_entrega + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{c.numero_pedido_compras}</td>
                        <td className="px-4 py-3 text-xs max-w-[180px] truncate">{c.nome_fornecedor}</td>
                        <td className="px-4 py-3 text-xs">
                          <Badge className="text-[10px] bg-fundo text-tinta-media">{c.material_recebimento}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-texto-fraco max-w-[160px] truncate">
                          {(c.inspecionado_por || []).join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <ChecklistNotaBadge nota={c.nota_final} showLabel />
                        </td>
                      </tr>
                    ))}
                    {filtrados.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-texto-apagado">
                          <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          Nenhum checklist encontrado no período
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA: INDICADORES (admin) */}
        {isAdmin && (
          <TabsContent value="indicadores" className="mt-4">
            <IndicadoresChecklist checklists={filtrados} />
          </TabsContent>
        )}

        {/* ABA: BASE SAP (admin) */}
        {isAdmin && (
          <TabsContent value="base-sap" className="mt-4">
            <AbaBaseSAP />
          </TabsContent>
        )}
      </Tabs>
      </div>
    </div>
  );
}
