import React, { useState } from "react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

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

const checklistSchema = z.object({
  pedido_disponivel_etapa5: z.enum(["Sim", "Não"], { errorMap: () => ({ message: "Selecione se o pedido está disponível na Etapa 5" }) }),
  numero_pedido_compras: z.string().min(1, "Número do Pedido de Compras é obrigatório"),
  sap_pedido_id: z.string().optional().default(""),
  nome_fornecedor: z.string().min(1, "Nome do Fornecedor é obrigatório"),
  codigo_fornecedor: z.string().optional().default(""),
  descricao_material: z.string().min(1, "Descrição do Material é obrigatória"),
  data_prevista_material: z.string().optional().default(""),
  data_entrega: z.string().min(1, "Data de Entrega é obrigatória"),
  entrega_conforme_prevista: z.enum(["Sim", "Não"], { errorMap: () => ({ message: "Informe se a entrega está conforme prevista" }) }),
  inspecionado_por: z.array(z.string()).min(1, "Selecione pelo menos 1 inspetor"),
  numero_nota_fiscal: z.string().min(1, "Número da Nota Fiscal é obrigatório"),
  material_recebimento: z.string().min(1, "Selecione o Material de Recebimento"),
  quantidade_recebida: z.coerce.number().min(0.001, "Quantidade recebida deve ser maior que zero"),
  unidade_medida: z.string().min(1, "Selecione a Unidade de Medida"),
  numero_lote: z.string().min(1, "Número de Lote é obrigatório"),
  quantidade_conforme_nf: z.enum(["Sim", "Não"], { errorMap: () => ({ message: "Responda sobre a quantidade conforme NF" }) }),
  amostragem_inspecionada: z.enum(["Sim", "Não", "N/A"], { errorMap: () => ({ message: "Responda sobre a amostragem inspecionada" }) }),
  condicoes_gerais_conformes: z.enum(["Sim", "Não", "N/A"], { errorMap: () => ({ message: "Responda sobre as condições gerais" }) }),
  spray_conforme_feps: z.enum(["Sim", "Não", "N/A"], { errorMap: () => ({ message: "Responda sobre conformidade FEPS" }) }),
  acompanha_certificado_analise: z.enum(["Sim", "Não", "N/A"], { errorMap: () => ({ message: "Responda sobre o certificado de análise" }) }),
  acompanha_ficha_emergencia: z.enum(["Sim", "Não", "N/A"], { errorMap: () => ({ message: "Responda sobre a ficha de emergência" }) }),
  acompanha_fispq: z.enum(["Sim", "Não", "N/A"], { errorMap: () => ({ message: "Responda sobre a FISPQ" }) }),
  observacoes: z.string().optional().default(""),
  recebimento_id: z.string().optional().default(""),
}).superRefine((data, ctx) => {
  const temNao = [
    data.pedido_disponivel_etapa5,
    data.entrega_conforme_prevista,
    data.quantidade_conforme_nf,
    data.amostragem_inspecionada,
    data.condicoes_gerais_conformes,
    data.spray_conforme_feps,
    data.acompanha_certificado_analise,
    data.acompanha_ficha_emergencia,
    data.acompanha_fispq
  ].some(v => v === "Não");

  if (temNao && (!data.observacoes || !data.observacoes.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Observações são obrigatórias quando há qualquer resposta 'Não'",
      path: ["observacoes"]
    });
  }
});

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

  const [sapStatus, setSapStatus] = useState(null); // null | "found" | "not_found"
  const [sapBuscando, setSapBuscando] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(checklistSchema),
    defaultValues: {
      pedido_disponivel_etapa5: "",
      numero_pedido_compras: "",
      sap_pedido_id: "",
      nome_fornecedor: "",
      codigo_fornecedor: "",
      descricao_material: "",
      data_prevista_material: "",
      data_entrega: "",
      entrega_conforme_prevista: "",
      inspecionado_por: [],
      numero_nota_fiscal: "",
      material_recebimento: "",
      quantidade_recebida: "",
      unidade_medida: "",
      numero_lote: "",
      quantidade_conforme_nf: "",
      amostragem_inspecionada: "",
      condicoes_gerais_conformes: "",
      spray_conforme_feps: "",
      acompanha_certificado_analise: "",
      acompanha_ficha_emergencia: "",
      acompanha_fispq: "",
      observacoes: "",
      recebimento_id: "",
    }
  });

  const formValues = watch();

  const { data: operators = [] } = useQuery({
    queryKey: ["operators"],
    queryFn: () => base44.entities.Operator.filter({ ativo: true }, "nome"),
  });

  const { data: recebimentos = [] } = useQuery({
    queryKey: ["recebimentos"],
    queryFn: () => base44.entities.Recebimento.list("-created_date", 100),
  });

  const set = (k, v) => setValue(k, v, { shouldValidate: true });

  const handleBuscarSAP = async () => {
    const num = (formValues.numero_pedido_compras || "").trim();
    if (!num) return;
    setSapBuscando(true);
    setSapStatus(null);
    const results = await base44.entities.SapPedido.filter({ numero_documento: num, ativo: true });
    setSapBuscando(false);
    if (results.length > 0) {
      const p = results[0];
      setSapStatus("found");
      setValue("sap_pedido_id", p.id || "", { shouldValidate: true });
      setValue("nome_fornecedor", p.nome_fornecedor || "", { shouldValidate: true });
      setValue("codigo_fornecedor", p.codigo_fornecedor || "", { shouldValidate: true });
      setValue("data_prevista_material", p.data_vencimento || "", { shouldValidate: true });
    } else {
      setSapStatus("not_found");
      setValue("sap_pedido_id", "");
      setValue("nome_fornecedor", "");
      setValue("codigo_fornecedor", "");
      setValue("data_prevista_material", "");
    }
  };

  const toggleInspetor = (nome) => {
    const listaAtual = formValues.inspecionado_por || [];
    const novaLista = listaAtual.includes(nome)
      ? listaAtual.filter(n => n !== nome)
      : [...listaAtual, nome];
    setValue("inspecionado_por", novaLista, { shouldValidate: true });
  };

  const { total_sim, total_nao, soma_sim, soma_nao, nota_final } = calcNota(formValues);

  const notaColor = nota_final >= 80 ? "text-green-700" : nota_final >= 0 ? "text-yellow-700" : "text-red-700";
  const notaLabel = nota_final >= 80 ? "Aprovado" : nota_final >= 0 ? "Atenção" : "Reprovado";

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.ChecklistRecebimento.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      navigate("/ChecklistRecebimento");
    },
  });

  const onSubmit = (validData) => {
    const calc = calcNota(validData);
    mutation.mutate({
      ...validData,
      quantidade_recebida: Number(validData.quantidade_recebida),
      ...calc,
      criado_por_nome: user?.full_name || user?.email || "",
    });
  };

  const sapReadOnly = sapStatus === "found";
  const errorKeys = Object.keys(errors);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={() => navigate("/ChecklistRecebimento")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Novo Checklist de Recebimento</h1>
          <p className="text-xs text-slate-500">Preencha todos os campos obrigatórios com validação automática</p>
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
                <button type="button" key={op} onClick={() => set("pedido_disponivel_etapa5", op)}
                  className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${formValues.pedido_disponivel_etapa5 === op
                    ? op === "Sim" ? "bg-green-600 text-white border-green-600" : "bg-red-600 text-white border-red-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                  {op}
                </button>
              ))}
            </div>
            {errors.pedido_disponivel_etapa5 && <p className="text-xs text-red-500 mt-1">{errors.pedido_disponivel_etapa5.message}</p>}
          </div>

          {/* Número do pedido + busca SAP */}
          <div>
            <Label className="text-sm font-medium">Número do Pedido de Compras *</Label>
            <div className="flex gap-2 mt-1.5">
              <Input
                {...register("numero_pedido_compras")}
                onChange={e => {
                  set("numero_pedido_compras", e.target.value);
                  setSapStatus(null);
                }}
                onBlur={handleBuscarSAP}
                placeholder="Ex: 4500012345"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleBuscarSAP} disabled={sapBuscando}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            {errors.numero_pedido_compras && <p className="text-xs text-red-500 mt-1">{errors.numero_pedido_compras.message}</p>}
            {sapBuscando && <p className="text-xs text-slate-500 mt-1">Buscando no SAP...</p>}
            {sapStatus === "found" && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Pedido encontrado — campos preenchidos automaticamente</p>}
            {sapStatus === "not_found" && <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Pedido não encontrado na base SAP — preencha manualmente</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Nome do Fornecedor *</Label>
              <Input
                {...register("nome_fornecedor")}
                disabled={sapReadOnly}
                className="mt-1.5"
                placeholder="Nome do fornecedor"
              />
              {errors.nome_fornecedor && <p className="text-xs text-red-500 mt-1">{errors.nome_fornecedor.message}</p>}
            </div>
            <div>
              <Label className="text-sm font-medium">Código do Fornecedor</Label>
              <Input
                {...register("codigo_fornecedor")}
                disabled={sapReadOnly}
                className="mt-1.5"
                placeholder="Ex: FOR000545"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Descrição do Material *</Label>
            <Textarea
              {...register("descricao_material")}
              className="mt-1.5"
              rows={2}
              placeholder="Descreva o material recebido"
            />
            {errors.descricao_material && <p className="text-xs text-red-500 mt-1">{errors.descricao_material.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Data Prevista do Material</Label>
              <Input
                type="date"
                {...register("data_prevista_material")}
                disabled={sapReadOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Data de Entrega *</Label>
              <Input
                type="date"
                {...register("data_entrega")}
                className="mt-1.5"
              />
              {errors.data_entrega && <p className="text-xs text-red-500 mt-1">{errors.data_entrega.message}</p>}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">A Data de Entrega Está Conforme Com a Data Prevista? *</Label>
            <div className="flex gap-2 mt-1.5">
              {["Sim", "Não"].map(op => (
                <button type="button" key={op} onClick={() => set("entrega_conforme_prevista", op)}
                  className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-colors ${formValues.entrega_conforme_prevista === op
                    ? op === "Sim" ? "bg-green-600 text-white border-green-600" : "bg-red-600 text-white border-red-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                  {op}
                </button>
              ))}
            </div>
            {errors.entrega_conforme_prevista && <p className="text-xs text-red-500 mt-1">{errors.entrega_conforme_prevista.message}</p>}
          </div>

          {/* Inspetores */}
          <div>
            <Label className="text-sm font-medium">Inspecionado Por * (mínimo 1)</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {operators.map(op => {
                const sel = (formValues.inspecionado_por || []).includes(op.nome);
                return (
                  <button type="button" key={op.id} onClick={() => toggleInspetor(op.nome)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${sel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
                    <User className="w-3 h-3" />{op.nome}
                  </button>
                );
              })}
            </div>
            {(formValues.inspecionado_por || []).length > 0 && (
              <p className="text-xs text-slate-500 mt-1">Selecionados: {formValues.inspecionado_por.join(", ")}</p>
            )}
            {errors.inspecionado_por && <p className="text-xs text-red-500 mt-1">{errors.inspecionado_por.message}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Número de Nota Fiscal *</Label>
              <Input
                {...register("numero_nota_fiscal")}
                className="mt-1.5"
                placeholder="Nº NF"
              />
              {errors.numero_nota_fiscal && <p className="text-xs text-red-500 mt-1">{errors.numero_nota_fiscal.message}</p>}
            </div>
            <div>
              <Label className="text-sm font-medium">Material de Recebimento *</Label>
              <Select value={formValues.material_recebimento} onValueChange={v => set("material_recebimento", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {["Spray", "Rótulo", "Embalagem", "Produto Interlub", "Matéria Prima (Terceiros)"].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.material_recebimento && <p className="text-xs text-red-500 mt-1">{errors.material_recebimento.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Quantidade Recebida *</Label>
              <Input
                type="number"
                step="any"
                {...register("quantidade_recebida")}
                className="mt-1.5"
                placeholder="0"
              />
              {errors.quantidade_recebida && <p className="text-xs text-red-500 mt-1">{errors.quantidade_recebida.message}</p>}
            </div>
            <div>
              <Label className="text-sm font-medium">Unidade de Medida *</Label>
              <Select value={formValues.unidade_medida} onValueChange={v => set("unidade_medida", v)}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="UN" /></SelectTrigger>
                <SelectContent>
                  {["KG", "LT", "PC", "UN", "MILHEIRO", "M³"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.unidade_medida && <p className="text-xs text-red-500 mt-1">{errors.unidade_medida.message}</p>}
            </div>
            <div>
              <Label className="text-sm font-medium">Número de Lote *</Label>
              <Input
                {...register("numero_lote")}
                className="mt-1.5"
                placeholder="Lote"
              />
              {errors.numero_lote && <p className="text-xs text-red-500 mt-1">{errors.numero_lote.message}</p>}
            </div>
          </div>

          {/* Vincular Recebimento (opcional) */}
          <div>
            <Label className="text-sm font-medium">Vincular a um Recebimento (opcional)</Label>
            <Select value={formValues.recebimento_id} onValueChange={v => set("recebimento_id", v === "_none" ? "" : v)}>
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
            const isSpray = formValues.material_recebimento === "Spray";
            return (
              <div key={campo.key} className="space-y-1">
                <div
                  className={`flex items-start justify-between gap-3 p-3 rounded-lg border transition-colors ${isSprayField && isSpray ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
                  <span className={`text-sm flex-1 ${isSprayField && isSpray ? "text-blue-800 font-medium" : "text-slate-700"}`}>
                    {campo.label}
                    {isSprayField && isSpray && <Badge className="ml-2 bg-blue-200 text-blue-800 text-[10px]">Spray</Badge>}
                  </span>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {campo.opcoes.map(op => (
                      <button type="button" key={op} onClick={() => set(campo.key, op)}
                        className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${formValues[campo.key] === op
                          ? op === "Sim" ? "bg-green-600 text-white border-green-600"
                            : op === "Não" ? "bg-red-600 text-white border-red-600"
                            : "bg-slate-500 text-white border-slate-500"
                          : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"}`}>
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
                {errors[campo.key] && <p className="text-xs text-red-500 px-1">{errors[campo.key].message}</p>}
              </div>
            );
          })}

          {/* Rodapé da seção */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-200">
            <span className="text-sm text-slate-600">Sim: <strong className="text-green-700">{total_sim}</strong></span>
            <span className="text-sm text-slate-600">Não: <strong className="text-red-700">{total_nao}</strong></span>
            <span className="text-sm text-slate-600">N/A: <strong className="text-slate-500">
              {CHECKLIST_CAMPOS.filter(c => formValues[c.key] === "N/A").length}
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
            <Textarea
              {...register("observacoes")}
              className="mt-1.5"
              rows={3}
              placeholder="Registre aqui qualquer observação relevante..."
            />
            {errors.observacoes && <p className="text-xs text-red-500 mt-1">{errors.observacoes.message}</p>}
          </div>

          {/* Preview nota final */}
          <div className={`p-4 rounded-xl border-2 text-center ${nota_final >= 80 ? "bg-green-50 border-green-300" : nota_final >= 0 ? "bg-yellow-50 border-yellow-300" : "bg-red-50 border-red-300"}`}>
            <p className="text-xs text-slate-500 mb-1">Nota Final</p>
            <p className={`text-4xl font-bold ${notaColor}`}>{nota_final}</p>
            <p className={`text-sm font-semibold mt-1 ${notaColor}`}>{notaLabel}</p>
            <p className="text-xs text-slate-500 mt-2">Sim ({total_sim} × +10) + Não ({total_nao} × -10)</p>
          </div>

          {errorKeys.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              <p className="text-sm font-semibold text-red-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" />Campos com pendência:</p>
              <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5">
                {errorKeys.map((k) => <li key={k}>{errors[k]?.message}</li>)}
              </ul>
            </div>
          )}

          <Button type="submit" disabled={mutation.isPending} className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-base font-semibold">
            {mutation.isPending ? "Enviando..." : "Enviar Checklist"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}