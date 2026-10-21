import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SelectOperador from "@/components/operadores/SelectOperador";
import { useAuth } from "@/lib/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Play, Square, Save, Edit, Calendar, User, Package, Clock, AlertCircle, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { formatarData } from "@/lib/datas";
import { StatusPill } from "@/components/fluxo";


export default function CheckoutItemCard({ item, operators }) {
  // Excluir o pedido é só do admin (o banco recusa o operador).
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(item.status === "Pendente" || item.status === "Em Andamento");
  const [timing, setTiming] = useState(false);
  const [showAtrasoForm, setShowAtrasoForm] = useState(false);

  /**
   * O estado do formulario a partir do que esta no banco.
   *
   * Existia duas vezes: aqui e, palavra por palavra, dentro do onClick do
   * botão Cancelar — e a cópia do Cancelar já não tinha o `operator_id`, de
   * modo que cancelar uma edição APAGAVA o id do operador do estado, deixando
   * só o nome. Com o CHECK do banco que exige `operator_id` quando o status não
   * é Pendente, isso vira erro de gravação na próxima vez que se salvar.
   */
  const doBanco = () => ({
    operador: item.operador || "",
    operator_id: item.operator_id || null,
    hora_inicio: item.hora_inicio || "",
    hora_termino: item.hora_termino || "",
    critico: item.critico || false,
    data_saida: item.data_saida || "",
    observacoes: item.observacoes || "",
    status: item.status || "Pendente",
    finalizado_fora_do_prazo: item.finalizado_fora_do_prazo || false,
    data_finalizacao_real: item.data_finalizacao_real || "",
    motivo_atraso: item.motivo_atraso || ""
  });

  const [formData, setFormData] = useState(doBanco);

  useEffect(() => {
    if (formData.hora_inicio && formData.hora_termino) {
      const inicio = new Date(`1970-01-01T${formData.hora_inicio}`);
      const termino = new Date(`1970-01-01T${formData.hora_termino}`);
      const diffMs = termino - inicio;
      const diffMins = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;

      setFormData(prev => ({
        ...prev,
        tempo_total: `${hours}:${mins.toString().padStart(2, '0')}`
      }));
    }
  }, [formData.hora_inicio, formData.hora_termino]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.CheckoutItem.update(item.id, data),
    onSuccess: (updatedItem) => {
      console.log('✅ Check-out salvo:', updatedItem);
      
      // Invalidar TODAS as queries relacionadas para garantir que a TV atualize
      queryClient.invalidateQueries({ queryKey: ['checkout-items', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-programacao', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-live'] });
      queryClient.invalidateQueries({ queryKey: ['checkout-programacoes-tv'] });
      
      setIsEditing(false);
      setShowAtrasoForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.CheckoutItem.delete(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-items', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-programacao', item.programacao_id] });
      queryClient.invalidateQueries({ queryKey: ['checkout-live'] });
    },
  });

  // Sem operador escolhido, nada sai de "Pendente" (o banco também exige).
  const [erroOperador, setErroOperador] = useState(null);

  const handleStartTimer = () => {
    if (!formData.operator_id) { setErroOperador("Escolha o operador antes de iniciar."); return; }
    setErroOperador(null);
    const now = format(new Date(), "HH:mm");
    const newData = { 
      ...formData, 
      hora_inicio: now, 
      status: "Em Andamento" 
    };
    setFormData(newData);
    setTiming(true);
    
    // SALVAR IMEDIATAMENTE quando iniciar
    console.log('🚀 Iniciando check-out e salvando automaticamente');
    updateMutation.mutate(newData);
  };

  const handleStopTimer = () => {
    const now = format(new Date(), "HH:mm");
    const newData = { 
      ...formData, 
      hora_termino: now, 
      status: "Concluído" 
    };
    setFormData(newData);
    setTiming(false);
    
    // SALVAR IMEDIATAMENTE quando parar
    console.log('⏹️ Finalizando check-out e salvando automaticamente');
    updateMutation.mutate(newData);
  };

  const handleSave = () => {
    let dataToSave = { ...formData };

    if (showAtrasoForm && formData.data_finalizacao_real && formData.motivo_atraso) {
      dataToSave.finalizado_fora_do_prazo = true;
      dataToSave.status = "Concluído";
    } else if (formData.hora_termino) {
      dataToSave.status = "Concluído";
    } else if (formData.hora_inicio) {
      dataToSave.status = "Em Andamento";
    } else {
      dataToSave.status = "Pendente";
    }

    if (dataToSave.status !== "Pendente" && !dataToSave.operator_id) {
      setErroOperador("Escolha o operador antes de salvar.");
      return;
    }
    setErroOperador(null);
    console.log('💾 Salvando check-out:', item.numero_pedido, dataToSave);
    updateMutation.mutate(dataToSave);
  };

  const handleDelete = () => {
    if (confirm(`Tem certeza que deseja excluir o pedido ${item.numero_pedido}?`)) {
      deleteMutation.mutate();
    }
  };

  /**
   * Cancelar: volta o formulário ao que está no banco.
   *
   * Era o mesmo objeto de dez campos escrito uma segunda vez dentro do
   * `onClick` — e as duas cópias já podiam divergir sem ninguém notar, porque
   * nada liga uma à outra.
   */
  const descartarEdicao = () => {
    setIsEditing(false);
    setShowAtrasoForm(false);
    setFormData(doBanco());
  };

  return (
    <article
      className={`entra cartao-fluxo min-w-0 ${item.critico ? "ring-2 ring-erro/30" : ""}`}
    >
      <div className="min-w-0 p-5 sm:p-6">
        {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Package
                className={`h-5 w-5 flex-none ${item.critico ? "text-erro" : "text-marca"}`}
                aria-hidden="true"
              />
              <h3 className="text-lg font-extrabold text-tinta">{item.numero_pedido}</h3>
              <StatusPill estado={formData.status} />
              {item.critico && (
                <span className="flex items-center gap-1 rounded-full bg-erro px-2.5 py-0.5
                                 text-[11px] font-extrabold text-white">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  Crítico
                </span>
              )}
              {item.finalizado_fora_do_prazo && (
                <span className="rounded-full bg-atencao-suave px-2.5 py-0.5 text-[11px] font-extrabold text-atencao">
                  Finalizado com atraso
                </span>
              )}
            </div>
            <p className="mt-1 font-bold text-tinta">{item.cliente}</p>
            <p className="text-sm font-semibold text-texto-fraco">
              Entrega: {formatarData(item.data_entrega, "dd/MM/yyyy", "sem data")}
            </p>
          </div>

          <div className="flex flex-none items-center gap-2">
            {!isEditing && !showAtrasoForm && (
              <Button variant="outline" size="lg" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4" aria-hidden="true" />
                Editar
              </Button>
            )}
            {!showAtrasoForm && !item.finalizado_fora_do_prazo && item.status !== "Concluído" && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowAtrasoForm(true)}
                className="text-atencao hover:bg-atencao-suave"
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
                Marcar atraso
              </Button>
            )}
            {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              aria-label={`Excluir o pedido ${item.numero_pedido}`}
              className="text-texto-fraco hover:bg-erro-suave hover:text-erro"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
            )}
          </div>
        </div>

        {/* ── Formulário de execução ─────────────────────────────────────── */}
        {(isEditing || showAtrasoForm) && (
          <div className="mt-5 flex min-w-0 flex-col gap-5 border-t border-borda pt-5">
            {/* Quem fez o check-out deste item: escolhido aqui, a cada item
                (o banco exige operator_id fora de "Pendente"). */}
            <SelectOperador
              id={`operador-${item.id}`}
              obrigatorio
              valor={formData.operator_id}
              aoEscolher={(op) => { setErroOperador(null); setFormData(prev => ({ ...prev, operador: op?.nome || "", operator_id: op?.id || null })); }}
              erro={erroOperador}
            />

            {/* Tempo */}
            <fieldset className="min-w-0 rounded-painel bg-fundo p-4">
              <legend className="px-1 text-[13px] font-bold text-texto-fraco">Tempo</legend>
              <div className="grid min-w-0 gap-4 md:grid-cols-3">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`inicio-${item.id}`}>Início</Label>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      id={`inicio-${item.id}`}
                      type="time"
                      className="min-w-0 flex-1 bg-cartao"
                      value={formData.hora_inicio}
                      onChange={(e) => setFormData(prev => ({ ...prev, hora_inicio: e.target.value }))}
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={handleStartTimer}
                      disabled={timing || formData.hora_inicio || updateMutation.isPending}
                      aria-label="Marcar o início agora"
                      className="flex-none bg-ok text-white hover:bg-ok"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`termino-${item.id}`}>Término</Label>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      id={`termino-${item.id}`}
                      type="time"
                      className="min-w-0 flex-1 bg-cartao"
                      value={formData.hora_termino}
                      onChange={(e) => setFormData(prev => ({ ...prev, hora_termino: e.target.value }))}
                    />
                    <Button
                      type="button"
                      size="icon"
                      onClick={handleStopTimer}
                      disabled={!formData.hora_inicio || formData.hora_termino || updateMutation.isPending}
                      aria-label="Marcar o término agora"
                      className="flex-none bg-erro text-white hover:bg-erro"
                    >
                      <Square className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`tempo-${item.id}`}>Tempo total</Label>
                  <Input
                    id={`tempo-${item.id}`}
                    value={formData.tempo_total || "--:--"}
                    disabled
                    className="num bg-cartao font-bold"
                  />
                </div>
              </div>
            </fieldset>

            {/* Crítico */}
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {/* O alvo de toque é o rótulo inteiro, não só a caixinha de 16px:
                  acertar 16px com luva é sorte. */}
              <label
                htmlFor={`critico-${item.id}`}
                className="press foco-fluxo flex min-h-[48px] cursor-pointer items-center gap-3
                           rounded-token bg-fundo px-4"
              >
                <Checkbox
                  id={`critico-${item.id}`}
                  checked={formData.critico}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, critico: checked }))}
                />
                <span className="text-sm font-bold text-tinta">Pedido crítico</span>
              </label>

              {formData.critico && (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={`data_saida-${item.id}`}>Data de saída</Label>
                  <Input
                    id={`data_saida-${item.id}`}
                    type="date"
                    value={formData.data_saida}
                    onChange={(e) => setFormData(prev => ({ ...prev, data_saida: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Atraso */}
            {showAtrasoForm && (
              <div className="min-w-0 rounded-painel bg-atencao-suave p-4">
                <h4 className="mb-4 flex items-center gap-2 font-extrabold text-atencao">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                  Registrar finalização com atraso
                </h4>

                <div className="flex min-w-0 flex-col gap-4">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`data_finalizacao-${item.id}`}>Data real de finalização *</Label>
                    <Input
                      id={`data_finalizacao-${item.id}`}
                      type="date"
                      className="bg-cartao"
                      value={formData.data_finalizacao_real}
                      onChange={(e) => setFormData(prev => ({ ...prev, data_finalizacao_real: e.target.value }))}
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`motivo-${item.id}`}>Motivo do atraso *</Label>
                    <Textarea
                      id={`motivo-${item.id}`}
                      className="bg-cartao"
                      value={formData.motivo_atraso}
                      onChange={(e) => setFormData(prev => ({ ...prev, motivo_atraso: e.target.value }))}
                      placeholder="Descreva o motivo do atraso…"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="min-w-0 space-y-2">
              <Label htmlFor={`observacoes-${item.id}`}>Observações</Label>
              <Textarea
                id={`observacoes-${item.id}`}
                value={formData.observacoes}
                onChange={(e) => setFormData(prev => ({ ...prev, observacoes: e.target.value }))}
                placeholder="Observações sobre o check-out…"
                rows={2}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button variant="outline" size="lg" onClick={descartarEdicao}>
                Cancelar
              </Button>
              <Button aria-label="Salvar" size="lg" onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4" aria-hidden="true" />
                {updateMutation.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Detalhes, fora da edição ───────────────────────────────────── */}
        {!isEditing && !showAtrasoForm && item.operador && (
          <dl className="mt-5 grid min-w-0 gap-4 border-t border-borda pt-5 text-sm md:grid-cols-3">
            <div className="min-w-0">
              <dt className="mb-1 flex items-center gap-1.5 font-bold text-texto-fraco">
                <User className="h-4 w-4" aria-hidden="true" />
                Operador
              </dt>
              <dd className="font-extrabold text-tinta">{item.operador}</dd>
            </div>
            <div className="min-w-0">
              <dt className="mb-1 flex items-center gap-1.5 font-bold text-texto-fraco">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Horário
              </dt>
              <dd className="num font-extrabold text-tinta">
                {item.hora_inicio} – {item.hora_termino || "--:--"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="mb-1 font-bold text-texto-fraco">Tempo total</dt>
              <dd className="num font-extrabold text-marca">{item.tempo_total || "--:--"}</dd>
            </div>

            {item.critico && item.data_saida && (
              <div className="min-w-0">
                <dt className="mb-1 flex items-center gap-1.5 font-bold text-texto-fraco">
                  <Calendar className="h-4 w-4" aria-hidden="true" />
                  Data de saída
                </dt>
                <dd className="num font-extrabold text-tinta">{formatarData(item.data_saida)}</dd>
              </div>
            )}

            {item.finalizado_fora_do_prazo && (
              <>
                <div className="min-w-0">
                  <dt className="mb-1 font-bold text-texto-fraco">Data real de finalização</dt>
                  <dd className="num font-extrabold text-atencao">
                    {formatarData(item.data_finalizacao_real, "dd/MM/yyyy", "N/A")}
                  </dd>
                </div>
                <div className="min-w-0 md:col-span-2">
                  <dt className="mb-1 font-bold text-texto-fraco">Motivo do atraso</dt>
                  <dd className="rounded-token bg-atencao-suave px-4 py-2.5 font-semibold text-atencao">
                    {item.motivo_atraso}
                  </dd>
                </div>
              </>
            )}

            {item.observacoes && (
              <div className="min-w-0 md:col-span-3">
                <dt className="mb-1 font-bold text-texto-fraco">Observações</dt>
                <dd className="rounded-token bg-fundo px-4 py-2.5 font-semibold text-tinta">
                  {item.observacoes}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </article>
  );
}
