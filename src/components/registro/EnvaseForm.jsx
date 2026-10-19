
import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, Check, Package, Hash, ClipboardList } from "lucide-react";
import { SectionCard, TecladoNumerico } from "@/components/fluxo";
import BuscaProduto from "./BuscaProduto";
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
  const [qtdTexto, setQtdTexto] = useState(() =>
    formData.quantidade_produzida ? String(formData.quantidade_produzida) : ""
  );
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

  // ---------------------------------------------------------------------
  // A quantidade tem DUAS representacoes de proposito: o texto que o operador
  // ve (pode estar vazio, pode ter virgula no meio da digitacao) e o numero que
  // vai para o banco e para as contas derivadas. Guardar so o numero fazia
  // "1," virar NaN; guardar so o texto quebraria
  // `Math.floor(quantidade / multiplo)`.
  // ---------------------------------------------------------------------
  const mudarQuantidade = (texto) => {
    setQtdTexto(texto);
    const n = parseFloat(String(texto).replace(",", "."));
    setFormData(prev => ({ ...prev, quantidade_produzida: Number.isFinite(n) ? n : 0 }));
  };

  const temProduto = Boolean(selectedProduct);
  const temQuantidade = Number(formData.quantidade_produzida) > 0;
  const ocupado = isLoading || isSubmitting || autoSaveMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      {/* =================================================================
          Linha de cima — o caminho curto do padrao Envase: escolher o
          produto (esquerda) e bater a quantidade (direita).
          Era o 8o e o 5o campo de uma pilha de 14; agora sao as duas
          unicas coisas na primeira tela.
          ================================================================= */}
      <div className="flex min-w-0 flex-col items-start gap-4 lg:flex-row">
        <SectionCard
          titulo="Produto"
          legenda="Busque pelo nome ou dispare o leitor de código"
          icone={Package}
          atraso={0.08}
          className="w-full min-w-0 flex-1"
        >
          <BuscaProduto
            products={products}
            codigo={formData.codigo_produto}
            aoEscolher={(codigo) => setFormData(prev => ({ ...prev, codigo_produto: codigo }))}
            produtoSelecionado={selectedProduct}
            embalagem={selectedEmbalagem}
            erro={formErrors.codigo_produto || formErrors.codigo_embalagem}
          />
        </SectionCard>

        <SectionCard
          titulo="Quantidade"
          icone={Hash}
          atraso={0.16}
          className="w-full lg:w-[400px] lg:flex-none"
        >
          <TecladoNumerico
            id="quantidade_produzida"
            rotulo={`Produzido${selectedProduct?.unidade_medida ? ` em ${selectedProduct.unidade_medida}` : ""}`}
            unidade={selectedProduct?.unidade_medida || "un"}
            valor={qtdTexto}
            aoMudar={mudarQuantidade}
            erro={formErrors.quantidade_produzida}
          />

          {/* O calculo derivado fica DO LADO do numero que o gera. Antes
              aparecia 300px abaixo, dentro do bloco de tempo. */}
          {formData.quantidade_embalagens > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-token bg-fundo px-4 py-3">
                <dt className="text-xs font-bold text-texto-fraco">Embalagens</dt>
                <dd className="num text-xl font-extrabold text-tinta">
                  {formData.quantidade_embalagens}
                </dd>
              </div>
              <div className="rounded-token bg-fundo px-4 py-3">
                <dt className="text-xs font-bold text-texto-fraco">Por embalagem</dt>
                <dd className="num text-xl font-extrabold text-tinta">
                  {formData.tempo_por_embalagem || "—"}
                </dd>
              </div>
            </dl>
          )}

          <Button aria-label="Confirmar"
            type="submit"
            size="lg"
            disabled={ocupado}
            className="mt-4 h-[72px] w-full rounded-painel text-lg"
          >
            <Check className="h-6 w-6" strokeWidth={2.6} aria-hidden="true" />
            {isSubmitting ? "Finalizando…" : isLoading ? "Salvando…" : "Registrar envase"}
          </Button>

          {/* O aviso de autosave ocupa espaco fixo: sem isso o botao subia e
              descia 20px a cada gravacao automatica. */}
          <p
            aria-live="polite"
            className={`mt-2 min-h-[20px] text-center text-sm font-semibold transition-opacity
                        ${autoSaveMutation.isPending ? "text-marca opacity-100" : "opacity-0"}`}
          >
            {autoSaveMutation.isPending ? "Salvando automaticamente…" : " "}
          </p>

          {!temProduto && !temQuantidade && (
            <p className="mt-1 text-center text-xs font-semibold text-texto-apagado">
              Escolha o produto e informe a quantidade
            </p>
          )}
        </SectionCard>
      </div>

      {/* =================================================================
          Dados do registro — tudo o que nao e produto nem quantidade.
          Continuam sendo os MESMOS 14 campos; o que mudou e que eles
          deixaram de disputar a primeira tela com o que o operador
          realmente vem fazer aqui.
          ================================================================= */}
      <SectionCard
        titulo="Dados do registro"
        legenda="Turno, tempo e rastreabilidade"
        icone={ClipboardList}
        atraso={0.24}
      >
        <div className="grid min-w-0 gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="sala">Sala *</Label>
            <Select
              value={formData.sala}
              onValueChange={(value) => setFormData(prev => ({ ...prev, sala: value }))}
              required
            >
              <SelectTrigger id="sala">
                <SelectValue placeholder="Selecione a sala" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Bio">Sala Bio</SelectItem>
                <SelectItem value="Industrial">Sala Industrial</SelectItem>
              </SelectContent>
            </Select>
            {formErrors.sala && <p className="text-xs font-bold text-erro">{formErrors.sala}</p>}
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="operador">Operador *</Label>
            <Select
              value={formData.operador}
              onValueChange={(value) => setFormData(prev => ({ ...prev, operador: value }))}
              required
            >
              <SelectTrigger id="operador">
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
            {formErrors.operador && (
              <p className="text-xs font-bold text-erro">{formErrors.operador}</p>
            )}
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="data">Data *</Label>
            <Input
              id="data"
              type="date"
              value={formData.data}
              onChange={(e) => setFormData(prev => ({ ...prev, data: e.target.value }))}
              required
            />
            {formErrors.data && <p className="text-xs font-bold text-erro">{formErrors.data}</p>}
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="op">Ordem de produção (OP)</Label>
            <Input
              id="op"
              value={formData.op}
              onChange={(e) => setFormData(prev => ({ ...prev, op: e.target.value }))}
              placeholder="Ex: OP-2025-001"
            />
            {formErrors.op && <p className="text-xs font-bold text-erro">{formErrors.op}</p>}
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="dificuldade">Dificuldade</Label>
            <Select
              value={formData.dificuldade_codigo.toString()}
              onValueChange={(value) =>
                setFormData(prev => ({ ...prev, dificuldade_codigo: parseInt(value) }))
              }
            >
              <SelectTrigger id="dificuldade">
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

          <div className="min-w-0 space-y-2">
            <Label htmlFor="lote_embalagem">Lote da embalagem</Label>
            <Input
              id="lote_embalagem"
              value={formData.lote_embalagem}
              onChange={(e) => setFormData(prev => ({ ...prev, lote_embalagem: e.target.value }))}
              placeholder="Ex: L2025-001"
            />
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="lotes_tampa">Lotes da tampa</Label>
            <Input
              id="lotes_tampa"
              value={formData.lotes_tampa}
              onChange={(e) => setFormData(prev => ({ ...prev, lotes_tampa: e.target.value }))}
              placeholder="Ex: LT2025-001"
            />
          </div>
        </div>

        {/* Controle de tempo — os botoes do cronometro ficavam de 40px colados
            no campo; agora tem 48px e rotulo acessivel. */}
        <fieldset className="mt-6 min-w-0 rounded-painel bg-fundo p-4 sm:p-5">
          <legend className="px-1 text-[13px] font-bold text-texto-fraco">Controle de tempo</legend>
          <div className="grid min-w-0 gap-4 md:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="inicio">Início *</Label>
              <div className="flex min-w-0 gap-2">
                <Input
                  id="inicio"
                  type="time"
                  className="min-w-0 flex-1 bg-cartao"
                  value={formData.inicio}
                  onChange={(e) => setFormData(prev => ({ ...prev, inicio: e.target.value }))}
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={handleStartTimer}
                  disabled={timing}
                  aria-label="Marcar o início agora"
                  className="flex-none bg-ok text-white hover:bg-ok"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {formErrors.inicio && (
                <p className="text-xs font-bold text-erro">{formErrors.inicio}</p>
              )}
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="termino">Término</Label>
              <div className="flex min-w-0 gap-2">
                <Input
                  id="termino"
                  type="time"
                  className="min-w-0 flex-1 bg-cartao"
                  value={formData.termino}
                  onChange={(e) => setFormData(prev => ({ ...prev, termino: e.target.value }))}
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={handleStopTimer}
                  disabled={!timing}
                  aria-label="Marcar o término agora"
                  className="flex-none bg-erro text-white hover:bg-erro"
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="tempo_produtivo">Tempo produtivo</Label>
              <Input
                id="tempo_produtivo"
                value={formData.tempo_produtivo || "--:--"}
                disabled
                className="num bg-cartao font-bold"
              />
            </div>
          </div>
        </fieldset>

        <div className="mt-6 min-w-0 space-y-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea
            id="observacoes"
            value={formData.observacoes}
            onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
            placeholder="Observações adicionais…"
            rows={3}
          />
        </div>
      </SectionCard>
    </form>
  );
}
