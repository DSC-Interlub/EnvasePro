import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, AlertTriangle, CheckCircle2, User } from "lucide-react";
import { format } from "date-fns";

const CHECKLIST_CAMPOS = [
  { key: "quantidade_conforme_nf", label: "A Quantidade Recebida Está Conforme Com a Nota Fiscal?", opcoes: ["Sim", "Não"] },
  { key: "amostragem_inspecionada", label: "Amostragem Inspecionada (10%)?", opcoes: ["Sim", "Não", "N/A"] },
  { key: "condicoes_gerais_conformes", label: "As Condições Gerais do Item Estão de Acordo Com os Padrões de Qualidade Interlub?", opcoes: ["Sim", "Não", "N/A"] },
  { key: "spray_conforme_feps", label: "O Spray Está de Acordo Com a FEPS Atual?", opcoes: ["Sim", "Não", "N/A"], soSpray: true },
  { key: "acompanha_certificado_analise", label: "O Material Está Acompanhado de Certificado de Análise?", opcoes: ["Sim", "Não", "N/A"] },
  { key: "acompanha_ficha_emergencia", label: "O Material Está Acompanhado da Ficha de Emergência?", opcoes: ["Sim", "Não", "N/A"] },
  { key: "acompanha_fispq", label: "O Material Está Acompanhado da FISPQ?", opcoes: ["Sim", "Não", "N/A"] },
];

const CAMPOS_PONTUACAO = [
  "pedido_disponivel_etapa5", "entrega_conforme_prevista",
  "quantidade_conforme_nf", "amostragem_inspecionada", "condicoes_gerais_conformes",
  "spray_conforme_feps", "acompanha_certificado_analise", "acompanha_ficha_emergencia", "acompanha_fispq",
];

function calcNota(form) {
  let sim = 0, nao = 0;
  CAMPOS_PONTUACAO.forEach(k => {
    if (form[k] === "Sim") sim++;
    else if (form[k] === "Não") nao++;
  });
  return { total_sim: sim, total_nao: nao, soma_sim: sim * 10, soma_nao: nao * -10, nota_final: sim * 10 + nao * -10 };
}

export default function NovoChecklist() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    pedido_disponivel_etapa5: "", numero_pedido_compras: "", sap_pedido_id: "",
    nome_fornecedor: "", codigo_fornecedor: "", descricao_material: "",
    data_prevista_material: "", data_entrega: "", entrega_conforme_prevista: "",
    inspecionado_por: [], numero_nota_fiscal: "", material_recebimento: "",
    quantidade_recebida: "", unidade_medida: "", numero_lote: "",
    quantidade_conforme_nf: "", amostragem_inspecionada: "", condicoes_gerais_conformes: "",
    spray_conforme_feps: "", acompanha_certificado_analise: "", acompanha_ficha_emergencia: "",
    acompanha_fispq: "", observacoes: "", recebimento_id: "",
  });

  const [sapStatus, setSapStatus] = useState(null); // null | "found" | "not_found"
  const [sapBuscando, setSapBuscando] = useState(false);
  const [erros, setErros] = useState([]);

  const { data: operators = [] } = useQuery({
    queryKey: ["operators"],
    queryFn: () => base44.entities.Operator.filter({ ativo: true }, "nome"),
  });

  const { data: recebimentos = [] } = useQuery({
    queryKey: ["recebimentos"],
    queryFn: () => base44.entities.Recebimento.list("-created_date", 100),
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleBuscarSAP = async () => {
    const num = form.numero_pedido_compras.trim();
    if (!num) return;
    setSapBuscando(true);
    setSapStatus(null);
    const results = await base44.entities.SapPedido.filter({ numero_documento: num, ativo: true });
    setSapBuscando(false);
    if (results.length > 0) {
      const p = results[0];
      setSapStatus("found");
      setForm(prev => ({
        ...prev,
        sap_pedido_id: p.id,
        nome_fornecedor: p.nome_fornecedor || "",
        codigo_fornecedor: p.codigo_fornecedor || "",
        data_prevista_material: p.data_vencimento || "",
      }));
    } else {
      setSapStatus("not_found");
      setForm(prev => ({ ...prev, sap_pedido_id: "", nome_fornecedor: "", codigo_fornecedor: "", data_prevista_material: "" }));
    }
  };

  const toggleInspetor = (nome) => {
    setForm(prev => {
      const lista = prev.inspecionado_por.includes(nome)
        ? prev.inspecionado_por.filter(n => n !== nome)
        : [...prev.inspecionado_por, nome];
      return { ...prev, inspecionado_por: lista };
    });
  };

  const { total_sim, total_nao, soma_sim, soma_nao, nota_final } = calcNota(form);

  const notaColor = nota_final >= 80 ? "text-green-700" : nota_final >= 0 ? "text-yellow-700" : "text-red-700";
  const notaLabel = nota_final >= 80 ? "Aprovado" : nota_final >= 0 ? "Atenção" : "Reprovado";

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistRecebimento.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      navigate("/ChecklistRecebimento");
    },
  });

  const handleSubmit = () => {
    const errosLista = [];
    if (!form.pedido_disponivel_etapa5) errosLista.push("Pedido disponível na Etapa 5?");
    if (!form.numero_pedido_compras) errosLista.push("Número do Pedido de Compras");
    if (!form.nome_fornecedor) errosLista.push("Nome do Fornecedor");
    if (!form.descricao_material) errosLista.push("Descrição do Material");
    if (!form.data_entrega) errosLista.push("Data de Entrega");
    if (!form.entrega_conforme_prevista) errosLista.push("Entrega conforme prevista?");
    if (form.inspecionado_por.length === 0) errosLista.push("Pelo menos 1 inspetor");
    if (!form.numero_nota_fiscal) errosLista.push("Número da Nota Fiscal");
    if (!form.material_recebimento) errosLista.push("Material de Recebimento");
    if (!form.quantidade_recebida) errosLista.push("Quantidade Recebida");
    if (!form.unidade_medida) errosLista.push("Unidade de Medida");
    if (!form.numero_lote) errosLista.push("Número de Lote");
    CHECKLIST_CAMPOS.forEach(c => { if (!form[c.key]) errosLista.push(c.label.slice(0, 40) + "..."); });

    // Se algum campo tem "Não" → observações obrigatórias
    const temNao = CHECKLIST_CAMPOS.some(c => form[c.key] === "Não") ||
      form.pedido_disponivel_etapa5 === "Não" || form.entrega_conforme_prevista === "Não";
    if (temNao && !form.observacoes.trim()) errosLista.push("Observações obrigatórias quando há resposta 'Não'");

    if (errosLista.length > 0) { setErros(errosLista); return; }
    setErros([]);

    const calc = calcNota(form);
    mutation.mutate({
      ...form,
      quantidade_recebida: Number(form.quantidade_recebida),
      ...calc,
      criado_por_nome: user?.full_name || user?.email || "",
    });
  };

  const sapReadOnly = sapStatus === "found";

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ChecklistRecebimento")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Novo Checklist de Recebimento</h1>
          <p className="text-xs text-slate-500">Preencha todos os campos obrigatórios</p>
        </div>
      </div>

      {/* SEÇÃO 1 — Identificação */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">1. Identificação do Pedido</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Pedido disponível */}
          <div>
            <Label className="text-sm font-medium">O Pedido de Compras Está Disponível na Etapa 5? *</Label>
            <div className="flex gap-2 mt-1.5">
              {["Sim", "Não"].map(op => (
                <button key={op} onClick={() => set("pedido_disponivel_etapa5", op)}
                  className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${form.pedido_disponivel_etapa5 === op
                    ? op === "Sim" ? "bg-green-600 text-white border-green-600" : "bg-red-600 text-white border-red-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                  {op}
                </button>
              ))}
            </div>
          </div>

          {/* Número do pedido + busca SAP */}
          <div>
            <Label className="text-sm font-medium">Número do Pedido de Compras *</Label>
            <div className="flex gap-2 mt-1.5">
              <Input value={form.numero_pedido_compras}
                onChange={e => { set("numero_pedido_compras", e.target.value); setSapStatus(null); }}
                onBlur={handleBuscarSAP}
                placeholder="Ex: 4500012345" className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleBuscarSAP} disabled={sapBuscando}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {sapBuscando && <p className="text-xs text-slate-500 mt-1">Buscando no SAP...</p>}
            {sapStatus === "found" && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Pedido encontrado — campos preenchidos automaticamente</p>}
            {sapStatus === "not_found" && <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Pedido não encontrado na base SAP — preencha manualmente</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Nome do Fornecedor *</Label>
              <Input value={form.nome_fornecedor} onChange={e => set("nome_fornecedor", e.target.value)}
                disabled={sapReadOnly} className="mt-1.5" placeholder="Nome do fornecedor" />
            </div>
            <div>
              <Label className="text-sm font-medium">Código do Fornecedor</Label>
              <Input value={form.codigo_fornecedor} onChange={e => set("codigo_fornecedor", e.target.value)}
                disabled={sapReadOnly} className="mt-1.5" placeholder="Ex: FOR000545" />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Descrição do Material *</Label>
            <Textarea value={form.descricao_material} onChange={e => set("descricao_material", e.target.value)}
              className="mt-1.5" rows={2} placeholder="Descreva o material recebido" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Data Prevista do Material</Label>
              <Input type="date" value={form.data_prevista_material} onChange={e => set("data_prevista_material", e.target.value)}
                disabled={sapReadOnly} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-sm font-medium">Data de Entrega *</Label>
              <Input type="date" value={form.data_entrega} onChange={e => set("data_entrega", e.target.value)} className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">A Data de Entrega Está Conforme Com a Data Prevista? *</Label>
            <div className="flex gap-2 mt-1.5">
              {["Sim", "Não"].map(op => (
                <button key={op} onClick={() => set("entrega_conforme_prevista", op)}
                  className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${form.entrega_conforme_prevista === op
                    ? op === "Sim" ? "bg-green-600 text-white border-green-600" : "bg-red-600 text-white border-red-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                  {op}
                </button>
              ))}
            </div>
          </div>

          {/* Inspetores */}
          <div>
            <Label className="text-sm font-medium">Inspecionado Por * (mínimo 1)</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {operators.map(op => {
                const sel = form.inspecionado_por.includes(op.nome);
                return (
                  <button key={op.id} onClick={() => toggleInspetor(op.nome)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${sel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                    <User className="w-3 h-3" />{op.nome}
                  </button>
                );
              })}
            </div>
            {form.inspecionado_por.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">Selecionados: {form.inspecionado_por.join(", ")}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Número de Nota Fiscal *</Label>
              <Input value={form.numero_nota_fiscal} onChange={e => set("numero_nota_fiscal", e.target.value)} className="mt-1.5" placeholder="Nº NF" />
            </div>
            <div>
              <Label className="text-sm font-medium">Material de Recebimento *</Label>
              <Select value={form.material_recebimento} onValueChange={v => set("material_recebimento", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {["Spray", "Rótulo", "Embalagem", "Produto Interlub", "Matéria Prima (Terceiros)"].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Quantidade Recebida *</Label>
              <Input type="number" value={form.quantidade_recebida} onChange={e => set("quantidade_recebida", e.target.value)} className="mt-1.5" placeholder="0" />
            </div>
            <div>
              <Label className="text-sm font-medium">Unidade de Medida *</Label>
              <Select value={form.unidade_medida} onValueChange={v => set("unidade_medida", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="UN" /></SelectTrigger>
                <SelectContent>
                  {["KG", "LT", "PC", "UN", "MILHEIRO", "M³"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Número de Lote *</Label>
              <Input value={form.numero_lote} onChange={e => set("numero_lote", e.target.value)} className="mt-1.5" placeholder="Lote" />
            </div>
          </div>

          {/* Vincular Recebimento (opcional) */}
          <div>
            <Label className="text-sm font-medium">Vincular a um Recebimento (opcional)</Label>
            <Select value={form.recebimento_id} onValueChange={v => set("recebimento_id", v === "_none" ? "" : v)}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhum</SelectItem>
                {recebimentos.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.numero_documento} · {r.fornecedor_nome || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO 2 — Checklist */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">2. Checklist de Conformidade</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {CHECKLIST_CAMPOS.map(campo => {
            const isSprayField = campo.soSpray;
            const isSpray = form.material_recebimento === "Spray";
            return (
              <div key={campo.key}
                className={`flex items-start justify-between gap-3 p-3 rounded-lg border transition-colors ${isSprayField && isSpray ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
                <span className={`text-sm flex-1 ${isSprayField && isSpray ? "text-blue-800 font-medium" : "text-slate-700"}`}>
                  {campo.label}
                  {isSprayField && isSpray && <Badge className="ml-2 bg-blue-200 text-blue-800 text-[10px]">Spray</Badge>}
                </span>
                <div className="flex gap-1.5 flex-shrink-0">
                  {campo.opcoes.map(op => (
                    <button key={op} onClick={() => set(campo.key, op)}
                      className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${form[campo.key] === op
                        ? op === "Sim" ? "bg-green-600 text-white border-green-600"
                          : op === "Não" ? "bg-red-600 text-white border-red-600"
                          : "bg-slate-500 text-white border-slate-500"
                        : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"}`}>
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Rodapé da seção */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-200">
            <span className="text-sm text-slate-600">Sim: <strong className="text-green-700">{total_sim}</strong></span>
            <span className="text-sm text-slate-600">Não: <strong className="text-red-700">{total_nao}</strong></span>
            <span className="text-sm text-slate-600">N/A: <strong className="text-slate-500">
              {CHECKLIST_CAMPOS.filter(c => form[c.key] === "N/A").length}
            </strong></span>
            <span className="text-sm font-semibold text-slate-700">
              Nota parcial: <span className={notaColor}>{soma_sim + soma_nao > 0 ? "+" : ""}{soma_sim + soma_nao}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* SEÇÃO 3 — Observações e envio */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">3. Observações e Envio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Observações</Label>
            <Textarea value={form.observacoes} onChange={e => set("observacoes", e.target.value)}
              className="mt-1.5" rows={3} placeholder="Registre aqui qualquer observação relevante..." />
          </div>

          {/* Preview nota final */}
          <div className={`p-4 rounded-xl border-2 text-center ${nota_final >= 80 ? "bg-green-50 border-green-300" : nota_final >= 0 ? "bg-yellow-50 border-yellow-300" : "bg-red-50 border-red-300"}`}>
            <p className="text-xs text-slate-500 mb-1">Nota Final</p>
            <p className={`text-4xl font-bold ${notaColor}`}>{nota_final}</p>
            <p className={`text-sm font-semibold mt-1 ${notaColor}`}>{notaLabel}</p>
            <p className="text-xs text-slate-500 mt-2">Sim ({total_sim} × +10) + Não ({total_nao} × -10)</p>
          </div>

          {erros.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-red-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />Campos obrigatórios:</p>
              <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
                {erros.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={mutation.isPending} className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-base font-semibold">
            {mutation.isPending ? "Enviando..." : "Enviar Checklist"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}