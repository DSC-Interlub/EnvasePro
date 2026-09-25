import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Package, BarChart2, X, ChevronLeft, ListTodo, Truck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import RecebimentoCard from "@/components/recebimento/RecebimentoCard";
import AbaFornecedoresRecebimento from "@/components/recebimento/AbaFornecedoresRecebimento";

const hoje = () => format(new Date(), "yyyy-MM-dd");

const DOC_LABEL = {
  "Importação": "Número DI / AWB / BL",
  "Nacional": "Número NF",
  "Devolução": "Número NF / Documento",
  "Material auxiliar": "Identificador",
  "Outro": "Número do documento",
};

const FORM_INICIAL = {
  tipo: "Nacional",
  numero_documento: "",
  numero_nf: "",
  fornecedor_id: "",
  fornecedor_nome: "",
  fornecedor_livre: false,
  data_chegada: hoje(),
  prioridade: "Normal",
  volume_geral: "",
  peso_geral: "",
  descricao: "",
  equipe: [],
};

const TIPO_COLORS = { "Importação": "#7c3aed", "Nacional": "#2563eb", "Devolução": "#ea580c", "Material auxiliar": "#0d9488", "Outro": "#64748b" };
const PIE_COLORS = ["#7c3aed", "#2563eb", "#ea580c", "#0d9488", "#64748b"];

function minToHM(min) {
  if (!min && min !== 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export default function Recebimento() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [abaAtiva, setAbaAtiva] = useState("lista");

  // Lista filters
  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFim, setDataFim] = useState(hoje());
  const [filtroTipo, setFiltroTipo] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

  // Indicadores filters
  const d = new Date();
  const [indInicio, setIndInicio] = useState(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"));
  const [indFim, setIndFim] = useState(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd"));

  // Formulário inline
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [operadorSelecionado, setOperadorSelecionado] = useState("");

  const { data: recebimentos = [] } = useQuery({
    queryKey: ["recebimentos"],
    queryFn: () => base44.entities.Recebimento.list("-data_chegada"),
  });
  const { data: itens = [] } = useQuery({
    queryKey: ["recebimento-itens"],
    queryFn: () => base44.entities.RecebimentoItem.list(),
  });
  const { data: ocorrencias = [] } = useQuery({
    queryKey: ["recebimento-ocorrencias-all"],
    queryFn: () => base44.entities.RecebimentoOcorrencia.list(),
  });
  const { data: participantes = [] } = useQuery({
    queryKey: ["recebimento-participantes-all"],
    queryFn: () => base44.entities.RecebimentoParticipante.list(),
  });
  const { data: fornecedores = [] } = useQuery({
    queryKey: ["recebimento-fornecedores"],
    queryFn: () => base44.entities.RecebimentoFornecedor.list(),
  });
  const { data: operadores = [] } = useQuery({
    queryKey: ["operadores"],
    queryFn: () => base44.entities.Operator.list(),
  });
  const { data: checklists = [] } = useQuery({
    queryKey: ["checklists"],
    queryFn: () => base44.entities.ChecklistRecebimento.list("-created_date", 500),
  });

  const mutation = useMutation({
    mutationFn: async (payload) => {
      const rec = await base44.entities.Recebimento.create(payload.recebimento);
      await Promise.all(payload.equipe.map(e => base44.entities.RecebimentoParticipante.create({ ...e, recebimento_id: rec.id })));
      return rec;
    },
    onSuccess: (rec) => {
      queryClient.invalidateQueries({ queryKey: ["recebimentos"] });
      queryClient.invalidateQueries({ queryKey: ["recebimento-participantes-all"] });
      navigate(`/ExecutarRecebimento?id=${rec.id}`);
    },
  });

  // Filtros da lista
  const filtrados = recebimentos.filter(r => {
    const dataRef = r.data_chegada || r.data_prevista || "";
    const noIntervalo = !dataRef || (dataRef >= dataInicio && dataRef <= dataFim);
    const tipoOk = filtroTipo === "Todos" || r.tipo === filtroTipo;
    const statusOk = filtroStatus === "Todos" || r.status === filtroStatus;
    return noIntervalo && tipoOk && statusOk;
  }).sort((a, b) => {
    const prio = { Urgente: 0, Alta: 1, Normal: 2 };
    return (prio[a.prioridade] ?? 2) - (prio[b.prioridade] ?? 2);
  });

  const kpis = {
    total: filtrados.length,
    emAndamento: filtrados.filter(r => r.status === "Em andamento").length,
    concluidos: filtrados.filter(r => r.status === "Concluído").length,
    agendados: filtrados.filter(r => r.status === "Agendado").length,
    comOcorrencia: filtrados.filter(r => ocorrencias.some(o => o.recebimento_id === r.id && !o.resolvido)).length,
  };

  const setFiltroRapido = (tipo) => {
    const d = new Date();
    if (tipo === "hoje") { setDataInicio(hoje()); setDataFim(hoje()); }
    else if (tipo === "semana") {
      setDataInicio(format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setDataFim(format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else {
      setDataInicio(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"));
      setDataFim(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd"));
    }
  };

  const setFiltroInd = (tipo) => {
    const d = new Date();
    if (tipo === "hoje") { setIndInicio(hoje()); setIndFim(hoje()); }
    else if (tipo === "semana") {
      setIndInicio(format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
      setIndFim(format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd"));
    } else {
      setIndInicio(format(new Date(d.getFullYear(), d.getMonth(), 1), "yyyy-MM-dd"));
      setIndFim(format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd"));
    }
  };

  // Handlers do formulário
  const handleFornecedorChange = (id) => {
    if (id === "_livre") {
      setForm(f => ({ ...f, fornecedor_id: "", fornecedor_livre: true, fornecedor_nome: "" }));
    } else {
      const forn = fornecedores.find(f => f.id === id);
      setForm(f => ({ ...f, fornecedor_id: id, fornecedor_livre: false, fornecedor_nome: forn?.nome || "" }));
    }
  };

  const handleAddEquipe = () => {
    if (!operadorSelecionado) return;
    const op = operadores.find(o => o.id === operadorSelecionado);
    if (!op || form.equipe.some(e => e.operator_id === op.id)) return;
    setForm(f => ({ ...f, equipe: [...f.equipe, { operator_id: op.id, operator_nome: op.nome, funcao: "Conferente" }] }));
    setOperadorSelecionado("");
  };

  const handleSalvar = () => {
    mutation.mutate({
      recebimento: {
        tipo: form.tipo,
        numero_documento: form.numero_documento,
        numero_nf: form.numero_nf || undefined,
        fornecedor_id: form.fornecedor_id || undefined,
        fornecedor_nome: form.fornecedor_nome || undefined,
        data_chegada: form.data_chegada || undefined,
        prioridade: form.prioridade,
        descricao: [form.volume_geral ? `Volume: ${form.volume_geral}` : "", form.peso_geral ? `Peso: ${form.peso_geral}` : "", form.descricao || ""].filter(Boolean).join(" | ") || undefined,
        status: "Em andamento",
        datetime_inicio: new Date().toISOString(),
        status_assinatura: "Pendente",
      },
      equipe: form.equipe,
    });
  };

  const valido = form.tipo && form.numero_documento;

  // ── Dados para indicadores ─────────────────────────────────────────────────
  const filtradosInd = recebimentos.filter(r => {
    const data = r.data_chegada || r.data_prevista || "";
    return data >= indInicio && data <= indFim;
  });

  const concluidosInd = filtradosInd.filter(r => r.status === "Concluído" && r.tempo_produtivo_minutos != null);

  const porTipo = Object.entries(filtradosInd.reduce((acc, r) => { acc[r.tipo] = (acc[r.tipo] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
  const porDia = Object.entries(filtradosInd.reduce((acc, r) => { const d = r.data_chegada || r.data_prevista || ""; if (!d) return acc; acc[d] = (acc[d] || 0) + 1; return acc; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ dia: format(new Date(date + "T00:00:00"), "dd/MM", { locale: ptBR }), total }));

  const tempoMedioGeral = concluidosInd.length > 0 ? Math.round(concluidosInd.reduce((s, r) => s + r.tempo_produtivo_minutos, 0) / concluidosInd.length) : 0;
  const tempoPausadoTotal = filtradosInd.reduce((s, r) => s + (r.tempo_pausado_minutos || 0), 0);
  const tempoTotalProdutivo = filtradosInd.reduce((s, r) => s + (r.tempo_produtivo_minutos || 0), 0);

  const tempoMedioPorTipo = ["Importação", "Devolução", "Material auxiliar", "Outro"].map(tipo => {
    const deste = concluidosInd.filter(r => r.tipo === tipo);
    return { tipo, media: deste.length > 0 ? Math.round(deste.reduce((s, r) => s + r.tempo_produtivo_minutos, 0) / deste.length) : 0, total: deste.length };
  });

  const rankingOp = Object.entries(
    participantes.filter(p => filtradosInd.some(r => r.id === p.recebimento_id)).reduce((acc, p) => { acc[p.operator_nome] = (acc[p.operator_nome] || 0) + 1; return acc; }, {})
  ).sort(([, a], [, b]) => b - a).slice(0, 8).map(([nome, total]) => ({ nome, total }));

  const ocFiltradas = ocorrencias.filter(o => filtradosInd.some(r => r.id === o.recebimento_id));
  const ocPorTipo = Object.entries(ocFiltradas.reduce((acc, o) => { acc[o.tipo] = (acc[o.tipo] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));

  // ── Formulário ─────────────────────────────────────────────────────────────
  if (showForm) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setForm(FORM_INICIAL); }}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" /> Novo Recebimento
          </h1>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Importação", "Nacional", "Devolução", "Material auxiliar", "Outro"].map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{DOC_LABEL[form.tipo] || "Número do documento"} *</Label>
              <Input value={form.numero_documento} onChange={e => setForm(f => ({ ...f, numero_documento: e.target.value }))} placeholder="Ex: NF-001234" />
            </div>
          </div>

          {form.tipo === "Importação" && (
            <div>
              <Label>Número NF (opcional)</Label>
              <Input value={form.numero_nf} onChange={e => setForm(f => ({ ...f, numero_nf: e.target.value }))} placeholder="NF vinculada à DI" />
            </div>
          )}

          <div>
            <Label>Fornecedor</Label>
            <Select value={form.fornecedor_livre ? "_livre" : form.fornecedor_id} onValueChange={handleFornecedorChange}>
              <SelectTrigger><SelectValue placeholder="Selecionar fornecedor..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_livre">Fornecedor não cadastrado</SelectItem>
                {fornecedores.filter(f => f.ativo !== false).map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.fornecedor_livre && (
              <Input className="mt-2" placeholder="Nome do fornecedor" value={form.fornecedor_nome} onChange={e => setForm(f => ({ ...f, fornecedor_nome: e.target.value }))} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label>Data de chegada</Label><Input type="date" value={form.data_chegada} onChange={e => setForm(f => ({ ...f, data_chegada: e.target.value }))} /></div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Normal", "Alta", "Urgente"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label>Volume geral (opcional)</Label><Input value={form.volume_geral} onChange={e => setForm(f => ({ ...f, volume_geral: e.target.value }))} placeholder="Ex: 20 pallets, 50 caixas..." /></div>
            <div><Label>Peso geral (opcional)</Label><Input value={form.peso_geral} onChange={e => setForm(f => ({ ...f, peso_geral: e.target.value }))} placeholder="Ex: 1.200 kg" /></div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} placeholder="Apontamentos, instruções especiais, problemas esperados..." />
          </div>

          <div>
            <Label>Equipe participante</Label>
            {form.equipe.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 mt-1">
                {form.equipe.map(e => (
                  <Badge key={e.operator_id} className="bg-blue-100 text-blue-800 border border-blue-200 gap-1 pr-1">
                    {e.operator_nome}
                    <button onClick={() => setForm(f => ({ ...f, equipe: f.equipe.filter(x => x.operator_id !== e.operator_id) }))} className="ml-0.5 hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Select value={operadorSelecionado} onValueChange={setOperadorSelecionado}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar participante..." /></SelectTrigger>
                <SelectContent>
                  {operadores.filter(o => o.ativo !== false && !form.equipe.some(e => e.operator_id === o.id)).map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" onClick={handleAddEquipe} disabled={!operadorSelecionado}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSalvar} disabled={!valido || mutation.isPending}>
              {mutation.isPending ? "Salvando..." : "Criar Recebimento"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" /> Recebimento
          </h1>
          <p className="text-sm text-slate-500">Controle de entrada de materiais</p>
        </div>
        {abaAtiva === "lista" && (
          <Button className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Novo Recebimento
          </Button>
        )}
      </div>

      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList className="mb-2">
          <TabsTrigger value="lista" className="flex items-center gap-2">
            <ListTodo className="w-4 h-4" /> Lista
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="indicadores" className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4" /> Indicadores
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="fornecedores" className="flex items-center gap-2">
              <Truck className="w-4 h-4" /> Fornecedores
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── ABA: LISTA ──────────────────────────────────────────────── */}
        <TabsContent value="lista" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Total", value: kpis.total, cls: "text-slate-700" },
              { label: "Agendados", value: kpis.agendados, cls: "text-slate-600" },
              { label: "Em andamento", value: kpis.emAndamento, cls: "text-blue-700" },
              { label: "Concluídos", value: kpis.concluidos, cls: "text-green-700" },
              { label: "Com ocorrência", value: kpis.comOcorrencia, cls: "text-red-700" },
            ].map(k => (
              <div key={k.label} className="text-center bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium text-slate-600">Período:</span>
              {[["hoje", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"]].map(([k, l]) => (
                <Button key={k} size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setFiltroRapido(k)}>{l}</Button>
              ))}
              <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-7 text-xs w-36" />
              <span className="text-slate-400 text-sm">até</span>
              <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-7 text-xs w-36" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{["Todos", "Importação", "Nacional", "Devolução", "Material auxiliar", "Outro"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{["Todos", "Agendado", "Em andamento", "Pausado", "Concluído", "Cancelado"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {filtrados.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Nenhum recebimento no período</p>
              <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => setShowForm(true)}>
                <Plus className="w-4 h-4 mr-1" /> Criar primeiro recebimento
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtrados.map(r => (
                <RecebimentoCard
                  key={r.id}
                  recebimento={r}
                  itens={itens.filter(i => i.recebimento_id === r.id)}
                  ocorrencias={ocorrencias.filter(o => o.recebimento_id === r.id)}
                  participantes={participantes.filter(p => p.recebimento_id === r.id)}
                  isAdmin={isAdmin}
                  checklist={checklists.find(c => c.recebimento_id === r.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ABA: FORNECEDORES ───────────────────────────────────────── */}
        <TabsContent value="fornecedores">
          <AbaFornecedoresRecebimento />
        </TabsContent>

        {/* ── ABA: INDICADORES ────────────────────────────────────────── */}
        <TabsContent value="indicadores" className="space-y-6">
          <div className="flex flex-wrap gap-2 items-center">
            {[["hoje", "Hoje"], ["semana", "Esta semana"], ["mes", "Este mês"]].map(([k, l]) => (
              <Button key={k} size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setFiltroInd(k)}>{l}</Button>
            ))}
            <Input type="date" value={indInicio} onChange={e => setIndInicio(e.target.value)} className="h-7 text-xs w-36" />
            <span className="text-slate-400 text-xs">até</span>
            <Input type="date" value={indFim} onChange={e => setIndFim(e.target.value)} className="h-7 text-xs w-36" />
          </div>

          {/* Volume */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4 text-blue-600" />Volume</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total", value: filtradosInd.length, cls: "text-slate-700" },
                  { label: "Concluídos", value: filtradosInd.filter(r => r.status === "Concluído").length, cls: "text-green-700" },
                  { label: "Em andamento", value: filtradosInd.filter(r => r.status === "Em andamento").length, cls: "text-blue-700" },
                  { label: "Cancelados", value: filtradosInd.filter(r => r.status === "Cancelado").length, cls: "text-red-700" },
                ].map(k => (
                  <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Por tipo</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={porTipo} cx="50%" cy="50%" outerRadius={60} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                        {porTipo.map((entry, i) => <Cell key={i} fill={TIPO_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Recebimentos por dia</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={porDia}>
                      <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tempo */}
          <Card>
            <CardHeader><CardTitle className="text-base">⏱ Tempo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Tempo médio geral", value: minToHM(tempoMedioGeral) },
                  { label: "Tempo total produtivo", value: minToHM(tempoTotalProdutivo) },
                  { label: "Tempo total pausado", value: minToHM(tempoPausadoTotal) },
                  { label: "Baseado em", value: `${concluidosInd.length} concluídos` },
                ].map(k => (
                  <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p className="text-lg font-bold text-slate-700">{k.value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Tempo médio por tipo (minutos)</p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={tempoMedioPorTipo}>
                    <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => minToHM(v)} />
                    <Bar dataKey="media" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {tempoPausadoTotal > 0 && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-center">
                  <p className="text-xs text-orange-600">Tempo improdutivo (pausas) no período</p>
                  <p className="text-3xl font-bold text-orange-700">{minToHM(tempoPausadoTotal)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ocorrências */}
          <Card>
            <CardHeader><CardTitle className="text-base">⚠️ Ocorrências</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { label: "Total", value: ocFiltradas.length, cls: "text-slate-700" },
                  { label: "Abertas", value: ocFiltradas.filter(o => !o.resolvido).length, cls: "text-red-700" },
                  { label: "Resolvidas", value: ocFiltradas.filter(o => o.resolvido).length, cls: "text-green-700" },
                ].map(k => (
                  <div key={k.label} className="text-center bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">{k.label}</p>
                    <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {ocPorTipo.map(o => (
                  <div key={o.name} className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-center">
                    <p className="text-red-600 font-medium">{o.name}</p>
                    <p className="text-xl font-bold text-red-700">{o.value}</p>
                  </div>
                ))}
                {ocPorTipo.length === 0 && <p className="text-xs text-slate-400">Sem ocorrências no período</p>}
              </div>
            </CardContent>
          </Card>

          {/* Equipe */}
          <Card>
            <CardHeader><CardTitle className="text-base">👥 Equipe</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs font-semibold text-slate-500 mb-2">Participações por operador</p>
              {rankingOp.length === 0 ? <p className="text-slate-400 text-sm">Sem dados no período</p> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={rankingOp} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="nome" type="category" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#0d9488" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}