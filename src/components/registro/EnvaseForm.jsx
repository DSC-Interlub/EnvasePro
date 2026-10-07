
import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Save } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCurrentOperator } from "@/lib/AuthContext";
import * as z from "zod";

const envaseSchema = z.object({
  sala: z.enum(["Bio", "Industrial"], {
    errorMap: () => ({ message: "Selecione uma sala válida (Bio ou Industrial)" })
  }),
  data: z.string().min(1, "Data é obrigatória"),
  op: z.string().optional().default(""),
  operador: z.string().min(1, "Operador é obrigatório"),
  codigo_produto: z.string().min(1, "Selecione um produto"),
  codigo_embalagem: z.string().min(1, "Selecione uma embalagem"),
  quantidade_produzida: z.coerce.number().min(0, "Quantidade produzida não pode ser negativa"),
  inicio: z.string().min(1, "Horário de início é obrigatório"),
  termino: z.string().optional().default(""),
  dificuldade_codigo: z.coerce.number().default(0),
  lote_embalagem: z.string().optional().default(""),
  lotes_tampa: z.string().optional().default(""),
  observacoes: z.string().optional().default("")
});

const DIFICULDADES = [
  { codigo: 0, descricao: "Normal" },
  { codigo: 1, descricao: "Rotulagem" },
  { codigo: 2, descricao: "Final Tambor" },
  { codigo: 3, descricao: "Mescla de Produto" }
];

export default function EnvaseForm({ products, embalagens, operators, onSubmit, isLoading, initialData }) {
  const queryClient = useQueryClient();
  const { currentOperator } = useCurrentOperator ? useCurrentOperator() : { currentOperator: null };
  const formId = initialData?.id || `envase-${Date.now()}`;
  const storageKey = `envase-form-${formId}`;
  const [recordId, setRecordId] = useState(initialData?.id || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const inFlightAutoSaveRef = useRef(null);

  const [formData, setFormData] = useState(() => {
    if (!initialData) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.recordId) {
            setRecordId(parsed.recordId);
          }
          return parsed;
        } catch (e) {
          console.error('Erro ao carregar dados salvos', e);
        }
      }
    }
    
    return initialData || {
      sala: "",
      data: format(new Date(), "yyyy-MM-dd"),
      op: "",
      operador: "",
      codigo_produto: "",
      quantidade_produzida: "",
      inicio: "",
      termino: "",
      dificuldade_codigo: 0,
      lote_embalagem: "",
      lotes_tampa: "",
      observacoes: ""
    };
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedEmbalagem, setSelectedEmbalagem] = useState(null);
  const [timing, setTiming] = useState(false);

  useEffect(() => {
    if (!formData.operador && currentOperator?.nome) {
      setFormData(prev => ({ ...prev, operador: currentOperator.nome }));
    }
  }, [currentOperator, formData.operador]);

  // Mutation para criar/atualizar registro
  const autoSaveMutation = useMutation({
    mutationFn: async (data) => {
      console.log('🔵 Tentando salvar registro:', data);
      
      // The recordId here is captured from the state at the time this function is called.
      // If recordId state changes during the component's lifecycle, the useEffect that calls mutate
      // will ensure this logic uses the latest recordId by re-evaluating.
      if (recordId) { 
        console.log('🟡 Atualizando registro existente (auto-save):', recordId);
        const result = await base44.entities.EnvaseRecord.update(recordId, data);
        console.log('✅ Registro atualizado (auto-save):', result);
        return result;
      } else {
        console.log('🟢 Criando novo registro (auto-save)');
        const result = await base44.entities.EnvaseRecord.create(data);
        console.log('✅ Registro criado (auto-save):', result);
        return result;
      }
    },
    onSuccess: (data) => {
      console.log('✅ Sucesso no salvamento (auto-save):', data);
      if (!recordId && data.id) {
        console.log('📝 Salvando ID do registro (auto-save):', data.id);
        setRecordId(data.id);
        // Salvar o ID no localStorage também
        const currentData = JSON.parse(localStorage.getItem(storageKey) || '{}');
        localStorage.setItem(storageKey, JSON.stringify({ ...currentData, recordId: data.id }));
      }
      queryClient.invalidateQueries({ queryKey: ['envase-live'] });
      queryClient.invalidateQueries({ queryKey: ['envase-records'] });
    },
    onError: (error) => {
      console.error('❌ Erro ao salvar (auto-save):', error);
    }
  });

  // Salvar no localStorage
  useEffect(() => {
    if (!initialData) {
      const dataToSave = { ...formData, recordId };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    }
  }, [formData, recordId, storageKey, initialData]);

  // SALVAR AUTOMATICAMENTE quando início for definido ou alterado
  useEffect(() => {
    // Não dispara autosave em segundo plano se submissão manual estiver em andamento
    if (isSubmitting) return;

    // Verificar se tem os campos mínimos necessários E tem início
    if (formData.inicio && formData.sala && formData.operador) {
      console.log('🚀 Iniciando auto-save porque início foi definido:', formData.inicio);
      
      const dataToSave = {
        sala: formData.sala,
        data: formData.data,
        mes: formData.mes || (formData.data ? new Date(formData.data).getMonth() + 1 : undefined),
        ano: formData.ano || (formData.data ? new Date(formData.data).getFullYear() : undefined),
        op: formData.op || "",
        operador: formData.operador,
        codigo_produto: formData.codigo_produto || "",
        descricao_produto: formData.descricao_produto || "",
        consistencia: formData.consistencia || "",
        codigo_embalagem: formData.codigo_embalagem || "",
        descricao_embalagem: formData.descricao_embalagem || "",
        multiplo: formData.multiplo || 0,
        quantidade_produzida: parseFloat(formData.quantidade_produzida) || 0,
        inicio: formData.inicio,
        termino: formData.termino || "",
        tempo_produtivo: formData.tempo_produtivo || "",
        quantidade_embalagens: formData.quantidade_embalagens || 0,
        tempo_por_embalagem: formData.tempo_por_embalagem || "",
        dificuldade_codigo: formData.dificuldade_codigo || 0,
        dificuldade_tipo: formData.dificuldade_tipo || "Normal",
        lote_embalagem: formData.lote_embalagem || "",
        lotes_tampa: formData.lotes_tampa || "",
        observacoes: formData.observacoes || ""
      };
      
      const savePromise = autoSaveMutation.mutateAsync(dataToSave).catch((err) => {
        console.error('Erro no autoSave assíncrono:', err);
      });
      inFlightAutoSaveRef.current = savePromise;
    }
  }, [
    formData.inicio, 
    formData.termino, 
    formData.sala, 
    formData.operador, 
    formData.data, 
    formData.op,
    formData.codigo_produto,
    formData.descricao_produto,
    formData.consistencia,
    formData.codigo_embalagem,
    formData.descricao_embalagem,
    formData.multiplo,
    formData.quantidade_produzida,
    formData.tempo_produtivo,
    formData.quantidade_embalagens,
    formData.tempo_por_embalagem,
    formData.dificuldade_codigo,
    formData.dificuldade_tipo,
    formData.lote_embalagem,
    formData.lotes_tampa,
    formData.observacoes,
    recordId,
    isSubmitting
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    // 1. Validação via Zod Schema
    const parseResult = envaseSchema.safeParse(formData);
    if (!parseResult.success) {
      const errMap = {};
      parseResult.error.errors.forEach((err) => {
        const fieldName = err.path[0];
        if (fieldName) errMap[fieldName] = err.message;
      });
      setFormErrors(errMap);
      return;
    }
    setFormErrors({});
    setIsSubmitting(true);

    try {
      // 2. Lock anti-corrida: se houver autosave em andamento, aguarda conclusão
      if (inFlightAutoSaveRef.current) {
        console.log('⏳ Aguardando auto-save em andamento finalizar antes de finalizar registro...');
        await inFlightAutoSaveRef.current;
        inFlightAutoSaveRef.current = null;
      }

      // Re-verificar se recordId foi obtido pelo autosave ou localStorage
      let currentRecordId = recordId;
      if (!currentRecordId && !initialData) {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.recordId) currentRecordId = parsed.recordId;
          } catch (err) {}
        }
      }

      const finalDataForUpdate = {
        sala: formData.sala,
        data: formData.data,
        mes: formData.mes || (formData.data ? new Date(formData.data).getMonth() + 1 : undefined),
        ano: formData.ano || (formData.data ? new Date(formData.data).getFullYear() : undefined),
        op: formData.op || "",
        operador: formData.operador,
        codigo_produto: formData.codigo_produto || "",
        descricao_produto: formData.descricao_produto || "",
        consistencia: formData.consistencia || "",
        codigo_embalagem: formData.codigo_embalagem || "",
        descricao_embalagem: formData.descricao_embalagem || "",
        multiplo: formData.multiplo || 0,
        quantidade_produzida: parseFloat(formData.quantidade_produzida) || 0,
        inicio: formData.inicio,
        termino: formData.termino || "",
        tempo_produtivo: formData.tempo_produtivo || "",
        quantidade_embalagens: formData.quantidade_embalagens || 0,
        tempo_por_embalagem: formData.tempo_por_embalagem || "",
        dificuldade_codigo: formData.dificuldade_codigo || 0,
        dificuldade_tipo: formData.dificuldade_tipo || "Normal",
        lote_embalagem: formData.lote_embalagem || "",
        lotes_tampa: formData.lotes_tampa || "",
        observacoes: formData.observacoes || ""
      };

      if (currentRecordId) {
        console.log('📋 Finalizando registro existente (submit):', currentRecordId);
        await base44.entities.EnvaseRecord.update(currentRecordId, finalDataForUpdate);
        if (!initialData) {
          localStorage.removeItem(storageKey);
        }
        await onSubmit({ ...formData, id: currentRecordId });
      } else {
        console.log('📋 Criando novo registro no submit (sem recordId prévio)');
        await onSubmit(formData);
        if (!initialData) {
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar/criar registro no submit:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (formData.codigo_produto) {
      const product = products.find(p => p.codigo === formData.codigo_produto);
      setSelectedProduct(product);

      if (product) {
        const last4Digits = product.codigo.slice(-4);
        const embalagem = embalagens.find(e => e.ultimos_4_digitos === last4Digits);
        setSelectedEmbalagem(embalagem);
      }
    } else {
      setSelectedProduct(null);
      setSelectedEmbalagem(null);
    }
  }, [formData.codigo_produto, products, embalagens]);

  useEffect(() => {
    if (formData.data) {
      const date = new Date(formData.data);
      setFormData(prev => ({
        ...prev,
        mes: date.getMonth() + 1,
        ano: date.getFullYear()
      }));
    }
  }, [formData.data]);

  useEffect(() => {
    if (selectedProduct) {
      setFormData(prev => ({
        ...prev,
        descricao_produto: selectedProduct.nome,
        consistencia: selectedProduct.consistencia
      }));
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (selectedEmbalagem) {
      setFormData(prev => ({
        ...prev,
        codigo_embalagem: selectedEmbalagem.codigo,
        descricao_embalagem: selectedEmbalagem.descricao,
        multiplo: selectedEmbalagem.conteudo
      }));
    }
  }, [selectedEmbalagem]);

  useEffect(() => {
    const dificuldade = DIFICULDADES.find(d => d.codigo === formData.dificuldade_codigo);
    if (dificuldade) {
      setFormData(prev => ({
        ...prev,
        dificuldade_tipo: dificuldade.descricao
      }));
    }
  }, [formData.dificuldade_codigo]);

  useEffect(() => {
    if (formData.inicio && formData.termino && formData.multiplo && formData.quantidade_produzida) {
      const inicio = new Date(`1970-01-01T${formData.inicio}`);
      const termino = new Date(`1970-01-01T${formData.termino}`);
      const diffMs = termino - inicio;
      const diffMins = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      
      const tempoProdutivo = `${hours}:${mins.toString().padStart(2, '0')}`;
      const quantidadeEmbalagens = Math.floor(formData.quantidade_produzida / formData.multiplo);
      const tempoPorEmbalagem = quantidadeEmbalagens > 0 
        ? `${(diffMins / quantidadeEmbalagens).toFixed(2)} min` 
        : "0";

      setFormData(prev => ({
        ...prev,
        tempo_produtivo: tempoProdutivo,
        quantidade_embalagens: quantidadeEmbalagens,
        tempo_por_embalagem: tempoPorEmbalagem
      }));
    }
  }, [formData.inicio, formData.termino, formData.multiplo, formData.quantidade_produzida]);

  const handleStartTimer = () => {
    const now = format(new Date(), "HH:mm");
    console.log('⏰ Iniciando timer:', now);
    setFormData(prev => ({ ...prev, inicio: now }));
    setTiming(true);
  };

  const handleStopTimer = () => {
    const now = format(new Date(), "HH:mm");
    console.log('⏹️ Parando timer:', now);
    setFormData(prev => ({ ...prev, termino: now }));
    setTiming(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Sala e Data */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="sala">Sala *</Label>
          <Select
            value={formData.sala}
            onValueChange={(value) => setFormData(prev => ({ ...prev, sala: value }))}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione a sala" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Bio">Sala Bio</SelectItem>
              <SelectItem value="Industrial">Sala Industrial</SelectItem>
            </SelectContent>
          </Select>
          {formErrors.sala && <p className="text-xs text-red-500">{formErrors.sala}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="data">Data *</Label>
          <Input
            id="data"
            type="date"
            value={formData.data}
            onChange={(e) => setFormData(prev => ({ ...prev, data: e.target.value }))}
            required
          />
          {formErrors.data && <p className="text-xs text-red-500">{formErrors.data}</p>}
        </div>
      </div>

      {/* OP e Operador */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="op">Ordem de Produção (OP)</Label>
          <Input
            id="op"
            value={formData.op}
            onChange={(e) => setFormData(prev => ({ ...prev, op: e.target.value }))}
            placeholder="Ex: OP-2025-001"
          />
          {formErrors.op && <p className="text-xs text-red-500">{formErrors.op}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="operador">Operador *</Label>
          <Select
            value={formData.operador}
            onValueChange={(value) => setFormData(prev => ({ ...prev, operador: value }))}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o operador" />
            </SelectTrigger>
            <SelectContent>
              {operators.map((op) => (
                <SelectItem key={op.id} value={op.nome}>
                  {op.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {formErrors.operador && <p className="text-xs text-red-500">{formErrors.operador}</p>}
        </div>
      </div>

      {/* Código do Produto */}
      <div className="space-y-2">
        <Label htmlFor="codigo_produto">Código do Produto</Label>
        <Input
          id="codigo_produto"
          value={formData.codigo_produto}
          onChange={(e) => setFormData(prev => ({ ...prev, codigo_produto: e.target.value }))}
          placeholder="Digite o código do produto"
        />
        {formErrors.codigo_produto && <p className="text-xs text-red-500">{formErrors.codigo_produto}</p>}
        {selectedProduct && (
          <div className="text-sm text-slate-600 mt-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="font-semibold text-blue-900 mb-2">{selectedProduct.nome}</p>
            <div className="grid grid-cols-2 gap-2">
              <p><strong>Código:</strong> {selectedProduct.codigo}</p>
              <p><strong>Consistência:</strong> {selectedProduct.consistencia}</p>
              {selectedProduct.unidade_medida && (
                <p><strong>Unidade:</strong> {selectedProduct.unidade_medida}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dados da Embalagem */}
      {selectedEmbalagem && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <h3 className="font-semibold text-slate-900 mb-2">Embalagem Identificada</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-600">Código: <strong>{selectedEmbalagem.codigo}</strong></p>
              <p className="text-slate-600">Descrição: <strong>{selectedEmbalagem.descricao}</strong></p>
            </div>
            <div>
              <p className="text-slate-600">Conteúdo: <strong>{selectedEmbalagem.conteudo}</strong></p>
              <p className="text-slate-600">Tipo: <strong>{selectedEmbalagem.tipo}</strong></p>
            </div>
          </div>
        </div>
      )}

      {/* Quantidade Produzida */}
      <div className="space-y-2">
        <Label htmlFor="quantidade_produzida">Quantidade Produzida</Label>
        <Input
          id="quantidade_produzida"
          type="number"
          value={formData.quantidade_produzida}
          onChange={(e) => setFormData(prev => ({ ...prev, quantidade_produzida: parseFloat(e.target.value) || 0 }))}
          placeholder="Ex: 1000"
        />
        {formErrors.quantidade_produzida && <p className="text-xs text-red-500">{formErrors.quantidade_produzida}</p>}
      </div>

      {/* Controle de Tempo */}
      <div className="space-y-4">
        <Label>Controle de Tempo</Label>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="inicio">Início *</Label>
            <div className="flex gap-2">
              <Input
                id="inicio"
                type="time"
                value={formData.inicio}
                onChange={(e) => setFormData(prev => ({ ...prev, inicio: e.target.value }))}
              />
              <Button
                type="button"
                onClick={handleStartTimer}
                disabled={timing}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="w-4 h-4" />
              </Button>
            </div>
            {formErrors.inicio && <p className="text-xs text-red-500">{formErrors.inicio}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="termino">Término</Label>
            <div className="flex gap-2">
              <Input
                id="termino"
                type="time"
                value={formData.termino}
                onChange={(e) => setFormData(prev => ({ ...prev, termino: e.target.value }))}
              />
              <Button
                type="button"
                onClick={handleStopTimer}
                disabled={!timing}
                className="bg-red-600 hover:bg-red-700"
              >
                <Square className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tempo Produtivo</Label>
            <Input
              value={formData.tempo_produtivo || "--:--"}
              disabled
              className="bg-slate-100"
            />
          </div>
        </div>

        {formData.quantidade_embalagens > 0 && (
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm">
            <p><strong>Quantidade de Embalagens:</strong> {formData.quantidade_embalagens}</p>
            <p><strong>Tempo por Embalagem:</strong> {formData.tempo_por_embalagem}</p>
          </div>
        )}
      </div>

      {/* Dificuldade */}
      <div className="space-y-2">
        <Label htmlFor="dificuldade">Dificuldade</Label>
        <Select
          value={formData.dificuldade_codigo.toString()}
          onValueChange={(value) => setFormData(prev => ({ ...prev, dificuldade_codigo: parseInt(value) }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIFICULDADES.map((d) => (
              <SelectItem key={d.codigo} value={d.codigo.toString()}>
                {d.descricao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lotes */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="lote_embalagem">Lote da Embalagem</Label>
          <Input
            id="lote_embalagem"
            value={formData.lote_embalagem}
            onChange={(e) => setFormData(prev => ({ ...prev, lote_embalagem: e.target.value }))}
            placeholder="Ex: L2025-001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lotes_tampa">Lotes da Tampa</Label>
          <Input
            id="lotes_tampa"
            value={formData.lotes_tampa}
            onChange={(e) => setFormData(prev => ({ ...prev, lotes_tampa: e.target.value }))}
            placeholder="Ex: LT2025-001"
          />
        </div>
      </div>

      {/* Observações */}
      <div className="space-y-2">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          value={formData.observacoes}
          onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
          placeholder="Observações adicionais..."
          rows={3}
        />
      </div>

      {/* Botão Salvar com trava anti-corrida */}
      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700"
        disabled={isLoading || isSubmitting || autoSaveMutation.isPending}
      >
        <Save className="w-4 h-4 mr-2" />
        {isSubmitting ? "Finalizando..." : isLoading ? "Salvando..." : "Finalizar Registro"}
      </Button>
      
      {autoSaveMutation.isPending && (
        <p className="text-sm text-blue-600 text-center animate-pulse">Salvando automaticamente em segundo plano...</p>
      )}
    </form>
  );
}
